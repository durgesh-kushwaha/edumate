from datetime import date, datetime
from sqlalchemy import String, Integer, ForeignKey, Date, DateTime, UniqueConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    full_name: Mapped[str] = mapped_column(String(255))


class Student(Base, TimestampMixin):
    __tablename__ = 'students'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True, index=True)
    enrollment_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    department: Mapped[str] = mapped_column(String(100))
    year: Mapped[int] = mapped_column(Integer)


class Faculty(Base, TimestampMixin):
    __tablename__ = 'faculty'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True, index=True)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    designation: Mapped[str] = mapped_column(String(100))


class Course(Base, TimestampMixin):
    __tablename__ = 'courses'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    faculty_id: Mapped[int] = mapped_column(ForeignKey('faculty.id'), index=True)


class Enrollment(Base, TimestampMixin):
    __tablename__ = 'enrollments'
    __table_args__ = (UniqueConstraint('student_id', 'course_id', name='uq_student_course'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('students.id'), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)


class Attendance(Base, TimestampMixin):
    __tablename__ = 'attendance'
    __table_args__ = (UniqueConstraint('student_id', 'course_id', 'attendance_date', name='uq_attendance_day'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('students.id'), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default='present')


class Result(Base, TimestampMixin):
    __tablename__ = 'results'
    __table_args__ = (UniqueConstraint('student_id', 'course_id', name='uq_result_student_course'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('students.id'), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    marks_obtained: Mapped[int] = mapped_column(Integer)
    max_marks: Mapped[int] = mapped_column(Integer)
    grade: Mapped[str] = mapped_column(String(5))


class FaceEncoding(Base, TimestampMixin):
    __tablename__ = 'face_encodings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey('students.id'), unique=True, index=True)
    encoding: Mapped[str] = mapped_column(Text)
    sample_image_path: Mapped[str] = mapped_column(String(255))
