from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from math import sqrt
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pymongo import MongoClient
from bson import ObjectId

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017')
MONGODB_DB = os.getenv('MONGODB_DB', 'eduvision_nexus_v2')
MATCH_THRESHOLD = float(os.getenv('FACE_MATCH_THRESHOLD', '0.58'))


class RegisterFaceRequest(BaseModel):
    student_id: str
    images: list[str] = Field(min_length=4)


class ScanRequest(BaseModel):
    course_id: str
    image: str


class VerifySelfRequest(BaseModel):
    course_id: str
    student_id: str
    image: str


@dataclass
class FaceBox:
    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        return self.x + self.w

    @property
    def y2(self) -> int:
        return self.y + self.h


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_db():
    client = MongoClient(MONGODB_URI)
    return client[MONGODB_DB]


def parse_oid(value: str, field: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f'Invalid {field}')
    return ObjectId(value)


def decode_image(image_base64: str) -> np.ndarray:
    try:
        raw = base64.b64decode(image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid base64 image') from exc

    nparr = np.frombuffer(raw, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail='Unable to decode image')
    return frame


def detect_faces(frame: np.ndarray) -> list[FaceBox]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    detected = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(50, 50))
    return dedupe_overlapping_boxes([FaceBox(int(x), int(y), int(w), int(h)) for (x, y, w, h) in detected])


def iou(a: FaceBox, b: FaceBox) -> float:
    inter_x1 = max(a.x, b.x)
    inter_y1 = max(a.y, b.y)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0

    area_a = a.w * a.h
    area_b = b.w * b.h
    denom = area_a + area_b - inter_area
    if denom <= 0:
        return 0.0
    return inter_area / denom


def centers_are_close(a: FaceBox, b: FaceBox) -> bool:
    ax = a.x + a.w / 2.0
    ay = a.y + a.h / 2.0
    bx = b.x + b.w / 2.0
    by = b.y + b.h / 2.0
    distance = sqrt((ax - bx) ** 2 + (ay - by) ** 2)
    min_diag = min(sqrt(a.w**2 + a.h**2), sqrt(b.w**2 + b.h**2))
    return distance < (0.25 * min_diag)


def dedupe_overlapping_boxes(boxes: list[FaceBox]) -> list[FaceBox]:
    if len(boxes) < 2:
        return boxes
    ordered = sorted(boxes, key=lambda box: box.w * box.h, reverse=True)
    kept: list[FaceBox] = []
    for candidate in ordered:
        is_duplicate = False
        for existing in kept:
            if iou(candidate, existing) > 0.25 or centers_are_close(candidate, existing):
                is_duplicate = True
                break
        if not is_duplicate:
            kept.append(candidate)
    return kept


def descriptor_for_face(frame: np.ndarray, box: FaceBox) -> list[float]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    crop = gray[max(0, box.y):box.y + box.h, max(0, box.x):box.x + box.w]
    if crop.size == 0:
        return []
    resized = cv2.resize(crop, (16, 8), interpolation=cv2.INTER_AREA)
    vector = resized.astype(np.float32).flatten() / 255.0
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector.tolist()


def largest_face(faces: list[FaceBox]) -> FaceBox | None:
    if not faces:
        return None
    return sorted(faces, key=lambda box: box.w * box.h, reverse=True)[0]


def euclidean_distance(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 999.0
    return sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def average_descriptors(descriptors: list[list[float]]) -> list[float]:
    if not descriptors:
        return []
    arr = np.array(descriptors, dtype=np.float32)
    mean = np.mean(arr, axis=0)
    norm = np.linalg.norm(mean)
    if norm > 0:
        mean = mean / norm
    return mean.tolist()


app = FastAPI(title='EduVision Attendance OpenCV Service')


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/register-face')
def register_face(payload: RegisterFaceRequest) -> dict[str, Any]:
    db = get_db()
    student_oid = parse_oid(payload.student_id, 'student_id')

    student = db.students.find_one({'_id': student_oid})
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')

    existing = db.face_profiles.find_one({'student_id': student_oid})
    if existing:
        raise HTTPException(status_code=409, detail='Face is already registered for this student')

    descriptors: list[list[float]] = []
    valid_count = 0
    failed_count = 0

    for image_base64 in payload.images:
        frame = decode_image(image_base64)
        faces = detect_faces(frame)
        face = largest_face(faces)
        if not face:
            failed_count += 1
            continue
        descriptor = descriptor_for_face(frame, face)
        if not descriptor:
            failed_count += 1
            continue
        descriptors.append(descriptor)
        valid_count += 1

    if valid_count < 4:
        raise HTTPException(status_code=400, detail='Need at least 4 clear face captures for registration')

    final_descriptor = average_descriptors(descriptors)
    db.face_profiles.insert_one(
        {
            'student_id': student_oid,
            'descriptor': final_descriptor,
            'images_count': len(payload.images),
            'valid_face_count': valid_count,
            'failed_face_count': failed_count,
            'model_version': 'opencv-haar-luma16x8-v1',
            'created_at': now(),
            'updated_at': now(),
        }
    )

    return {
        'message': 'Live face registration completed',
        'student_id': payload.student_id,
        'images_saved': len(payload.images),
        'valid_face_images': valid_count,
    }


@app.post('/scan')
def scan_frame(payload: ScanRequest) -> dict[str, Any]:
    db = get_db()
    course_oid = parse_oid(payload.course_id, 'course_id')

    course = db.courses.find_one({'_id': course_oid})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')

    enrolled_ids = [record['student_id'] for record in db.enrollments.find({'course_id': course_oid})]
    if not enrolled_ids:
        return {'faces_detected': 0, 'recognized_count': 0, 'faces': []}

    profiles = list(db.face_profiles.find({'student_id': {'$in': enrolled_ids}}))
    profile_map: dict[str, dict[str, Any]] = {}
    for profile in profiles:
        student = db.students.find_one({'_id': profile['student_id']})
        user = db.users.find_one({'_id': student['user_id']}) if student else None
        profile_map[str(profile['student_id'])] = {
            'descriptor': profile.get('descriptor') or [],
            'name': user.get('full_name', 'Unknown') if user else 'Unknown',
            'enrollment_number': student.get('enrollment_number', '') if student else '',
        }

    frame = decode_image(payload.image)
    boxes = detect_faces(frame)
    faces_payload: list[dict[str, Any]] = []

    for box in boxes:
        descriptor = descriptor_for_face(frame, box)
        if not descriptor:
            continue

        best_id: str | None = None
        best_distance = 999.0
        for student_id, profile in profile_map.items():
            distance = euclidean_distance(descriptor, profile['descriptor'])
            if distance < best_distance:
                best_distance = distance
                best_id = student_id

        if not best_id or best_distance > MATCH_THRESHOLD:
            faces_payload.append(
                {
                    'student_id': None,
                    'student_name': 'Unknown',
                    'enrollment_number': '',
                    'distance': round(best_distance, 4),
                }
            )
            continue

        matched_profile = profile_map[best_id]
        faces_payload.append(
            {
                'student_id': best_id,
                'student_name': matched_profile['name'],
                'enrollment_number': matched_profile['enrollment_number'],
                'distance': round(best_distance, 4),
            }
        )

    deduped_recognized: dict[str, dict[str, Any]] = {}
    unknown_faces: list[dict[str, Any]] = []
    for entry in faces_payload:
        student_id = entry.get('student_id')
        if not student_id:
            unknown_faces.append(entry)
            continue
        existing = deduped_recognized.get(student_id)
        if existing is None or float(entry['distance']) < float(existing['distance']):
            deduped_recognized[student_id] = entry

    final_faces = list(deduped_recognized.values()) + unknown_faces
    final_faces.sort(key=lambda item: (item.get('student_id') is None, float(item.get('distance', 999))))

    return {
        'faces_detected': len(final_faces),
        'recognized_count': len(deduped_recognized),
        'faces': final_faces,
    }


@app.post('/verify-self')
def verify_self(payload: VerifySelfRequest) -> dict[str, Any]:
    db = get_db()
    student_oid = parse_oid(payload.student_id, 'student_id')
    course_oid = parse_oid(payload.course_id, 'course_id')

    profile = db.face_profiles.find_one({'student_id': student_oid})
    if not profile:
        raise HTTPException(status_code=404, detail='Face profile not registered for student')

    enrolled = db.enrollments.find_one({'student_id': student_oid, 'course_id': course_oid})
    if not enrolled:
        raise HTTPException(status_code=403, detail='Student is not enrolled in this subject')

    frame = decode_image(payload.image)
    face = largest_face(detect_faces(frame))
    if not face:
        raise HTTPException(status_code=400, detail='No face detected in the frame')

    descriptor = descriptor_for_face(frame, face)
    if not descriptor:
        raise HTTPException(status_code=400, detail='No clear face found')

    distance = euclidean_distance(descriptor, profile.get('descriptor') or [])
    matched = distance <= MATCH_THRESHOLD

    return {
        'matched': matched,
        'distance': round(distance, 4),
    }
