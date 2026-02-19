from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models import Attendance, Student, FaceEncoding
from app.schemas.domain import AttendanceMarkRequest

router = APIRouter(prefix='/attendance', tags=['Attendance'])


@router.post('/mark', status_code=status.HTTP_201_CREATED)
def mark_attendance(payload: AttendanceMarkRequest, db: Session = Depends(get_db), _=Depends(require_roles('teacher', 'admin'))):
    student = db.query(Student).filter(Student.id == payload.student_id, Student.is_deleted.is_(False)).first()
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    existing = db.query(Attendance).filter(
        Attendance.student_id == payload.student_id,
        Attendance.course_id == payload.course_id,
        Attendance.attendance_date == payload.attendance_date,
        Attendance.is_deleted.is_(False),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail='Attendance already marked for this student today')

    record = Attendance(
        student_id=payload.student_id,
        course_id=payload.course_id,
        attendance_date=payload.attendance_date,
        marked_at=payload.marked_at,
        status='present',
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post('/face-encoding/{student_id}')
def upload_face_encoding(student_id: int, encoding: list[float], sample_image_path: str, db: Session = Depends(get_db), _=Depends(require_roles('admin', 'teacher'))):
    encoding_text = ','.join(str(v) for v in encoding)
    face = db.query(FaceEncoding).filter(FaceEncoding.student_id == student_id, FaceEncoding.is_deleted.is_(False)).first()
    if not face:
        face = FaceEncoding(student_id=student_id, encoding=encoding_text, sample_image_path=sample_image_path)
        db.add(face)
    else:
        face.encoding = encoding_text
        face.sample_image_path = sample_image_path
    db.commit()
    return {'message': 'Face encoding saved'}


@router.get('/face-encodings')
def get_face_encodings(db: Session = Depends(get_db), _=Depends(require_roles('admin', 'teacher'))):
    records = db.query(FaceEncoding).filter(FaceEncoding.is_deleted.is_(False)).all()
    return [
        {
            'student_id': item.student_id,
            'encoding': [float(v) for v in item.encoding.split(',') if v],
            'sample_image_path': item.sample_image_path,
        }
        for item in records
    ]
