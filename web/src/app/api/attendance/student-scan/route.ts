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

    const rawBuf = Buffer.from(await image.arrayBuffer());
    const smallBuf = await shrinkImage(rawBuf, 320);

    /* --- try Python first --- */
    const pyRes = await callPython('/verify-self', {
      course_id: courseId,
      student_id: student._id.toString(),
      image: smallBuf.toString('base64'),
    });

    if (pyRes.ok) {
      const v = pyRes.data as { distance: number; matched: boolean };
      return jsonOk({
        matched: v.matched,
        distance: v.distance,
        student_name: (user as { full_name?: string }).full_name || 'Unknown',
        message: v.matched
          ? 'Face matched successfully! You can now mark your attendance.'
          : 'Face did not match. Please try again with better lighting and face position.',
      });
    }

    /* --- fallback: inline verification --- */
    const profile = await db.collection('face_profiles').findOne({ student_id: student._id });
    if (!profile) return jsonError('Face profile not registered for student', 404);

    const descriptor = await computeDescriptor(smallBuf);
    if (!descriptor) return jsonError('No clear face found', 400);

    const distance = euclideanDistance(descriptor, (profile.descriptor as number[]) || []);
    const matched = distance <= MATCH_THRESHOLD;

    return jsonOk({
      matched,
      distance: Math.round(distance * 10000) / 10000,
      student_name: (user as { full_name?: string }).full_name || 'Unknown',
      message: matched
        ? 'Face matched successfully! You can now mark your attendance.'
        : 'Face did not match. Please try again with better lighting and face position.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to scan face', 500);
  }
}
