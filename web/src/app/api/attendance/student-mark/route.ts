import { callPython } from '@/lib/python';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';
import { shrinkImage, computeDescriptor, euclideanDistance, MATCH_THRESHOLD } from '@/lib/face';

export const maxDuration = 60;

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

    const rawBuf = Buffer.from(await image.arrayBuffer());
    const smallBuf = await shrinkImage(rawBuf, 320);

    /* --- try Python first --- */
    const pyRes = await callPython('/verify-self', {
      course_id: courseId,
      student_id: student._id.toString(),
      image: smallBuf.toString('base64'),
    });

    let matched = false;
    if (pyRes.ok) {
      const v = pyRes.data as { distance: number; matched: boolean };
      matched = v.matched;
    } else {
      /* --- fallback: inline verification --- */
      const profile = await db.collection('face_profiles').findOne({ student_id: student._id });
      if (!profile) return jsonError('Face profile not registered for student', 404);

      const descriptor = await computeDescriptor(smallBuf);
      if (!descriptor) return jsonError('No clear face found', 400);

      const distance = euclideanDistance(descriptor, (profile.descriptor as number[]) || []);
      matched = distance <= MATCH_THRESHOLD;
    }

    if (!matched) {
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
