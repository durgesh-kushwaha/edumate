from datetime import date
import csv
import io
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.api.deps import require_roles
from app.core.config import settings
from app.db.mongo import get_db
from app.schemas.domain import ResultCreate
from app.utils.mongo import oid, serialize_document, utc_now

router = APIRouter(prefix='/teacher', tags=['Teacher'])


def compute_grade(score_percent: float) -> str:
    if score_percent >= 90:
        return 'A+'
    if score_percent >= 80:
        return 'A'
    if score_percent >= 70:
        return 'B'
    if score_percent >= 60:
        return 'C'
    if score_percent >= 40:
        return 'D'
    return 'F'


def ensure_teacher_access(db: Database, current_user: dict, course: dict) -> None:
    if current_user['role'] != 'teacher':
        return
    teacher = db.faculty.find_one({'user_id': oid(current_user['id'], 'teacher user id')})
    if not teacher or teacher['_id'] != course['faculty_id']:
        raise HTTPException(status_code=403, detail='Not allowed for this course')


def ensure_pdf(upload: UploadFile | None) -> None:
    if not upload:
        return
    ext = Path(upload.filename or '').suffix.lower()
    if ext != '.pdf':
        raise HTTPException(status_code=400, detail='Only PDF files are allowed')


@router.get('/courses')
def assigned_courses(db: Database = Depends(get_db), current_user=Depends(require_roles('teacher'))):
    faculty = db.faculty.find_one({'user_id': oid(current_user['id'], 'teacher user id')})
    if not faculty:
        raise HTTPException(status_code=404, detail='Faculty profile not found')
    courses = []
    for course in db.courses.find({'faculty_id': faculty['_id']}).sort('semester', 1):
        courses.append(serialize_document(course))
    return courses


@router.post('/courses')
def create_teacher_course(
    payload: dict,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher')),
):
    code = str(payload.get('code', '')).strip().upper()
    title = str(payload.get('title', '')).strip()
    semester = int(payload.get('semester', 1))
    credits = int(payload.get('credits', 4))
    if not code or not title:
        raise HTTPException(status_code=400, detail='Course code and title are required')
    faculty = db.faculty.find_one({'user_id': oid(current_user['id'], 'teacher user id')})
    if not faculty:
        raise HTTPException(status_code=404, detail='Faculty profile not found')
    try:
        course_id = db.courses.insert_one(
            {
                'code': code,
                'title': title,
                'faculty_id': faculty['_id'],
                'semester': semester,
                'credits': credits,
                'created_at': utc_now(),
                'updated_at': utc_now(),
            }
        ).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Course code already exists')
    return serialize_document(db.courses.find_one({'_id': course_id}))


@router.post('/results')
def enter_marks(payload: ResultCreate, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher'))):
    student = db.students.find_one({'_id': oid(payload.student_id, 'student_id')})
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not student or not course:
        raise HTTPException(status_code=404, detail='Student or course not found')

    teacher = db.faculty.find_one({'user_id': oid(current_user['id'], 'teacher user id')})
    if not teacher:
        raise HTTPException(status_code=404, detail='Faculty profile missing')
    if course['faculty_id'] != teacher['_id']:
        raise HTTPException(status_code=403, detail='You can only submit marks for your own course')

    grade = compute_grade((payload.marks_obtained / payload.max_marks) * 100)
    now = utc_now()
    data = {
        'student_id': student['_id'],
        'course_id': course['_id'],
        'marks_obtained': payload.marks_obtained,
        'max_marks': payload.max_marks,
        'grade': grade,
        'teacher_user_id': oid(current_user['id'], 'teacher user id'),
        'updated_at': now,
    }
    try:
        db.results.insert_one({'created_at': now, **data})
    except DuplicateKeyError:
        db.results.update_one({'student_id': student['_id'], 'course_id': course['_id']}, {'$set': data})
    result = db.results.find_one({'student_id': student['_id'], 'course_id': course['_id']})
    return serialize_document(result)


@router.get('/attendance-report/{course_id}')
def attendance_report(course_id: str, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_access(db, current_user, course)

    total_students = db.enrollments.count_documents({'course_id': course['_id']})
    present_records = db.attendance.count_documents({'course_id': course['_id'], 'status': 'present'})
    today_present = db.attendance.count_documents({'course_id': course['_id'], 'attendance_date': date.today().isoformat(), 'status': 'present'})
    return {
        'course_id': course_id,
        'course_code': course['code'],
        'total_enrolled': total_students,
        'present_records': present_records,
        'today_present': today_present,
    }


@router.get('/course-roster/{course_id}')
def course_roster(course_id: str, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_access(db, current_user, course)

    roster = []
    for enrollment in db.enrollments.find({'course_id': course['_id']}):
        student = db.students.find_one({'_id': enrollment['student_id']})
        user = db.users.find_one({'_id': student['user_id']}) if student else None
        if student and user:
            roster.append(
                {
                    'student_id': str(student['_id']),
                    'name': user['full_name'],
                    'enrollment_number': student['enrollment_number'],
                    'department': student['department'],
                    'year': student['year'],
                }
            )
    return roster


@router.get('/attendance-export/{course_id}')
def attendance_export(course_id: str, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_access(db, current_user, course)

    today = date.today().isoformat()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Course Code', 'Student Name', 'Enrollment Number', 'Status', 'Marked At'])

    for record in db.attendance.find({'course_id': course['_id'], 'attendance_date': today}).sort('marked_at', 1):
        student = db.students.find_one({'_id': record['student_id']})
        user = db.users.find_one({'_id': student['user_id']}) if student else None
        writer.writerow(
            [
                today,
                course['code'],
                user['full_name'] if user else 'Unknown',
                student['enrollment_number'] if student else '',
                record.get('status', 'present'),
                record.get('marked_at').isoformat() if record.get('marked_at') else '',
            ]
        )

    csv_content = output.getvalue()
    output.close()
    filename = f"attendance_{course['code']}_{today}.csv"
    headers = {'Content-Disposition': f'attachment; filename={filename}'}
    return StreamingResponse(iter([csv_content]), media_type='text/csv', headers=headers)


@router.post('/assignments')
async def create_assignment(
    course_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(default=''),
    due_date: str = Form(...),
    attachment: UploadFile | None = File(default=None),
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher')),
):
    course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_access(db, current_user, course)
    ensure_pdf(attachment)

    attachment_path = ''
    now = utc_now()
    if attachment:
        assignment_dir = Path(settings.ASSIGNMENTS_DIR) / course_id
        assignment_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{now.strftime('%Y%m%d%H%M%S')}_{Path(attachment.filename or 'assignment.pdf').name}"
        save_path = assignment_dir / filename
        save_path.write_bytes(await attachment.read())
        attachment_path = str(save_path)

    assignment_id = db.assignments.insert_one(
        {
            'course_id': course['_id'],
            'title': title.strip(),
            'description': description.strip(),
            'due_date': due_date,
            'attachment_path': attachment_path,
            'teacher_user_id': oid(current_user['id'], 'teacher user id'),
            'created_at': now,
            'updated_at': now,
        }
    ).inserted_id
    return serialize_document(db.assignments.find_one({'_id': assignment_id}))


@router.get('/assignments')
def list_assignments(course_id: str | None = None, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    query: dict = {}
    if course_id:
        query['course_id'] = oid(course_id, 'course_id')
    assignments = []
    for assignment in db.assignments.find(query).sort('created_at', -1):
        course = db.courses.find_one({'_id': assignment['course_id']})
        if not course:
            continue
        if current_user['role'] == 'teacher':
            ensure_teacher_access(db, current_user, course)
        assignments.append(
            {
                **serialize_document(assignment),
                'course_code': course.get('code', ''),
                'course_title': course.get('title', ''),
            }
        )
    return assignments


@router.get('/assignment-submissions/{assignment_id}')
def list_assignment_submissions(assignment_id: str, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    assignment = db.assignments.find_one({'_id': oid(assignment_id, 'assignment_id')})
    if not assignment:
        raise HTTPException(status_code=404, detail='Assignment not found')
    course = db.courses.find_one({'_id': assignment['course_id']})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    if current_user['role'] == 'teacher':
        ensure_teacher_access(db, current_user, course)

    output = []
    for submission in db.assignment_submissions.find({'assignment_id': assignment['_id']}).sort('submitted_at', -1):
        student = db.students.find_one({'_id': submission['student_id']})
        user = db.users.find_one({'_id': student['user_id']}) if student else None
        output.append(
            {
                **serialize_document(submission),
                'student_name': user['full_name'] if user else 'Unknown',
                'enrollment_number': student.get('enrollment_number', '') if student else '',
            }
        )
    return output


@router.get('/assignment-submissions/{submission_id}/file')
def download_submission_file(submission_id: str, db: Database = Depends(get_db), current_user=Depends(require_roles('teacher', 'admin'))):
    submission = db.assignment_submissions.find_one({'_id': oid(submission_id, 'submission_id')})
    if not submission:
        raise HTTPException(status_code=404, detail='Submission not found')
    assignment = db.assignments.find_one({'_id': submission['assignment_id']})
    if not assignment:
        raise HTTPException(status_code=404, detail='Assignment not found')
    course = db.courses.find_one({'_id': assignment['course_id']})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    if current_user['role'] == 'teacher':
        ensure_teacher_access(db, current_user, course)
    path = submission.get('submission_path') or ''
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail='Submission file missing')
    return FileResponse(path, media_type='application/pdf', filename=Path(path).name)
