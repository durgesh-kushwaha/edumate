from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pymongo.database import Database

from app.core.config import settings
from app.db.mongo import get_db
from app.utils.mongo import oid, serialize_document

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/v1/auth/login')
ROLE_HIERARCHY = {
    'superadmin': {'superadmin', 'admin', 'teacher', 'student'},
    'admin': {'admin'},
    'teacher': {'teacher'},
    'student': {'student'},
}


def get_current_user(token: str = Depends(oauth2_scheme), db: Database = Depends(get_db)) -> dict:
    credentials_error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get('sub')
        if not isinstance(user_id, str):
            raise credentials_error
    except JWTError:
        raise credentials_error
    try:
        user_oid = oid(user_id, 'user id')
    except HTTPException:
        raise credentials_error
    user = db.users.find_one({'_id': user_oid, 'is_active': True})
    if not user:
        raise credentials_error
    user_data = serialize_document(user) or {}
    user_data.pop('hashed_password', None)
    return user_data


def require_roles(*roles: str):
    def checker(current_user: dict = Depends(get_current_user)) -> dict:
        current_role = current_user['role']
        allowed = ROLE_HIERARCHY.get(current_role, {current_role})
        if not allowed.intersection(roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Permission denied')
        return current_user

    return checker
