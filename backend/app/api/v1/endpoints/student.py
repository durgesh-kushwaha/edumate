from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.api.deps import require_roles
from app.core.config import settings
from app.db.mongo import get_db
from app.schemas.domain import PaymentCreateRequest
from app.utils.mongo import oid, serialize_document, utc_now

router = APIRouter(prefix='/student', tags=['Student'])


def safe_user_payload(user_doc: dict | None) -> dict | None:
    payload = serialize_document(user_doc)
    if payload:
        payload.pop('hashed_password', None)
    return payload


def get_student_doc(db: Database, current_user: dict) -> dict:
    student = db.students.find_one({'user_id': oid(current_user['id'], 'current user id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student profile not found')
    return student


def ensure_pdf(upload: UploadFile) -> None:
    extension = Path(upload.filename or '').suffix.lower()
    if extension != '.pdf':
        raise HTTPException(status_code=400, detail='Only PDF files are allowed')


@router.get('/profile')
def profile(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    user = db.users.find_one({'_id': student['user_id']})
    return {
        'student': serialize_document(student),
        'user': safe_user_payload(user),
    }


@router.get('/results')
def results(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    response = []
    for result in db.results.find({'student_id': student['_id']}):
        course = db.courses.find_one({'_id': result['course_id']})
        response.append(
            {
                **serialize_document(result),
                'course_code': course['code'] if course else '',
                'course_title': course['title'] if course else '',
            }
        )
    return response


@router.get('/attendance')
def attendance_percentage(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    enrolled_course_count = db.enrollments.count_documents({'student_id': student['_id']})
    unique_days = len({item['attendance_date'] for item in db.attendance.find({'student_id': student['_id']})})
    total_possible = enrolled_course_count * max(unique_days, 1)
    attended = db.attendance.count_documents({'student_id': student['_id'], 'status': 'present'})
    percentage = (attended / total_possible * 100) if total_possible else 0
    return {
        'student_id': str(student['_id']),
        'attendance_percentage': round(percentage, 2),
        'present_records': attended,
        'tracked_days': unique_days,
    }


@router.get('/attendance/history')
def attendance_history(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    items = []
    for record in db.attendance.find({'student_id': student['_id']}).sort('attendance_date', -1):
        course = db.courses.find_one({'_id': record['course_id']})
        items.append(
            {
                **serialize_document(record),
                'course_code': course['code'] if course else '',
                'course_title': course['title'] if course else '',
            }
        )
    return items


@router.get('/fees')
def student_fees(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    fees = [serialize_document(item) for item in db.fee_ledgers.find({'student_id': student['_id']}).sort('due_date', 1)]
    total_pending = round(sum(item['amount'] for item in fees if item['status'] == 'pending'), 2)
    return {'items': fees, 'total_pending': total_pending}


@router.post('/fees/pay')
def pay_fee(payload: PaymentCreateRequest, db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    fee = db.fee_ledgers.find_one({'_id': oid(payload.fee_id, 'fee_id'), 'student_id': student['_id']})
    if not fee:
        raise HTTPException(status_code=404, detail='Fee record not found')
    if fee['status'] == 'paid':
        return {'message': 'Fee already marked paid', 'payment_link': fee['payment_link']}

    payment_link = fee.get('payment_link') or f"{settings.RAZORPAY_PAYMENT_LINK_BASE}/{int(round(fee['amount']))}"
    db.fee_ledgers.update_one(
        {'_id': fee['_id']},
        {
            '$set': {
                'payment_link': payment_link,
                'payment_initiated_at': utc_now(),
                'updated_at': utc_now(),
            }
        },
    )
    return {
        'message': 'Payment link generated',
        'payment_link': payment_link,
        'note': 'Use this Razorpay page to complete fee payment. Admin can confirm payment status after verification.',
    }


@router.get('/academics')
def academics_overview(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    course_map: dict = {}
    enrolled_course_ids = []
    for enrollment in db.enrollments.find({'student_id': student['_id']}):
        course = db.courses.find_one({'_id': enrollment['course_id']})
        if not course:
            continue
        enrolled_course_ids.append(course['_id'])
        faculty = db.faculty.find_one({'_id': course.get('faculty_id')})
        faculty_user = db.users.find_one({'_id': faculty['user_id']}) if faculty else None
        course_key = str(course['_id'])
        course_map[course_key] = {
            'course_id': course_key,
            'course_code': course.get('code', ''),
            'course_title': course.get('title', ''),
            'semester': course.get('semester', 0),
            'faculty_name': faculty_user.get('full_name', 'Unassigned') if faculty_user else 'Unassigned',
            'assignments': [],
        }

    for assignment in db.assignments.find({'course_id': {'$in': enrolled_course_ids}}):
        assignment_payload = serialize_document(assignment)
        submission = db.assignment_submissions.find_one({'assignment_id': assignment['_id'], 'student_id': student['_id']})
        assignment_payload['submitted'] = bool(submission)
        assignment_payload['submission'] = serialize_document(submission)
        course_key = str(assignment['course_id'])
        if course_key in course_map:
            course_map[course_key]['assignments'].append(assignment_payload)

    return list(course_map.values())


@router.post('/assignments/{assignment_id}/submit')
async def submit_assignment(
    assignment_id: str,
    file: UploadFile = File(...),
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student')),
):
    ensure_pdf(file)
    student = get_student_doc(db, current_user)
    assignment = db.assignments.find_one({'_id': oid(assignment_id, 'assignment_id')})
    if not assignment:
        raise HTTPException(status_code=404, detail='Assignment not found')
    ensure_enrolled = db.enrollments.find_one({'student_id': student['_id'], 'course_id': assignment['course_id']})
    if not ensure_enrolled:
        raise HTTPException(status_code=403, detail='Assignment is not for your enrolled subject')

    now = utc_now()
    submission_dir = Path(settings.SUBMISSIONS_DIR) / assignment_id
    submission_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{student['enrollment_number']}_{now.strftime('%Y%m%d%H%M%S')}.pdf"
    save_path = submission_dir / filename
    save_path.write_bytes(await file.read())
    try:
        db.assignment_submissions.insert_one(
            {
                'assignment_id': assignment['_id'],
                'student_id': student['_id'],
                'submission_path': str(save_path),
                'submitted_at': now,
                'created_at': now,
            }
        )
    except DuplicateKeyError:
        db.assignment_submissions.update_one(
            {'assignment_id': assignment['_id'], 'student_id': student['_id']},
            {'$set': {'submission_path': str(save_path), 'submitted_at': now}},
        )
    return {'message': 'Assignment submitted successfully'}


@router.get('/assignments/{assignment_id}/file')
def download_assignment_file(
    assignment_id: str,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student')),
):
    student = get_student_doc(db, current_user)
    assignment = db.assignments.find_one({'_id': oid(assignment_id, 'assignment_id')})
    if not assignment:
        raise HTTPException(status_code=404, detail='Assignment not found')
    enrolled = db.enrollments.find_one({'student_id': student['_id'], 'course_id': assignment['course_id']})
    if not enrolled:
        raise HTTPException(status_code=403, detail='Not allowed')
    path = assignment.get('attachment_path') or ''
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail='Attachment not available')
    return FileResponse(path, media_type='application/pdf', filename=Path(path).name)


@router.get('/exams')
def exam_overview(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    student_user = db.users.find_one({'_id': student['user_id']})
    department = student.get('department', '')
    year = student.get('year', 1)
    semester = min(year * 2, 8)

    upcoming = []
    for exam in db.exam_schedules.find({'department': department, 'semester': semester}).sort('exam_date', 1):
        upcoming.append(serialize_document(exam))

    hall_ticket = db.hall_tickets.find_one({'student_id': student['_id'], 'semester': semester})
    if not hall_ticket:
        hall_ticket = {
            'student_id': student['_id'],
            'semester': semester,
            'exam_session': f'Semester {semester} Examination',
            'hall_no': f'H-{semester}12',
            'seat_no': f'{student["enrollment_number"][-6:]}',
            'issued_at': utc_now(),
        }
        db.hall_tickets.insert_one(hall_ticket)
        hall_ticket = db.hall_tickets.find_one({'student_id': student['_id'], 'semester': semester})

    semester_results: dict[int, list] = {}
    for result in db.results.find({'student_id': student['_id']}):
        course = db.courses.find_one({'_id': result['course_id']})
        sem = int(course.get('semester', 0)) if course else 0
        semester_results.setdefault(sem, []).append(
            {
                **serialize_document(result),
                'exam_type': result.get('exam_type', 'final'),
                'course_code': course.get('code', '') if course else '',
                'course_title': course.get('title', '') if course else '',
            }
        )

    return {
        'student_name': student_user['full_name'] if student_user else '',
        'enrollment_number': student['enrollment_number'],
        'department': department,
        'semester': semester,
        'upcoming_exams': upcoming,
        'hall_ticket': serialize_document(hall_ticket),
        'semester_results': [
            {'semester': key, 'results': semester_results[key]} for key in sorted(semester_results.keys()) if key > 0
        ],
    }


@router.get('/today')
def today_summary(db: Database = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = get_student_doc(db, current_user)
    today = date.today().isoformat()
    marked_today = db.attendance.count_documents({'student_id': student['_id'], 'attendance_date': today})
    pending_fees = db.fee_ledgers.count_documents({'student_id': student['_id'], 'status': 'pending'})
    return {'attendance_marked_today': marked_today, 'pending_fee_items': pending_fees}
