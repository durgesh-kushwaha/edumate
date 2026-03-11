import { callPython } from '@/lib/python';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';
import { shrinkImage, computeDescriptor, averageDescriptors } from '@/lib/face';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await ensureDbSetup();
    await requireUser(['admin', 'superadmin']);

    const form = await request.formData();
    const studentId = String(form.get('student_id') || '').trim();
    const images = form.getAll('images');

    if (!studentId || images.length < 4) {
      return jsonError('Student and minimum 4 images are required', 400);
    }

    const db = await getDb();
    const student = await db.collection('students').findOne({ _id: oid(studentId) }).catch(() => null);
    if (!student) {
      return jsonError('Student not found', 404);
    }

    const existing = await db.collection('face_profiles').findOne({ student_id: oid(studentId) });
    if (existing) {
      return jsonError('Face is already registered for this student', 409);
    }

    /* ---------- collect image buffers & shrink ---------- */
    const imageBuffers: Buffer[] = [];
    for (const image of images) {
      if (!(image instanceof File)) continue;
      const buf = Buffer.from(await image.arrayBuffer());
      imageBuffers.push(await shrinkImage(buf, 320));
    }

    /* ---------- try Python service first (Haar cascade) ---------- */
    const base64Images = imageBuffers.map((b) => b.toString('base64'));
    const pyRes = await callPython('/register-face', {
      student_id: studentId,
      images: base64Images,
    });

    if (pyRes.ok) {
      return jsonOk(pyRes.data);
    }

    /* ---------- fallback: inline face processing ---------- */
    const descriptors: number[][] = [];
    let validCount = 0;
    let failedCount = 0;

    for (const buf of imageBuffers) {
      const descriptor = await computeDescriptor(buf);
      if (!descriptor) {
        failedCount++;
        continue;
      }
      descriptors.push(descriptor);
      validCount++;
    }

    if (validCount < 4) {
      return jsonError('Need at least 4 clear face captures for registration', 400);
    }

    const finalDescriptor = averageDescriptors(descriptors);
    const now = new Date();
    await db.collection('face_profiles').insertOne({
      student_id: oid(studentId),
      descriptor: finalDescriptor,
      images_count: images.length,
      valid_face_count: validCount,
      failed_face_count: failedCount,
      model_version: 'sharp-attention-luma16x8-v1',
      created_at: now,
      updated_at: now,
    });

    return jsonOk({
      message: 'Live face registration completed',
      student_id: studentId,
      images_saved: images.length,
      valid_face_images: validCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to register face', 500);
  }
}
