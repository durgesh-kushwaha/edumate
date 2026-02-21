from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.database import Database

from app.api.deps import get_current_user, require_roles
from app.core.security import get_password_hash, verify_password
from app.db.mongo import get_db
from app.schemas.domain import PasswordUpdateRequest, ProfileUpdateRequest
from app.utils.mongo import oid, serialize_document, utc_now

router = APIRouter(prefix='/account', tags=['Account'])


def safe_user_payload(user_doc: dict | None) -> dict | None:
    payload = serialize_document(user_doc)
    if payload:
        payload.pop('hashed_password', None)
    return payload


def get_profile_doc(db: Database, current_user: dict) -> tuple[str, dict | None]:
    if current_user['role'] == 'student':
        return 'student', db.students.find_one({'user_id': oid(current_user['id'], 'current user id')})
    if current_user['role'] == 'teacher':
        return 'faculty', db.faculty.find_one({'user_id': oid(current_user['id'], 'current user id')})
    return 'user', None


@router.get('/me')
def me(db: Database = Depends(get_db), current_user=Depends(get_current_user)):
    user = db.users.find_one({'_id': oid(current_user['id'], 'current user id')})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    profile_kind, profile = get_profile_doc(db, current_user)
    return {'user': safe_user_payload(user), 'profile_kind': profile_kind, 'profile': serialize_document(profile)}


@router.patch('/me')
def update_profile(
    payload: ProfileUpdateRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student', 'teacher', 'admin', 'superadmin')),
):
    user_oid = oid(current_user['id'], 'current user id')
    update_user: dict = {'updated_at': utc_now()}
    if payload.full_name:
        update_user['full_name'] = payload.full_name.strip()

    db.users.find_one_and_update({'_id': user_oid}, {'$set': update_user}, return_document=ReturnDocument.AFTER)

    if current_user['role'] == 'student':
        update_student = {'updated_at': utc_now()}
        if payload.student_phone is not None:
            update_student['student_phone'] = payload.student_phone
        if payload.parent_name is not None:
            update_student['parent_name'] = payload.parent_name.strip()
        if payload.parent_phone is not None:
            update_student['parent_phone'] = payload.parent_phone
        if payload.address_line is not None:
            update_student['address_line'] = payload.address_line.strip()
        if payload.state is not None:
            update_student['state'] = payload.state.strip()
        if payload.city is not None:
            update_student['city'] = payload.city.strip()
        if payload.pincode is not None:
            update_student['pincode'] = payload.pincode
        db.students.update_one({'user_id': user_oid}, {'$set': update_student})

    if current_user['role'] == 'teacher':
        update_faculty = {'updated_at': utc_now()}
        if payload.faculty_phone is not None:
            update_faculty['faculty_phone'] = payload.faculty_phone
        db.faculty.update_one({'user_id': user_oid}, {'$set': update_faculty})

    user = db.users.find_one({'_id': user_oid})
    profile_kind, profile = get_profile_doc(db, current_user)
    return {'user': safe_user_payload(user), 'profile_kind': profile_kind, 'profile': serialize_document(profile)}


@router.patch('/password')
def update_password(
    payload: PasswordUpdateRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student', 'teacher', 'admin', 'superadmin')),
):
    user_oid = oid(current_user['id'], 'current user id')
    user = db.users.find_one({'_id': user_oid})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    if not verify_password(payload.current_password, user['hashed_password']):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    db.users.update_one(
        {'_id': user_oid},
        {'$set': {'hashed_password': get_password_hash(payload.new_password), 'updated_at': utc_now()}},
    )
    return {'message': 'Password updated successfully'}
