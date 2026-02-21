from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class StudentCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    enrollment_number: str = Field(min_length=1, pattern=r'^\d+$')
    department: str
    year: int = Field(ge=1, le=6)
    gender: str = ''
    student_phone: str = Field(default='', pattern=r'^$|^\d{10}$')
    parent_name: str = ''
    parent_phone: str = Field(default='', pattern=r'^$|^\d{10}$')
    address_line: str = ''
    pincode: str = Field(default='', pattern=r'^$|^\d{6}$')
    state: str = ''
    city: str = ''


class FacultyCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    employee_code: str
    designation: str
    department: str
    faculty_phone: str = Field(default='', pattern=r'^$|^\d{10}$')


class CourseCreate(BaseModel):
    code: str
    title: str
    faculty_id: str
    semester: int = Field(ge=1, le=8)
    credits: int = Field(ge=1, le=6)


class EnrollmentCreate(BaseModel):
    student_id: str
    course_id: str


class ResultCreate(BaseModel):
    student_id: str
    course_id: str
    marks_obtained: int = Field(ge=0)
    max_marks: int = Field(gt=0)


class AttendanceMarkRequest(BaseModel):
    student_id: str
    course_id: str
    attendance_date: date
    marked_at: datetime
    source: str = 'face_engine'


class AttendanceBatchMarkRequest(BaseModel):
    course_id: str
    student_ids: list[str] = Field(min_length=1)
    attendance_date: date | None = None
    marked_at: datetime | None = None
    source: str = 'faculty_session'


class FaceEncodingUpsert(BaseModel):
    encoding: list[float]
    sample_image_path: str = ''


class FaceRecognitionRequest(BaseModel):
    course_id: str
    encoding: list[float]
    tolerance: float = Field(default=0.55, ge=0.1, le=1.0)


class FeeCreate(BaseModel):
    student_id: str
    title: str
    amount: float = Field(gt=0)
    due_date: date
    notes: str = ''


class FeeStatusUpdate(BaseModel):
    status: str = Field(pattern='^(pending|paid|overdue)$')


class PaymentCreateRequest(BaseModel):
    fee_id: str


class SuperAdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str


class AttendanceSessionStartRequest(BaseModel):
    course_id: str
    allow_student_mark: bool = True


class AttendanceSessionStopRequest(BaseModel):
    course_id: str


class RegistrationDecisionRequest(BaseModel):
    action: str = Field(pattern='^(approve|reject)$')
    remarks: str = ''
    full_name: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    enrollment_number: str | None = Field(default=None, pattern=r'^\d+$')
    department: str | None = None
    year: int | None = Field(default=None, ge=1, le=6)
    gender: str | None = None
    student_phone: str | None = Field(default=None, pattern=r'^\d{10}$')
    parent_name: str | None = None
    parent_phone: str | None = Field(default=None, pattern=r'^\d{10}$')
    address_line: str | None = None
    pincode: str | None = Field(default=None, pattern=r'^\d{6}$')
    state: str | None = None
    city: str | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    student_phone: str | None = Field(default=None, pattern=r'^\d{10}$')
    parent_name: str | None = None
    parent_phone: str | None = Field(default=None, pattern=r'^\d{10}$')
    faculty_phone: str | None = Field(default=None, pattern=r'^\d{10}$')
    address_line: str | None = None
    state: str | None = None
    city: str | None = None
    pincode: str | None = Field(default=None, pattern=r'^\d{6}$')


class PasswordUpdateRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class SalaryConfigUpsert(BaseModel):
    designation: str
    monthly_salary: float = Field(gt=0)


class SalaryDisburseRequest(BaseModel):
    month: str = Field(pattern=r'^\d{4}-\d{2}$')


class AttendanceStudentLiveMarkResponse(BaseModel):
    message: str
    course_id: str
    attendance_date: str
    distance: float
