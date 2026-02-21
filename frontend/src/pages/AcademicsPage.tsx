import { useEffect, useMemo, useState } from 'react';
import {
  createTeacherAssignment,
  downloadStudentAssignmentFile,
  downloadTeacherSubmissionFile,
  extractApiMessage,
  fetchDepartments,
  fetchStudentAcademics,
  fetchTeacherAssignmentSubmissions,
  fetchTeacherAssignments,
  fetchTeacherCourses,
  submitStudentAssignment,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import { useAuth } from '../context/AuthContext';
import type { AssignmentItem, Course, DepartmentCatalogItem, StudentAcademicCourse } from '../types';

export default function AcademicsPage() {
  const { role } = useAuth();
  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [departments, setDepartments] = useState<DepartmentCatalogItem[]>([]);

  const [studentCourses, setStudentCourses] = useState<StudentAcademicCourse[]>([]);
  const [selectedStudentCourseId, setSelectedStudentCourseId] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, File | null>>({});

  const [teacherCourses, setTeacherCourses] = useState<Course[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<AssignmentItem[]>([]);
  const [selectedTeacherAssignmentId, setSelectedTeacherAssignmentId] = useState('');
  const [submissions, setSubmissions] = useState<{ id: string; student_name: string; enrollment_number: string; submitted_at: string }[]>([]);
  const [assignmentForm, setAssignmentForm] = useState({
    course_id: '',
    title: '',
    description: '',
    due_date: '',
    attachment: null as File | null,
  });

  const selectedStudentCourse = useMemo(
    () => studentCourses.find((item) => item.course_id === selectedStudentCourseId),
    [studentCourses, selectedStudentCourseId],
  );

  const selectedTeacherAssignment = useMemo(
    () => teacherAssignments.find((item) => item.id === selectedTeacherAssignmentId),
    [teacherAssignments, selectedTeacherAssignmentId],
  );

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const departmentData = await fetchDepartments();
      setDepartments(departmentData);

      if (isStudent) {
        const courses = await fetchStudentAcademics();
        setStudentCourses(courses);
        setSelectedStudentCourseId((prev) => prev || courses[0]?.course_id || '');
      } else if (isTeacher) {
        const [courses, assignments] = await Promise.all([fetchTeacherCourses(), fetchTeacherAssignments()]);
        setTeacherCourses(courses);
        setTeacherAssignments(assignments);
        setAssignmentForm((prev) => ({ ...prev, course_id: prev.course_id || courses[0]?.id || '' }));
      }
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [role]);

  useEffect(() => {
    if (!selectedTeacherAssignmentId || !isTeacher) {
      return;
    }
    void fetchTeacherAssignmentSubmissions(selectedTeacherAssignmentId)
      .then((items) => setSubmissions(items))
      .catch((err: unknown) => setError(extractApiMessage(err)));
  }, [selectedTeacherAssignmentId, isTeacher]);

  if (loading) {
    return <Loader label="Loading academics..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      {isStudent ? (
        <SectionCard title="Academics" subtitle="Click a subject to view assignments and submit your work.">
          <div className="grid gap-5 lg:grid-cols-[260px,1fr]">
            <div className="space-y-2">
              {studentCourses.map((course) => (
                <button
                  key={course.course_id}
                  className={[
                    'w-full rounded-xl border px-3 py-2 text-left text-sm transition',
                    selectedStudentCourseId === course.course_id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
                  ].join(' ')}
                  onClick={() => setSelectedStudentCourseId(course.course_id)}
                >
                  <p className="font-semibold">{course.course_code}</p>
                  <p className="text-xs opacity-80">{course.course_title}</p>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {selectedStudentCourse ? (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedStudentCourse.course_code} - {selectedStudentCourse.course_title}
                  </p>
                  <p className="text-xs text-slate-600">Assigned by {selectedStudentCourse.faculty_name}</p>
                </div>
              ) : null}

              <div className="space-y-3">
                {(selectedStudentCourse?.assignments || []).map((assignment) => (
                  <article key={assignment.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
                        <p className="text-xs text-slate-600">Due: {assignment.due_date}</p>
                        <p className="mt-1 text-xs text-slate-500">{assignment.description}</p>
                      </div>
                      <span className={['rounded-full px-2 py-1 text-xs font-semibold', assignment.submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'].join(' ')}>
                        {assignment.submitted ? 'Submitted' : 'Pending'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="soft-btn"
                        onClick={() => {
                          setError('');
                          void downloadStudentAssignmentFile(assignment.id)
                            .then((blob) => {
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `${assignment.title.replace(/\s+/g, '_')}.pdf`;
                              link.click();
                              URL.revokeObjectURL(url);
                            })
                            .catch((err: unknown) => setError(extractApiMessage(err)));
                        }}
                      >
                        Download PDF
                      </button>

                      <label className="soft-btn cursor-pointer">
                        Upload PDF
                        <input
                          type="file"
                          className="hidden"
                          accept="application/pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setSubmissionFiles((prev) => ({ ...prev, [assignment.id]: file }));
                          }}
                        />
                      </label>

                      <button
                        className="primary-btn"
                        disabled={!submissionFiles[assignment.id]}
                        onClick={() => {
                          const file = submissionFiles[assignment.id];
                          if (!file) {
                            return;
                          }
                          setError('');
                          setFeedback('');
                          void submitStudentAssignment(assignment.id, file)
                            .then(async () => {
                              setFeedback('Assignment submitted successfully.');
                              await loadData();
                            })
                            .catch((err: unknown) => setError(extractApiMessage(err)));
                        }}
                      >
                        Submit Assignment
                      </button>
                    </div>
                  </article>
                ))}
                {(selectedStudentCourse?.assignments || []).length === 0 ? <p className="text-sm text-slate-500">No assignments for this subject yet.</p> : null}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {isTeacher ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,1.3fr]">
          <SectionCard title="Create Assignment" subtitle="Assign PDF work to students for your subject.">
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError('');
                setFeedback('');
                void createTeacherAssignment(assignmentForm)
                  .then(async () => {
                    setFeedback('Assignment created successfully.');
                    setAssignmentForm((prev) => ({ ...prev, title: '', description: '', due_date: '', attachment: null }));
                    await loadData();
                  })
                  .catch((err: unknown) => setError(extractApiMessage(err)));
              }}
            >
              <select className="form-field" value={assignmentForm.course_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, course_id: event.target.value }))}>
                <option value="">Select Subject</option>
                {teacherCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.title}
                  </option>
                ))}
              </select>
              <input className="form-field" placeholder="Assignment Title" value={assignmentForm.title} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.target.value }))} />
              <textarea className="form-field min-h-20" placeholder="Description" value={assignmentForm.description} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, description: event.target.value }))} />
              <input className="form-field" type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_date: event.target.value }))} />
              <input className="form-field" type="file" accept="application/pdf" onChange={(event) => setAssignmentForm((prev) => ({ ...prev, attachment: event.target.files?.[0] || null }))} />
              <button className="primary-btn">Assign to Students</button>
            </form>
          </SectionCard>

          <SectionCard title="Assignment Submissions" subtitle="Select assignment to see submitted student PDFs.">
            <div className="space-y-3">
              <select className="form-field" value={selectedTeacherAssignmentId} onChange={(event) => setSelectedTeacherAssignmentId(event.target.value)}>
                <option value="">Select Assignment</option>
                {teacherAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {(assignment.course_code || '') + ' - ' + assignment.title}
                  </option>
                ))}
              </select>

              {selectedTeacherAssignment ? (
                <p className="text-xs text-slate-600">{selectedTeacherAssignment.description}</p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">Roll Number</th>
                      <th className="px-2 py-2">Submitted At</th>
                      <th className="px-2 py-2">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{item.student_name}</td>
                        <td className="px-2 py-2">{item.enrollment_number}</td>
                        <td className="px-2 py-2">{new Date(item.submitted_at).toLocaleString()}</td>
                        <td className="px-2 py-2">
                          <button
                            className="soft-btn"
                            onClick={() => {
                              setError('');
                              void downloadTeacherSubmissionFile(item.id)
                                .then((blob) => {
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `submission_${item.enrollment_number}.pdf`;
                                  link.click();
                                  URL.revokeObjectURL(url);
                                })
                                .catch((err: unknown) => setError(extractApiMessage(err)));
                            }}
                          >
                            Download PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {submissions.length === 0 ? <p className="py-3 text-sm text-slate-500">No submissions yet.</p> : null}
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!isStudent && !isTeacher ? (
        <SectionCard title="Department Subjects & Timetable" subtitle="Predefined departments with subject map and timetable.">
          <div className="grid gap-4 lg:grid-cols-2">
            {departments.map((department) => (
              <article key={department.code} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-sm font-semibold text-slate-900">{department.name}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Subjects</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {department.subjects.map((subject) => (
                    <li key={subject.code}>{subject.code} - {subject.name}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Timetable</p>
                <div className="mt-1 space-y-1 text-sm text-slate-700">
                  {department.timetable.map((entry) => (
                    <p key={entry.day}>{entry.day}: {entry.slots.join(', ')}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
