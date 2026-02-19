import { useEffect, useState } from 'react';
import client from '../api/client';

export default function MarksPage() {
  const [marks, setMarks] = useState<any[]>([]);
  useEffect(() => { client.get('/student/results').then((r) => setMarks(r.data)).catch(() => {}); }, []);
  return <div className="bg-white p-4 rounded shadow"><h2 className="font-semibold mb-4">Marks</h2><pre>{JSON.stringify(marks, null, 2)}</pre></div>;
}
