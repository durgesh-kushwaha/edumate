const PY_SERVICE_URL = process.env.PY_ATTENDANCE_URL || 'http://127.0.0.1:8010';
const PY_SERVICE_TIMEOUT_MS = Number(process.env.PY_ATTENDANCE_TIMEOUT_MS || 25000);

type PythonResponse = {
  ok: boolean;
  status: number;
  data: unknown;
};

export async function callPython(path: string, payload: unknown): Promise<PythonResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PY_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(`${PY_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: { error: 'Attendance service unavailable' } };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pingPythonHealth(): Promise<PythonResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PY_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(`${PY_SERVICE_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: { error: 'Attendance service unavailable' } };
  } finally {
    clearTimeout(timeout);
  }
}
