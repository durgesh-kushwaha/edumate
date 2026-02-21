# EduMate

EduMate is a multi-role ERP platform for campuses with role-specific portals for superadmin, admin, faculty, and students.

The active production architecture in this repository is:
- `web/` -> Next.js + TypeScript app (UI + API routes)
- `services/attendance_service/` -> FastAPI + OpenCV attendance engine
- MongoDB -> single database for platform data and face profiles

## 1. Core Capabilities

- Role-based portals: superadmin, admin, faculty, student
- Student self-registration with superadmin approval workflow
- Admin/superadmin onboarding for students and faculty
- Department-based academics with timetable and semester mapping
- Face registration for students (duplicate face registration blocked)
- Live face-based attendance workflows
- Manual attendance by faculty with topic-covered field
- Attendance CSV export for faculty
- Assignments and e-content:
  - faculty publishes
  - students download and upload PDF submissions
- Student exam and result workflows:
  - hall ticket
  - exam schedules
  - semester-wise results
  - exam-type views
- Fees and payment declaration flow with Razorpay link
- Profile update and password change for all roles
- Faculty salary configuration and disbursement by superadmin
- Campus notices with role/department/course targeting

## 2. Current Tech Stack

- Frontend + Backend API: Next.js 16 + React 19 + TypeScript
- DB driver: MongoDB Node.js driver
- Auth: JWT + HTTP-only cookie
- Face service: FastAPI + OpenCV + NumPy + PyMongo
- Data store: MongoDB (local or Atlas)

## 3. Repository Structure

```text
.
├── web/                              # Main app (deploy on Netlify or Vercel)
│   ├── src/app/page.tsx              # Multi-role portal UI
│   ├── src/app/api/...               # App API routes
│   ├── src/lib/db.ts                 # DB setup + seed logic
│   └── .env.example
├── services/
│   └── attendance_service/           # Python attendance service
│       ├── main.py
│       ├── requirements.txt
│       └── .env.example
└── package.json                      # Root scripts (dev/setup/build)
```

Notes:
- `backend/` and `frontend/` directories are legacy and not used by the current runtime path.
- Deploy only `web/` and `services/attendance_service/`.

## 4. Local Development

### Prerequisites

- Node.js 20+
- Python 3.10+
- MongoDB local instance, or Atlas URI

### Install dependencies

```bash
npm install
npm run setup
```

### Environment files (local)

```bash
cp web/.env.example web/.env.local
cp services/attendance_service/.env.example services/attendance_service/.env
```

### Run both services

```bash
npm run dev
```

Services:
- Web app: `http://localhost:5173`
- Attendance engine health: `http://localhost:8010/health`

### Build

```bash
npm run build
```

## 5. Environment Variables

### 5.1 Web app (`web/.env.local` for local, Vercel env for production)

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=eduvision_nexus_v2
JWT_SECRET=replace_with_long_random_secret
PY_ATTENDANCE_URL=http://127.0.0.1:8010
PY_ATTENDANCE_TIMEOUT_MS=15000
```

Production example:

```env
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/eduvision_nexus_v2?retryWrites=true&w=majority
MONGODB_DB=eduvision_nexus_v2
JWT_SECRET=<long_random_secret_64_plus_chars>
PY_ATTENDANCE_URL=https://<your-attendance-service-domain>
PY_ATTENDANCE_TIMEOUT_MS=15000
```

### 5.2 Attendance service (`services/attendance_service/.env` for local, service env for production)

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=eduvision_nexus_v2
FACE_MATCH_THRESHOLD=0.58
```

Production:

```env
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/eduvision_nexus_v2?retryWrites=true&w=majority
MONGODB_DB=eduvision_nexus_v2
FACE_MATCH_THRESHOLD=0.58
```

## 6. Seeded Data and Default Users

On first run, seed/setup creates required base data and users.

Default accounts:
- Superadmin: `durgeshcgc@gmail.com / Pass@1234` (Durgesh Kushwaha)
- Admin: `admin@eduvision.com / Pass@1234`
- Faculty:
  - `teacher@eduvision.com / Pass@1234`
  - `teacher2@eduvision.com / Pass@1234`
  - `teacher3@eduvision.com / Pass@1234`
  - `teacher4@eduvision.com / Pass@1234`
- Student: `student@eduvision.com / Pass@1234`

Seed behavior highlights:
- Student sample data is constrained to semester 4 (year 2)
- Student enrollments are capped by year-to-semester mapping
- CSE subjects are distributed across multiple sample faculty

## 7. Production Deployment (Recommended)

### 7.1 MongoDB Atlas setup

1. Create cluster.
2. Create DB user with read/write access.
3. Add Network Access:
   - recommended: only deploy provider egress IPs
   - temporary/testing: `0.0.0.0/0`
4. Copy connection string and set `MONGODB_URI` in both services.

### 7.2 Deploy attendance service first (Render)

Render service setup:

1. In Render dashboard, click `New +` -> `Web Service`.
2. Connect your GitHub repo.
3. Set root directory to:
   - `services/attendance_service`
4. Runtime:
   - `Python 3`
5. Build command:
   - `pip install -r requirements.txt`
6. Start command:
   - `python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Health check path:
   - `/health`
8. Add environment variables:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `FACE_MATCH_THRESHOLD` (example `0.58`)

Render free plan note:
- Cold starts are expected after inactivity (commonly around 30 to 60 seconds).
- EduMate includes frontend-triggered warm-up to reduce wait when users open the site.

Service root:
- `services/attendance_service`

Build command:
```bash
pip install -r requirements.txt
```

Start command:
```bash
python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set env:
- `MONGODB_URI`
- `MONGODB_DB`
- `FACE_MATCH_THRESHOLD`

Verify:
- Open `https://<attendance-domain>/health`
- Should return `{"status":"ok"}`

### 7.3 Deploy web app on Netlify

Important:
- Netlify hosts the Next.js app (`web/`) directly.
- The Python attendance service is not deployed on Netlify in this setup.
- Deploy `services/attendance_service` separately (Render/Railway/VPS), then set `PY_ATTENDANCE_URL` in Netlify.

Netlify project setup:
- Connect repository from Git provider
- Framework preset: `Next.js` (recommended)
- For monorepo selection, choose the `web` app directory when prompted

If you configure manually, use:
- Base directory: `web`
- Build command: `npm run build`
- Publish directory: `.next`

Set env in Netlify:
- `MONGODB_URI`
- `MONGODB_DB`
- `JWT_SECRET`
- `PY_ATTENDANCE_URL` (attendance service URL from step 7.2)
- `PY_ATTENDANCE_TIMEOUT_MS` (recommended `15000`)

Deploy and verify:
- Login works
- Role dashboards load
- Attendance scan endpoints can reach Python service

### 7.4 Deploy web app on Vercel

1. Import the same repository in Vercel.
2. Configure project root directory:
   - `web`
3. Framework preset:
   - `Next.js`
4. Add env variables:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `JWT_SECRET`
   - `PY_ATTENDANCE_URL`
   - `PY_ATTENDANCE_TIMEOUT_MS` (recommended `15000`)
   - `NEXT_TELEMETRY_DISABLED=1`
5. Deploy.

Quick copy file:
- Use `web/vercel-env.example` as reference while adding Vercel environment variables.

### 7.5 Render attendance warm-up on frontend open

Implemented in app:
- Frontend automatically calls `/api/attendance/warmup` once per session on first page load.
- Server route pings Render attendance `/health`.
- This wakes Render earlier so login-to-attendance flow feels faster.

Manual checks:
- Open your live site.
- Open:
  - `https://<your-web-domain>/api/attendance/warmup`
  - `https://<your-render-attendance-domain>/health`

Important:
- Free Render instances can still sleep again after inactivity.
- Warm-up improves first-use delay but cannot guarantee zero cold-start on free tier.

## 8. Operational Notes

- Razorpay payment link currently configured as:
  - `https://razorpay.me/@zavraq`
- Attendance and face profile data are stored in MongoDB.
- Timetable-based "today classes" logic only shows mapped classes for current weekday.
- If today is a non-scheduled day (for example Saturday in sample data), today class sections are intentionally empty.

## 9. Security Checklist Before Going Live

- Rotate all default passwords immediately
- Rotate MongoDB password if it was shared in chat/logs
- Use strong `JWT_SECRET`
- Restrict Atlas network access
- Use HTTPS-only domains for both services
- Keep `PY_ATTENDANCE_URL` pointed to trusted endpoint only

## 10. Useful Commands

```bash
# root
npm run setup
npm run dev
npm run build

# web only
npm --prefix web run dev -- --hostname 0.0.0.0 --port 5173
npm --prefix web run build

# attendance service only
cd services/attendance_service
python3 -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload
```

---

If you are deploying for the first time, complete in this order:
1. Atlas ready
2. Attendance service live
3. Web (Netlify) live with correct `PY_ATTENDANCE_URL`
