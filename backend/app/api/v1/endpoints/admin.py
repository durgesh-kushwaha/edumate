from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models import User, Student, Faculty, Course
from app.schemas.domain import StudentCreate, FacultyCreate, CourseCreate

router = APIRouter(prefix='/admin', tags=['Admin'])


@router.post('/students')
def create_student(payload: StudentCreate, db: Session = Depends(get_db), _=Depends(require_roles('admin'))):
    if not db.query(User).filter(User.id == payload.user_id, User.role == 'student').first():
        raise HTTPException(status_code=404, detail='Linked student user not found')
    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.post('/faculty')
def create_faculty(payload: FacultyCreate, db: Session = Depends(get_db), _=Depends(require_roles('admin'))):
    if not db.query(User).filter(User.id == payload.user_id, User.role == 'teacher').first():
        raise HTTPException(status_code=404, detail='Linked faculty user not found')
    faculty = Faculty(**payload.model_dump())
    db.add(faculty)
    db.commit()
    db.refresh(faculty)
    return faculty


@router.post('/courses')
def create_course(payload: CourseCreate, db: Session = Depends(get_db), _=Depends(require_roles('admin'))):
    if not db.query(Faculty).filter(Faculty.id == payload.faculty_id, Faculty.is_deleted.is_(False)).first():
        raise HTTPException(status_code=404, detail='Faculty not found')
    course = Course(**payload.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get('/dashboard')
def dashboard(db: Session = Depends(get_db), _=Depends(require_roles('admin'))):
    return {
        'users': db.query(User).filter(User.is_deleted.is_(False)).count(),
        'students': db.query(Student).filter(Student.is_deleted.is_(False)).count(),
        'faculty': db.query(Faculty).filter(Faculty.is_deleted.is_(False)).count(),
        'courses': db.query(Course).filter(Course.is_deleted.is_(False)).count(),
    }
