from datetime import date, datetime
from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    user_id: int
    enrollment_number: str
    department: str
    year: int = Field(ge=1, le=6)


class FacultyCreate(BaseModel):
    user_id: int
    employee_code: str
    designation: str


class CourseCreate(BaseModel):
    code: str
    title: str
    faculty_id: int


class EnrollmentCreate(BaseModel):
    student_id: int
    course_id: int


class ResultCreate(BaseModel):
    student_id: int
    course_id: int
    marks_obtained: int
    max_marks: int
    grade: str


class AttendanceMarkRequest(BaseModel):
    student_id: int
    course_id: int
    attendance_date: date
    marked_at: datetime
    source: str = 'face_engine'
