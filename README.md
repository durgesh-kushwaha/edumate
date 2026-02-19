# Smart Student Record Management System with AI-Based Face Recognition Attendance

## Tech Stack
- Frontend: React + Vite + Tailwind + Axios + Recharts
- Backend: FastAPI + SQLAlchemy + JWT + Pydantic
- Database: PostgreSQL (3NF schema)
- AI: OpenCV + face_recognition + NumPy

## Folder Structure
- `backend/`: API server, auth, RBAC, SRMS/attendance endpoints
- `frontend/`: role-based dashboards and reports
- `ai_engine/`: face dataset + attendance recognition engine
- `database/`: schema and sample data
- `docs/`: architecture, workflow, and project report structure

## Quick Setup
1. Copy environment file:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Start Postgres and API:
   ```bash
   docker compose up --build
   ```
3. Run backend locally (optional):
   ```bash
   cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
   ```
4. Seed base users:
   ```bash
   cd backend && python -m scripts.seed_data
   ```
5. Run frontend:
   ```bash
   cd frontend && npm install && npm run dev
   ```

## Key API Endpoints
- Auth: `/api/v1/auth/register`, `/api/v1/auth/login`
- Admin: `/api/v1/admin/students`, `/faculty`, `/courses`, `/dashboard`
- Teacher: `/api/v1/teacher/courses`, `/results`, `/attendance-report/{course_id}`
- Student: `/api/v1/student/profile`, `/attendance`, `/results`
- Attendance Engine: `/api/v1/attendance/face-encodings`, `/mark`

Swagger docs available at `/docs`.

## Security Controls
- Bcrypt password hashing
- JWT token expiration
- RBAC-enforced endpoints
- Request validation with Pydantic
- SQLAlchemy ORM (prevents SQL injection patterns)
- CORS configured through environment variables
- Global exception handling + logging
- Soft-delete fields in all tables

## Deployment Guides
### Render
- Create PostgreSQL service and Web Service.
- Set env vars from `.env.example`.
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 10000`.

### Railway
- Provision PostgreSQL plugin.
- Deploy backend folder as service.
- Configure `DATABASE_URL` and JWT secrets.

### AWS EC2 (basic)
- Launch Ubuntu instance.
- Install Docker + Docker Compose.
- Clone repo and run `docker compose up --build -d`.
- Expose ports 80/443 via Nginx reverse proxy.

## Academic Documentation Checklist
- Architecture: `docs/architecture.md`
- Face workflow: `docs/face_workflow.md`
- Report skeleton: `docs/project_report_template.md`
- Database schema: `database/schema.sql`
