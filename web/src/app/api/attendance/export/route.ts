import { ObjectId } from 'mongodb';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, requireUser } from '@/lib/http';

function asObjectId(value: unknown): ObjectId | null {
  return value instanceof ObjectId ? value : null;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  try {
    await ensureDbSetup();
    const user = await requireUser(['teacher', 'admin', 'superadmin']);

    const { searchParams } = new URL(request.url);
    const courseId = String(searchParams.get('course_id') || '').trim();
    const date = String(searchParams.get('date') || new Date().toISOString().slice(0, 10)).trim();

    if (!courseId) {
      return jsonError('course_id is required', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError('date must be YYYY-MM-DD', 400);
    }

    const db = await getDb();
    const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
    if (!course) {
      return jsonError('Course not found', 404);
    }

    if (user.role === 'teacher') {
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty || String(faculty._id) !== String(course.faculty_id)) {
        return jsonError('You can download attendance only for your own subject', 403);
      }
    }

    const [attendanceRows, enrollmentRows] = await Promise.all([
      db
        .collection('attendance')
        .find({ course_id: course._id, attendance_date: date })
        .sort({ marked_at: 1 })
        .toArray(),
      db.collection('enrollments').find({ course_id: course._id }).toArray(),
    ]);

    const attendanceByStudent = new Map<string, Record<string, unknown>>();
    for (const row of attendanceRows) {
      const studentId = asObjectId(row.student_id);
      if (studentId) {
        attendanceByStudent.set(studentId.toString(), row as Record<string, unknown>);
      }
    }

    const enrolledStudentIds = enrollmentRows
      .map((entry) => asObjectId(entry.student_id))
      .filter((entry): entry is ObjectId => Boolean(entry));

    const students = enrolledStudentIds.length
      ? await db.collection('students').find({ _id: { $in: enrolledStudentIds } }).toArray()
      : [];
    const studentUserIds = students
      .map((student) => asObjectId(student.user_id))
      .filter((entry): entry is ObjectId => Boolean(entry));
    const users = studentUserIds.length ? await db.collection('users').find({ _id: { $in: studentUserIds } }).toArray() : [];
    const userMap = new Map(users.map((entry) => [String(entry._id), entry]));

    const sortedStudents = [...students].sort((a, b) => String(a.enrollment_number || '').localeCompare(String(b.enrollment_number || '')));

    const lines: string[] = ['date,course_code,course_title,enrollment_number,student_name,status,marked_at,topic_covered'];

    for (const student of sortedStudents) {
      const attendance = attendanceByStudent.get(String(student._id));
      const studentUser = userMap.get(String(student.user_id));
      lines.push(
        [
          date,
          escapeCsv(course.code),
          escapeCsv(course.title),
          escapeCsv(student?.enrollment_number || ''),
          escapeCsv(studentUser?.full_name || 'Unknown'),
          escapeCsv(String(attendance?.status || 'absent')),
          escapeCsv(attendance?.marked_at instanceof Date ? attendance.marked_at.toISOString() : ''),
          escapeCsv(String(attendance?.topic_covered || '')),
        ].join(','),
      );
    }

    if (!sortedStudents.length && attendanceRows.length) {
      for (const record of attendanceRows) {
        const studentId = asObjectId(record.student_id);
        const student = studentId ? await db.collection('students').findOne({ _id: studentId }) : null;
        const studentUserId = student && asObjectId(student.user_id);
        const studentUser = studentUserId ? await db.collection('users').findOne({ _id: studentUserId }) : null;

        lines.push(
          [
            date,
            escapeCsv(course.code),
            escapeCsv(course.title),
            escapeCsv(student?.enrollment_number || ''),
            escapeCsv(studentUser?.full_name || 'Unknown'),
            escapeCsv(record.status || 'present'),
            escapeCsv(record.marked_at instanceof Date ? record.marked_at.toISOString() : ''),
            escapeCsv(String(record.topic_covered || '')),
          ].join(','),
        );
      }
    }

    return new Response(`\uFEFF${lines.join('\n')}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-${course.code}-${date}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to export attendance', 500);
  }
}
