from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles, get_current_user
from app.db.session import get_db
from app.models import Faculty, Course, Enrollment, Result, Attendance
from app.schemas.domain import ResultCreate

router = APIRouter(prefix='/teacher', tags=['Teacher'])


@router.get('/courses')
def assigned_courses(db: Session = Depends(get_db), current_user=Depends(require_roles('teacher'))):
    faculty = db.query(Faculty).filter(Faculty.user_id == current_user.id, Faculty.is_deleted.is_(False)).first()
    if not faculty:
        raise HTTPException(status_code=404, detail='Faculty profile not found')
    return db.query(Course).filter(Course.faculty_id == faculty.id, Course.is_deleted.is_(False)).all()


@router.post('/results')
def enter_marks(payload: ResultCreate, db: Session = Depends(get_db), _=Depends(require_roles('teacher'))):
    result = Result(**payload.model_dump())
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.get('/attendance-report/{course_id}')
def attendance_report(course_id: int, db: Session = Depends(get_db), _=Depends(require_roles('teacher'))):
    total = db.query(Enrollment).filter(Enrollment.course_id == course_id, Enrollment.is_deleted.is_(False)).count()
    present = db.query(Attendance).filter(Attendance.course_id == course_id, Attendance.is_deleted.is_(False)).count()
    return {'course_id': course_id, 'total_enrolled': total, 'present_records': present}
