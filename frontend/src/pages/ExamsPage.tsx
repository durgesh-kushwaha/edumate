import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { extractApiMessage, fetchStudentExams } from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import { useAuth } from '../context/AuthContext';
import type { StudentExamOverview } from '../types';

const EMPTY_EXAMS: StudentExamOverview = {
  student_name: '',
  enrollment_number: '',
  department: '',
  semester: 0,
  upcoming_exams: [],
  hall_ticket: {
    exam_session: '',
    hall_no: '',
    seat_no: '',
    semester: 0,
    issued_at: '',
  },
  semester_results: [],
};

export default function ExamsPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<StudentExamOverview>(EMPTY_EXAMS);

  useEffect(() => {
    if (role !== 'student') {
      setLoading(false);
      return;
    }
    void fetchStudentExams()
      .then((response) => setData(response))
      .catch((err: unknown) => setError(extractApiMessage(err)))
      .finally(() => setLoading(false));
  }, [role]);

  if (loading) {
    return <Loader label="Loading exams..." />;
  }

  if (role !== 'student') {
    return (
      <SectionCard title="Exams">
        <p className="text-sm text-slate-700">Exam view is available in student portal.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <SectionCard title="Upcoming Exams" subtitle={`Semester ${data.semester} schedule and hall ticket`}>
        <div className="grid gap-5 xl:grid-cols-[1.2fr,1fr]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming_exams.map((exam) => (
                  <tr key={exam.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{exam.subject_code} - {exam.subject_title}</td>
                    <td className="px-2 py-2">{exam.exam_date}</td>
                    <td className="px-2 py-2">{exam.exam_time}</td>
                    <td className="px-2 py-2">{exam.exam_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.upcoming_exams.length === 0 ? <p className="py-3 text-sm text-slate-500">No upcoming exams available.</p> : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700">
            <p className="text-base font-semibold text-slate-900">Hall Ticket</p>
            <p className="mt-2">Name: {data.student_name}</p>
            <p>Roll Number: {data.enrollment_number}</p>
            <p>Department: {data.department}</p>
            <p>Exam Session: {data.hall_ticket.exam_session}</p>
            <p>Hall No: {data.hall_ticket.hall_no}</p>
            <p>Seat No: {data.hall_ticket.seat_no}</p>
            <p>Issued: {data.hall_ticket.issued_at ? new Date(data.hall_ticket.issued_at).toLocaleDateString() : '-'}</p>
            <Link to="/exams/results" className="primary-btn mt-4 inline-flex">
              Open Results Page
            </Link>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
