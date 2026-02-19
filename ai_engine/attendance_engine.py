"""AI attendance engine that recognizes faces and calls backend attendance APIs."""
import json
import os
from datetime import datetime

import cv2
import face_recognition
import numpy as np
import requests

API_BASE = os.getenv('API_BASE', 'http://localhost:8000/api/v1')
API_TOKEN = os.getenv('AI_API_TOKEN', '')
COURSE_ID = int(os.getenv('COURSE_ID', '1'))
HEADERS = {'Authorization': f'Bearer {API_TOKEN}'}


def fetch_face_encodings():
    response = requests.get(f'{API_BASE}/attendance/face-encodings', headers=HEADERS, timeout=10)
    response.raise_for_status()
    data = response.json()
    return [item['student_id'] for item in data], [np.array(item['encoding']) for item in data]


def mark_attendance(student_id: int):
    payload = {
        'student_id': student_id,
        'course_id': COURSE_ID,
        'attendance_date': datetime.utcnow().date().isoformat(),
        'marked_at': datetime.utcnow().isoformat(),
        'source': 'opencv_face_recognition',
    }
    response = requests.post(f'{API_BASE}/attendance/mark', headers=HEADERS, json=payload, timeout=10)
    if response.status_code == 409:
        print(f'Student {student_id}: already marked today')
    else:
        response.raise_for_status()
        print(f'Attendance marked for student {student_id}')


def liveness_check(frame) -> bool:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return np.var(gray) > 50


def run():
    known_ids, known_encodings = fetch_face_encodings()
    video_capture = cv2.VideoCapture(0)
    processed_ids = set()

    while True:
        ret, frame = video_capture.read()
        if not ret:
            break
        if not liveness_check(frame):
            cv2.putText(frame, 'Spoof suspected', (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.imshow('Smart Attendance', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
            continue

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_frame)
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

        for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.5)
            student_id = None
            if True in matches:
                matched_idx = matches.index(True)
                student_id = known_ids[matched_idx]

            label = 'Unknown'
            color = (0, 0, 255)
            if student_id is not None:
                label = f'ID {student_id}'
                color = (0, 255, 0)
                if student_id not in processed_ids:
                    try:
                        mark_attendance(student_id)
                        processed_ids.add(student_id)
                    except requests.RequestException as err:
                        print(f'API error: {err}')

            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, label, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow('Smart Attendance', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    video_capture.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    run()
