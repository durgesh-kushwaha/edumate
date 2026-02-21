from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = 'student'
    full_name: str
    enrollment_number: str = Field(min_length=1, pattern=r'^\d+$')
    department: str
    year: int = Field(ge=1, le=6)
    gender: str
    student_phone: str = Field(pattern=r'^\d{10}$')
    parent_name: str
    parent_phone: str = Field(pattern=r'^\d{10}$')
    address_line: str
    pincode: str = Field(pattern=r'^\d{6}$')
    state: str
    city: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: dict
