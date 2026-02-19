import { useEffect, useState } from 'react';
import client from '../api/client';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({});
  useEffect(() => { client.get('/admin/dashboard').then((r) => setStats(r.data)); }, []);
  return <div className="grid grid-cols-2 gap-4">{Object.entries(stats).map(([k, v]) => <div key={k} className="bg-white p-4 rounded shadow"><h3>{k}</h3><p className="text-2xl">{v as number}</p></div>)}</div>;
}
