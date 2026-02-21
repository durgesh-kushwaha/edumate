import { ObjectId } from 'mongodb';
import { toPublic } from './db';

function toId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }
  return null;
}

export async function listStudents(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const output: unknown[] = [];
  const students = await db.collection('students').find().sort({ created_at: -1 }).toArray();
  for (const student of students) {
    const userId = toId(student.user_id);
    const user = userId ? await db.collection('users').findOne({ _id: userId }) : null;
    output.push({ student: toPublic(student), user: toPublic(user) });
  }
  return output;
}

export async function listFaculty(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const output: unknown[] = [];
  const facultyDocs = await db.collection('faculty').find().sort({ created_at: -1 }).toArray();
  for (const faculty of facultyDocs) {
    const userId = toId(faculty.user_id);
    const user = userId ? await db.collection('users').findOne({ _id: userId }) : null;
    output.push({ faculty: toPublic(faculty), user: toPublic(user) });
  }
  return output;
}

export async function listCourses(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const output: Record<string, unknown>[] = [];
  const courses = await db.collection('courses').find().sort({ semester: 1 }).toArray();
  for (const course of courses) {
    const facultyId = toId(course.faculty_id);
    const faculty = facultyId ? await db.collection('faculty').findOne({ _id: facultyId }) : null;
    const facultyUserId = faculty && toId(faculty.user_id);
    const facultyUser = facultyUserId ? await db.collection('users').findOne({ _id: facultyUserId }) : null;
    output.push({
      ...(toPublic(course) as Record<string, unknown>),
      faculty_name: facultyUser?.full_name || 'Unassigned',
    });
  }
  return output;
}

export async function listFees(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const output: Record<string, unknown>[] = [];
  const fees = await db.collection('fee_ledgers').find().sort({ created_at: -1 }).toArray();
  for (const fee of fees) {
    const studentId = toId(fee.student_id);
    const student = studentId ? await db.collection('students').findOne({ _id: studentId }) : null;
    const studentUserId = student && toId(student.user_id);
    const user = studentUserId ? await db.collection('users').findOne({ _id: studentUserId }) : null;
    output.push({
      ...(toPublic(fee) as Record<string, unknown>),
      student_name: user?.full_name || '',
      enrollment_number: student?.enrollment_number || '',
    });
  }
  return output;
}

export async function adminStats(db: Awaited<ReturnType<typeof import('./db').getDb>>) {
  const pendingAggregate = await db
    .collection('fee_ledgers')
    .aggregate([{ $match: { status: { $ne: 'paid' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    .toArray();

  return {
    users: await db.collection('users').countDocuments({ is_active: true }),
    students: await db.collection('students').countDocuments(),
    faculty: await db.collection('faculty').countDocuments(),
    courses: await db.collection('courses').countDocuments(),
    pending_fees: pendingAggregate[0]?.total || 0,
    attendance_records: await db.collection('attendance').countDocuments(),
  };
}
