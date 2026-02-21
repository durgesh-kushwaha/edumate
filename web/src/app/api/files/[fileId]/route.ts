import { Binary } from 'mongodb';
import { ensureDbSetup, getDb, oid } from '@/lib/db';
import { jsonError, requireUser } from '@/lib/http';

export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    await ensureDbSetup();
    await requireUser(['student', 'teacher', 'admin', 'superadmin']);
    const { fileId } = await params;

    const db = await getDb();
    const file = await db.collection('file_blobs').findOne({ _id: oid(fileId) }).catch(() => null);
    if (!file) {
      return jsonError('File not found', 404);
    }

    const content = file.content as Binary;
    const bytes = Buffer.from(content.buffer);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': String(file.mime || 'application/octet-stream'),
        'Content-Disposition': `attachment; filename="${String(file.name || 'file')}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonError('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return jsonError('Forbidden', 403);
    return jsonError('Unable to download file', 500);
  }
}
