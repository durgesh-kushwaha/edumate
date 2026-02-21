import { callPython } from '@/lib/python';
import { jsonError, jsonOk, requireUser } from '@/lib/http';

export async function POST(request: Request) {
  try {
    await requireUser(['teacher', 'admin', 'superadmin']);

    const form = await request.formData();
    const courseId = String(form.get('course_id') || '').trim();
    const image = form.get('image');

    if (!courseId || !(image instanceof File)) {
      return jsonError('Course and image are required', 400);
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const response = await callPython('/scan', {
      course_id: courseId,
      image: buffer.toString('base64'),
    });

    if (!response.ok) {
      const error = response.data as { error?: string };
      return jsonError(error.error || 'Unable to scan face', response.status);
    }

    return jsonOk(response.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to scan attendance', 500);
  }
}
