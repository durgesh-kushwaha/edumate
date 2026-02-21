import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  extractApiMessage,
  fetchStudentAttendanceSummary,
  fetchStudentFees,
  fetchStudentProfile,
  fetchStudentResults,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import type { AttendanceSummary, Result, StudentFeeResponse } from '../types';

type ProfileResponse = {
  student: {
    enrollment_number: string;
    department: string;
    year: number;
  };
  user: {
    full_name: string;
    email: string;
  };
};

const EMPTY_ATTENDANCE: AttendanceSummary = {
  student_id: '',
  attendance_percentage: 0,
  present_records: 0,
  tracked_days: 0,
};

const EMPTY_FEES: StudentFeeResponse = { items: [], total_pending: 0 };

export default function StudentDashboard() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary>(EMPTY_ATTENDANCE);
  const [results, setResults] = useState<Result[]>([]);
  const [fees, setFees] = useState<StudentFeeResponse>(EMPTY_FEES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      setError('');
      try {
        const [profileData, attendanceData, resultData, feeData] = await Promise.all([
          fetchStudentProfile(),
          fetchStudentAttendanceSummary(),
          fetchStudentResults(),
          fetchStudentFees(),
        ]);
        setProfile(profileData as ProfileResponse);
        setAttendance(attendanceData);
        setResults(resultData);
        setFees(feeData);
      } catch (err: unknown) {
        setError(extractApiMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  const chartData = useMemo(
    () => [
      { key: 'Attendance', value: Number(attendance.attendance_percentage.toFixed(2)) },
      { key: 'Target', value: 75 },
      { key: 'Best Result', value: results.length ? Math.max(...results.map((item) => (item.marks_obtained / item.max_marks) * 100)) : 0 },
    ],
    [attendance.attendance_percentage, results],
  );

  if (loading) {
    return <Loader label="Loading student dashboard..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <SectionCard title="Student Profile">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Name" value={profile?.user.full_name || '-'} />
          <StatCard label="Enrollment" value={profile?.student.enrollment_number || '-'} />
          <StatCard label="Department" value={profile?.student.department || '-'} />
          <StatCard label="Year" value={profile?.student.year || '-'} />
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance" value={`${attendance.attendance_percentage}%`} />
        <StatCard label="Present Records" value={attendance.present_records} />
        <StatCard label="Tracked Days" value={attendance.tracked_days} />
        <StatCard label="Pending Fees" value={`₹${fees.total_pending.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
        <SectionCard title="Performance Snapshot">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#dbe8f3" />
                <XAxis dataKey="key" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Latest Results">
          <div className="space-y-2">
            {results.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">{item.course_code || '-'}: {item.course_title || '-'}</p>
                <p className="text-xs text-slate-600">
                  Score {item.marks_obtained}/{item.max_marks} | Grade {item.grade}
                </p>
              </div>
            ))}
            {results.length === 0 ? <p className="text-sm text-slate-500">No marks uploaded yet.</p> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
