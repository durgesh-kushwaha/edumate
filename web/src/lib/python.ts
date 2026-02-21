const PY_SERVICE_URL = process.env.PY_ATTENDANCE_URL || 'http://127.0.0.1:8010';

type PythonResponse = {
  ok: boolean;
  status: number;
  data: unknown;
};

export async function callPython(path: string, payload: unknown): Promise<PythonResponse> {
  try {
    const response = await fetch(`${PY_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: { error: 'Attendance service unavailable' } };
  }
}
