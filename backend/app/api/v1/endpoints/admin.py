from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.api.deps import require_roles
from app.core.catalog import DEPARTMENT_CATALOG, DESIGNATION_SALARY_DEFAULTS
from app.core.config import settings
from app.core.security import get_password_hash
from app.db.mongo import get_db
from app.schemas.domain import (
    CourseCreate,
    EnrollmentCreate,
    FacultyCreate,
    FeeCreate,
    FeeStatusUpdate,
    RegistrationDecisionRequest,
    SalaryConfigUpsert,
    SalaryDisburseRequest,
    StudentCreate,
    SuperAdminCreate,
)
from app.utils.mongo import oid, serialize_document, utc_now

router = APIRouter(prefix='/admin', tags=['Admin'])


def safe_user_payload(user_doc: dict | None) -> dict | None:
    payload = serialize_document(user_doc)
    if payload:
        payload.pop('hashed_password', None)
    return payload


def validate_department(department: str) -> str:
    allowed = {item['name'] for item in DEPARTMENT_CATALOG}
    selected = department.strip()
    if selected not in allowed:
        raise HTTPException(status_code=400, detail='Select a valid department')
    return selected


@router.post('/students')
def create_student(payload: StudentCreate, db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    now = utc_now()
    department = validate_department(payload.department)
    user_doc = {
        'email': payload.email.lower(),
        'hashed_password': get_password_hash(payload.password),
        'role': 'student',
        'full_name': payload.full_name.strip(),
        'is_active': True,
        'created_at': now,
        'updated_at': now,
    }
    student_doc = {
        'enrollment_number': payload.enrollment_number.strip(),
        'department': department,
        'year': payload.year,
        'gender': payload.gender.strip(),
        'student_phone': payload.student_phone.strip(),
        'parent_name': payload.parent_name.strip(),
        'parent_phone': payload.parent_phone.strip(),
        'address_line': payload.address_line.strip(),
        'pincode': payload.pincode.strip(),
        'state': payload.state.strip(),
        'city': payload.city.strip(),
        'created_at': now,
        'updated_at': now,
    }
    try:
        user_id = db.users.insert_one(user_doc).inserted_id
        student_doc['user_id'] = user_id
        student_id = db.students.insert_one(student_doc).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Email or enrollment number already exists')
    return {'user': safe_user_payload(db.users.find_one({'_id': user_id})), 'student': serialize_document(db.students.find_one({'_id': student_id}))}


@router.post('/superadmins')
def create_superadmin(payload: SuperAdminCreate, db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    now = utc_now()
    user_doc = {
        'email': payload.email.lower(),
        'hashed_password': get_password_hash(payload.password),
        'role': 'superadmin',
        'full_name': payload.full_name.strip(),
        'is_active': True,
        'created_at': now,
        'updated_at': now,
    }
    try:
        user_id = db.users.insert_one(user_doc).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Email already exists')
    return {'user': safe_user_payload(db.users.find_one({'_id': user_id}))}


@router.get('/registration-requests')
def list_registration_requests(
    status: str = Query(default='pending'),
    db: Database = Depends(get_db),
    _=Depends(require_roles('superadmin')),
):
    query: dict = {}
    if status != 'all':
        query['status'] = status
    items = []
    for request in db.registration_requests.find(query).sort('submitted_at', -1):
        serialized = serialize_document(request)
        if serialized:
            serialized.pop('hashed_password', None)
            items.append(serialized)
    return items


@router.patch('/registration-requests/{request_id}')
def decide_registration_request(
    request_id: str,
    payload: RegistrationDecisionRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('superadmin')),
):
    request = db.registration_requests.find_one({'_id': oid(request_id, 'request_id')})
    if not request:
        raise HTTPException(status_code=404, detail='Registration request not found')
    if request.get('status') != 'pending':
        raise HTTPException(status_code=400, detail='Only pending requests can be processed')

    if payload.action == 'reject':
        updated = db.registration_requests.find_one_and_update(
            {'_id': request['_id']},
            {
                '$set': {
                    'status': 'rejected',
                    'remarks': payload.remarks.strip(),
                    'reviewed_by': oid(current_user['id'], 'reviewer'),
                    'reviewed_at': utc_now(),
                    'updated_at': utc_now(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        serialized = serialize_document(updated)
        if serialized:
            serialized.pop('hashed_password', None)
        return serialized

    full_name = (payload.full_name or request['full_name']).strip()
    email = (payload.email or request['email']).lower()
    enrollment_number = (payload.enrollment_number or request['enrollment_number']).strip()
    department = validate_department(payload.department or request['department'])
    year = payload.year or request['year']
    gender = (payload.gender or request.get('gender') or '').strip()
    student_phone = (payload.student_phone or request.get('student_phone') or '').strip()
    parent_name = (payload.parent_name or request.get('parent_name') or '').strip()
    parent_phone = (payload.parent_phone or request.get('parent_phone') or '').strip()
    address_line = (payload.address_line or request.get('address_line') or '').strip()
    pincode = (payload.pincode or request.get('pincode') or '').strip()
    state = (payload.state or request.get('state') or '').strip()
    city = (payload.city or request.get('city') or '').strip()
    hashed_password = get_password_hash(payload.password) if payload.password else request['hashed_password']
    now = utc_now()

    try:
        user_id = db.users.insert_one(
            {
                'email': email,
                'hashed_password': hashed_password,
                'role': 'student',
                'full_name': full_name,
                'is_active': True,
                'created_at': now,
                'updated_at': now,
            }
        ).inserted_id
        student_id = db.students.insert_one(
            {
                'user_id': user_id,
                'enrollment_number': enrollment_number,
                'department': department,
                'year': year,
                'gender': gender,
                'student_phone': student_phone,
                'parent_name': parent_name,
                'parent_phone': parent_phone,
                'address_line': address_line,
                'pincode': pincode,
                'state': state,
                'city': city,
                'created_at': now,
                'updated_at': now,
            }
        ).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Email or roll number already exists')

    db.registration_requests.update_one(
        {'_id': request['_id']},
        {
            '$set': {
                'status': 'approved',
                'remarks': payload.remarks.strip(),
                'reviewed_by': oid(current_user['id'], 'reviewer'),
                'reviewed_at': now,
                'approved_user_id': user_id,
                'approved_student_id': student_id,
                'updated_at': now,
            }
        },
    )

    return {
        'message': 'Registration approved',
        'user': safe_user_payload(db.users.find_one({'_id': user_id})),
        'student': serialize_document(db.students.find_one({'_id': student_id})),
    }


@router.post('/faculty')
def create_faculty(payload: FacultyCreate, db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    now = utc_now()
    department = validate_department(payload.department)
    user_doc = {
        'email': payload.email.lower(),
        'hashed_password': get_password_hash(payload.password),
        'role': 'teacher',
        'full_name': payload.full_name.strip(),
        'is_active': True,
        'created_at': now,
        'updated_at': now,
    }
    faculty_doc = {
        'employee_code': payload.employee_code.strip(),
        'designation': payload.designation.strip(),
        'department': department,
        'faculty_phone': payload.faculty_phone.strip(),
        'created_at': now,
        'updated_at': now,
    }
    try:
        user_id = db.users.insert_one(user_doc).inserted_id
        faculty_doc['user_id'] = user_id
        faculty_id = db.faculty.insert_one(faculty_doc).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Email or employee code already exists')
    return {'user': safe_user_payload(db.users.find_one({'_id': user_id})), 'faculty': serialize_document(db.faculty.find_one({'_id': faculty_id}))}


@router.post('/courses')
def create_course(payload: CourseCreate, db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    faculty = db.faculty.find_one({'_id': oid(payload.faculty_id, 'faculty_id')})
    if not faculty:
        raise HTTPException(status_code=404, detail='Faculty not found')
    now = utc_now()
    try:
        course_id = db.courses.insert_one(
            {
                'code': payload.code.strip().upper(),
                'title': payload.title.strip(),
                'faculty_id': faculty['_id'],
                'semester': payload.semester,
                'credits': payload.credits,
                'created_at': now,
                'updated_at': now,
            }
        ).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Course code already exists')
    return serialize_document(db.courses.find_one({'_id': course_id}))


@router.post('/enrollments')
def create_enrollment(payload: EnrollmentCreate, db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    student = db.students.find_one({'_id': oid(payload.student_id, 'student_id')})
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not student or not course:
        raise HTTPException(status_code=404, detail='Student or course not found')
    try:
        enrollment_id = db.enrollments.insert_one(
            {
                'student_id': student['_id'],
                'course_id': course['_id'],
                'created_at': utc_now(),
            }
        ).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Student already enrolled in this course')
    return serialize_document(db.enrollments.find_one({'_id': enrollment_id}))


@router.post('/fees')
def create_fee(payload: FeeCreate, db: Database = Depends(get_db), current_user=Depends(require_roles('admin'))):
    student = db.students.find_one({'_id': oid(payload.student_id, 'student_id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')

    now = utc_now()
    fee_id = db.fee_ledgers.insert_one(
        {
            'student_id': student['_id'],
            'title': payload.title.strip(),
            'amount': round(payload.amount, 2),
            'due_date': datetime.combine(payload.due_date, datetime.min.time(), tzinfo=timezone.utc),
            'notes': payload.notes.strip(),
            'status': 'pending',
            'created_by': oid(current_user['id'], 'created_by'),
            'created_at': now,
            'updated_at': now,
            'payment_link': f"{settings.RAZORPAY_PAYMENT_LINK_BASE}/{int(round(payload.amount))}",
        }
    ).inserted_id
    return serialize_document(db.fee_ledgers.find_one({'_id': fee_id}))


@router.get('/students')
def list_students(db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    students = []
    for student in db.students.find().sort('created_at', -1):
        user = db.users.find_one({'_id': student['user_id']})
        students.append({'student': serialize_document(student), 'user': safe_user_payload(user)})
    return students


@router.get('/faculty')
def list_faculty(db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    faculty_list = []
    for faculty in db.faculty.find().sort('created_at', -1):
        user = db.users.find_one({'_id': faculty['user_id']})
        faculty_list.append({'faculty': serialize_document(faculty), 'user': safe_user_payload(user)})
    return faculty_list


@router.get('/courses')
def list_courses(db: Database = Depends(get_db), _=Depends(require_roles('admin', 'teacher', 'student'))):
    output = []
    for course in db.courses.find().sort('semester', 1):
        faculty = db.faculty.find_one({'_id': course['faculty_id']})
        faculty_user = db.users.find_one({'_id': faculty['user_id']}) if faculty else None
        output.append(
            {
                **serialize_document(course),
                'faculty_name': faculty_user['full_name'] if faculty_user else 'Unassigned',
            }
        )
    return output


@router.get('/dashboard')
def dashboard(db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    pending_fees = list(db.fee_ledgers.aggregate([{'$match': {'status': 'pending'}}, {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}]))
    return {
        'users': db.users.count_documents({'is_active': True}),
        'students': db.students.count_documents({}),
        'faculty': db.faculty.count_documents({}),
        'courses': db.courses.count_documents({}),
        'pending_fees': pending_fees[0]['total'] if pending_fees else 0,
        'attendance_records': db.attendance.count_documents({}),
    }


@router.get('/fees')
def list_fees(
    student_id: str | None = Query(default=None),
    db: Database = Depends(get_db),
    _=Depends(require_roles('admin')),
):
    query: dict = {}
    if student_id:
        query['student_id'] = oid(student_id, 'student_id')
    fees = []
    for fee in db.fee_ledgers.find(query).sort('created_at', -1):
        student = db.students.find_one({'_id': fee['student_id']})
        student_user = db.users.find_one({'_id': student['user_id']}) if student else None
        fees.append(
            {
                **serialize_document(fee),
                'student_name': student_user['full_name'] if student_user else 'Unknown',
                'enrollment_number': student['enrollment_number'] if student else '',
            }
        )
    return fees


@router.patch('/fees/{fee_id}')
def update_fee_status(
    fee_id: str,
    payload: FeeStatusUpdate,
    db: Database = Depends(get_db),
    _=Depends(require_roles('admin')),
):
    result = db.fee_ledgers.find_one_and_update(
        {'_id': oid(fee_id, 'fee_id')},
        {'$set': {'status': payload.status, 'updated_at': utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail='Fee record not found')
    return serialize_document(result)


@router.get('/users')
def list_users(db: Database = Depends(get_db), _=Depends(require_roles('admin'))):
    return [safe_user_payload(user) for user in db.users.find({'is_active': True}).sort('created_at', -1)]


@router.get('/superadmins')
def list_superadmins(db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    return [safe_user_payload(user) for user in db.users.find({'role': 'superadmin', 'is_active': True}).sort('created_at', -1)]


@router.get('/salary/configs')
def salary_configs(db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    configs = [serialize_document(item) for item in db.salary_configs.find().sort('designation', 1)]
    if configs:
        return configs
    now = utc_now()
    for item in DESIGNATION_SALARY_DEFAULTS:
        db.salary_configs.update_one(
            {'designation': item['designation']},
            {
                '$set': {
                    'designation': item['designation'],
                    'monthly_salary': item['monthly_salary'],
                    'updated_at': now,
                },
                '$setOnInsert': {'created_at': now},
            },
            upsert=True,
        )
    return [serialize_document(item) for item in db.salary_configs.find().sort('designation', 1)]


@router.put('/salary/configs')
def upsert_salary_config(payload: SalaryConfigUpsert, db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    now = utc_now()
    db.salary_configs.update_one(
        {'designation': payload.designation.strip()},
        {
            '$set': {
                'designation': payload.designation.strip(),
                'monthly_salary': round(payload.monthly_salary, 2),
                'updated_at': now,
            },
            '$setOnInsert': {'created_at': now},
        },
        upsert=True,
    )
    return {'message': 'Salary config updated'}


@router.post('/salary/disburse')
def disburse_salary(payload: SalaryDisburseRequest, db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    configs = {item['designation']: item for item in db.salary_configs.find()}
    created = 0
    for faculty in db.faculty.find():
        designation = faculty.get('designation', '')
        monthly_salary = configs.get(designation, {}).get('monthly_salary', 0)
        if monthly_salary <= 0:
            continue
        try:
            db.salary_records.insert_one(
                {
                    'faculty_id': faculty['_id'],
                    'designation': designation,
                    'month': payload.month,
                    'amount': monthly_salary,
                    'status': 'credited',
                    'created_at': utc_now(),
                }
            )
            created += 1
        except DuplicateKeyError:
            continue
    return {'message': f'Salary processed for {created} faculty member(s)', 'month': payload.month}


@router.get('/salary/records')
def list_salary_records(month: str | None = Query(default=None), db: Database = Depends(get_db), _=Depends(require_roles('superadmin'))):
    query: dict = {}
    if month:
        query['month'] = month
    output = []
    for item in db.salary_records.find(query).sort('created_at', -1):
        faculty = db.faculty.find_one({'_id': item['faculty_id']})
        user = db.users.find_one({'_id': faculty['user_id']}) if faculty else None
        output.append(
            {
                **serialize_document(item),
                'faculty_name': user['full_name'] if user else 'Unknown',
                'employee_code': faculty.get('employee_code', '') if faculty else '',
            }
        )
    return output
