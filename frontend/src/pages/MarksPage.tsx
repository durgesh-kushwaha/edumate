import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { extractApiMessage, fetchStudentResults } from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import { useAuth } from '../context/AuthContext';
import type { Result } from '../types';

export default function MarksPage() {
  const { role } = useAuth();
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(role === 'student');
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'student') {
      return;
    }
    setLoading(true);
    setError('');
    void fetchStudentResults()
      .then((data) => setResults(data))
      .catch((err: unknown) => setError(extractApiMessage(err)))
      .finally(() => setLoading(false));
  }, [role]);

  const trendData = useMemo(
    () =>
      results.map((item, index) => ({
        index: index + 1,
        percent: Number(((item.marks_obtained / item.max_marks) * 100).toFixed(2)),
      })),
    [results],
  );

  if (role !== 'student') {
    return (
      <SectionCard title="Marks Module" subtitle="Teachers submit marks from dashboard. Admin monitors marks from reports.">
        <p className="text-sm text-slate-700">Use the dashboard to upload or update result entries course-wise.</p>
      </SectionCard>
    );
  }

  if (loading) {
    return <Loader label="Loading marks..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <SectionCard title="Result Trend">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <XAxis dataKey="index" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="percent" stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="All Marks">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="px-2 py-2">Course</th>
                <th className="px-2 py-2">Marks</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Percent</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{item.course_code} - {item.course_title}</td>
                  <td className="px-2 py-2">{item.marks_obtained}/{item.max_marks}</td>
                  <td className="px-2 py-2">{item.grade}</td>
                  <td className="px-2 py-2">{((item.marks_obtained / item.max_marks) * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 ? <p className="py-3 text-sm text-slate-500">No marks uploaded yet.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
