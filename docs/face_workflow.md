# Face Recognition Workflow

1. Capture student face samples using `collect_face_dataset.py`.
2. Generate face encodings (can be integrated into preprocessing script).
3. Upload face encodings via backend `/attendance/face-encoding/{student_id}` endpoint.
4. Start `attendance_engine.py`.
5. Engine fetches all encodings through API, processes webcam frames in real-time.
6. On match, engine calls `/attendance/mark` endpoint.
7. Backend checks duplicate attendance and stores one entry per day per course.
8. Unknown faces are labeled and ignored.
