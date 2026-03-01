# EduMate - Project Deep Analysis & Architecture Guide

## 1. Project Overview & Deep Analysis
**Project Name:** EduMate (EduVision Nexus)
**Description:** A multi-role Educational ERP platform designed for campuses, featuring role-specific portals (Superadmin, Admin, Faculty, Student) and an AI-powered face-recognition attendance system.

### 1.1 Active Production Architecture
The project has evolved, and the current active production architecture consists of two main services and a single database:

1. **Main Web Application (`web/`):**
   - **Tech Stack:** Next.js 16 (App Router), React 19, TypeScript.
   - **Role:** Handles both the Frontend UI and Backend API routes.
   - **Auth:** Custom JWT + HTTP-only cookies.
   - **Database Driver:** Native Node.js MongoDB driver (`mongodb` package).
   - **Styling:** Tailwind CSS (v4).

2. **AI Attendance Service (`services/attendance_service/`):**
   - **Tech Stack:** Python 3.10+, FastAPI, OpenCV, NumPy, PyMongo.
   - **Role:** A dedicated microservice for processing images, matching face encodings against the database, and handling AI attendance workflows.

3. **Database:**
   - **Tech Stack:** MongoDB (local or Atlas).
   - **Role:** Centralized data store for all ERP platform data (users, roles, academics, assignments, exams, fees) and face profile encodings.

### 1.2 Legacy/Deprecated Components
The repository contains older directories that are **no longer part of the active runtime path**:
- `backend/`: Legacy REST API (likely an older FastAPI implementation, given `requirements.txt` with bcrypt and uvicorn).
- `frontend/`: Legacy Vite + React frontend application.
- `ai_engine/`: Older standalone AI scripts (`attendance_engine.py`, `collect_face_dataset.py`).

### 1.3 Key Workflows & Data Flows
- **Authentication:** Role-based access control. Users log in via the Next.js API, which verifies credentials against MongoDB and signs a JWT securely stored in an HTTP-only cookie.
- **Attendance Workflow:**
  1. Frontend (Next.js) captures a video frame/image from the user's camera.
  2. The image is sent to the FastAPI `attendance_service`.
  3. The FastAPI service uses OpenCV to process the face, extracts features, and matches them against stored encodings in MongoDB.
  4. The result (match/no match) is returned to the frontend/database to mark attendance securely.
- **Academic ERP Processing:** Next.js API routes handle standard CRUD operations for assignments, fee declarations (via Razorpay links), student/faculty onboarding, and exam results directly with MongoDB.

---

## 2. Prompt to Generate Architecture Diagram

You can use the following detailed prompt in tools like **ChatGPT (for Mermaid.js generation), Claude, or copy-paste it into an AI visual diagram generator (like Eraser.io, Lucidchart AI, or draw.io AI)** to generate a comprehensive architecture diagram.

***

**Copy the prompt below:**

> "Act as a Senior Cloud Solutions Architect. Create a detailed system architecture diagram for an educational ERP platform called 'EduMate'. 
> 
> **System Components & Tech Stack to include:**
> 1. **Client/User Endpoints (Frontend):**
>    - Role-based Portals: Superadmin, Admin, Faculty, and Student interfaces.
>    - Tech: Next.js 16, React 19, TailwindCSS.
> 
> 2. **Primary Application Server (Monolithic UI + API):**
>    - Host: Vercel or Netlify.
>    - Tech: Next.js API Routes (Node.js).
>    - Responsibilities: JWT Authentication (HTTP-only cookies), ERP workflows (fees, exams, assignments, timetables), User Management, and Routing.
>    - External Integration: Razorpay (Payment Links).
> 
> 3. **AI Microservice (Attendance Engine):**
>    - Host: Render, Railway, or VPS.
>    - Tech: FastAPI (Python), OpenCV, NumPy.
>    - Responsibilities: Receives image frames from the frontend, computes face encodings, and performs face matching algorithm against stored database profiles.
> 
> 4. **Database Layer:**
>    - Host: MongoDB Atlas (Cloud Database).
>    - Tech: MongoDB.
>    - Responsibilities: Stores all relational ERP data (Users, Departments, Semesters, Fees, Results) and Vector/Array-based facial encodings. Both Next.js and FastAPI connect directly to this database.
> 
> **Data Flow / Connections to map:**
> - [Students/Faculty/Admins] <--(HTTPS)--> [Next.js Web App]
> - [Next.js Web App] <--(Internal API Calls over HTTPS)--> [FastAPI Attendance Service] : Send face images/prompts.
> - [Next.js Web App] <--(MongoDB Native Connection)--> [MongoDB Atlas] : Standard CRUD operations and user auth.
> - [FastAPI Attendance Service] <--(PyMongo Connection)--> [MongoDB Atlas] : Fetch and compare face embeddings.
> - [Next.js Web App] <--(External API)--> [Razorpay Gateway] : Payment link redirection.
> 
> Please output the architecture using **Mermaid.js code (graph TD layout)**, with clear groupings (subgraphs) for 'Client Layer', 'Application Layer', 'AI Microservice Layer', and 'Database Layer'. Apply custom styling with distinct colors for the Next.js app, FastAPI service, and MongoDB database to make it visually appealing."
