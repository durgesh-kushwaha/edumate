import { callPython } from '@/lib/python';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';

export async function POST(request: Request) {
  try {
    await ensureDbSetup();
    const user = await requireUser(['student']);

    const form = await request.formData();
    const courseId = String(form.get('course_id') || '').trim();
    const image = form.get('image');
    if (!courseId || !(image instanceof File)) {
      return jsonError('Course and image are required', 400);
    }

    const db = await getDb();
    const student = await db.collection('students').findOne({ user_id: user._id });
    if (!student) return jsonError('Student profile not found', 404);

    const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
    if (!course) return jsonError('Course not found', 404);

    const today = new Date().toISOString().slice(0, 10);
    const session = await db.collection('attendance_sessions').findOne({
      course_id: course._id,
      attendance_date: today,
      is_active: true,
      allow_student_mark: true,
    });
    if (!session) return jsonError('Attendance session is not active for students', 403);

    const enrolled = await db.collection('enrollments').findOne({ student_id: student._id, course_id: course._id });
    if (!enrolled) return jsonError('You are not enrolled in this subject', 403);

    const already = await db.collection('attendance').findOne({ student_id: student._id, course_id: course._id, attendance_date: today });
    if (already) return jsonError('Attendance already marked for today', 409);

    const buffer = Buffer.from(await image.arrayBuffer());
    const verifyResponse = await callPython('/verify-self', {
      course_id: courseId,
      student_id: student._id.toString(),
      image: buffer.toString('base64'),
    });
    if (!verifyResponse.ok) {
      const error = verifyResponse.data as { error?: string };
      return jsonError(error.error || 'Face verification failed', verifyResponse.status);
    }

    const verification = verifyResponse.data as { distance: number; matched: boolean };
    if (!verification.matched) {
      return jsonError('Face match failed. Please retry with clear frame.', 401);
    }

    await db.collection('attendance').insertOne({
      student_id: student._id,
      course_id: course._id,
      attendance_date: today,
      marked_at: new Date(),
      status: 'present',
      source: 'student_live_face',
      created_at: new Date(),
    });

    return jsonOk({ message: 'Attendance marked successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to mark attendance', 500);
  }
}
