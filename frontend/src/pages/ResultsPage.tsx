import { useEffect, useState } from 'react';
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

export default function ResultsPage() {
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
    return <Loader label="Loading results..." />;
  }

  if (role !== 'student') {
    return (
      <SectionCard title="Results">
        <p className="text-sm text-slate-700">Result view is available in student portal.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <SectionCard title="Semester-wise Results" subtitle="Mid and Final results are grouped by semester.">
        <div className="space-y-4">
          {data.semester_results.map((bucket) => (
            <article key={bucket.semester} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <h3 className="text-base font-semibold text-slate-900">Semester {bucket.semester}</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-2 py-2">Subject</th>
                      <th className="px-2 py-2">Exam</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.results.map((result) => (
                      <tr key={result.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{result.course_code} - {result.course_title}</td>
                        <td className="px-2 py-2">{result.exam_type}</td>
                        <td className="px-2 py-2">{result.marks_obtained}/{result.max_marks}</td>
                        <td className="px-2 py-2">{result.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {data.semester_results.length === 0 ? <p className="text-sm text-slate-500">No results available yet.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
