import { useEffect, useState } from 'react';
import { createTeacherCourse, extractApiMessage, fetchCourses, fetchTeacherCourses } from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import { useAuth } from '../context/AuthContext';
import type { Course } from '../types';

export default function CoursesPage() {
  const { role } = useAuth();
  const isTeacher = role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [teacherForm, setTeacherForm] = useState({ code: '', title: '', semester: 1, credits: 4 });

  async function loadCourses() {
    setLoading(true);
    setError('');
    try {
      const data = isTeacher ? await fetchTeacherCourses() : await fetchCourses();
      setCourses(data);
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCourses();
  }, [isTeacher]);

  if (loading) {
    return <Loader label="Loading courses..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      {isTeacher ? (
        <SectionCard title="Add Subject Details" subtitle="Faculty can add own subject before starting attendance capture.">
          <form
            className="grid gap-3 sm:max-w-xl"
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              setFeedback('');
              void createTeacherCourse(teacherForm)
                .then(async () => {
                  setFeedback('Subject created successfully.');
                  setTeacherForm({ code: '', title: '', semester: 1, credits: 4 });
                  await loadCourses();
                })
                .catch((err: unknown) => setError(extractApiMessage(err)));
            }}
          >
            <input className="form-field" placeholder="Subject Code" value={teacherForm.code} onChange={(event) => setTeacherForm((prev) => ({ ...prev, code: event.target.value }))} />
            <input className="form-field" placeholder="Subject Title" value={teacherForm.title} onChange={(event) => setTeacherForm((prev) => ({ ...prev, title: event.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <input className="form-field" type="number" min={1} max={8} value={teacherForm.semester} onChange={(event) => setTeacherForm((prev) => ({ ...prev, semester: Number(event.target.value) }))} />
              <input className="form-field" type="number" min={1} max={6} value={teacherForm.credits} onChange={(event) => setTeacherForm((prev) => ({ ...prev, credits: Number(event.target.value) }))} />
            </div>
            <button className="primary-btn">Add Subject</button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Courses" subtitle={isTeacher ? 'Subjects assigned/created by you.' : 'Curriculum and faculty mapping'}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <article key={course.id} className="rounded-2xl border border-slate-100 bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">{course.code} - {course.title}</p>
              {!isTeacher ? <p className="mt-1 text-xs text-slate-600">Faculty: {course.faculty_name || 'Unassigned'}</p> : null}
              <p className="mt-1 text-xs text-slate-600">Semester {course.semester} | Credits {course.credits}</p>
            </article>
          ))}
        </div>
        {courses.length === 0 ? <p className="py-3 text-sm text-slate-500">No courses available.</p> : null}
      </SectionCard>
    </div>
  );
}
