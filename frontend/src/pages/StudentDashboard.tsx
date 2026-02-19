import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import client from '../api/client';

export default function StudentDashboard() {
  const [attendance, setAttendance] = useState(0);
  useEffect(() => { client.get('/student/attendance').then((r) => setAttendance(r.data.attendance_percentage)); }, []);
  const data = [{ name: 'Attendance', value: attendance }, { name: 'Target', value: 75 }];
  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="text-lg font-semibold">Attendance Trend</h2>
      <div className="h-72"><ResponsiveContainer><LineChart data={data}><XAxis dataKey="name" /><YAxis /><Tooltip /><Line dataKey="value" stroke="#334155" /></LineChart></ResponsiveContainer></div>
    </div>
  );
}
