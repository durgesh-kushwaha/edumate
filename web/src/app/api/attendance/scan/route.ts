import { callPython } from '@/lib/python';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';
import { shrinkImage, computeDescriptor, euclideanDistance, MATCH_THRESHOLD } from '@/lib/face';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await ensureDbSetup();
    await requireUser(['teacher', 'admin', 'superadmin']);

    const form = await request.formData();
    const courseId = String(form.get('course_id') || '').trim();
    const image = form.get('image');

    if (!courseId || !(image instanceof File)) {
      return jsonError('Course and image are required', 400);
    }

    const rawBuf = Buffer.from(await image.arrayBuffer());
    const smallBuf = await shrinkImage(rawBuf, 480);

    /* --- try Python service (supports multi-face Haar cascade) --- */
    const pyRes = await callPython('/scan', {
      course_id: courseId,
      image: smallBuf.toString('base64'),
    });

    if (pyRes.ok) {
      return jsonOk(pyRes.data);
    }

    /* --- fallback: inline single-face matching --- */
    const db = await getDb();
    const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
    if (!course) return jsonError('Course not found', 404);

    const enrolledIds = (await db.collection('enrollments').find({ course_id: course._id }).toArray()).map((e) => e.student_id);
    if (!enrolledIds.length) return jsonOk({ faces_detected: 0, recognized_count: 0, faces: [] });

    const profiles = await db.collection('face_profiles').find({ student_id: { $in: enrolledIds } }).toArray();
    const descriptor = await computeDescriptor(smallBuf);
    if (!descriptor) return jsonOk({ faces_detected: 0, recognized_count: 0, faces: [] });

    let bestId: string | null = null;
    let bestDist = 999;
    let bestName = 'Unknown';
    let bestEnroll = '';

    for (const profile of profiles) {
      const stored = (profile.descriptor as number[]) || [];
      const dist = euclideanDistance(descriptor, stored);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = profile.student_id.toString();
        const stu = await db.collection('students').findOne({ _id: profile.student_id });
        const usr = stu ? await db.collection('users').findOne({ _id: stu.user_id }) : null;
        bestName = (usr as { full_name?: string })?.full_name || 'Unknown';
        bestEnroll = (stu as { enrollment_number?: string })?.enrollment_number || '';
      }
    }

    const matched = bestId && bestDist <= MATCH_THRESHOLD;
    const faces = matched
      ? [{ student_id: bestId, student_name: bestName, enrollment_number: bestEnroll, distance: Math.round(bestDist * 10000) / 10000 }]
      : [{ student_id: null, student_name: 'Unknown', enrollment_number: '', distance: Math.round(bestDist * 10000) / 10000 }];

    return jsonOk({ faces_detected: 1, recognized_count: matched ? 1 : 0, faces });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to scan attendance', 500);
  }
}
