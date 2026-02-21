from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.mongo import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.utils.mongo import serialize_document, utc_now

router = APIRouter(prefix='/auth', tags=['Auth'])
ALLOWED_ROLES = {'student'}


def build_user_payload(user: dict, profile: dict | None = None) -> dict:
    output = {
        'id': str(user['_id']),
        'email': user['email'],
        'full_name': user['full_name'],
        'role': user['role'],
    }
    if profile:
        output['profile'] = serialize_document(profile)
    return output


@router.post('/register', status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Database = Depends(get_db)):
    normalized_email = payload.email.lower()
    role = payload.role.lower().strip() if payload.role else 'student'
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail='Only student self-registration is allowed')
    if db.users.find_one({'email': normalized_email}):
        raise HTTPException(status_code=409, detail='Email already exists')
    if db.registration_requests.find_one({'email': normalized_email, 'status': 'pending'}):
        raise HTTPException(status_code=409, detail='A pending registration request already exists for this email')
    now = utc_now()
    try:
        request_id = db.registration_requests.insert_one(
            {
                'email': normalized_email,
                'hashed_password': get_password_hash(payload.password),
                'role': role,
                'full_name': payload.full_name.strip(),
                'enrollment_number': payload.enrollment_number.strip(),
                'department': payload.department.strip(),
                'year': payload.year,
                'gender': payload.gender.strip(),
                'student_phone': payload.student_phone.strip(),
                'parent_name': payload.parent_name.strip(),
                'parent_phone': payload.parent_phone.strip(),
                'address_line': payload.address_line.strip(),
                'pincode': payload.pincode.strip(),
                'state': payload.state.strip(),
                'city': payload.city.strip(),
                'status': 'pending',
                'remarks': '',
                'submitted_at': now,
                'created_at': now,
                'updated_at': now,
            }
        ).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Account or profile values already exist')
    return {
        'request_id': str(request_id),
        'status': 'pending',
        'message': 'Registration submitted. Superadmin approval is required before login.',
    }


@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, db: Database = Depends(get_db)):
    user = db.users.find_one({'email': payload.email.lower(), 'is_active': True})
    if not user or not verify_password(payload.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    profile = None
    if user['role'] == 'student':
        profile = db.students.find_one({'user_id': user['_id']})
    elif user['role'] == 'teacher':
        profile = db.faculty.find_one({'user_id': user['_id']})
    return TokenResponse(
        access_token=create_access_token(str(user['_id']), user['role']),
        user=build_user_payload(user, profile),
    )
