import { jsonOk } from '@/lib/http';
import { pingPythonHealth } from '@/lib/python';

async function warmup() {
  const response = await pingPythonHealth();
  return jsonOk({
    triggered: true,
    attendance_awake: response.ok,
    attendance_status: response.status,
  });
}

export async function GET() {
  return warmup();
}

export async function POST() {
  return warmup();
}
