import { useEffect, useMemo, useState } from 'react';
import {
  extractApiMessage,
  fetchTeacherCourseReport,
  fetchTeacherCourseRoster,
  fetchTeacherCourses,
  submitResult,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import type { Course, TeacherCourseReport, TeacherRosterItem } from '../types';

const INITIAL_REPORT: TeacherCourseReport = {
  course_id: '',
  course_code: '-',
  total_enrolled: 0,
  present_records: 0,
  today_present: 0,
};

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [report, setReport] = useState<TeacherCourseReport>(INITIAL_REPORT);
  const [roster, setRoster] = useState<TeacherRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [resultForm, setResultForm] = useState({
    student_id: '',
    marks_obtained: 80,
    max_marks: 100,
  });

  const selectedCourse = useMemo(() => courses.find((item) => item.id === selectedCourseId), [courses, selectedCourseId]);

  async function loadCourses() {
    setError('');
    const coursesData = await fetchTeacherCourses();
    setCourses(coursesData);
    const firstId = coursesData[0]?.id || '';
    setSelectedCourseId((prev) => prev || firstId);
    return firstId;
  }

  async function loadCourseInsights(courseId: string) {
    if (!courseId) {
      setReport(INITIAL_REPORT);
      setRoster([]);
      return;
    }
    const [reportData, rosterData] = await Promise.all([fetchTeacherCourseReport(courseId), fetchTeacherCourseRoster(courseId)]);
    setReport(reportData);
    setRoster(rosterData);
    setResultForm((prev) => ({ ...prev, student_id: prev.student_id || rosterData[0]?.student_id || '' }));
  }

  async function bootstrap() {
    setLoading(true);
    setError('');
    try {
      const first = await loadCourses();
      await loadCourseInsights(first);
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      return;
    }
    void loadCourseInsights(selectedCourseId).catch((err: unknown) => {
      setError(extractApiMessage(err));
    });
  }, [selectedCourseId]);

  if (loading) {
    return <Loader label="Loading teacher dashboard..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      <SectionCard title="Assigned Courses" subtitle="Select a course to manage attendance and marks.">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="form-field max-w-md"
            value={selectedCourseId}
            onChange={(event) => {
              setSelectedCourseId(event.target.value);
              setFeedback('');
            }}
          >
            {courses.length === 0 ? <option value="">No assigned courses</option> : null}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} - {course.title}
              </option>
            ))}
          </select>
          {selectedCourse ? (
            <p className="text-sm text-slate-600">
              Semester {selectedCourse.semester} | Credits {selectedCourse.credits}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Enrolled" value={report.total_enrolled} />
        <StatCard label="Present Records" value={report.present_records} />
        <StatCard label="Today Present" value={report.today_present} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1.3fr]">
        <SectionCard title="Submit / Update Marks" subtitle="One result per student per course (updates overwrite).">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedCourseId || !resultForm.student_id) {
                setError('Select course and student before submitting marks.');
                return;
              }
              setError('');
              setFeedback('');
              void submitResult({
                student_id: resultForm.student_id,
                course_id: selectedCourseId,
                marks_obtained: resultForm.marks_obtained,
                max_marks: resultForm.max_marks,
              })
                .then(() => {
                  setFeedback('Marks submitted successfully.');
                })
                .catch((err: unknown) => {
                  setError(extractApiMessage(err));
                });
            }}
          >
            <select
              className="form-field"
              value={resultForm.student_id}
              onChange={(event) => setResultForm((prev) => ({ ...prev, student_id: event.target.value }))}
            >
              <option value="">Select Student</option>
              {roster.map((student) => (
                <option key={student.student_id} value={student.student_id}>
                  {student.name} ({student.enrollment_number})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="form-field"
                type="number"
                min={0}
                value={resultForm.marks_obtained}
                onChange={(event) => setResultForm((prev) => ({ ...prev, marks_obtained: Number(event.target.value) }))}
              />
              <input
                className="form-field"
                type="number"
                min={1}
                value={resultForm.max_marks}
                onChange={(event) => setResultForm((prev) => ({ ...prev, max_marks: Number(event.target.value) }))}
              />
            </div>

            <button className="primary-btn">Save Marks</button>
          </form>
        </SectionCard>

        <SectionCard title="Course Roster">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Enrollment</th>
                  <th className="px-2 py-2">Department</th>
                  <th className="px-2 py-2">Year</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => (
                  <tr key={student.student_id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{student.name}</td>
                    <td className="px-2 py-2">{student.enrollment_number}</td>
                    <td className="px-2 py-2">{student.department}</td>
                    <td className="px-2 py-2">{student.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roster.length === 0 ? <p className="py-3 text-sm text-slate-500">No students enrolled yet.</p> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
