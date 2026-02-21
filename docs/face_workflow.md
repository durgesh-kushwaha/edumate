# Face Recognition Attendance Workflow

## Option A: UI/API Driven
1. Admin/teacher creates student and enrollment.
2. Admin captures multiple face images live and registers via `/api/v1/attendance/register-face-live/{student_id}`.
3. Images are stored locally under `FACE_REGISTRY_DIR/<student_id>/`.
4. Duplicate registration is blocked if a face profile already exists for that student.
5. (Optional) Upload explicit encoding via `/api/v1/attendance/face-encoding/{student_id}`.
6. Verify face descriptor with `/api/v1/attendance/verify-face`.
7. API records attendance for matched student/course/day.

## Option B: OpenCV Engine (camera live)
1. Set env vars:
   - `AI_API_TOKEN` (teacher/admin JWT)
   - `COURSE_ID` (MongoDB course id)
   - `API_BASE` (default `http://localhost:8000/api/v1`)
2. Run `python ai_engine/attendance_engine.py`.
3. Engine fetches face encodings using `/attendance/face-encodings`.
4. On recognition, engine calls `/attendance/mark`.
5. Duplicate marks on the same day are prevented at DB index level.

## Notes
- Tolerance can be tuned via `/attendance/verify-face` payload.
- Keep high-quality sample images and stable lighting for better recognition.
- If `opencv-python` + `face_recognition` are unavailable, backend falls back to a lightweight 128-d grayscale descriptor so live registration still works locally.
