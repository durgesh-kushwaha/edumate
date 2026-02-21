from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def oid(value: str, field_name: str = 'id') -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=422, detail=f'Invalid {field_name}')
    return ObjectId(value)


def serialize_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    output: dict[str, Any] = {}
    for key, value in document.items():
        if key == '_id':
            output['id'] = str(value)
            continue
        if isinstance(value, ObjectId):
            output[key] = str(value)
            continue
        if isinstance(value, datetime):
            output[key] = value.isoformat()
            continue
        output[key] = value
    return output
