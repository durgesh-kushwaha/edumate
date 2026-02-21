# System Architecture

## Overview
- React frontend (responsive, role-aware ERP) consumes FastAPI REST endpoints.
- FastAPI handles JWT auth, RBAC, ERP business logic, and MongoDB persistence.
- OpenCV face engine fetches face profiles and posts attendance marks.
- Razorpay payment links are generated per fee record for student payment.

## High-Level Data Flow
1. User logs in/registers and receives JWT.
2. Frontend calls role-specific endpoints with bearer token.
3. Admin manages students/faculty/courses/enrollments/fees.
4. Teacher manages course marks and attendance.
5. Student views profile, attendance, marks, and fee dues.
6. Face engine calls attendance APIs after face recognition.

## Core Collections (MongoDB)
- `users`
- `students`
- `faculty`
- `courses`
- `enrollments`
- `attendance`
- `results`
- `face_profiles`
- `fee_ledgers`

## Roles
- Superadmin: full admin controls with global override access
- Admin: full ERP controls + fee status updates
- Teacher: course ownership, marks submission, attendance reporting
- Student: academic and fee visibility + payment action
