from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import User


def run():
    db = SessionLocal()
    users = [
        ('admin@eduvision.com', 'admin', 'Admin User'),
        ('teacher@eduvision.com', 'teacher', 'Teacher User'),
        ('student@eduvision.com', 'student', 'Student User'),
    ]
    for email, role, name in users:
        if not db.query(User).filter(User.email == email).first():
            db.add(User(email=email, role=role, full_name=name, hashed_password=get_password_hash('Pass@1234')))
    db.commit()
    db.close()


if __name__ == '__main__':
    run()
