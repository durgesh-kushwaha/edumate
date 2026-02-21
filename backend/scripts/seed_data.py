from pathlib import Path

from app.core.catalog import DEPARTMENT_CATALOG, DESIGNATION_SALARY_DEFAULTS
from app.core.config import settings
from app.core.security import get_password_hash
from app.db.mongo import get_database, setup_indexes
from app.utils.mongo import utc_now


def ensure_user(db, email: str, role: str, name: str):
    user = db.users.find_one({'email': email})
    if user:
        if user.get('role') != role:
            db.users.update_one({'_id': user['_id']}, {'$set': {'role': role, 'updated_at': utc_now()}})
            user = db.users.find_one({'_id': user['_id']})
        return user
    user_id = db.users.insert_one(
        {
            'email': email,
            'hashed_password': get_password_hash('Pass@1234'),
            'role': role,
            'full_name': name,
            'is_active': True,
            'created_at': utc_now(),
            'updated_at': utc_now(),
        }
    ).inserted_id
    return db.users.find_one({'_id': user_id})


def run():
    db = get_database()
    setup_indexes()
    Path(settings.ASSIGNMENTS_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.SUBMISSIONS_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.FACE_REGISTRY_DIR).mkdir(parents=True, exist_ok=True)

    superadmin_user = ensure_user(db, 'durgesh@zavraq.com', 'superadmin', 'Durgesh Superadmin')
    admin_user = ensure_user(db, 'admin@eduvision.com', 'admin', 'Admin User')
    teacher_user = ensure_user(db, 'teacher@eduvision.com', 'teacher', 'Teacher User')
    student_user = ensure_user(db, 'student@eduvision.com', 'student', 'Student User')

    db.faculty.update_one(
        {'user_id': teacher_user['_id']},
        {
            '$set': {
                'employee_code': 'EMP-001',
                'designation': 'Assistant Professor',
                'department': 'Computer Science',
                'faculty_phone': '9876543210',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )
    faculty = db.faculty.find_one({'user_id': teacher_user['_id']})

    db.students.update_one(
        {'user_id': student_user['_id']},
        {
            '$set': {
                'enrollment_number': '2026001',
                'department': 'Computer Science',
                'year': 2,
                'gender': 'Male',
                'student_phone': '9999999999',
                'parent_name': 'Parent User',
                'parent_phone': '8888888888',
                'address_line': 'Sector 18',
                'pincode': '201301',
                'state': 'Uttar Pradesh',
                'city': 'Noida',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )
    student = db.students.find_one({'user_id': student_user['_id']})

    db.courses.update_one(
        {'code': 'CS201'},
        {
            '$set': {
                'title': 'Data Structures',
                'faculty_id': faculty['_id'],
                'semester': 4,
                'credits': 4,
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )
    course = db.courses.find_one({'code': 'CS201'})

    db.enrollments.update_one(
        {'student_id': student['_id'], 'course_id': course['_id']},
        {'$setOnInsert': {'created_at': utc_now()}},
        upsert=True,
    )

    db.results.update_one(
        {'student_id': student['_id'], 'course_id': course['_id']},
        {
            '$set': {
                'marks_obtained': 84,
                'max_marks': 100,
                'grade': 'A',
                'exam_type': 'final',
                'teacher_user_id': teacher_user['_id'],
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )

    db.fee_ledgers.update_one(
        {'student_id': student['_id'], 'title': 'Semester 4 Tuition'},
        {
            '$set': {
                'amount': 25000.0,
                'status': 'pending',
                'notes': 'Pay before exam registration.',
                'due_date': utc_now(),
                'payment_link': 'https://razorpay.me/zavraq/25000',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {
                'created_by': admin_user['_id'],
                'created_at': utc_now(),
            },
        },
        upsert=True,
    )

    db.face_profiles.update_one(
        {'student_id': student['_id']},
        {
            '$set': {
                'encoding': [0.02] * 128,
                'sample_image_path': 'dataset/2026001/0.jpg',
                'model_version': 'opencv-face-recognition-v1',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )

    for config in DESIGNATION_SALARY_DEFAULTS:
        db.salary_configs.update_one(
            {'designation': config['designation']},
            {
                '$set': {
                    'designation': config['designation'],
                    'monthly_salary': config['monthly_salary'],
                    'updated_at': utc_now(),
                },
                '$setOnInsert': {'created_at': utc_now()},
            },
            upsert=True,
        )

    db.salary_records.update_one(
        {'faculty_id': faculty['_id'], 'month': '2026-02'},
        {
            '$set': {
                'designation': faculty.get('designation', ''),
                'amount': 55000,
                'status': 'credited',
                'created_at': utc_now(),
            }
        },
        upsert=True,
    )

    db.hall_tickets.update_one(
        {'student_id': student['_id'], 'semester': 4},
        {
            '$set': {
                'exam_session': 'Semester 4 Examination',
                'hall_no': 'H-412',
                'seat_no': student['enrollment_number'][-6:],
                'issued_at': utc_now(),
            }
        },
        upsert=True,
    )

    db.exam_schedules.update_one(
        {'department': 'Computer Science', 'semester': 4, 'subject_code': 'CS201'},
        {
            '$set': {
                'department': 'Computer Science',
                'semester': 4,
                'subject_code': 'CS201',
                'subject_title': 'Data Structures',
                'exam_date': '2026-03-12',
                'exam_time': '10:00 AM - 1:00 PM',
                'exam_type': 'mid',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )
    db.exam_schedules.update_one(
        {'department': 'Computer Science', 'semester': 4, 'subject_code': 'CS202'},
        {
            '$set': {
                'department': 'Computer Science',
                'semester': 4,
                'subject_code': 'CS202',
                'subject_title': 'Database Management Systems',
                'exam_date': '2026-03-18',
                'exam_time': '10:00 AM - 1:00 PM',
                'exam_type': 'final',
                'updated_at': utc_now(),
            },
            '$setOnInsert': {'created_at': utc_now()},
        },
        upsert=True,
    )

    for department in DEPARTMENT_CATALOG:
        for subject in department['subjects']:
            db.department_subjects.update_one(
                {'department': department['name'], 'subject_code': subject['code']},
                {
                    '$set': {
                        'department': department['name'],
                        'subject_code': subject['code'],
                        'subject_name': subject['name'],
                        'timetable': department['timetable'],
                        'updated_at': utc_now(),
                    },
                    '$setOnInsert': {'created_at': utc_now()},
                },
                upsert=True,
            )

    print('Seed complete:')
    print('- durgesh@zavraq.com / Pass@1234 (superadmin)')
    print('- admin@eduvision.com / Pass@1234')
    print('- teacher@eduvision.com / Pass@1234')
    print('- student@eduvision.com / Pass@1234')


if __name__ == '__main__':
    run()
