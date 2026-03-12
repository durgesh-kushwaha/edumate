import { ObjectId } from 'mongodb';
import { toPublic } from './db';

export async function listStudents(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const students = await db.collection('students').find().sort({ created_at: -1 }).toArray();
  const userIds = students
    .map((s) => s.user_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const users = userIds.length
    ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  return students.map((student) => ({
    student: toPublic(student),
    user: toPublic(userMap.get(String(student.user_id)) || null),
  }));
}

export async function listFaculty(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const facultyDocs = await db.collection('faculty').find().sort({ created_at: -1 }).toArray();
  const userIds = facultyDocs
    .map((f) => f.user_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const users = userIds.length
    ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  return facultyDocs.map((faculty) => ({
    faculty: toPublic(faculty),
    user: toPublic(userMap.get(String(faculty.user_id)) || null),
  }));
}

export async function listCourses(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const courses = await db.collection('courses').find().sort({ semester: 1 }).toArray();
  const facultyIds = courses
    .map((c) => c.faculty_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const facultyDocs = facultyIds.length
    ? await db.collection('faculty').find({ _id: { $in: facultyIds } }).toArray()
    : [];
  const facultyUserIds = facultyDocs
    .map((f) => f.user_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const facultyUsers = facultyUserIds.length
    ? await db.collection('users').find({ _id: { $in: facultyUserIds } }).toArray()
    : [];
  const facultyMap = new Map(facultyDocs.map((f) => [String(f._id), f]));
  const userMap = new Map(facultyUsers.map((u) => [String(u._id), u]));
  return courses.map((course) => {
    const faculty = facultyMap.get(String(course.faculty_id || ''));
    const facultyUser = faculty ? userMap.get(String(faculty.user_id || '')) : null;
    return {
      ...(toPublic(course) as Record<string, unknown>),
      faculty_name: facultyUser?.full_name || 'Unassigned',
    };
  });
}

export async function listFees(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const fees = await db.collection('fee_ledgers').find().sort({ created_at: -1 }).toArray();
  const studentIds = fees
    .map((f) => f.student_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const students = studentIds.length
    ? await db.collection('students').find({ _id: { $in: studentIds } }).toArray()
    : [];
  const studentUserIds = students
    .map((s) => s.user_id)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const users = studentUserIds.length
    ? await db.collection('users').find({ _id: { $in: studentUserIds } }).toArray()
    : [];
  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  return fees.map((fee) => {
    const student = studentMap.get(String(fee.student_id || ''));
    const user = student ? userMap.get(String(student.user_id || '')) : null;
    return {
      ...(toPublic(fee) as Record<string, unknown>),
      student_name: user?.full_name || '',
      enrollment_number: student?.enrollment_number || '',
    };
  });
}

export async function adminStats(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const [users, students, faculty, courses, pendingAggregate, attendance] = await Promise.all([
    db.collection('users').countDocuments({ is_active: true }),
    db.collection('students').countDocuments(),
    db.collection('faculty').countDocuments(),
    db.collection('courses').countDocuments(),
    db
      .collection('fee_ledgers')
      .aggregate([{ $match: { status: { $ne: 'paid' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      .toArray(),
    db.collection('attendance').countDocuments(),
  ]);

  return {
    users,
    students,
    faculty,
    courses,
    pending_fees: pendingAggregate[0]?.total || 0,
    attendance_records: attendance,
  };
}
