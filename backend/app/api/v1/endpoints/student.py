from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models import Student, Attendance, Enrollment, Result

router = APIRouter(prefix='/student', tags=['Student'])


@router.get('/profile')
def profile(db: Session = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = db.query(Student).filter(Student.user_id == current_user.id, Student.is_deleted.is_(False)).first()
    if not student:
        raise HTTPException(status_code=404, detail='Student profile not found')
    return student


@router.get('/attendance')
def attendance_percentage(db: Session = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = db.query(Student).filter(Student.user_id == current_user.id, Student.is_deleted.is_(False)).first()
    total_classes = db.query(Enrollment).filter(Enrollment.student_id == student.id, Enrollment.is_deleted.is_(False)).count()
    attended = db.query(func.count(Attendance.id)).filter(Attendance.student_id == student.id, Attendance.is_deleted.is_(False)).scalar() or 0
    percentage = (attended / total_classes * 100) if total_classes else 0
    return {'student_id': student.id, 'attendance_percentage': round(percentage, 2)}


@router.get('/results')
def results(db: Session = Depends(get_db), current_user=Depends(require_roles('student'))):
    student = db.query(Student).filter(Student.user_id == current_user.id, Student.is_deleted.is_(False)).first()
    return db.query(Result).filter(Result.student_id == student.id, Result.is_deleted.is_(False)).all()
