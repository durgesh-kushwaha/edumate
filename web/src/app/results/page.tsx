'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Dict = Record<string, any>;

async function apiJson<T = Dict>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || `Request failed (${response.status})`));
  }
  return body as T;
}

function gradeFromMarks(marks: number) {
  if (marks >= 90) return 'A+';
  if (marks >= 80) return 'A';
  if (marks >= 70) return 'B+';
  if (marks >= 60) return 'B';
  if (marks >= 50) return 'C';
  return 'F';
}

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [state, setState] = useState<Dict | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>('all');

  function printResult() {
    window.print();
  }

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiJson<Dict>('/api/app/state');
        if (payload.role !== 'student') {
          setError('Result page is available only for student accounts.');
          return;
        }
        setState(payload);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Loading Results...</h1>
        </section>
      </main>
    );
  }

  if (error || !state) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Results</h1>
          <p className="error-text">{error || 'Unable to load result data.'}</p>
          <Link href="/" className="btn btn-primary inline-link">
            Back to Portal
          </Link>
        </section>
      </main>
    );
  }

  const examData = state.exams || {};
  const semesterResults = (Array.isArray(examData.semester_results) ? examData.semester_results : []).sort(
    (a: Dict, b: Dict) => Number(a.semester || 0) - Number(b.semester || 0),
  );
  const filteredSemesterResults =
    selectedSemester === 'all' ? semesterResults : semesterResults.filter((semester: Dict) => String(semester.semester) === selectedSemester);

  const allEntries = semesterResults.flatMap((semester: Dict) => (Array.isArray(semester.results) ? semester.results : []));
  const totalExams = allEntries.length;
  const passedExams = allEntries.filter((entry: Dict) => Number(entry.marks || 0) >= 40).length;
  const averagePercentage = totalExams
    ? allEntries.reduce((sum: number, entry: Dict) => {
        const marks = Number(entry.marks || 0);
        const maxMarks = Math.max(Number(entry.max_marks || 100), 1);
        return sum + (marks / maxMarks) * 100;
      }, 0) / totalExams
    : 0;

  return (
    <main className="portal-root">
      <header className="shell-header">
        <div className="brand-block">
          <h1>EduMate</h1>
          <p>Semester Results</p>
        </div>
        <nav className="tab-nav">
          <Link href="/" className="tab-pill active">
            Back to Student Portal
          </Link>
          <button type="button" className="tab-pill no-print" onClick={printResult}>
            Print Result
          </button>
        </nav>
      </header>

      <section className="portal-content stack">
        <article className="card">
          <div>
            <h2>Result Intelligence Panel</h2>
            <p className="muted">Review semester-wise and exam-type wise outcomes in one organized view.</p>
          </div>
        </article>

        <article className="card">
          <h2>
            {examData.student_name} ({examData.enrollment_number})
          </h2>
          <p className="muted">
            Department: {examData.department} | Current Semester: {examData.semester}
          </p>
        </article>

        <article className="card">
          <div className="stats-grid three">
            <div className="stat-card">
              <p>Total Exams</p>
              <h3>{totalExams}</h3>
            </div>
            <div className="stat-card">
              <p>Average %</p>
              <h3>{averagePercentage.toFixed(1)}%</h3>
            </div>
            <div className="stat-card">
              <p>Passed Exams</p>
              <h3>
                {passedExams}/{totalExams || 0}
              </h3>
            </div>
          </div>
          {semesterResults.length > 0 && (
            <div className="inline-actions top-gap">
              <button
                type="button"
                className={`tab-pill ${selectedSemester === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedSemester('all')}
              >
                All Semesters
              </button>
              {semesterResults.map((semester: Dict) => (
                <button
                  key={`sem-tab-${semester.semester}`}
                  type="button"
                  className={`tab-pill ${selectedSemester === String(semester.semester) ? 'active' : ''}`}
                  onClick={() => setSelectedSemester(String(semester.semester))}
                >
                  Semester {semester.semester}
                </button>
              ))}
            </div>
          )}
        </article>

        {semesterResults.length === 0 && (
          <article className="card">
            <h2>No Published Results Yet</h2>
            <p className="muted">Results will appear semester-wise once published.</p>
          </article>
        )}

        {filteredSemesterResults.map((semester: Dict) => (
          <article className="card" key={semester.semester}>
            <h2>Semester {semester.semester}</h2>
            <div className="table-wrap top-gap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exam Type</th>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Grade</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(semester.results) ? semester.results : []).map((entry: Dict) => {
                    const marks = Number(entry.marks ?? 0);
                    const passed = marks >= 40;
                    return (
                      <tr key={entry.id}>
                        <td>{String(entry.exam_type || 'final').toUpperCase()}</td>
                        <td>
                          {entry.course_code} - {entry.course_title}
                        </td>
                        <td>{marks}</td>
                        <td>{gradeFromMarks(marks)}</td>
                        <td>
                          <span className={passed ? 'badge badge-green' : 'badge badge-red'}>{passed ? 'Pass' : 'Fail'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
