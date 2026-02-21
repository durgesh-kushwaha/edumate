from io import BytesIO
from datetime import date
from math import sqrt
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.api.deps import require_roles
from app.core.config import settings
from app.db.mongo import get_db
from app.schemas.domain import (
    AttendanceBatchMarkRequest,
    AttendanceMarkRequest,
    AttendanceSessionStartRequest,
    AttendanceSessionStopRequest,
    FaceEncodingUpsert,
    FaceRecognitionRequest,
)
from app.utils.mongo import oid, serialize_document, utc_now

router = APIRouter(prefix='/attendance', tags=['Attendance'])
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
LIVE_MATCH_TOLERANCE = 0.58


def euclidean_distance(v1: list[float], v2: list[float]) -> float:
    if len(v1) != len(v2):
        return 999.0
    return sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))


def extract_face_encoding(image_bytes: bytes) -> tuple[list[float] | None, str]:
    try:
        import cv2
        import face_recognition
        import numpy as np
    except ImportError:
        from PIL import Image
        import numpy as np

        try:
            # Fallback descriptor (16x8 grayscale = 128 values) when OpenCV/face_recognition is unavailable.
            image = Image.open(BytesIO(image_bytes)).convert('L').resize((16, 8))
            vector = np.asarray(image, dtype=np.float32).flatten() / 255.0
        except Exception:
            return None, 'luma_16x8_v1'
        norm = float(np.linalg.norm(vector))
        if norm > 0:
            vector = vector / norm
        return vector.tolist(), 'luma_16x8_v1'

    image_array = np.frombuffer(image_bytes, np.uint8)
    image_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image_bgr is None:
        return None, 'face_recognition_hog_v1'
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(image_rgb, model='hog')
    if not locations:
        return None, 'face_recognition_hog_v1'
    encodings = face_recognition.face_encodings(image_rgb, locations)
    if not encodings:
        return None, 'face_recognition_hog_v1'
    return encodings[0].tolist(), 'face_recognition_hog_v1'


def mean_encoding(encodings: list[list[float]]) -> list[float]:
    if not encodings:
        return []
    vector_len = len(encodings[0])
    return [sum(encoding[idx] for encoding in encodings) / len(encodings) for idx in range(vector_len)]


def cleanup_dataset(paths: list[str], dataset_dir: Path) -> None:
    for path in paths:
        Path(path).unlink(missing_ok=True)
    if dataset_dir.exists():
        try:
            dataset_dir.rmdir()
        except OSError:
            # Keep directory if manual inspection is needed for partially captured images.
            pass


def ensure_teacher_can_access_course(db: Database, current_user: dict, course: dict) -> None:
    if current_user['role'] != 'teacher':
        return
    teacher = db.faculty.find_one({'user_id': oid(current_user['id'], 'teacher user id')})
    if not teacher or teacher['_id'] != course['faculty_id']:
        raise HTTPException(status_code=403, detail='You can only mark attendance for your own course')


def build_attendance_record(student_oid, course_oid, attendance_day: str, marked_at, source: str) -> dict:
    return {
        'student_id': student_oid,
        'course_id': course_oid,
        'attendance_date': attendance_day,
        'marked_at': marked_at,
        'status': 'present',
        'source': source,
        'created_at': utc_now(),
    }


def get_active_session(db: Database, course_oid, attendance_day: str | None = None):
    query: dict = {'course_id': course_oid, 'is_active': True}
    if attendance_day:
        query['attendance_date'] = attendance_day
    return db.attendance_sessions.find_one(query)


def ensure_student_enrolled(db: Database, student_oid, course_oid):
    enrolled = db.enrollments.find_one({'student_id': student_oid, 'course_id': course_oid})
    if not enrolled:
        raise HTTPException(status_code=400, detail='Student is not enrolled in this subject')


@router.post('/session/start')
def start_attendance_session(
    payload: AttendanceSessionStartRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher', 'admin')),
):
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_can_access_course(db, current_user, course)
    today = date.today().isoformat()
    now = utc_now()
    db.attendance_sessions.update_many(
        {'course_id': course['_id'], 'attendance_date': today, 'is_active': True},
        {'$set': {'is_active': False, 'closed_at': now, 'updated_at': now}},
    )
    session_id = db.attendance_sessions.insert_one(
        {
            'course_id': course['_id'],
            'attendance_date': today,
            'allow_student_mark': payload.allow_student_mark,
            'is_active': True,
            'started_by': oid(current_user['id'], 'session starter'),
            'started_at': now,
            'created_at': now,
            'updated_at': now,
        }
    ).inserted_id
    return serialize_document(db.attendance_sessions.find_one({'_id': session_id}))


@router.post('/session/stop')
def stop_attendance_session(
    payload: AttendanceSessionStopRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher', 'admin')),
):
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_can_access_course(db, current_user, course)
    today = date.today().isoformat()
    updated = db.attendance_sessions.find_one_and_update(
        {'course_id': course['_id'], 'attendance_date': today, 'is_active': True},
        {'$set': {'is_active': False, 'closed_at': utc_now(), 'updated_at': utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=404, detail='No active session found for this subject')
    return serialize_document(updated)


@router.get('/sessions/active')
def list_active_sessions_for_staff(
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher', 'admin')),
):
    today = date.today().isoformat()
    result = []
    for session in db.attendance_sessions.find({'attendance_date': today, 'is_active': True}).sort('started_at', -1):
        course = db.courses.find_one({'_id': session['course_id']})
        if not course:
            continue
        ensure_teacher_can_access_course(db, current_user, course)
        result.append(
            {
                **serialize_document(session),
                'course_code': course.get('code', ''),
                'course_title': course.get('title', ''),
            }
        )
    return result


@router.get('/sessions/student-active')
def list_active_sessions_for_student(
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student')),
):
    today = date.today().isoformat()
    student = db.students.find_one({'user_id': oid(current_user['id'], 'current user id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student profile not found')
    enrolled_course_ids = {item['course_id'] for item in db.enrollments.find({'student_id': student['_id']})}

    result = []
    for session in db.attendance_sessions.find({'attendance_date': today, 'is_active': True, 'allow_student_mark': True}):
        if session['course_id'] not in enrolled_course_ids:
            continue
        course = db.courses.find_one({'_id': session['course_id']})
        if not course:
            continue
        result.append(
            {
                **serialize_document(session),
                'course_code': course.get('code', ''),
                'course_title': course.get('title', ''),
            }
        )
    return result


@router.post('/mark-self-live')
async def mark_attendance_self_live(
    course_id: str = Form(...),
    image: UploadFile = File(...),
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('student')),
):
    course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    today = date.today().isoformat()
    active_session = get_active_session(db, course['_id'], today)
    if not active_session or not active_session.get('allow_student_mark', False):
        raise HTTPException(status_code=403, detail='Attendance session is not active for students')

    student = db.students.find_one({'user_id': oid(current_user['id'], 'current user id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student profile not found')
    ensure_student_enrolled(db, student['_id'], course['_id'])

    existing = db.attendance.find_one({'student_id': student['_id'], 'course_id': course['_id'], 'attendance_date': today})
    if existing:
        raise HTTPException(status_code=409, detail='Attendance already marked for today')

    profile = db.face_profiles.find_one({'student_id': student['_id']})
    if not profile:
        raise HTTPException(status_code=404, detail='Face profile not registered. Contact admin.')

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail='Invalid image')
    encoding, _ = extract_face_encoding(image_bytes)
    if not encoding:
        raise HTTPException(status_code=400, detail='No face found in the captured frame')

    distance = euclidean_distance(encoding, profile['encoding'])
    if distance > LIVE_MATCH_TOLERANCE:
        raise HTTPException(status_code=401, detail='Face match failed. Please retry with proper lighting.')

    record_id = db.attendance.insert_one(
        build_attendance_record(student['_id'], course['_id'], today, utc_now(), 'student_live_face')
    ).inserted_id
    return {
        'message': 'Attendance marked successfully',
        'course_id': course_id,
        'attendance_date': today,
        'distance': round(distance, 4),
        'attendance': serialize_document(db.attendance.find_one({'_id': record_id})),
    }


@router.post('/mark', status_code=status.HTTP_201_CREATED)
def mark_attendance(
    payload: AttendanceMarkRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher', 'admin')),
):
    student = db.students.find_one({'_id': oid(payload.student_id, 'student_id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_can_access_course(db, current_user, course)

    if not db.enrollments.find_one({'student_id': student['_id'], 'course_id': course['_id']}):
        raise HTTPException(status_code=400, detail='Student is not enrolled in this course')

    record = build_attendance_record(
        student['_id'],
        course['_id'],
        payload.attendance_date.isoformat(),
        payload.marked_at,
        payload.source,
    )
    try:
        record_id = db.attendance.insert_one(record).inserted_id
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Attendance already marked for this student today')
    return serialize_document(db.attendance.find_one({'_id': record_id}))


@router.post('/mark-batch')
def mark_attendance_batch(
    payload: AttendanceBatchMarkRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('teacher', 'admin')),
):
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_can_access_course(db, current_user, course)

    attendance_day = (payload.attendance_date or date.today()).isoformat()
    active_session = get_active_session(db, course['_id'], attendance_day)
    if not active_session:
        raise HTTPException(status_code=403, detail='Start attendance session before marking attendance')
    marked_at = payload.marked_at or utc_now()

    marked: list[dict] = []
    already_marked: list[dict] = []
    rejected: list[dict] = []
    seen_ids: set[str] = set()

    for student_id in payload.student_ids:
        if student_id in seen_ids:
            continue
        seen_ids.add(student_id)
        try:
            student_oid = oid(student_id, 'student_id')
        except HTTPException:
            rejected.append({'student_id': student_id, 'reason': 'invalid_student_id'})
            continue

        student = db.students.find_one({'_id': student_oid})
        if not student:
            rejected.append({'student_id': student_id, 'reason': 'student_not_found'})
            continue
        user = db.users.find_one({'_id': student['user_id']})
        student_name = user['full_name'] if user else 'Unknown'

        enrolled = db.enrollments.find_one({'student_id': student_oid, 'course_id': course['_id']})
        if not enrolled:
            rejected.append({'student_id': student_id, 'name': student_name, 'reason': 'not_enrolled'})
            continue

        try:
            db.attendance.insert_one(
                build_attendance_record(student_oid, course['_id'], attendance_day, marked_at, payload.source)
            )
            marked.append({'student_id': student_id, 'name': student_name})
        except DuplicateKeyError:
            already_marked.append({'student_id': student_id, 'name': student_name})

    return {
        'course_id': payload.course_id,
        'attendance_date': attendance_day,
        'marked': marked,
        'already_marked': already_marked,
        'rejected': rejected,
        'summary': {
            'requested': len(payload.student_ids),
            'marked_count': len(marked),
            'already_marked_count': len(already_marked),
            'rejected_count': len(rejected),
        },
    }


@router.post('/face-encoding/{student_id}')
def upload_face_encoding(
    student_id: str,
    payload: FaceEncodingUpsert,
    db: Database = Depends(get_db),
    _=Depends(require_roles('admin', 'teacher')),
):
    student = db.students.find_one({'_id': oid(student_id, 'student_id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    now = utc_now()
    db.face_profiles.update_one(
        {'student_id': student['_id']},
        {
            '$set': {
                'encoding': payload.encoding,
                'sample_image_path': payload.sample_image_path,
                'updated_at': now,
                'model_version': 'opencv-face-recognition-v1',
            },
            '$setOnInsert': {'created_at': now},
        },
        upsert=True,
    )
    return {'message': 'Face encoding saved'}


@router.get('/face-encodings')
def get_face_encodings(
    course_id: str | None = Query(default=None),
    db: Database = Depends(get_db),
    _=Depends(require_roles('admin', 'teacher')),
):
    allowed_students = None
    if course_id:
        course = db.courses.find_one({'_id': oid(course_id, 'course_id')})
        if not course:
            raise HTTPException(status_code=404, detail='Course not found')
        allowed_students = {record['student_id'] for record in db.enrollments.find({'course_id': course['_id']})}

    output = []
    for item in db.face_profiles.find():
        if allowed_students is not None and item['student_id'] not in allowed_students:
            continue
        student = db.students.find_one({'_id': item['student_id']})
        user = db.users.find_one({'_id': student['user_id']}) if student else None
        output.append(
            {
                'student_id': str(item['student_id']),
                'student_name': user['full_name'] if user else 'Unknown',
                'enrollment_number': student['enrollment_number'] if student else '',
                'encoding': item['encoding'],
                'sample_image_path': item.get('sample_image_path', ''),
                'images_count': item.get('images_count', 0),
            }
        )
    return output


@router.post('/register-face-live/{student_id}')
async def register_face_live(
    student_id: str,
    images: list[UploadFile] = File(...),
    db: Database = Depends(get_db),
    _=Depends(require_roles('admin')),
):
    student = db.students.find_one({'_id': oid(student_id, 'student_id')})
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')

    existing = db.face_profiles.find_one({'student_id': student['_id']})
    if existing:
        raise HTTPException(status_code=409, detail='Face is already registered for this student')

    if len(images) < settings.FACE_REGISTRATION_MIN_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f'Upload at least {settings.FACE_REGISTRATION_MIN_IMAGES} images for reliable registration',
        )

    student_dir = Path(settings.FACE_REGISTRY_DIR) / student_id
    if student_dir.exists() and any(student_dir.iterdir()):
        raise HTTPException(status_code=409, detail='Local face dataset already exists for this student')
    student_dir.mkdir(parents=True, exist_ok=True)

    valid_encodings: list[list[float]] = []
    saved_paths: list[str] = []
    failed_images = 0
    model_version = 'face_recognition_hog_v1'

    for index, image in enumerate(images, start=1):
        extension = Path(image.filename or '').suffix.lower() or '.jpg'
        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            extension = '.jpg'
        image_bytes = await image.read()
        if not image_bytes:
            failed_images += 1
            continue

        saved_name = f'{index:02d}{extension}'
        save_path = student_dir / saved_name
        save_path.write_bytes(image_bytes)
        saved_paths.append(str(save_path))

        encoding, inferred_model = extract_face_encoding(image_bytes)
        model_version = inferred_model
        if encoding is None:
            failed_images += 1
            continue
        valid_encodings.append(encoding)

    if len(valid_encodings) < settings.FACE_REGISTRATION_MIN_IMAGES:
        cleanup_dataset(saved_paths, student_dir)
        raise HTTPException(
            status_code=400,
            detail=(
                f'Unable to detect face in enough images. '
                f'Need at least {settings.FACE_REGISTRATION_MIN_IMAGES} clear face captures.'
            ),
        )

    now = utc_now()
    averaged_encoding = mean_encoding(valid_encodings)
    db.face_profiles.insert_one(
        {
            'student_id': student['_id'],
            'encoding': averaged_encoding,
            'sample_image_path': saved_paths[0],
            'dataset_dir': str(student_dir),
            'images_count': len(saved_paths),
            'valid_face_count': len(valid_encodings),
            'failed_images': failed_images,
            'model_version': model_version,
            'created_at': now,
            'updated_at': now,
        }
    )
    return {
        'message': 'Live face registration completed',
        'student_id': student_id,
        'images_saved': len(saved_paths),
        'valid_face_images': len(valid_encodings),
        'dataset_dir': str(student_dir),
    }


@router.post('/verify-face')
def verify_face_and_mark(
    payload: FaceRecognitionRequest,
    db: Database = Depends(get_db),
    current_user=Depends(require_roles('admin', 'teacher')),
):
    course = db.courses.find_one({'_id': oid(payload.course_id, 'course_id')})
    if not course:
        raise HTTPException(status_code=404, detail='Course not found')
    ensure_teacher_can_access_course(db, current_user, course)

    profiles = list(db.face_profiles.find())
    if not profiles:
        raise HTTPException(status_code=404, detail='No face profiles registered')

    best_match = None
    best_distance = 999.0
    for profile in profiles:
        distance = euclidean_distance(payload.encoding, profile['encoding'])
        if distance < best_distance:
            best_distance = distance
            best_match = profile

    if not best_match or best_distance > payload.tolerance:
        raise HTTPException(status_code=404, detail='Face not recognized')

    student_id = best_match['student_id']
    today = date.today().isoformat()
    try:
        record_id = db.attendance.insert_one(
            build_attendance_record(student_id, course['_id'], today, utc_now(), 'face-recognition-live')
        ).inserted_id
    except DuplicateKeyError:
        existing = db.attendance.find_one({'student_id': student_id, 'course_id': course['_id'], 'attendance_date': today})
        return {
            'message': 'Attendance already marked today',
            'student_id': str(student_id),
            'distance': round(best_distance, 4),
            'attendance': serialize_document(existing),
        }

    return {
        'message': 'Attendance marked',
        'student_id': str(student_id),
        'distance': round(best_distance, 4),
        'attendance': serialize_document(db.attendance.find_one({'_id': record_id})),
    }
