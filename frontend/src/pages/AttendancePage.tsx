import { useEffect, useState } from 'react';
import client from '../api/client';

export default function AttendancePage() {
  const [report, setReport] = useState<any>();
  useEffect(() => { client.get('/teacher/attendance-report/1').then((r) => setReport(r.data)).catch(() => {}); }, []);
  return <pre className="bg-white p-4 rounded shadow">{JSON.stringify(report ?? { message: 'Teacher-only report endpoint' }, null, 2)}</pre>;
}
