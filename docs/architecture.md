# System Architecture

## Overview
- Frontend (React + Tailwind) consumes FastAPI REST endpoints.
- FastAPI handles auth, validation, RBAC, business logic, and PostgreSQL persistence.
- OpenCV attendance engine recognizes faces and calls protected backend attendance endpoints.
- PostgreSQL stores normalized academic and attendance records.

## Data Flow
1. User logs in via frontend and receives JWT.
2. Frontend calls role-specific endpoints with bearer token.
3. AI engine obtains face encodings through API.
4. AI engine matches detected face and calls `/attendance/mark`.
5. Backend enforces duplicate attendance prevention and stores valid records.

## ER Diagram (Text)
- `users` 1-1 `students`
- `users` 1-1 `faculty`
- `faculty` 1-M `courses`
- `students` M-N `courses` through `enrollments`
- `students` 1-M `attendance`
- `courses` 1-M `attendance`
- `students` 1-M `results`
- `courses` 1-M `results`
- `students` 1-1 `face_encodings`

## Use Case Diagram (Text)
- Admin: manage students/faculty/courses, dashboard analytics.
- Teacher: view assigned courses, submit marks, view attendance reports, run AI attendance.
- Student: view profile, attendance %, and marks.
