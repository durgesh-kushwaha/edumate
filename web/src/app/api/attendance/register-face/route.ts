import { callPython } from '@/lib/python';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';

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

    const base64Images: string[] = [];
    for (const image of images) {
      if (!(image instanceof File)) {
        continue;
      }
      const arrayBuffer = await image.arrayBuffer();
      base64Images.push(Buffer.from(arrayBuffer).toString('base64'));
    }

    const response = await callPython('/register-face', {
      student_id: studentId,
      images: base64Images,
    });

    if (!response.ok) {
      const error = response.data as { error?: string };
      return jsonError(error.error || 'Unable to register face', response.status);
    }

    return jsonOk(response.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to register face', 500);
  }
}
