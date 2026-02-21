from functools import lru_cache

from pymongo import ASCENDING, MongoClient
from pymongo.database import Database

from app.core.config import settings


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    return MongoClient(settings.MONGODB_URI)


def get_database() -> Database:
    return get_client()[settings.MONGODB_DB]


def get_db():
    yield get_database()


def setup_indexes() -> None:
    db = get_database()
    db.users.create_index([('email', ASCENDING)], unique=True)
    db.students.create_index([('user_id', ASCENDING)], unique=True)
    db.students.create_index([('enrollment_number', ASCENDING)], unique=True)
    db.faculty.create_index([('user_id', ASCENDING)], unique=True)
    db.faculty.create_index([('employee_code', ASCENDING)], unique=True)
    db.courses.create_index([('code', ASCENDING)], unique=True)
    db.enrollments.create_index([('student_id', ASCENDING), ('course_id', ASCENDING)], unique=True)
    db.results.create_index([('student_id', ASCENDING), ('course_id', ASCENDING)], unique=True)
    db.attendance.create_index([('student_id', ASCENDING), ('course_id', ASCENDING), ('attendance_date', ASCENDING)], unique=True)
    db.face_profiles.create_index([('student_id', ASCENDING)], unique=True)
    db.fee_ledgers.create_index([('student_id', ASCENDING), ('status', ASCENDING)])
    db.registration_requests.create_index([('email', ASCENDING), ('status', ASCENDING)])
    db.attendance_sessions.create_index([('course_id', ASCENDING), ('attendance_date', ASCENDING), ('is_active', ASCENDING)])
    db.assignments.create_index([('course_id', ASCENDING), ('created_at', ASCENDING)])
    db.assignment_submissions.create_index([('assignment_id', ASCENDING), ('student_id', ASCENDING)], unique=True)
    db.salary_configs.create_index([('designation', ASCENDING)], unique=True)
    db.salary_records.create_index([('faculty_id', ASCENDING), ('month', ASCENDING)], unique=True)
    db.exam_schedules.create_index([('department', ASCENDING), ('semester', ASCENDING), ('exam_date', ASCENDING)])
    db.hall_tickets.create_index([('student_id', ASCENDING), ('semester', ASCENDING)], unique=True)
