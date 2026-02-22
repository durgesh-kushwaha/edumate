'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/static-components */

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Dict = Record<string, any>;
type ToastType = 'success' | 'error' | 'info';

type Department = {
  id?: string;
  code: string;
  name: string;
  subjects: { code: string; name: string }[];
  timetable: { day: string; slots: string[] }[];
  classes?: { semester: number; section: string; room: string }[];
};

type PasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
};

const EMPTY_STUDENT_FORM = {
  full_name: '',
  email: '',
  password: '',
  enrollment_number: '',
  department: '',
  year: '',
  gender: '',
  student_phone: '',
  parent_name: '',
  parent_phone: '',
  address_line: '',
  pincode: '',
  state: '',
  city: '',
};

const EMPTY_STUDENT_SELF_FORM = {
  full_name: '',
  email: '',
  password: '',
  enrollment_number: '',
  department: '',
  year: '',
  gender: '',
  student_phone: '',
  parent_name: '',
  parent_phone: '',
  address_line: '',
  pincode: '',
  state: '',
  city: '',
};

const ATTENDANCE_WARMUP_SESSION_KEY = 'edumate_attendance_warmup_at';
const ATTENDANCE_WARMUP_COOLDOWN_MS = 15 * 60 * 1000;

async function apiJson<T = Dict>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const contentType = response.headers.get('content-type') || '';
  const body: Dict = contentType.includes('application/json') ? ((await response.json()) as Dict) : {};

  if (!response.ok) {
    const message = String(body?.error || body?.detail || `Request failed (${response.status})`);
    throw new Error(message);
  }

  return body as T;
}

function warmAttendanceService() {
  if (typeof window === 'undefined') return;
  try {
    const previousWarmup = Number(window.sessionStorage.getItem(ATTENDANCE_WARMUP_SESSION_KEY) || 0);
    const now = Date.now();
    if (now - previousWarmup < ATTENDANCE_WARMUP_COOLDOWN_MS) {
      return;
    }
    window.sessionStorage.setItem(ATTENDANCE_WARMUP_SESSION_KEY, String(now));
  } catch {
    // Ignore storage issues and still try a one-off warmup call.
  }

  void fetch('/api/attendance/warmup', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => null);
}

async function lookupPincode(pincode: string) {
  if (!/^\d{6}$/.test(pincode)) {
    throw new Error('Pincode must be 6 digits');
  }
  return apiJson<{ state: string; city: string }>(`/api/catalog/pincode/${pincode}`);
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const base64 = raw.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatDateTime(value: string | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatCurrency(value: number | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function gradeFromMarksValue(marks: number, maxMarks: number) {
  const percentage = (marks / Math.max(maxMarks, 1)) * 100;
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  return 'F';
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'paid' || normalized === 'approved' || normalized === 'credited' || normalized === 'present') {
    return 'badge badge-green';
  }
  if (normalized === 'partial' || normalized === 'payment_review') {
    return 'badge badge-blue';
  }
  if (normalized === 'rejected' || normalized === 'failed') {
    return 'badge badge-red';
  }
  return 'badge badge-amber';
}

function noticeAudienceLabel(targetRoles: unknown) {
  const list = Array.isArray(targetRoles) ? targetRoles.map((entry) => String(entry || '').trim().toLowerCase()) : [];
  if (list.includes('all')) return 'All users';
  if (!list.length) return '-';
  return list.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ');
}

function PasswordInput({ value, onChange, placeholder, autoComplete = 'new-password', required = true }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="input"
        required={required}
      />
      <button type="button" className="btn btn-ghost mini" onClick={() => setVisible((prev) => !prev)}>
        {visible ? 'Hide' : 'View'}
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
}

function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');

  const stop = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  };

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported on this browser.');
      return;
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play().catch(() => null);
      }
      setStream(media);
    } catch {
      setError('Please allow camera permission and retry.');
    }
  };

  const capture = async (name: string) => {
    if (!videoRef.current) {
      throw new Error('Camera preview is not ready');
    }

    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Camera frame is not ready');
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to capture frame');
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });

    if (!blob) {
      throw new Error('Unable to capture image');
    }

    return new File([blob], name, { type: 'image/jpeg' });
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  return { videoRef, stream, error, start, stop, capture };
}

function ShellHeader({
  roleLabel,
  userName,
  tabs,
  active,
  onTab,
  onLogout,
}: {
  roleLabel: string;
  userName: string;
  tabs: { key: string; label: string }[];
  active: string;
  onTab: (key: string) => void;
  onLogout: () => void;
}) {
  return (
    <header className="shell-header">
      <div className="brand-block">
        <h1>EduMate</h1>
        <p>{roleLabel}</p>
      </div>
      <nav className="tab-nav">
        {tabs.map((item) => (
          <button key={item.key} type="button" className={`tab-pill ${active === item.key ? 'active' : ''}`} onClick={() => onTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="header-right">
        <span>{userName}</span>
        <button type="button" className="btn btn-light" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

function AdminSuperPortal({
  state,
  departments,
  runAction,
  refresh,
  notify,
  onLogout,
}: {
  state: Dict;
  departments: Department[];
  runAction: (action: string, payload?: Dict, refreshAfter?: boolean) => Promise<Dict>;
  refresh: () => Promise<void>;
  notify: (message: string, type?: ToastType) => void;
  onLogout: () => void;
}) {
  const isSuperadmin = state.role === 'superadmin';
  const [active, setActive] = useState('dashboard');

  const students = Array.isArray(state.students) ? state.students : [];
  const faculty = Array.isArray(state.faculty) ? state.faculty : [];
  const courses = Array.isArray(state.courses) ? state.courses : [];
  const fees = Array.isArray(state.fees) ? state.fees : [];
  const registrationRequests = Array.isArray(state.registration_requests) ? state.registration_requests : [];
  const superadmins = Array.isArray(state.superadmins) ? state.superadmins : [];
  const salaryConfigs = Array.isArray(state.salary_configs) ? state.salary_configs : [];
  const salaryRecords = Array.isArray(state.salary_records) ? state.salary_records : [];
  const notices = Array.isArray(state.notices) ? state.notices : [];
  const databaseRecords = (state.database_records || {}) as Record<string, Dict[]>;
  const userPasswords = (state.user_passwords || {}) as Record<string, string>;

  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT_FORM);
  const [facultyForm, setFacultyForm] = useState({
    full_name: '',
    email: '',
    password: '',
    employee_code: '',
    designation: '',
    department: '',
    faculty_phone: '',
  });
  const [courseForm, setCourseForm] = useState({ code: '', title: '', department: '', faculty_id: '', semester: '1', credits: '4' });
  const [enrollmentForm, setEnrollmentForm] = useState({ student_id: '', course_id: '' });
  const [feeForm, setFeeForm] = useState({ student_id: '', title: '', amount: '', due_date: '', notes: '' });
  const [profileForm, setProfileForm] = useState({ full_name: state.user?.full_name || '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [superadminForm, setSuperadminForm] = useState({ full_name: '', email: '', password: '' });
  const [salaryConfigForm, setSalaryConfigForm] = useState({ designation: '', monthly_salary: '' });
  const [salaryMonth, setSalaryMonth] = useState('');
  const [semesterForm, setSemesterForm] = useState({
    department: '',
    year: '1',
    semester: '',
    section: 'A',
    room_number: '',
  });
  const [decisionRemarks, setDecisionRemarks] = useState<Record<string, string>>({});
  const [departmentPopupCode, setDepartmentPopupCode] = useState('');
  const [studentEditForm, setStudentEditForm] = useState<Dict | null>(null);
  const [facultyEditForm, setFacultyEditForm] = useState<Dict | null>(null);
  const [facultyCourseMap, setFacultyCourseMap] = useState<Record<string, string>>({});
  const [databaseCollection, setDatabaseCollection] = useState('notices');
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    body: '',
    target_roles: ['student'] as string[],
    department: '',
    course_id: '',
  });
  const [feeReviewRemarks, setFeeReviewRemarks] = useState<Record<string, string>>({});
  const [feeApprovedAmounts, setFeeApprovedAmounts] = useState<Record<string, string>>({});

  const {
    videoRef: faceVideoRef,
    stream: faceStream,
    error: faceCameraError,
    start: startFaceCamera,
    stop: stopFaceCamera,
    capture: captureFaceImage,
  } = useCamera();
  const [faceStudentId, setFaceStudentId] = useState('');
  const [faceShots, setFaceShots] = useState<File[]>([]);

  useEffect(() => {
    setProfileForm({ full_name: state.user?.full_name || '' });
  }, [state.user?.full_name]);

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'students', label: 'Students' },
    { key: 'faculty', label: 'Faculty' },
    { key: 'courses', label: 'Courses' },
    { key: 'fees', label: 'Fees' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'notices', label: 'Notices' },
    ...(isSuperadmin
      ? [{ key: 'approvals', label: 'Approvals' }, { key: 'salary', label: 'Salary' }, { key: 'superadmins', label: 'Superadmins' }, { key: 'database', label: 'Database' }]
      : []),
    { key: 'account', label: 'Account' },
  ];

  const studentDepartmentOptions = departments.map((item) => item.name);
  const designationOptions = ['Lecturer', 'Assistant Professor', 'Associate Professor', 'Professor'];
  const databaseCollectionOptions = ['notices', 'results', 'assignments', 'econtents', 'exam_schedules', 'extra_classes'];
  const selectedDepartment = departments.find((item) => item.code === departmentPopupCode) || null;
  const selectedFaceStudent = students.find((row: Dict) => String(row.student?.id || '') === faceStudentId);
  const selectedDatabaseRecords = Array.isArray(databaseRecords[databaseCollection]) ? databaseRecords[databaseCollection] : [];

  async function autoFillStudentAddress(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    try {
      const info = await lookupPincode(pincode);
      setStudentForm((prev) => ({ ...prev, state: info.state || '', city: info.city || '' }));
      notify('State and city were auto-filled from pincode.', 'info');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  }

  async function createStudent(event: FormEvent) {
    event.preventDefault();
    await runAction('admin.create_student', {
      ...studentForm,
      year: Number(studentForm.year),
    });
    setStudentForm(EMPTY_STUDENT_FORM);
  }

  async function createFaculty(event: FormEvent) {
    event.preventDefault();
    await runAction('admin.create_faculty', facultyForm);
    setFacultyForm({
      full_name: '',
      email: '',
      password: '',
      employee_code: '',
      designation: '',
      department: '',
      faculty_phone: '',
    });
  }

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    await runAction('admin.create_course', {
      ...courseForm,
      semester: Number(courseForm.semester),
      credits: Number(courseForm.credits),
    });
    setCourseForm({ code: '', title: '', department: '', faculty_id: '', semester: '1', credits: '4' });
  }

  async function createEnrollment(event: FormEvent) {
    event.preventDefault();
    await runAction('admin.enroll_student', enrollmentForm);
    setEnrollmentForm({ student_id: '', course_id: '' });
  }

  async function createFee(event: FormEvent) {
    event.preventDefault();
    await runAction('admin.create_fee', {
      ...feeForm,
      amount: Number(feeForm.amount),
    });
    setFeeForm({ student_id: '', title: '', amount: '', due_date: '', notes: '' });
  }

  async function updateFeeStatus(feeId: string, status: string) {
    await runAction('admin.update_fee_status', { fee_id: feeId, status });
  }

  function startEditStudent(row: Dict) {
    setStudentEditForm({
      student_id: row.student?.id,
      user_id: row.user?.id,
      full_name: row.user?.full_name || '',
      email: row.user?.email || '',
      enrollment_number: row.student?.enrollment_number || '',
      department: row.student?.department || '',
      year: String(row.student?.year || 1),
      gender: row.student?.gender || '',
      student_phone: row.student?.student_phone || '',
      parent_name: row.student?.parent_name || '',
      parent_phone: row.student?.parent_phone || '',
      address_line: row.student?.address_line || '',
      pincode: row.student?.pincode || '',
      state: row.student?.state || '',
      city: row.student?.city || '',
    });
  }

  async function saveStudentEdit(event: FormEvent) {
    event.preventDefault();
    if (!studentEditForm?.student_id) return;
    await runAction('superadmin.update_student', {
      ...studentEditForm,
      year: Number(studentEditForm.year || 1),
    });
    setStudentEditForm(null);
  }

  async function deleteStudent(studentId: string) {
    if (!window.confirm('Delete this student account permanently? All linked student data will be deleted.')) return;
    await runAction('superadmin.delete_student', { student_id: studentId });
  }

  function startEditFaculty(row: Dict) {
    setFacultyEditForm({
      faculty_id: row.faculty?.id,
      user_id: row.user?.id,
      full_name: row.user?.full_name || '',
      email: row.user?.email || '',
      employee_code: row.faculty?.employee_code || '',
      designation: row.faculty?.designation || '',
      department: row.faculty?.department || '',
      faculty_phone: row.faculty?.faculty_phone || '',
      auto_assign_subjects: true,
    });
  }

  async function saveFacultyEdit(event: FormEvent) {
    event.preventDefault();
    if (!facultyEditForm?.faculty_id) return;
    await runAction('superadmin.update_faculty', facultyEditForm);
    setFacultyEditForm(null);
  }

  async function deleteFaculty(facultyId: string) {
    if (!window.confirm('Delete this faculty account permanently? All linked faculty data will be deleted.')) return;
    await runAction('superadmin.delete_faculty', { faculty_id: facultyId });
  }

  async function assignDepartmentSubjects(facultyId: string, overwrite = false) {
    await runAction('superadmin.assign_department_subjects', { faculty_id: facultyId, overwrite });
  }

  async function assignSingleSubject(facultyId: string) {
    const courseId = String(facultyCourseMap[facultyId] || '');
    if (!courseId) {
      notify('Select a subject to assign.', 'error');
      return;
    }
    await runAction('superadmin.assign_subject_to_faculty', { faculty_id: facultyId, course_id: courseId });
    setFacultyCourseMap((prev) => ({ ...prev, [facultyId]: '' }));
  }

  async function resetUserPassword(userId: string) {
    const password = window.prompt('Enter new password for this account');
    if (!password) return;
    await runAction('superadmin.reset_user_password', { user_id: userId, new_password: password });
  }

  async function captureFaceFrame() {
    try {
      const file = await captureFaceImage(`face-${Date.now()}.jpg`);
      setFaceShots((prev) => [...prev, file]);
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  }

  async function submitFaceRegistration(event: FormEvent) {
    event.preventDefault();
    if (!faceStudentId) {
      notify('Select student for face registration.', 'error');
      return;
    }
    if (faceShots.length < 4) {
      notify('Capture at least 4 face images.', 'error');
      return;
    }

    const form = new FormData();
    form.append('student_id', faceStudentId);
    faceShots.forEach((file) => form.append('images', file));

    const response = await fetch('/api/attendance/register-face', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(String(payload.error || 'Unable to register face.'), 'error');
      return;
    }

    notify('Face registration completed for selected student.', 'success');
    setFaceShots([]);
  }

  async function approveRequest(requestId: string, decision: 'approve' | 'reject') {
    await runAction('superadmin.registration_decide', {
      request_id: requestId,
      decision,
      remarks: decisionRemarks[requestId] || '',
    });
    setDecisionRemarks((prev) => ({ ...prev, [requestId]: '' }));
  }

  async function createSuperadmin(event: FormEvent) {
    event.preventDefault();
    await runAction('superadmin.create_superadmin', superadminForm);
    setSuperadminForm({ full_name: '', email: '', password: '' });
  }

  async function upsertSalaryConfig(event: FormEvent) {
    event.preventDefault();
    await runAction('superadmin.salary_config_upsert', {
      designation: salaryConfigForm.designation,
      monthly_salary: Number(salaryConfigForm.monthly_salary),
    });
    setSalaryConfigForm({ designation: '', monthly_salary: '' });
  }

  async function disburseSalary(event: FormEvent) {
    event.preventDefault();
    await runAction('superadmin.salary_disburse', { month: salaryMonth });
  }

  async function addDepartmentSemester(event: FormEvent) {
    event.preventDefault();
    await runAction('superadmin.add_department_semester', {
      department: semesterForm.department,
      year: Number(semesterForm.year || 1),
      semester: semesterForm.semester ? Number(semesterForm.semester) : undefined,
      section: semesterForm.section || 'A',
      room_number: semesterForm.room_number,
    });
    setSemesterForm({ department: semesterForm.department, year: semesterForm.year, semester: '', section: 'A', room_number: '' });
  }

  async function deleteDatabaseEntry(collection: string, recordId: string) {
    if (!recordId) return;
    if (!window.confirm(`Delete this ${collection} record directly from database?`)) return;
    await runAction('superadmin.database_delete', { collection, record_id: recordId });
  }

  function databaseRecordLabel(collection: string, row: Dict) {
    if (collection === 'notices') {
      return `${row.title || 'Notice'} | ${formatDateTime(row.created_at)}`;
    }
    if (collection === 'results') {
      return `${String(row.exam_type || 'exam').toUpperCase()} | Marks ${row.marks ?? '-'} / ${row.max_marks ?? '-'}`;
    }
    if (collection === 'assignments') {
      return `${row.title || 'Assignment'} | Due ${row.due_date || '-'}`;
    }
    if (collection === 'econtents') {
      return `${row.title || 'E-Content'} | ${String(row.content_type || '').toUpperCase()}`;
    }
    if (collection === 'exam_schedules') {
      return `${row.subject_code || '-'} | ${row.exam_date || '-'} ${row.exam_time || ''}`;
    }
    if (collection === 'extra_classes') {
      return `${row.course_code || '-'} | ${row.class_date || '-'} ${row.class_time || ''}`;
    }
    return `Record ${row.id || ''}`;
  }

  function toggleNoticeTarget(role: string) {
    setNoticeForm((prev) => {
      const list = prev.target_roles.includes(role) ? prev.target_roles.filter((item) => item !== role) : [...prev.target_roles, role];
      return { ...prev, target_roles: list };
    });
  }

  async function createNotice(event: FormEvent) {
    event.preventDefault();
    await runAction('superadmin.create_notice', noticeForm);
    setNoticeForm({ title: '', body: '', target_roles: ['student'], department: '', course_id: '' });
  }

  async function reviewFeeDeclaration(feeId: string, decision: 'approve_full' | 'approve_partial' | 'reject') {
    const payload: Dict = {
      fee_id: feeId,
      decision,
      remarks: feeReviewRemarks[feeId] || '',
    };
    if (decision === 'approve_partial') {
      payload.approved_amount = Number(feeApprovedAmounts[feeId] || 0);
    }
    await runAction('superadmin.review_fee_declaration', payload);
  }

  async function syncDepartmentEnrollments(department?: string) {
    await runAction('superadmin.sync_department_enrollments', { department: department || '' });
  }

  async function updateAccount(event: FormEvent) {
    event.preventDefault();
    await runAction('account.update_profile', profileForm);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    await runAction('account.change_password', passwordForm, false);
    setPasswordForm({ current_password: '', new_password: '' });
    notify('Password updated successfully.', 'success');
  }

  return (
    <div className="portal-root">
      <ShellHeader
        roleLabel={isSuperadmin ? 'Superadmin Portal' : 'Admin Portal'}
        userName={state.user?.full_name || 'User'}
        tabs={tabs}
        active={active}
        onTab={setActive}
        onLogout={onLogout}
      />

      <main className="portal-content">
        {active === 'dashboard' && (
          <section className="stack">
            <article className="card">
              <div>
                <h2>Campus Operations Dashboard</h2>
                <p className="muted">Manage departments, users, academics, attendance, fees and approvals in one control plane.</p>
              </div>
            </article>

            <div className="stats-grid six">
              <StatCard label="Total Users" value={state.stats?.users || 0} />
              <StatCard label="Students" value={state.stats?.students || 0} />
              <StatCard label="Faculty" value={state.stats?.faculty || 0} />
              <StatCard label="Courses" value={state.stats?.courses || 0} />
              <StatCard label="Pending Fees" value={formatCurrency(state.stats?.pending_fees || 0)} />
              <StatCard label="Attendance Records" value={state.stats?.attendance_records || 0} />
            </div>

            <article className="card">
              <div className="inline-actions">
                <h2>Department Explorer</h2>
                {isSuperadmin && (
                  <button type="button" className="btn btn-secondary mini" onClick={() => syncDepartmentEnrollments()}>
                    Sync All Department Enrollments
                  </button>
                )}
              </div>
              <p className="muted">Click any department card to open full classes, subjects and timetable details.</p>
              <div className="department-grid top-gap">
                {departments.map((dept) => (
                  <div key={dept.code} className="department-card-wrap">
                    <button
                      type="button"
                      className="department-card-btn"
                      onClick={() => setDepartmentPopupCode(dept.code)}
                    >
                      <strong>{dept.name}</strong>
                      <span>{dept.code}</span>
                      <p>{dept.subjects.length} subjects</p>
                    </button>
                    {isSuperadmin && (
                      <button type="button" className="btn btn-ghost mini" onClick={() => syncDepartmentEnrollments(dept.name)}>
                        Sync {dept.code} Students
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </article>

            {selectedDepartment && (
              <div className="modal-backdrop" role="presentation" onClick={() => setDepartmentPopupCode('')}>
                <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-head">
                    <h3>
                      {selectedDepartment.name} ({selectedDepartment.code})
                    </h3>
                    <button type="button" className="btn btn-ghost mini" onClick={() => setDepartmentPopupCode('')}>
                      Close
                    </button>
                  </div>
                  <div className="grid-2 align-start">
                    <div className="soft-panel">
                      <p className="muted small">Classes</p>
                      <ul className="clean-list">
                        {(Array.isArray(selectedDepartment.classes) ? selectedDepartment.classes : []).map((cls: Dict) => (
                          <li key={`${selectedDepartment.code}-${cls.semester}-${cls.section}`}>
                            Semester {cls.semester} - Section {cls.section} - Room {cls.room}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="soft-panel">
                      <p className="muted small">Subjects</p>
                      <ul className="clean-list">
                        {selectedDepartment.subjects.map((subject) => (
                          <li key={subject.code}>
                            {subject.code} - {subject.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="soft-panel top-gap">
                    <p className="muted small">Weekly Timetable</p>
                    <ul className="clean-list">
                      {selectedDepartment.timetable.map((slot) => (
                        <li key={slot.day}>
                          {slot.day}: {slot.slots.join(' | ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'students' && (
          <section className="stack">
            <article className="card">
              <h2>Create Student</h2>
              <p className="muted">All fields are manual entry. No auto-filled defaults are used.</p>
              <form className="form-grid three" onSubmit={createStudent}>
                <input className="input" placeholder="Full name" value={studentForm.full_name} onChange={(event) => setStudentForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                <input className="input" type="email" placeholder="Email" value={studentForm.email} onChange={(event) => setStudentForm((prev) => ({ ...prev, email: event.target.value }))} required />
                <PasswordInput value={studentForm.password} onChange={(value) => setStudentForm((prev) => ({ ...prev, password: value }))} placeholder="Password" />

                <input className="input" placeholder="Roll number" inputMode="numeric" pattern="[0-9]*" value={studentForm.enrollment_number} onChange={(event) => setStudentForm((prev) => ({ ...prev, enrollment_number: event.target.value.replace(/\D/g, '') }))} required />
                <select className="select" value={studentForm.department} onChange={(event) => setStudentForm((prev) => ({ ...prev, department: event.target.value }))} required>
                  <option value="">Select Department</option>
                  {studentDepartmentOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select className="select" value={studentForm.year} onChange={(event) => setStudentForm((prev) => ({ ...prev, year: event.target.value }))} required>
                  <option value="">Select Year</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>

                <select className="select" value={studentForm.gender} onChange={(event) => setStudentForm((prev) => ({ ...prev, gender: event.target.value }))} required>
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <input className="input" placeholder="Student contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={studentForm.student_phone} onChange={(event) => setStudentForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <input className="input" placeholder="Parent name" value={studentForm.parent_name} onChange={(event) => setStudentForm((prev) => ({ ...prev, parent_name: event.target.value }))} required />

                <input className="input" placeholder="Parent contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={studentForm.parent_phone} onChange={(event) => setStudentForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <input className="input" placeholder="Address line" value={studentForm.address_line} onChange={(event) => setStudentForm((prev) => ({ ...prev, address_line: event.target.value }))} required />
                <input
                  className="input"
                  placeholder="Pincode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={studentForm.pincode}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  onBlur={(event) => autoFillStudentAddress(event.target.value)}
                  required
                />

                <input className="input" placeholder="State" value={studentForm.state} onChange={(event) => setStudentForm((prev) => ({ ...prev, state: event.target.value }))} required />
                <input className="input" placeholder="City" value={studentForm.city} onChange={(event) => setStudentForm((prev) => ({ ...prev, city: event.target.value }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Create Student
                </button>
              </form>
            </article>

            {isSuperadmin && studentEditForm && (
              <article className="card">
                <h2>Edit Student</h2>
                <form className="form-grid three" onSubmit={saveStudentEdit}>
                  <input className="input" placeholder="Full name" value={studentEditForm.full_name || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), full_name: event.target.value }))} required />
                  <input className="input" type="email" placeholder="Email" value={studentEditForm.email || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), email: event.target.value }))} required />
                  <input className="input" placeholder="Roll number" inputMode="numeric" pattern="[0-9]*" value={studentEditForm.enrollment_number || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), enrollment_number: event.target.value.replace(/\D/g, '') }))} required />
                  <select className="select" value={studentEditForm.department || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), department: event.target.value }))} required>
                    <option value="">Select Department</option>
                    {studentDepartmentOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input className="input" type="number" min={1} max={6} value={studentEditForm.year || '1'} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), year: event.target.value }))} required />
                  <select className="select" value={studentEditForm.gender || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), gender: event.target.value }))} required>
                    <option value="">Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  <input className="input" placeholder="Student contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={studentEditForm.student_phone || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                  <input className="input" placeholder="Parent name" value={studentEditForm.parent_name || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), parent_name: event.target.value }))} required />
                  <input className="input" placeholder="Parent contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={studentEditForm.parent_phone || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                  <input className="input full-row" placeholder="Address line" value={studentEditForm.address_line || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), address_line: event.target.value }))} required />
                  <input className="input" placeholder="Pincode" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={studentEditForm.pincode || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} />
                  <input className="input" placeholder="State" value={studentEditForm.state || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), state: event.target.value }))} />
                  <input className="input" placeholder="City" value={studentEditForm.city || ''} onChange={(event) => setStudentEditForm((prev) => ({ ...(prev || {}), city: event.target.value }))} />
                  <div className="inline-actions full-row">
                    <button type="submit" className="btn btn-primary">
                      Save Student
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setStudentEditForm(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            )}

            <article className="card">
              <h2>Students</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Roll Number</th>
                      <th>Department</th>
                      <th>Year</th>
                      {isSuperadmin && <th>Password</th>}
                      <th>Face Registration</th>
                      {isSuperadmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((row: Dict) => (
                      <tr key={row.student?.id}>
                        <td>{row.user?.full_name || '-'}</td>
                        <td>{row.user?.email || '-'}</td>
                        <td>{row.student?.enrollment_number || '-'}</td>
                        <td>{row.student?.department || '-'}</td>
                        <td>{row.student?.year || '-'}</td>
                        {isSuperadmin && <td>{userPasswords[String(row.user?.id || '')] || 'Unavailable'}</td>}
                        <td>
                          <button type="button" className="btn btn-secondary mini" onClick={() => setFaceStudentId(String(row.student?.id || ''))}>
                            Select
                          </button>
                        </td>
                        {isSuperadmin && (
                          <td>
                            <div className="inline-actions">
                              <button type="button" className="btn btn-ghost mini" onClick={() => startEditStudent(row)}>
                                Edit
                              </button>
                              <button type="button" className="btn btn-secondary mini" onClick={() => resetUserPassword(String(row.user?.id || ''))}>
                                Reset Password
                              </button>
                              <button type="button" className="btn btn-danger mini" onClick={() => deleteStudent(String(row.student?.id || ''))}>
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'faculty' && (
          <section className="stack">
            <article className="card">
              <h2>Create Faculty</h2>
              <form className="form-grid three" onSubmit={createFaculty}>
                <input className="input" placeholder="Full name" value={facultyForm.full_name} onChange={(event) => setFacultyForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                <input className="input" type="email" placeholder="Email" value={facultyForm.email} onChange={(event) => setFacultyForm((prev) => ({ ...prev, email: event.target.value }))} required />
                <PasswordInput value={facultyForm.password} onChange={(value) => setFacultyForm((prev) => ({ ...prev, password: value }))} placeholder="Password" />

                <input className="input" placeholder="Employee code" value={facultyForm.employee_code} onChange={(event) => setFacultyForm((prev) => ({ ...prev, employee_code: event.target.value }))} required />
                <select className="select" value={facultyForm.designation} onChange={(event) => setFacultyForm((prev) => ({ ...prev, designation: event.target.value }))} required>
                  <option value="">Designation</option>
                  {designationOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select className="select" value={facultyForm.department} onChange={(event) => setFacultyForm((prev) => ({ ...prev, department: event.target.value }))} required>
                  <option value="">Department</option>
                  {studentDepartmentOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <input className="input" placeholder="Faculty contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={facultyForm.faculty_phone} onChange={(event) => setFacultyForm((prev) => ({ ...prev, faculty_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Create Faculty
                </button>
              </form>
            </article>

            {isSuperadmin && facultyEditForm && (
              <article className="card">
                <h2>Edit Faculty</h2>
                <form className="form-grid three" onSubmit={saveFacultyEdit}>
                  <input className="input" placeholder="Full name" value={facultyEditForm.full_name || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), full_name: event.target.value }))} required />
                  <input className="input" type="email" placeholder="Email" value={facultyEditForm.email || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), email: event.target.value }))} required />
                  <input className="input" placeholder="Employee code" value={facultyEditForm.employee_code || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), employee_code: event.target.value }))} required />
                  <select className="select" value={facultyEditForm.designation || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), designation: event.target.value }))} required>
                    <option value="">Designation</option>
                    {designationOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select className="select" value={facultyEditForm.department || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), department: event.target.value }))} required>
                    <option value="">Department</option>
                    {studentDepartmentOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input className="input" placeholder="Faculty contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={facultyEditForm.faculty_phone || ''} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), faculty_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                  <label className="checkbox-line full-row">
                    <input type="checkbox" checked={facultyEditForm.auto_assign_subjects !== false} onChange={(event) => setFacultyEditForm((prev) => ({ ...(prev || {}), auto_assign_subjects: event.target.checked }))} />
                    Auto assign department subjects after save
                  </label>
                  <div className="inline-actions full-row">
                    <button type="submit" className="btn btn-primary">
                      Save Faculty
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setFacultyEditForm(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            )}

            <article className="card">
              <h2>Faculty List</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Code</th>
                      <th>Designation</th>
                      <th>Department</th>
                      <th>Contact</th>
                      {isSuperadmin && <th>Password</th>}
                      {isSuperadmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.map((row: Dict) => (
                      <tr key={row.faculty?.id}>
                        <td>{row.user?.full_name || '-'}</td>
                        <td>{row.user?.email || '-'}</td>
                        <td>{row.faculty?.employee_code || '-'}</td>
                        <td>{row.faculty?.designation || '-'}</td>
                        <td>{row.faculty?.department || '-'}</td>
                        <td>{row.faculty?.faculty_phone || '-'}</td>
                        {isSuperadmin && <td>{userPasswords[String(row.user?.id || '')] || 'Unavailable'}</td>}
                        {isSuperadmin && (
                          <td>
                            <div className="stack">
                              <div className="inline-actions">
                                <select
                                  className="select"
                                  value={facultyCourseMap[String(row.faculty?.id || '')] || ''}
                                  onChange={(event) =>
                                    setFacultyCourseMap((prev) => ({
                                      ...prev,
                                      [String(row.faculty?.id || '')]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Assign specific subject</option>
                                  {courses
                                    .filter((course: Dict) => {
                                      const dept = String(row.faculty?.department || '').trim();
                                      return dept ? String(course.department || '').trim() === dept : true;
                                    })
                                    .map((course: Dict) => (
                                      <option key={course.id} value={course.id}>
                                        {course.code} - {course.title}
                                      </option>
                                    ))}
                                </select>
                                <button type="button" className="btn btn-primary mini" onClick={() => assignSingleSubject(String(row.faculty?.id || ''))}>
                                  Assign Subject
                                </button>
                              </div>
                              <div className="inline-actions">
                              <button type="button" className="btn btn-ghost mini" onClick={() => startEditFaculty(row)}>
                                Edit
                              </button>
                              <button type="button" className="btn btn-secondary mini" onClick={() => assignDepartmentSubjects(String(row.faculty?.id || ''), true)}>
                                Assign Dept Subjects
                              </button>
                              <button type="button" className="btn btn-secondary mini" onClick={() => resetUserPassword(String(row.user?.id || ''))}>
                                Reset Password
                              </button>
                              <button type="button" className="btn btn-danger mini" onClick={() => deleteFaculty(String(row.faculty?.id || ''))}>
                                Delete
                              </button>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'courses' && (
          <section className="stack">
            {isSuperadmin && (
              <article className="card">
                <h2>Add Extra Semester (Department / Year)</h2>
                <p className="muted">Create semester class mapping for any department and year. Semester courses and enrollments are synced automatically.</p>
                <form className="form-grid three top-gap" onSubmit={addDepartmentSemester}>
                  <select className="select" value={semesterForm.department} onChange={(event) => setSemesterForm((prev) => ({ ...prev, department: event.target.value }))} required>
                    <option value="">Select Department</option>
                    {studentDepartmentOptions.map((item) => (
                      <option key={`semester-dept-${item}`} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input className="input" type="number" min={1} max={10} placeholder="Year" value={semesterForm.year} onChange={(event) => setSemesterForm((prev) => ({ ...prev, year: event.target.value }))} required />
                  <input className="input" type="number" min={1} max={20} placeholder="Semester (Optional)" value={semesterForm.semester} onChange={(event) => setSemesterForm((prev) => ({ ...prev, semester: event.target.value }))} />
                  <input className="input" placeholder="Section (A/B/C)" value={semesterForm.section} onChange={(event) => setSemesterForm((prev) => ({ ...prev, section: event.target.value.toUpperCase() }))} />
                  <input className="input" placeholder="Room Number" value={semesterForm.room_number} onChange={(event) => setSemesterForm((prev) => ({ ...prev, room_number: event.target.value }))} />
                  <button type="submit" className="btn btn-primary">
                    Add Semester
                  </button>
                </form>
              </article>
            )}

            <article className="card">
              <h2>Create Course</h2>
              <form className="form-grid three" onSubmit={createCourse}>
                <input className="input" placeholder="Course code" value={courseForm.code} onChange={(event) => setCourseForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} required />
                <input className="input" placeholder="Course title" value={courseForm.title} onChange={(event) => setCourseForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <select className="select" value={courseForm.department} onChange={(event) => setCourseForm((prev) => ({ ...prev, department: event.target.value }))}>
                  <option value="">Select Department</option>
                  {studentDepartmentOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select className="select" value={courseForm.faculty_id} onChange={(event) => setCourseForm((prev) => ({ ...prev, faculty_id: event.target.value }))}>
                  <option value="">Assign Faculty (Optional)</option>
                  {faculty.map((row: Dict) => (
                    <option key={row.faculty?.id} value={row.faculty?.id}>
                      {row.user?.full_name} ({row.faculty?.employee_code})
                    </option>
                  ))}
                </select>

                <input className="input" type="number" min={1} max={20} placeholder="Semester" value={courseForm.semester} onChange={(event) => setCourseForm((prev) => ({ ...prev, semester: event.target.value }))} required />
                <input className="input" type="number" min={1} max={8} placeholder="Credits" value={courseForm.credits} onChange={(event) => setCourseForm((prev) => ({ ...prev, credits: event.target.value }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Create Course
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Enroll Student to Course</h2>
              <form className="form-grid three" onSubmit={createEnrollment}>
                <select className="select" value={enrollmentForm.student_id} onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, student_id: event.target.value }))} required>
                  <option value="">Select Student</option>
                  {students.map((row: Dict) => (
                    <option key={row.student?.id} value={row.student?.id}>
                      {row.user?.full_name} ({row.student?.enrollment_number})
                    </option>
                  ))}
                </select>
                <select className="select" value={enrollmentForm.course_id} onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, course_id: event.target.value }))} required>
                  <option value="">Select Course</option>
                  {courses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  Enroll
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Courses</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Semester</th>
                      <th>Credits</th>
                      <th>Faculty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course: Dict) => (
                      <tr key={course.id}>
                        <td>{course.code}</td>
                        <td>{course.title}</td>
                        <td>{course.department || '-'}</td>
                        <td>{course.semester}</td>
                        <td>{course.credits}</td>
                        <td>{course.faculty_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'fees' && (
          <section className="stack">
            <article className="card">
              <h2>Assign Fee</h2>
              <form className="form-grid three" onSubmit={createFee}>
                <select className="select" value={feeForm.student_id} onChange={(event) => setFeeForm((prev) => ({ ...prev, student_id: event.target.value }))} required>
                  <option value="">Select Student</option>
                  {students.map((row: Dict) => (
                    <option key={row.student?.id} value={row.student?.id}>
                      {row.user?.full_name} ({row.student?.enrollment_number})
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="Fee title" value={feeForm.title} onChange={(event) => setFeeForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <input className="input" type="number" min={1} placeholder="Amount" value={feeForm.amount} onChange={(event) => setFeeForm((prev) => ({ ...prev, amount: event.target.value }))} required />
                <input className="input" type="date" value={feeForm.due_date} onChange={(event) => setFeeForm((prev) => ({ ...prev, due_date: event.target.value }))} required />
                <input className="input" placeholder="Notes" value={feeForm.notes} onChange={(event) => setFeeForm((prev) => ({ ...prev, notes: event.target.value }))} />
                <button type="submit" className="btn btn-primary">
                  Assign Fee
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Fee Ledger</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll</th>
                      <th>Title</th>
                      <th>Amount</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Student Declaration</th>
                      <th>Review / Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee: Dict) => (
                      <tr key={fee.id}>
                        <td>{fee.student_name}</td>
                        <td>{fee.enrollment_number}</td>
                        <td>{fee.title}</td>
                        <td>{formatCurrency(Number(fee.amount || 0))}</td>
                        <td>{fee.due_date}</td>
                        <td>
                          <span className={statusBadgeClass(String(fee.status || 'pending'))}>{String(fee.status || 'pending')}</span>
                        </td>
                        <td>
                          {fee.student_claim ? (
                            <div>
                              <span className={statusBadgeClass(String(fee.student_claim.review_status || 'pending'))}>
                                {String(fee.student_claim.declared_status || '-')} | {String(fee.student_claim.review_status || 'pending')}
                              </span>
                              <p className="muted small top-gap">
                                Amount: {formatCurrency(Number(fee.student_claim.paid_amount || 0))}
                                {fee.student_claim.reference ? ` | Ref: ${fee.student_claim.reference}` : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="muted small">No declaration submitted</span>
                          )}
                        </td>
                        <td>
                          {isSuperadmin && fee.student_claim && fee.student_claim.review_status === 'pending' ? (
                            <div className="stack">
                              <input
                                className="input"
                                type="number"
                                min={1}
                                placeholder="Approved partial amount"
                                value={feeApprovedAmounts[String(fee.id)] || ''}
                                onChange={(event) => setFeeApprovedAmounts((prev) => ({ ...prev, [String(fee.id)]: event.target.value }))}
                              />
                              <input
                                className="input"
                                placeholder="Review remarks"
                                value={feeReviewRemarks[String(fee.id)] || ''}
                                onChange={(event) => setFeeReviewRemarks((prev) => ({ ...prev, [String(fee.id)]: event.target.value }))}
                              />
                              <div className="inline-actions">
                                <button type="button" className="btn btn-primary mini" onClick={() => reviewFeeDeclaration(String(fee.id), 'approve_full')}>
                                  Approve Full
                                </button>
                                <button type="button" className="btn btn-secondary mini" onClick={() => reviewFeeDeclaration(String(fee.id), 'approve_partial')}>
                                  Approve Partial
                                </button>
                                <button type="button" className="btn btn-danger mini" onClick={() => reviewFeeDeclaration(String(fee.id), 'reject')}>
                                  Reject
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="inline-actions">
                              <button type="button" className="btn btn-secondary mini" onClick={() => updateFeeStatus(String(fee.id), 'paid')}>
                                Paid
                              </button>
                              <button type="button" className="btn btn-ghost mini" onClick={() => updateFeeStatus(String(fee.id), 'overdue')}>
                                Overdue
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'attendance' && (
          <section className="stack">
            <article className="card">
              <h2>Live Face Registration</h2>
              <p className="muted">Select a student, capture multiple face images, and register once.</p>
              <form className="stack" onSubmit={submitFaceRegistration}>
                <select className="select" value={faceStudentId} onChange={(event) => setFaceStudentId(event.target.value)} required>
                  <option value="">Select Student</option>
                  {students.map((row: Dict) => (
                    <option key={row.student?.id} value={row.student?.id}>
                      {row.user?.full_name} ({row.student?.enrollment_number})
                    </option>
                  ))}
                </select>

                <div className="grid-2 align-start">
                  <div>
                    <div className="video-wrap video-wide">
                      <video ref={faceVideoRef} className="video" autoPlay muted playsInline />
                    </div>
                    {faceCameraError && <p className="error-text">{faceCameraError}</p>}
                  </div>
                  <div className="soft-panel">
                    <h3>Capture Controls</h3>
                    <div className="inline-actions top-gap">
                      {!faceStream ? (
                        <button type="button" className="btn btn-secondary" onClick={startFaceCamera}>
                          Start Camera
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost" onClick={stopFaceCamera}>
                          Stop Camera
                        </button>
                      )}
                      <button type="button" className="btn btn-primary" onClick={captureFaceFrame} disabled={!faceStream}>
                        Capture Image
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={faceShots.length < 4}>
                        Register Face ({faceShots.length})
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setFaceShots([])}>
                        Clear Captures
                      </button>
                    </div>
                    <p className="muted small top-gap">Minimum 4 clear images required.</p>
                    <p className="muted small">Selected student: {selectedFaceStudent?.user?.full_name || '-'}</p>
                    <p className="muted small">Roll number: {selectedFaceStudent?.student?.enrollment_number || '-'}</p>
                    <p className="muted small">Department: {selectedFaceStudent?.student?.department || '-'}</p>
                    <p className="muted small">Captured frames: {faceShots.length}</p>
                  </div>
                </div>
              </form>
            </article>
          </section>
        )}

        {active === 'notices' && (
          <section className="stack">
            {isSuperadmin && (
              <article className="card">
                <h2>Publish Notice</h2>
                <form className="form-grid three" onSubmit={createNotice}>
                  <input className="input" placeholder="Notice title" value={noticeForm.title} onChange={(event) => setNoticeForm((prev) => ({ ...prev, title: event.target.value }))} required />
                  <select className="select" value={noticeForm.department} onChange={(event) => setNoticeForm((prev) => ({ ...prev, department: event.target.value }))}>
                    <option value="">All Departments</option>
                    {studentDepartmentOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select className="select" value={noticeForm.course_id} onChange={(event) => setNoticeForm((prev) => ({ ...prev, course_id: event.target.value }))}>
                    <option value="">All Subjects</option>
                    {courses.map((course: Dict) => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.title}
                      </option>
                    ))}
                  </select>
                  <textarea className="textarea full-row" placeholder="Notice details" rows={3} value={noticeForm.body} onChange={(event) => setNoticeForm((prev) => ({ ...prev, body: event.target.value }))} required />
                  <div className="full-row">
                    <p className="muted small">Target audience</p>
                    <div className="inline-actions top-gap">
                      {['student', 'teacher', 'admin', 'superadmin'].map((role) => (
                        <label key={role} className="checkbox-line">
                          <input type="checkbox" checked={noticeForm.target_roles.includes(role)} onChange={() => toggleNoticeTarget(role)} />
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary full-row">
                    Publish Notice
                  </button>
                </form>
              </article>
            )}

            <article className="card">
              <h2>Recent Notices</h2>
              {notices.length === 0 ? (
                <p className="muted">No notices available.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Audience</th>
                        <th>Department</th>
                        <th>Message</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notices.map((notice: Dict) => (
                        <tr key={notice.id}>
                          <td>{notice.title}</td>
                          <td>{noticeAudienceLabel(notice.target_roles)}</td>
                          <td>{notice.department || 'All'}</td>
                          <td>{notice.body}</td>
                          <td>{formatDateTime(notice.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {isSuperadmin && active === 'approvals' && (
          <section className="stack">
            <article className="card">
              <h2>Registration Approvals</h2>
              {registrationRequests.length === 0 ? (
                <p className="muted">No pending requests.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Roll</th>
                        <th>Department</th>
                        <th>Submitted</th>
                        <th>Remarks</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrationRequests.map((request: Dict) => (
                        <tr key={request.id}>
                          <td>{request.full_name}</td>
                          <td>{request.email}</td>
                          <td>{request.enrollment_number}</td>
                          <td>{request.department}</td>
                          <td>{formatDateTime(request.submitted_at)}</td>
                          <td>
                            <input
                              className="input"
                              value={decisionRemarks[String(request.id)] || ''}
                              onChange={(event) => setDecisionRemarks((prev) => ({ ...prev, [String(request.id)]: event.target.value }))}
                              placeholder="Remarks"
                            />
                          </td>
                          <td>
                            <div className="inline-actions">
                              <button type="button" className="btn btn-primary mini" onClick={() => approveRequest(String(request.id), 'approve')}>
                                Approve
                              </button>
                              <button type="button" className="btn btn-danger mini" onClick={() => approveRequest(String(request.id), 'reject')}>
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {isSuperadmin && active === 'salary' && (
          <section className="stack">
            <article className="card">
              <h2>Designation Salary Configuration</h2>
              <form className="form-grid three" onSubmit={upsertSalaryConfig}>
                <input className="input" placeholder="Designation" value={salaryConfigForm.designation} onChange={(event) => setSalaryConfigForm((prev) => ({ ...prev, designation: event.target.value }))} required />
                <input className="input" type="number" min={1} placeholder="Monthly salary" value={salaryConfigForm.monthly_salary} onChange={(event) => setSalaryConfigForm((prev) => ({ ...prev, monthly_salary: event.target.value }))} required />
                <button type="submit" className="btn btn-primary">
                  Save Config
                </button>
              </form>
              <div className="table-wrap top-gap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Designation</th>
                      <th>Monthly Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryConfigs.map((row: Dict) => (
                      <tr key={row.id}>
                        <td>{row.designation}</td>
                        <td>{formatCurrency(Number(row.monthly_salary || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>Disburse Salary</h2>
              <form className="form-grid three" onSubmit={disburseSalary}>
                <input className="input" type="month" value={salaryMonth} onChange={(event) => setSalaryMonth(event.target.value)} required />
                <button type="submit" className="btn btn-primary">
                  Process Salary
                </button>
              </form>
              <div className="table-wrap top-gap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Faculty</th>
                      <th>Code</th>
                      <th>Designation</th>
                      <th>Month</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryRecords.map((row: Dict) => (
                      <tr key={row.id}>
                        <td>{row.faculty_name || '-'}</td>
                        <td>{row.employee_code || '-'}</td>
                        <td>{row.designation}</td>
                        <td>{row.month}</td>
                        <td>{formatCurrency(Number(row.amount || 0))}</td>
                        <td>
                          <span className={statusBadgeClass(String(row.status || 'credited'))}>{String(row.status || 'credited')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {isSuperadmin && active === 'superadmins' && (
          <section className="stack">
            <article className="card">
              <h2>Create Superadmin</h2>
              <form className="form-grid three" onSubmit={createSuperadmin}>
                <input className="input" placeholder="Full name" value={superadminForm.full_name} onChange={(event) => setSuperadminForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                <input className="input" type="email" placeholder="Email" value={superadminForm.email} onChange={(event) => setSuperadminForm((prev) => ({ ...prev, email: event.target.value }))} required />
                <PasswordInput value={superadminForm.password} onChange={(value) => setSuperadminForm((prev) => ({ ...prev, password: value }))} placeholder="Password" />
                <button type="submit" className="btn btn-primary full-row">
                  Create Superadmin
                </button>
              </form>
            </article>
            <article className="card">
              <h2>Active Superadmins</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Password</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {superadmins.map((row: Dict) => (
                      <tr key={row.id}>
                        <td>{row.full_name}</td>
                        <td>{row.email}</td>
                        <td>{userPasswords[String(row.id || '')] || 'Unavailable'}</td>
                        <td>
                          <button type="button" className="btn btn-secondary mini" onClick={() => resetUserPassword(String(row.id || ''))}>
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {isSuperadmin && active === 'database' && (
          <section className="stack">
            <article className="card">
              <h2>Database Records</h2>
              <p className="muted">Delete records directly from database (notices, results, assignments, and more).</p>
              <div className="inline-actions top-gap">
                <select className="select" value={databaseCollection} onChange={(event) => setDatabaseCollection(event.target.value)}>
                  {databaseCollectionOptions.map((item) => (
                    <option key={`db-collection-${item}`} value={item}>
                      {item.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" onClick={refresh}>
                  Refresh
                </button>
              </div>
            </article>

            <article className="card">
              <h2>{databaseCollection.replace(/_/g, ' ').toUpperCase()} Records</h2>
              {selectedDatabaseRecords.length === 0 ? (
                <p className="muted top-gap">No records found in this collection.</p>
              ) : (
                <div className="table-wrap top-gap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Record</th>
                        <th>Created / Updated</th>
                        <th>ID</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDatabaseRecords.map((row: Dict) => (
                        <tr key={`${databaseCollection}-${row.id}`}>
                          <td>{databaseRecordLabel(databaseCollection, row)}</td>
                          <td>{formatDateTime(String(row.updated_at || row.created_at || ''))}</td>
                          <td>{row.id}</td>
                          <td>
                            <button type="button" className="btn btn-danger mini" onClick={() => deleteDatabaseEntry(databaseCollection, String(row.id || ''))}>
                              Delete From DB
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {active === 'account' && (
          <section className="stack">
            <article className="card">
              <h2>Profile</h2>
              <form className="form-grid two" onSubmit={updateAccount}>
                <input className="input" placeholder="Full name" value={profileForm.full_name} onChange={(event) => setProfileForm({ full_name: event.target.value })} required />
                <button type="submit" className="btn btn-primary">
                  Update Profile
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Change Password</h2>
              <form className="form-grid two" onSubmit={updatePassword}>
                <PasswordInput value={passwordForm.current_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, current_password: value }))} placeholder="Current password" autoComplete="current-password" />
                <PasswordInput value={passwordForm.new_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, new_password: value }))} placeholder="New password" />
                <button type="submit" className="btn btn-primary full-row">
                  Update Password
                </button>
              </form>
            </article>

            <article className="card">
              <button type="button" className="btn btn-secondary" onClick={refresh}>
                Refresh Data
              </button>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function TeacherPortal({
  state,
  runAction,
  notify,
  onLogout,
}: {
  state: Dict;
  runAction: (action: string, payload?: Dict, refreshAfter?: boolean) => Promise<Dict>;
  notify: (message: string, type?: ToastType) => void;
  onLogout: () => void;
}) {
  const courses = Array.isArray(state.courses) ? state.courses : [];
  const departments = Array.isArray(state.departments) ? state.departments : [];
  const assignments = Array.isArray(state.assignments) ? state.assignments : [];
  const activeSessions = Array.isArray(state.active_sessions) ? state.active_sessions : [];
  const courseStudents = Array.isArray(state.course_students) ? state.course_students : [];
  const submissions = Array.isArray(state.submissions) ? state.submissions : [];
  const resultRows = Array.isArray(state.results) ? state.results : [];
  const econtents = Array.isArray(state.econtents) ? state.econtents : [];
  const notices = Array.isArray(state.notices) ? state.notices : [];
  const todayClasses = Array.isArray(state.today_classes) ? state.today_classes : [];
  const extraClasses = Array.isArray(state.extra_classes) ? state.extra_classes : [];
  const todayDayName = String(state.today_day || new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()));

  const [active, setActive] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [allowStudentMark, setAllowStudentMark] = useState(true);
  const [scanResult, setScanResult] = useState<Dict | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    course_id: '',
    title: '',
    description: '',
    due_date: '',
    file: null as File | null,
  });
  const [econtentForm, setEcontentForm] = useState({
    course_id: '',
    content_type: 'syllabus',
    title: '',
    description: '',
    external_link: '',
    file: null as File | null,
  });
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    body: '',
    department: state.faculty?.department || '',
    course_id: '',
  });
  const [profileForm, setProfileForm] = useState({
    full_name: state.user?.full_name || '',
    faculty_phone: state.faculty?.faculty_phone || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [gradingForm, setGradingForm] = useState<Record<string, { marks: string; max_marks: string; remarks: string }>>({});
  const [resultForm, setResultForm] = useState({
    course_id: '',
    student_id: '',
    exam_type: 'mid',
    marks: '',
    max_marks: '100',
    remarks: '',
  });
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    course_id: '',
    attendance_date: new Date().toISOString().slice(0, 10),
    topic_covered: '',
  });
  const [manualSelected, setManualSelected] = useState<Record<string, boolean>>({});
  const [extraClassForm, setExtraClassForm] = useState({
    course_id: '',
    course_code: '',
    course_title: '',
    department: String(state.faculty?.department || ''),
    semester: '',
    class_date: new Date().toISOString().slice(0, 10),
    class_time: '',
    section: 'A',
    room_number: '',
    note: '',
  });

  const {
    videoRef: teacherVideoRef,
    stream: teacherCameraStream,
    error: teacherCameraError,
    start: startTeacherCamera,
    stop: stopTeacherCamera,
    capture: captureTeacherFrame,
  } = useCamera();

  const manualStudents = useMemo(
    () => courseStudents.filter((entry: Dict) => String(entry.course_id) === String(manualForm.course_id)),
    [courseStudents, manualForm.course_id],
  );
  const attendanceCourses = useMemo(
    () =>
      courses.filter((course: Dict) =>
        todayClasses.some((todayEntry: Dict) => String(todayEntry.course_id) === String(course.id)),
      ),
    [courses, todayClasses],
  );
  const attendanceCourseIdSet = useMemo(
    () => new Set(attendanceCourses.map((course: Dict) => String(course.id))),
    [attendanceCourses],
  );

  const allManualSelected = manualStudents.length > 0 && manualStudents.every((entry: Dict) => manualSelected[String(entry.student_id)]);
  const departmentNames = departments.map((entry: Dict) => String(entry.name || '')).filter((entry) => entry);

  useEffect(() => {
    if ((!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) && attendanceCourses[0]?.id) {
      setSelectedCourseId(String(attendanceCourses[0].id));
    }
    if (attendanceCourses.length === 0 && selectedCourseId) {
      setSelectedCourseId('');
    }
    if (!assignmentForm.course_id && courses[0]?.id) {
      setAssignmentForm((prev) => ({ ...prev, course_id: String(courses[0].id) }));
    }
    if (!econtentForm.course_id && courses[0]?.id) {
      setEcontentForm((prev) => ({ ...prev, course_id: String(courses[0].id) }));
    }
    if (!resultForm.course_id && courses[0]?.id) {
      setResultForm((prev) => ({ ...prev, course_id: String(courses[0].id) }));
    }
  }, [courses, attendanceCourses, attendanceCourseIdSet, selectedCourseId, assignmentForm.course_id, econtentForm.course_id, resultForm.course_id]);

  useEffect(() => {
    if (!extraClassForm.course_id && courses[0]?.id) {
      setExtraClassForm((prev) => ({
        ...prev,
        course_id: String(courses[0].id),
        course_code: String(courses[0].code || ''),
        course_title: String(courses[0].title || ''),
        department: String(courses[0].department || prev.department || ''),
        semester: String(courses[0].semester || prev.semester || '1'),
      }));
    }
  }, [courses, extraClassForm.course_id]);

  useEffect(() => {
    const studentForCourse = courseStudents.find((item: Dict) => String(item.course_id) === String(resultForm.course_id));
    if (!resultForm.student_id && studentForCourse?.student_id) {
      setResultForm((prev) => ({ ...prev, student_id: String(studentForCourse.student_id) }));
    }
  }, [courseStudents, resultForm.course_id, resultForm.student_id]);

  useEffect(() => {
    setProfileForm({
      full_name: state.user?.full_name || '',
      faculty_phone: state.faculty?.faculty_phone || '',
    });
  }, [state.user?.full_name, state.faculty?.faculty_phone]);

  async function startSession() {
    if (!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) {
      notify('Select a subject from today classes first.', 'error');
      return;
    }
    await runAction('teacher.start_session', { course_id: selectedCourseId, allow_student_mark: allowStudentMark });
  }

  async function stopSession() {
    if (!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) {
      notify('Select a subject from today classes first.', 'error');
      return;
    }
    await runAction('teacher.stop_session', { course_id: selectedCourseId });
  }

  async function scanFaces() {
    if (!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) {
      notify('Select a subject from today classes first.', 'error');
      return;
    }

    let frame: File;
    try {
      frame = await captureTeacherFrame(`scan-${Date.now()}.jpg`);
    } catch (error) {
      notify((error as Error).message, 'error');
      return;
    }
    const form = new FormData();
    form.append('course_id', selectedCourseId);
    form.append('image', frame);

    const response = await fetch('/api/attendance/scan', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(String(payload.error || 'Unable to scan faces.'), 'error');
      return;
    }

    const rawFaces = Array.isArray(payload.faces) ? payload.faces : [];
    const recognizedBest = new Map<string, Dict>();
    const unknownFaces: Dict[] = [];
    for (const face of rawFaces) {
      const studentId = String(face?.student_id || '');
      if (!studentId) {
        unknownFaces.push(face);
        continue;
      }
      const current = recognizedBest.get(studentId);
      if (!current || Number(face.distance || 999) < Number(current.distance || 999)) {
        recognizedBest.set(studentId, face);
      }
    }
    const finalFaces = [...recognizedBest.values(), ...unknownFaces];
    const finalPayload = {
      ...payload,
      faces: finalFaces,
      faces_detected: finalFaces.length,
      recognized_count: recognizedBest.size,
    };

    setScanResult(finalPayload);
    notify(`${finalPayload.faces_detected || 0} face(s) detected.`, 'info');
  }

  async function markDetectedAttendance() {
    if (!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) {
      notify('Select a subject from today classes first.', 'error');
      return;
    }
    const recognizedIds = Array.from(
      new Set(
        (Array.isArray(scanResult?.faces) ? scanResult?.faces : [])
          .map((entry: Dict) => String(entry.student_id || ''))
          .filter((value: string) => Boolean(value)),
      ),
    );

    if (!recognizedIds.length) {
      notify('No recognized students in last scan.', 'error');
      return;
    }

    const result = await runAction('attendance.mark_batch', {
      course_id: selectedCourseId,
      student_ids: recognizedIds,
    });
    notify(
      `Marked ${result.summary?.marked_count || 0}, already marked ${result.summary?.already_marked_count || 0}, rejected ${result.summary?.rejected_count || 0}.`,
      'success',
    );
  }

  async function downloadTodayAttendance() {
    if (!selectedCourseId || !attendanceCourseIdSet.has(String(selectedCourseId))) {
      notify('Select a subject from today classes first.', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`/api/attendance/export?course_id=${encodeURIComponent(selectedCourseId)}&date=${today}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      notify(String(payload.error || 'Unable to download attendance file.'), 'error');
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance-${today}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    notify('Attendance CSV downloaded.', 'success');
  }

  function openManualAttendance(courseId: string) {
    if (!attendanceCourseIdSet.has(String(courseId))) {
      notify('Manual attendance is allowed only for today classes.', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const students = courseStudents.filter((entry: Dict) => String(entry.course_id) === String(courseId));
    const nextSelection: Record<string, boolean> = {};
    for (const student of students) {
      nextSelection[String(student.student_id)] = false;
    }
    setManualForm({ course_id: courseId, attendance_date: today, topic_covered: '' });
    setManualSelected(nextSelection);
    setManualModalOpen(true);
  }

  function toggleManualSelectAll(checked: boolean) {
    const nextSelection: Record<string, boolean> = {};
    for (const student of manualStudents) {
      nextSelection[String(student.student_id)] = checked;
    }
    setManualSelected(nextSelection);
  }

  async function submitManualAttendance(event: FormEvent) {
    event.preventDefault();
    if (!manualForm.course_id) {
      notify('Select a subject first.', 'error');
      return;
    }
    if (!manualForm.topic_covered.trim()) {
      notify('Enter lecture topic before submitting attendance.', 'error');
      return;
    }
    const presentStudentIds = manualStudents.filter((entry: Dict) => manualSelected[String(entry.student_id)]).map((entry: Dict) => String(entry.student_id));
    await runAction('teacher.submit_manual_attendance', {
      course_id: manualForm.course_id,
      attendance_date: manualForm.attendance_date,
      topic_covered: manualForm.topic_covered,
      present_student_ids: presentStudentIds,
    });
    setManualModalOpen(false);
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    const payload: Dict = {
      course_id: assignmentForm.course_id,
      title: assignmentForm.title,
      description: assignmentForm.description,
      due_date: assignmentForm.due_date,
    };

    if (assignmentForm.file) {
      payload.file = {
        name: assignmentForm.file.name,
        mime: assignmentForm.file.type || 'application/pdf',
        base64: await toBase64(assignmentForm.file),
      };
    }

    await runAction('teacher.create_assignment', payload);
    setAssignmentForm({ course_id: assignmentForm.course_id, title: '', description: '', due_date: '', file: null });
  }

  async function createEcontent(event: FormEvent) {
    event.preventDefault();
    const payload: Dict = {
      course_id: econtentForm.course_id,
      content_type: econtentForm.content_type,
      title: econtentForm.title,
      description: econtentForm.description,
      external_link: econtentForm.external_link,
    };
    if (econtentForm.file) {
      payload.file = {
        name: econtentForm.file.name,
        mime: econtentForm.file.type || 'application/pdf',
        base64: await toBase64(econtentForm.file),
      };
    }
    await runAction('teacher.create_econtent', payload);
    setEcontentForm((prev) => ({ ...prev, title: '', description: '', external_link: '', file: null }));
  }

  async function createStudentNotice(event: FormEvent) {
    event.preventDefault();
    await runAction('teacher.create_notice', noticeForm);
    setNoticeForm((prev) => ({ ...prev, title: '', body: '' }));
  }

  function handleExtraClassCourse(courseId: string) {
    const mappedCourse = courses.find((item: Dict) => String(item.id) === String(courseId));
    setExtraClassForm((prev) => ({
      ...prev,
      course_id: courseId,
      course_code: String(mappedCourse?.code || prev.course_code || ''),
      course_title: String(mappedCourse?.title || prev.course_title || ''),
      department: String(mappedCourse?.department || prev.department || ''),
      semester: String(mappedCourse?.semester || prev.semester || '1'),
    }));
  }

  async function createExtraClass(event: FormEvent) {
    event.preventDefault();
    if (!extraClassForm.department) {
      notify('Select target department for extra class.', 'error');
      return;
    }
    if (!extraClassForm.semester) {
      notify('Enter target semester for extra class.', 'error');
      return;
    }
    if (!extraClassForm.class_time.trim()) {
      notify('Enter class time for extra class.', 'error');
      return;
    }

    await runAction('teacher.create_extra_class', {
      course_id: extraClassForm.course_id,
      course_code: extraClassForm.course_code,
      course_title: extraClassForm.course_title,
      department: extraClassForm.department,
      semester: Number(extraClassForm.semester),
      class_date: extraClassForm.class_date,
      class_time: extraClassForm.class_time,
      section: extraClassForm.section || 'A',
      room_number: extraClassForm.room_number,
      note: extraClassForm.note,
    });

    setExtraClassForm((prev) => ({
      ...prev,
      class_time: '',
      room_number: '',
      note: '',
      class_date: new Date().toISOString().slice(0, 10),
    }));
  }

  async function gradeSubmission(submissionId: string) {
    const data = gradingForm[submissionId];
    if (!data) {
      notify('Enter marks before saving evaluation.', 'error');
      return;
    }
    await runAction('teacher.grade_submission', {
      submission_id: submissionId,
      marks: Number(data.marks),
      max_marks: Number(data.max_marks || 100),
      remarks: data.remarks || '',
    });
  }

  async function publishResult(event: FormEvent) {
    event.preventDefault();
    await runAction('teacher.publish_result', {
      course_id: resultForm.course_id,
      student_id: resultForm.student_id,
      exam_type: resultForm.exam_type,
      marks: Number(resultForm.marks),
      max_marks: Number(resultForm.max_marks || 100),
      remarks: resultForm.remarks,
    });
    setResultForm((prev) => ({ ...prev, marks: '', remarks: '' }));
  }

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    await runAction('account.update_profile', profileForm);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    await runAction('account.change_password', passwordForm, false);
    setPasswordForm({ current_password: '', new_password: '' });
    notify('Password updated successfully.', 'success');
  }

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'academics', label: 'Academics' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'results', label: 'Results' },
    { key: 'notices', label: 'Notices' },
    { key: 'account', label: 'Account' },
  ];

  return (
    <div className="portal-root">
      <ShellHeader roleLabel="Faculty Portal" userName={state.user?.full_name || 'Faculty'} tabs={tabs} active={active} onTab={setActive} onLogout={onLogout} />
      <main className="portal-content">
        {active === 'dashboard' && (
          <section className="stack">
            <article className="card">
              <div>
                <h2>Faculty Teaching Workspace</h2>
                <p className="muted">Run attendance, publish assignments, evaluate submissions and generate results quickly.</p>
              </div>
            </article>

            <div className="stats-grid four">
              <StatCard label="Subjects" value={courses.length} />
              <StatCard label="Active Sessions" value={activeSessions.length} />
              <StatCard label="Assignments" value={assignments.length} />
              <StatCard label="Published Results" value={resultRows.length} />
            </div>
            <article className="card">
              <h2>Today&apos;s Classes ({todayDayName})</h2>
              {todayClasses.length === 0 ? (
                <p className="muted">No classes scheduled for today.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Subject</th>
                        <th>Semester</th>
                        <th>Section</th>
                        <th>Room</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayClasses.map((entry: Dict, index: number) => (
                        <tr key={`teacher-today-${entry.course_id || index}`}>
                          <td>{entry.class_time || '-'}</td>
                          <td>
                            <span className={String(entry.class_type || '') === 'extra' ? 'badge badge-blue' : 'badge badge-green'}>
                              {String(entry.class_type || 'regular').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{entry.semester || '-'}</td>
                          <td>{entry.section || '-'}</td>
                          <td>{entry.room_number || '-'}</td>
                          <td>{entry.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <article className="card">
              <h2>Create Extra Class</h2>
              <p className="muted">Generate extra class for any department and semester. It will appear in students&apos; daily schedule.</p>
              <form className="form-grid three top-gap" onSubmit={createExtraClass}>
                <select className="select" value={extraClassForm.course_id} onChange={(event) => handleExtraClassCourse(event.target.value)}>
                  <option value="">Manual Subject Entry</option>
                  {courses.map((course: Dict) => (
                    <option key={`extra-course-${course.id}`} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="Subject Code" value={extraClassForm.course_code} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, course_code: event.target.value.toUpperCase() }))} required />
                <input className="input" placeholder="Subject Title" value={extraClassForm.course_title} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, course_title: event.target.value }))} required />
                <select className="select" value={extraClassForm.department} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, department: event.target.value }))} required>
                  <option value="">Select Department</option>
                  {departmentNames.map((dept) => (
                    <option key={`extra-dept-${dept}`} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <input className="input" type="number" min={1} max={20} placeholder="Semester" value={extraClassForm.semester} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, semester: event.target.value }))} required />
                <input className="input" type="date" value={extraClassForm.class_date} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, class_date: event.target.value }))} required />
                <input className="input" placeholder="Class Time (e.g. 17:00)" value={extraClassForm.class_time} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, class_time: event.target.value }))} required />
                <input className="input" placeholder="Section" value={extraClassForm.section} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, section: event.target.value.toUpperCase() }))} />
                <input className="input" placeholder="Room Number" value={extraClassForm.room_number} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, room_number: event.target.value }))} />
                <input className="input" placeholder="Note (optional)" value={extraClassForm.note} onChange={(event) => setExtraClassForm((prev) => ({ ...prev, note: event.target.value }))} />
                <button type="submit" className="btn btn-primary full-row">
                  Add Extra Class
                </button>
              </form>
            </article>
            <article className="card">
              <h2>Extra Classes (Created By You)</h2>
              {extraClasses.length === 0 ? (
                <p className="muted">No extra classes created yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Department</th>
                        <th>Semester</th>
                        <th>Subject</th>
                        <th>Section</th>
                        <th>Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraClasses.map((entry: Dict) => (
                        <tr key={`extra-created-${entry.id}`}>
                          <td>{entry.class_date || '-'}</td>
                          <td>{entry.class_time || '-'}</td>
                          <td>{entry.department || '-'}</td>
                          <td>{entry.semester || '-'}</td>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{entry.section || '-'}</td>
                          <td>{entry.room_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <article className="card">
              <h2>Assigned Subjects</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Semester</th>
                      <th>Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course: Dict) => (
                      <tr key={course.id}>
                        <td>{course.code}</td>
                        <td>{course.title}</td>
                        <td>{course.semester}</td>
                        <td>{course.credits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'attendance' && (
          <section className="stack">
            <article className="card">
              <h2>Manual Attendance Sessions (Today)</h2>
              <p className="muted">Only course-linked classes from today schedule are available for attendance.</p>
              {todayClasses.length === 0 ? (
                <p className="muted top-gap">No classes scheduled for today.</p>
              ) : (
                <div className="table-wrap top-gap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Subject</th>
                        <th>Semester</th>
                        <th>Section</th>
                        <th>Room</th>
                        <th>Total Students</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayClasses.map((entry: Dict, index: number) => (
                        <tr key={`manual-${entry.course_id || index}`}>
                          <td>{entry.class_time || '-'}</td>
                          <td>{String(entry.class_type || 'regular').toUpperCase()}</td>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{entry.semester || '-'}</td>
                          <td>{entry.section || '-'}</td>
                          <td>{entry.room_number || '-'}</td>
                          <td>{courseStudents.filter((row: Dict) => String(row.course_id) === String(entry.course_id)).length}</td>
                          <td>
                            {entry.course_id ? (
                              <button type="button" className="btn btn-primary mini" onClick={() => openManualAttendance(String(entry.course_id || ''))}>
                                Take Attendance
                              </button>
                            ) : (
                              <span className="muted small">No linked subject</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="card">
              <h2>Live Attendance Session (Today)</h2>
              <div className="form-grid three">
                <select className="select" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
                  <option value="">Select Subject</option>
                  {attendanceCourses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <label className="checkbox-line">
                  <input type="checkbox" checked={allowStudentMark} onChange={(event) => setAllowStudentMark(event.target.checked)} />
                  Allow students to mark attendance
                </label>
                <div className="inline-actions">
                  <button type="button" className="btn btn-primary" onClick={startSession} disabled={attendanceCourses.length === 0}>
                    Start Attendance
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={stopSession} disabled={attendanceCourses.length === 0}>
                    Stop Session
                  </button>
                </div>
              </div>
              {attendanceCourses.length === 0 && <p className="muted top-gap">No classes available today for attendance operations.</p>}

              <div className="inline-actions top-gap">
                {!teacherCameraStream ? (
                  <button type="button" className="btn btn-secondary" onClick={startTeacherCamera}>
                    Start Camera
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={stopTeacherCamera}>
                    Stop Camera
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={scanFaces} disabled={!teacherCameraStream}>
                  Scan Faces
                </button>
                <button type="button" className="btn btn-primary" onClick={markDetectedAttendance}>
                  Mark Detected
                </button>
                <button type="button" className="btn btn-secondary" onClick={downloadTodayAttendance}>
                  Download Today CSV
                </button>
              </div>

              {teacherCameraError && <p className="error-text">{teacherCameraError}</p>}

              <div className="grid-2 top-gap">
                <div className="video-wrap video-wide">
                  <video ref={teacherVideoRef} className="video" autoPlay muted playsInline />
                </div>
                <div className="soft-panel">
                  <h3>Detected Faces</h3>
                  <p className="muted">{scanResult ? `${scanResult.faces_detected || 0} face(s), ${scanResult.recognized_count || 0} recognized` : 'No scan yet'}</p>
                  <ul className="clean-list">
                    {(Array.isArray(scanResult?.faces) ? scanResult?.faces : []).map((face: Dict, index: number) => (
                      <li key={`${face.student_id || 'unknown'}-${index}`} className={`detected-item ${face.student_id ? 'known' : 'unknown'}`}>
                        <div>
                          <strong className="detected-name">{face.student_name || 'Unknown'}</strong> {face.enrollment_number ? `(${face.enrollment_number})` : ''}
                        </div>
                        <div className="muted small">distance {face.distance}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>

            {manualModalOpen && (
              <div className="modal-backdrop" role="presentation" onClick={() => setManualModalOpen(false)}>
                <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Take Manual Attendance</h3>
                    <button type="button" className="btn btn-ghost mini" onClick={() => setManualModalOpen(false)}>
                      Close
                    </button>
                  </div>
                  <form className="stack" onSubmit={submitManualAttendance}>
                    <div className="form-grid two">
                      <select
                        className="select"
                        value={manualForm.course_id}
                        onChange={(event) => setManualForm((prev) => ({ ...prev, course_id: event.target.value }))}
                        required
                      >
                        <option value="">Select Subject</option>
                        {attendanceCourses.map((course: Dict) => (
                          <option key={`manual-form-${course.id}`} value={course.id}>
                            {course.code} - {course.title}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        type="date"
                        value={manualForm.attendance_date}
                        onChange={(event) => setManualForm((prev) => ({ ...prev, attendance_date: event.target.value }))}
                        required
                      />
                    </div>
                    <input
                      className="input"
                      placeholder="Topic covered in today's lecture"
                      value={manualForm.topic_covered}
                      onChange={(event) => setManualForm((prev) => ({ ...prev, topic_covered: event.target.value }))}
                      required
                    />
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={allManualSelected}
                        onChange={(event) => toggleManualSelectAll(event.target.checked)}
                      />
                      Select All / Unselect All
                    </label>
                    <div className="manual-student-grid">
                      {manualStudents.map((student: Dict) => {
                        const selected = Boolean(manualSelected[String(student.student_id)]);
                        return (
                          <button
                            key={`${manualForm.course_id}-${student.student_id}`}
                            type="button"
                            className={`manual-student-card ${selected ? 'active' : ''}`}
                            onClick={() =>
                              setManualSelected((prev) => ({
                                ...prev,
                                [String(student.student_id)]: !prev[String(student.student_id)],
                              }))
                            }
                          >
                            <strong>{student.student_name}</strong>
                            <span>{student.enrollment_number}</span>
                          </button>
                        );
                      })}
                    </div>
                    {manualStudents.length === 0 && <p className="muted small">No students enrolled for this subject.</p>}
                    <div className="inline-actions">
                      <button type="submit" className="btn btn-primary">
                        Submit Attendance
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'academics' && (
          <section className="stack">
            <article className="card">
              <h2>Publish E-Content</h2>
              <p className="muted">Upload syllabus, notes and reference materials for enrolled students.</p>
              <form className="form-grid three top-gap" onSubmit={createEcontent}>
                <select className="select" value={econtentForm.course_id} onChange={(event) => setEcontentForm((prev) => ({ ...prev, course_id: event.target.value }))} required>
                  <option value="">Select Subject</option>
                  {courses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <select className="select" value={econtentForm.content_type} onChange={(event) => setEcontentForm((prev) => ({ ...prev, content_type: event.target.value }))} required>
                  <option value="syllabus">Syllabus</option>
                  <option value="notes">Class Notes</option>
                  <option value="reference">Reference Material</option>
                  <option value="video">Video Link</option>
                  <option value="announcement">Academic Notice</option>
                </select>
                <input className="input" placeholder="Title" value={econtentForm.title} onChange={(event) => setEcontentForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <textarea className="textarea full-row" placeholder="Description" rows={3} value={econtentForm.description} onChange={(event) => setEcontentForm((prev) => ({ ...prev, description: event.target.value }))} />
                <input className="input" placeholder="External link (optional)" value={econtentForm.external_link} onChange={(event) => setEcontentForm((prev) => ({ ...prev, external_link: event.target.value }))} />
                <input className="input" type="file" accept="application/pdf" onChange={(event) => setEcontentForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
                <button type="submit" className="btn btn-primary full-row">
                  Publish E-Content
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Published E-Content</h2>
              {econtents.length === 0 ? (
                <p className="muted">No e-content published yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Resource</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {econtents.map((entry: Dict) => (
                        <tr key={entry.id}>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{String(entry.content_type || '').toUpperCase()}</td>
                          <td>{entry.title}</td>
                          <td>
                            <div className="inline-actions">
                              {entry.external_link ? (
                                <a href={entry.external_link} target="_blank" rel="noreferrer" className="link">
                                  Open Link
                                </a>
                              ) : null}
                              {entry.attachment_file_id ? (
                                <a href={`/api/files/${entry.attachment_file_id}`} className="link" target="_blank" rel="noreferrer">
                                  Download PDF
                                </a>
                              ) : (
                                !entry.external_link && <span className="muted small">No file</span>
                              )}
                            </div>
                          </td>
                          <td>{formatDateTime(entry.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {active === 'assignments' && (
          <section className="stack">
            <article className="card">
              <h2>Create Assignment</h2>
              <form className="form-grid three" onSubmit={createAssignment}>
                <select className="select" value={assignmentForm.course_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, course_id: event.target.value }))} required>
                  <option value="">Select Subject</option>
                  {courses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="Assignment title" value={assignmentForm.title} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <input className="input" type="date" value={assignmentForm.due_date} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_date: event.target.value }))} required />
                <textarea className="textarea full-row" placeholder="Description" value={assignmentForm.description} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
                <input className="input full-row" type="file" accept="application/pdf" onChange={(event) => setAssignmentForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))} />
                <button type="submit" className="btn btn-primary full-row">
                  Publish Assignment
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Recent Assignments</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Title</th>
                      <th>Due Date</th>
                      <th>Attachment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((item: Dict) => (
                      <tr key={item.id}>
                        <td>
                          {item.course_code} - {item.course_title}
                        </td>
                        <td>{item.title}</td>
                        <td>{item.due_date}</td>
                        <td>
                          {item.attachment_file_id ? (
                            <a href={`/api/files/${item.attachment_file_id}`} className="link" target="_blank" rel="noreferrer">
                              Download PDF
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>Evaluate Assignment Submissions</h2>
              {submissions.length === 0 ? (
                <p className="muted">No submissions available yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Subject</th>
                        <th>Assignment</th>
                        <th>Submission</th>
                        <th>Marks</th>
                        <th>Remarks</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((entry: Dict) => (
                        <tr key={entry.id}>
                          <td>
                            {entry.student_name} ({entry.enrollment_number})
                          </td>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{entry.assignment_title || '-'}</td>
                          <td>
                            {entry.submission_file_id ? (
                              <a href={`/api/files/${entry.submission_file_id}`} className="link" target="_blank" rel="noreferrer">
                                Download PDF
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            <div className="inline-actions">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                placeholder="Marks"
                                value={gradingForm[String(entry.id)]?.marks || String(entry.marks ?? '')}
                                onChange={(event) =>
                                  setGradingForm((prev) => ({
                                    ...prev,
                                    [String(entry.id)]: {
                                      marks: event.target.value,
                                      max_marks: prev[String(entry.id)]?.max_marks || String(entry.max_marks ?? 100),
                                      remarks: prev[String(entry.id)]?.remarks ?? String(entry.remarks || ''),
                                    },
                                  }))
                                }
                              />
                              <input
                                className="input"
                                type="number"
                                min={1}
                                placeholder="Max"
                                value={gradingForm[String(entry.id)]?.max_marks || String(entry.max_marks ?? 100)}
                                onChange={(event) =>
                                  setGradingForm((prev) => ({
                                    ...prev,
                                    [String(entry.id)]: {
                                      marks: prev[String(entry.id)]?.marks ?? String(entry.marks ?? ''),
                                      max_marks: event.target.value,
                                      remarks: prev[String(entry.id)]?.remarks ?? String(entry.remarks || ''),
                                    },
                                  }))
                                }
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              className="input"
                              placeholder="Remarks"
                              value={gradingForm[String(entry.id)]?.remarks || String(entry.remarks || '')}
                              onChange={(event) =>
                                setGradingForm((prev) => ({
                                  ...prev,
                                  [String(entry.id)]: {
                                    marks: prev[String(entry.id)]?.marks ?? String(entry.marks ?? ''),
                                    max_marks: prev[String(entry.id)]?.max_marks || String(entry.max_marks ?? 100),
                                    remarks: event.target.value,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <button type="button" className="btn btn-primary mini" onClick={() => gradeSubmission(String(entry.id))}>
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {active === 'results' && (
          <section className="stack">
            <article className="card">
              <h2>Generate Exam Results</h2>
              <form className="form-grid three" onSubmit={publishResult}>
                <select className="select" value={resultForm.course_id} onChange={(event) => setResultForm((prev) => ({ ...prev, course_id: event.target.value }))} required>
                  <option value="">Select Subject</option>
                  {courses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <select className="select" value={resultForm.student_id} onChange={(event) => setResultForm((prev) => ({ ...prev, student_id: event.target.value }))} required>
                  <option value="">Select Student</option>
                  {courseStudents
                    .filter((entry: Dict) => String(entry.course_id) === String(resultForm.course_id))
                    .map((entry: Dict) => (
                      <option key={`${entry.course_id}-${entry.student_id}`} value={entry.student_id}>
                        {entry.student_name} ({entry.enrollment_number})
                      </option>
                    ))}
                </select>
                <select className="select" value={resultForm.exam_type} onChange={(event) => setResultForm((prev) => ({ ...prev, exam_type: event.target.value }))} required>
                  <option value="mid">Mid Semester</option>
                  <option value="final">Final Semester</option>
                  <option value="assignment">Assignment</option>
                  <option value="practical">Practical</option>
                  <option value="viva">Viva</option>
                </select>
                <input className="input" type="number" min={0} placeholder="Marks" value={resultForm.marks} onChange={(event) => setResultForm((prev) => ({ ...prev, marks: event.target.value }))} required />
                <input className="input" type="number" min={1} placeholder="Maximum Marks" value={resultForm.max_marks} onChange={(event) => setResultForm((prev) => ({ ...prev, max_marks: event.target.value }))} required />
                <input className="input" placeholder="Remarks" value={resultForm.remarks} onChange={(event) => setResultForm((prev) => ({ ...prev, remarks: event.target.value }))} />
                <button type="submit" className="btn btn-primary full-row">
                  Save Result
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Published Results</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Subject</th>
                      <th>Exam Type</th>
                      <th>Marks</th>
                      <th>Max</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.map((entry: Dict) => (
                      <tr key={entry.id}>
                        <td>
                          {entry.student_name} ({entry.enrollment_number})
                        </td>
                        <td>
                          {entry.course_code} - {entry.course_title}
                        </td>
                        <td>{String(entry.exam_type || '').toUpperCase()}</td>
                        <td>{entry.marks}</td>
                        <td>{entry.max_marks || 100}</td>
                        <td>{formatDateTime(entry.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'notices' && (
          <section className="stack">
            <article className="card">
              <h2>Publish Student Notice</h2>
              <form className="form-grid three" onSubmit={createStudentNotice}>
                <input className="input" placeholder="Notice title" value={noticeForm.title} onChange={(event) => setNoticeForm((prev) => ({ ...prev, title: event.target.value }))} required />
                <select className="select" value={noticeForm.department} onChange={(event) => setNoticeForm((prev) => ({ ...prev, department: event.target.value }))}>
                  <option value="">All Departments</option>
                  {departments.map((dept: Dict) => (
                    <option key={String(dept.code || dept.id)} value={String(dept.name || '')}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                <select className="select" value={noticeForm.course_id} onChange={(event) => setNoticeForm((prev) => ({ ...prev, course_id: event.target.value }))}>
                  <option value="">All Your Subjects</option>
                  {courses.map((course: Dict) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.title}
                    </option>
                  ))}
                </select>
                <textarea className="textarea full-row" placeholder="Notice details" rows={3} value={noticeForm.body} onChange={(event) => setNoticeForm((prev) => ({ ...prev, body: event.target.value }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Publish for Students
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Recent Notices</h2>
              {notices.length === 0 ? (
                <p className="muted">No notices to display.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Audience</th>
                        <th>Department</th>
                        <th>Message</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notices.map((notice: Dict) => (
                        <tr key={notice.id}>
                          <td>{notice.title}</td>
                          <td>{noticeAudienceLabel(notice.target_roles)}</td>
                          <td>{notice.department || 'All'}</td>
                          <td>{notice.body}</td>
                          <td>{formatDateTime(notice.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {active === 'account' && (
          <section className="stack">
            <article className="card">
              <h2>Profile</h2>
              <form className="form-grid two" onSubmit={updateProfile}>
                <input className="input" placeholder="Full name" value={profileForm.full_name} onChange={(event) => setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                <input className="input" placeholder="Contact number" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={profileForm.faculty_phone} onChange={(event) => setProfileForm((prev) => ({ ...prev, faculty_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Update Profile
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Change Password</h2>
              <form className="form-grid two" onSubmit={updatePassword}>
                <PasswordInput value={passwordForm.current_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, current_password: value }))} placeholder="Current password" autoComplete="current-password" />
                <PasswordInput value={passwordForm.new_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, new_password: value }))} placeholder="New password" />
                <button type="submit" className="btn btn-primary full-row">
                  Update Password
                </button>
              </form>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function StudentPortal({
  state,
  runAction,
  refresh,
  notify,
  onLogout,
}: {
  state: Dict;
  runAction: (action: string, payload?: Dict, refreshAfter?: boolean) => Promise<Dict>;
  refresh: () => Promise<void>;
  notify: (message: string, type?: ToastType) => void;
  onLogout: () => void;
}) {
  const [active, setActive] = useState('dashboard');

  const attendanceSummary = state.attendance_summary || {};
  const attendanceHistory = Array.isArray(state.attendance_history) ? state.attendance_history : [];
  const activeSessions = Array.isArray(state.active_sessions) ? state.active_sessions : [];
  const academics = Array.isArray(state.academics) ? state.academics : [];
  const examData = state.exams || {};
  const fees = Array.isArray(state.fees?.items) ? state.fees.items : [];
  const notices = Array.isArray(state.notices) ? state.notices : [];
  const studentTimetable = Array.isArray(state.student_timetable) ? state.student_timetable : [];
  const todayClasses = Array.isArray(state.today_classes) ? state.today_classes : [];
  const todayDayName = String(state.today_day || new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()));
  const performanceSummary = state.performance_summary || {};
  const resultTrend = Array.isArray(performanceSummary.result_trend) ? performanceSummary.result_trend : [];
  const semesterResults = Array.isArray(examData.semester_results) ? examData.semester_results : [];

  const [selectedSessionCourseId, setSelectedSessionCourseId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [dayTimetableModal, setDayTimetableModal] = useState<Dict | null>(null);
  const [resultTypeModal, setResultTypeModal] = useState('');
  const [faceAttendanceOpen, setFaceAttendanceOpen] = useState(false);
  const [assignmentFiles, setAssignmentFiles] = useState<Record<string, File | null>>({});
  const [feeDeclarationForms, setFeeDeclarationForms] = useState<
    Record<string, { declared_status: 'full' | 'partial'; paid_amount: string; reference: string; notes: string }>
  >({});
  const [profileForm, setProfileForm] = useState({
    full_name: state.user?.full_name || '',
    student_phone: state.profile?.student_phone || '',
    parent_name: state.profile?.parent_name || '',
    parent_phone: state.profile?.parent_phone || '',
    address_line: state.profile?.address_line || '',
    pincode: state.profile?.pincode || '',
    state: state.profile?.state || '',
    city: state.profile?.city || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const {
    videoRef: studentVideoRef,
    stream: studentCameraStream,
    error: studentCameraError,
    start: startStudentCamera,
    stop: stopStudentCamera,
    capture: captureStudentFrame,
  } = useCamera();

  useEffect(() => {
    if (!selectedSessionCourseId && activeSessions[0]?.course_id) {
      setSelectedSessionCourseId(String(activeSessions[0].course_id));
    }
  }, [activeSessions, selectedSessionCourseId]);

  useEffect(() => {
    if (!selectedCourseId && academics[0]?.course_id) {
      setSelectedCourseId(String(academics[0].course_id));
    }
  }, [academics, selectedCourseId]);

  useEffect(() => {
    setProfileForm({
      full_name: state.user?.full_name || '',
      student_phone: state.profile?.student_phone || '',
      parent_name: state.profile?.parent_name || '',
      parent_phone: state.profile?.parent_phone || '',
      address_line: state.profile?.address_line || '',
      pincode: state.profile?.pincode || '',
      state: state.profile?.state || '',
      city: state.profile?.city || '',
    });
  }, [
    state.user?.full_name,
    state.profile?.student_phone,
    state.profile?.parent_name,
    state.profile?.parent_phone,
    state.profile?.address_line,
    state.profile?.pincode,
    state.profile?.state,
    state.profile?.city,
  ]);

  const selectedAcademic = useMemo(
    () => academics.find((course: Dict) => String(course.course_id) === String(selectedCourseId)) || academics[0],
    [academics, selectedCourseId],
  );
  const academicsBySemester = useMemo(() => {
    const map = new Map<number, Dict[]>();
    for (const course of academics) {
      const semester = Number(course.semester || 0);
      if (!map.has(semester)) map.set(semester, []);
      map.get(semester)?.push(course);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([semester, items]) => ({
        semester,
        items: [...items].sort((a, b) => String(a.course_code || '').localeCompare(String(b.course_code || ''))),
      }));
  }, [academics]);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayKey = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }, []);
  const todayAttendance = useMemo(
    () => attendanceHistory.filter((record: Dict) => String(record.attendance_date) === todayKey),
    [attendanceHistory, todayKey],
  );
  const yesterdayAttendance = useMemo(
    () => attendanceHistory.filter((record: Dict) => String(record.attendance_date) === yesterdayKey),
    [attendanceHistory, yesterdayKey],
  );
  const selectedDateAttendance = useMemo(
    () => (attendanceDateFilter ? attendanceHistory.filter((record: Dict) => String(record.attendance_date) === attendanceDateFilter) : []),
    [attendanceDateFilter, attendanceHistory],
  );
  const subjectAttendanceStats = useMemo(() => {
    const map = new Map<string, { course_code: string; course_title: string; present: number; total: number; faculty_name: string }>();
    for (const record of attendanceHistory) {
      const key = String(record.course_code || record.course_id || '');
      if (!map.has(key)) {
        const academic = academics.find((course: Dict) => String(course.course_code) === String(record.course_code));
        map.set(key, {
          course_code: String(record.course_code || ''),
          course_title: String(record.course_title || ''),
          present: 0,
          total: 0,
          faculty_name: String(academic?.faculty_name || ''),
        });
      }
      const item = map.get(key)!;
      item.total += 1;
      if (String(record.status || '') === 'present') item.present += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [attendanceHistory, academics]);

  const examTypeGroups = useMemo(() => {
    const groups = new Map<string, Dict[]>();
    for (const semester of semesterResults) {
      const semesterNo = Number(semester.semester || 0);
      const results = Array.isArray(semester.results) ? semester.results : [];
      for (const entry of results) {
        const type = String(entry.exam_type || 'final').toLowerCase();
        if (!groups.has(type)) groups.set(type, []);
        groups.get(type)?.push({ ...entry, semester: semesterNo });
      }
    }
    return Array.from(groups.entries()).map(([type, entries]) => ({
      type,
      label: type.toUpperCase(),
      entries: entries.sort((a, b) => Number(a.semester || 0) - Number(b.semester || 0)),
    }));
  }, [semesterResults]);

  const resultTypeRecords = useMemo(() => {
    const selected = examTypeGroups.find((group) => group.type === resultTypeModal);
    return selected?.entries || [];
  }, [examTypeGroups, resultTypeModal]);

  async function submitAssignment(assignmentId: string) {
    const file = assignmentFiles[assignmentId];
    if (!file) {
      notify('Select a PDF file first.', 'error');
      return;
    }

    await runAction('student.submit_assignment', {
      assignment_id: assignmentId,
      file: {
        name: file.name,
        mime: file.type || 'application/pdf',
        base64: await toBase64(file),
      },
    });

    setAssignmentFiles((prev) => ({ ...prev, [assignmentId]: null }));
  }

  async function payFee(feeId: string) {
    const payload = await runAction('student.pay_fee', { fee_id: feeId }, false);
    const link = String(payload.payment_link || '');
    if (!link) {
      notify('Payment link unavailable.', 'error');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    notify('Payment page opened in a new tab.', 'success');
  }

  async function submitFeeDeclaration(feeId: string) {
    const form = feeDeclarationForms[feeId] || { declared_status: 'full' as const, paid_amount: '', reference: '', notes: '' };
    await runAction('student.submit_fee_declaration', {
      fee_id: feeId,
      declared_status: form.declared_status,
      paid_amount: Number(form.paid_amount || 0),
      reference: form.reference,
      notes: form.notes,
    });
    setFeeDeclarationForms((prev) => ({
      ...prev,
      [feeId]: { declared_status: 'full', paid_amount: '', reference: '', notes: '' },
    }));
  }

  async function markAttendanceByFace() {
    if (!selectedSessionCourseId) {
      notify('Select an active subject first.', 'error');
      return;
    }
    let frame: File;
    try {
      frame = await captureStudentFrame(`student-${Date.now()}.jpg`);
    } catch (error) {
      notify((error as Error).message, 'error');
      return;
    }
    const form = new FormData();
    form.append('course_id', selectedSessionCourseId);
    form.append('image', frame);

    const response = await fetch('/api/attendance/student-mark', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(String(payload.error || 'Unable to mark attendance.'), 'error');
      return;
    }
    notify('Attendance marked successfully.', 'success');
    stopStudentCamera();
    setFaceAttendanceOpen(false);
    await refresh();
  }

  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    await runAction('account.update_profile', profileForm);
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    await runAction('account.change_password', passwordForm, false);
    setPasswordForm({ current_password: '', new_password: '' });
    notify('Password updated successfully.', 'success');
  }

  async function autofillProfilePincode(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    try {
      const info = await lookupPincode(pincode);
      setProfileForm((prev) => ({ ...prev, state: info.state || '', city: info.city || '' }));
      notify('State and city were auto-filled from pincode.', 'info');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  }

  function AttendanceTable({ records, empty }: { records: Dict[]; empty: string }) {
    if (!records.length) {
      return <p className="muted small">{empty}</p>;
    }
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Topic Covered</th>
              <th>Marked At</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record: Dict) => (
              <tr key={record.id}>
                <td>{record.attendance_date}</td>
                <td>
                  {record.course_code} - {record.course_title}
                </td>
                <td>
                  <span className={statusBadgeClass(String(record.status || 'present'))}>{String(record.status || 'present')}</span>
                </td>
                <td>{record.topic_covered || '-'}</td>
                <td>{formatDateTime(record.marked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'academics', label: 'Academics' },
    { key: 'exams', label: 'Exams' },
    { key: 'results', label: 'Results' },
    { key: 'fees', label: 'Fees' },
    { key: 'notices', label: 'Notices' },
    { key: 'account', label: 'Account' },
  ];

  return (
    <div className="portal-root">
      <ShellHeader roleLabel="Student Portal" userName={state.user?.full_name || 'Student'} tabs={tabs} active={active} onTab={setActive} onLogout={onLogout} />
      <main className="portal-content">
        {active === 'dashboard' && (
          <section className="stack">
            <article className="card">
              <div>
                <h2>Student Academic Command Center</h2>
                <p className="muted">Track timetable, attendance, assignments and results from one place.</p>
              </div>
            </article>

            <div className="stats-grid four">
              <StatCard label="Attendance %" value={`${attendanceSummary.attendance_percentage || 0}%`} />
              <StatCard label="Present Records" value={attendanceSummary.present_records || 0} />
              <StatCard label="Tracked Days" value={attendanceSummary.tracked_days || 0} />
              <StatCard label="Pending Fees" value={formatCurrency(Number(state.fees?.total_pending || 0))} />
            </div>

            <div className="stats-grid four">
              <StatCard label="Assignments Submitted" value={performanceSummary.assignments_submitted || 0} />
              <StatCard label="Assignments Pending" value={performanceSummary.assignments_pending || 0} />
              <StatCard label="Total Assignments" value={performanceSummary.assignments_total || 0} />
              <StatCard label="Attendance Records" value={attendanceSummary.total_records || 0} />
            </div>

            <article className="card">
              <h2>Active Attendance Sessions</h2>
              {activeSessions.length === 0 ? (
                <p className="muted">No active subject session available for attendance marking right now.</p>
              ) : (
                <ul className="clean-list">
                  {activeSessions.map((session: Dict) => (
                    <li key={session.id}>
                      {session.course_code} - {session.course_title} | Date: {session.attendance_date}
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="card">
              <h2>Department Timetable</h2>
              {studentTimetable.length === 0 ? (
                <p className="muted">Timetable not available.</p>
              ) : (
                <div className="grid-2">
                  {studentTimetable.map((day: Dict) => (
                    <button key={String(day.day)} type="button" className="soft-panel day-card-btn" onClick={() => setDayTimetableModal(day)}>
                      <strong>{day.day}</strong>
                      <p className="muted small top-gap">{Array.isArray(day.slots) ? day.slots.length : 0} periods</p>
                      <p className="muted small">Click to view full day schedule</p>
                    </button>
                  ))}
                </div>
              )}
            </article>

            <article className="card">
              <h2>Today&apos;s Classes ({todayDayName})</h2>
              {todayClasses.length === 0 ? (
                <p className="muted">No classes scheduled for today.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Subject</th>
                        <th>Faculty</th>
                        <th>Semester</th>
                        <th>Section</th>
                        <th>Room</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayClasses.map((entry: Dict, index: number) => (
                        <tr key={`today-class-${entry.course_id || index}`}>
                          <td>{entry.class_time || '-'}</td>
                          <td>
                            <span className={String(entry.class_type || '') === 'extra' ? 'badge badge-blue' : 'badge badge-green'}>
                              {String(entry.class_type || 'regular').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {entry.course_code} - {entry.course_title}
                          </td>
                          <td>{entry.faculty_name || '-'}</td>
                          <td>{entry.semester || '-'}</td>
                          <td>{entry.section || '-'}</td>
                          <td>{entry.room_number || '-'}</td>
                          <td>{entry.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="card">
              <h2>Recent Notices</h2>
              {notices.length === 0 ? (
                <p className="muted">No notices published yet.</p>
              ) : (
                <ul className="clean-list">
                  {notices.slice(0, 5).map((notice: Dict) => (
                    <li key={`dash-notice-${notice.id}`} className="soft-panel">
                      <strong>{notice.title}</strong>
                      <p className="muted small">{notice.body}</p>
                      <p className="muted small">{formatDateTime(notice.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="card">
              <h2>Result Performance Trend</h2>
              {resultTrend.length === 0 ? (
                <p className="muted">Result graph will appear once results are published.</p>
              ) : (
                <div className="result-graph">
                  {resultTrend.map((point: Dict) => (
                    <div key={`sem-${point.semester}`} className="result-bar-col">
                      <div className="result-bar-track">
                        <div className="result-bar-fill" style={{ height: `${Math.max(6, Math.min(100, Number(point.percentage || 0)))}%` }} />
                      </div>
                      <span>Sem {point.semester}</span>
                      <strong>{Number(point.percentage || 0).toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            {dayTimetableModal && (
              <div className="modal-backdrop" role="presentation" onClick={() => setDayTimetableModal(null)}>
                <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-head">
                    <h3>{String(dayTimetableModal.day || '')} Timetable</h3>
                    <button type="button" className="btn btn-ghost mini" onClick={() => setDayTimetableModal(null)}>
                      Close
                    </button>
                  </div>
                  <ul className="clean-list">
                    {(Array.isArray(dayTimetableModal.slots) ? dayTimetableModal.slots : []).map((slot: string) => {
                      const codeMatch = slot.match(/[A-Z]{2,}\d{3}/);
                      const code = codeMatch?.[0] || '';
                      const subject = academics.find((course: Dict) => String(course.course_code) === code);
                      return (
                        <li key={`day-slot-${slot}`} className="soft-panel">
                          <strong>{slot}</strong>
                          <p className="muted small">
                            {subject ? `${subject.course_title} | Faculty: ${subject.faculty_name || '-'}` : 'Subject info not mapped'}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'attendance' && (
          <section className="stack">
            <article className="card">
              <h2>Attendance Records</h2>
              <p className="muted">View subject-wise attendance percentage and open face capture popup when needed.</p>
              {activeSessions.length > 0 && (
                <div className="soft-panel top-gap">
                  <div className="inline-actions">
                    <h3>Today Active Sessions</h3>
                    <button type="button" className="btn btn-primary mini" onClick={() => setFaceAttendanceOpen(true)}>
                      Open Face Capture
                    </button>
                  </div>
                  <p className="muted small top-gap">
                    {activeSessions.map((session: Dict) => `${session.course_code}`).join(', ')}
                  </p>
                </div>
              )}
              {subjectAttendanceStats.length > 0 && (
                <div className="table-wrap top-gap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Faculty</th>
                        <th>Present</th>
                        <th>Total</th>
                        <th>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectAttendanceStats.map((item) => (
                        <tr key={`subject-attn-${item.course_code}`}>
                          <td>
                            {item.course_code} - {item.course_title}
                          </td>
                          <td>{item.faculty_name || '-'}</td>
                          <td>{item.present}</td>
                          <td>{item.total}</td>
                          <td>{((item.present / Math.max(item.total, 1)) * 100).toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="stack top-gap">
                <div className="soft-panel">
                  <h3>Today ({todayKey})</h3>
                  <AttendanceTable records={todayAttendance} empty="No attendance records found for today." />
                </div>
                <div className="soft-panel">
                  <h3>Yesterday ({yesterdayKey})</h3>
                  <AttendanceTable records={yesterdayAttendance} empty="No attendance records found for yesterday." />
                </div>
                <div className="soft-panel">
                  <div className="inline-actions">
                    <h3>Choose Previous Date</h3>
                    <input className="input" type="date" value={attendanceDateFilter} onChange={(event) => setAttendanceDateFilter(event.target.value)} max={todayKey} />
                  </div>
                  <AttendanceTable records={selectedDateAttendance} empty="Select a date to view attendance records." />
                </div>
              </div>
            </article>

            {faceAttendanceOpen && (
              <div className="modal-backdrop" role="presentation" onClick={() => setFaceAttendanceOpen(false)}>
                <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-head">
                    <h3>Face Attendance Capture</h3>
                    <button
                      type="button"
                      className="btn btn-ghost mini"
                      onClick={() => {
                        stopStudentCamera();
                        setFaceAttendanceOpen(false);
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <div className="form-grid two">
                    <select className="select" value={selectedSessionCourseId} onChange={(event) => setSelectedSessionCourseId(event.target.value)}>
                      <option value="">Select Active Subject</option>
                      {activeSessions.map((session: Dict) => (
                        <option key={`student-live-${session.id}`} value={session.course_id}>
                          {session.course_code} - {session.course_title}
                        </option>
                      ))}
                    </select>
                    <div className="inline-actions">
                      {!studentCameraStream ? (
                        <button type="button" className="btn btn-secondary mini" onClick={startStudentCamera}>
                          Start Camera
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost mini" onClick={stopStudentCamera}>
                          Stop Camera
                        </button>
                      )}
                      <button type="button" className="btn btn-primary mini" onClick={markAttendanceByFace} disabled={!studentCameraStream}>
                        Mark Attendance
                      </button>
                    </div>
                  </div>
                  {studentCameraError && <p className="error-text top-gap">{studentCameraError}</p>}
                  <div className="grid-2 top-gap align-start">
                    <div className="video-wrap video-wide">
                      <video ref={studentVideoRef} className="video" autoPlay muted playsInline />
                    </div>
                    <div className="soft-panel">
                      <h3>Session Details</h3>
                      <p className="muted small">
                        Selected Subject:{' '}
                        {activeSessions.find((session: Dict) => String(session.course_id) === String(selectedSessionCourseId))?.course_code || '-'}
                      </p>
                      <p className="muted small">Detected user will be matched with your registered student face profile only.</p>
                      <p className="muted small">Keep your face centered and use good lighting before clicking Mark Attendance.</p>
                      <div className="top-gap">
                        <h3>Today Active Subjects</h3>
                        <ul className="clean-list">
                          {activeSessions.map((session: Dict) => (
                            <li key={`student-session-list-${session.id}`} className="detected-item known">
                              <strong>{session.course_code}</strong> - {session.course_title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'academics' && (
          <section className="stack">
            <article className="card">
              <h2>Subject Wise Academics</h2>
              <div className="grid-2 align-start">
                <div className="soft-panel">
                  <h3>Subjects (Semester Wise)</h3>
                  {academicsBySemester.length === 0 ? (
                    <p className="muted small">No subjects available.</p>
                  ) : (
                    <div className="stack">
                      {academicsBySemester.map((group) => (
                        <div key={`semester-subjects-${group.semester}`}>
                          <p className="muted small">Semester {group.semester}</p>
                          <ul className="clean-list selectable-list top-gap">
                            {group.items.map((course: Dict) => (
                              <li key={course.course_id}>
                                <button
                                  type="button"
                                  className={`subject-pill ${String(selectedCourseId) === String(course.course_id) ? 'active' : ''}`}
                                  onClick={() => setSelectedCourseId(String(course.course_id))}
                                >
                                  {course.course_code} - {course.course_title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="soft-panel">
                  <h3>
                    {selectedAcademic?.course_code} - {selectedAcademic?.course_title}
                  </h3>
                  <p className="muted">Assigned by {selectedAcademic?.faculty_name || '-'}</p>
                  <div className="top-gap">
                    <h3>E-Content</h3>
                    {Array.isArray(selectedAcademic?.econtents) && selectedAcademic.econtents.length > 0 ? (
                      <div className="stack">
                        {selectedAcademic.econtents.map((entry: Dict) => (
                          <div key={entry.id} className="assignment-card">
                            <div>
                              <strong>{entry.title}</strong>
                              <p className="muted">
                                {String(entry.content_type || '').toUpperCase()} | Published {formatDateTime(entry.created_at)}
                              </p>
                            </div>
                            {entry.description ? <p className="muted small">{entry.description}</p> : null}
                            <div className="inline-actions">
                              {entry.external_link ? (
                                <a href={entry.external_link} target="_blank" rel="noreferrer" className="btn btn-ghost mini">
                                  Open Link
                                </a>
                              ) : null}
                              {entry.attachment_file_id ? (
                                <a href={`/api/files/${entry.attachment_file_id}`} className="btn btn-ghost mini" target="_blank" rel="noreferrer">
                                  Download PDF
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted small">No e-content published for this subject yet.</p>
                    )}
                  </div>
                  <div className="top-gap">
                    <h3>Assignments</h3>
                    <div className="stack">
                      {(Array.isArray(selectedAcademic?.assignments) ? selectedAcademic?.assignments : []).map((assignment: Dict) => (
                        <div key={assignment.id} className="assignment-card">
                          <div>
                            <strong>{assignment.title}</strong>
                            <p className="muted">Due {formatDate(assignment.due_date)}</p>
                          </div>
                          <div className="inline-actions">
                            {assignment.attachment_file_id ? (
                              <a href={`/api/files/${assignment.attachment_file_id}`} className="btn btn-ghost mini" target="_blank" rel="noreferrer">
                                Download PDF
                              </a>
                            ) : (
                              <span className="muted small">No attachment</span>
                            )}
                            <span className={assignment.submitted ? 'badge badge-green' : 'badge badge-amber'}>{assignment.submitted ? 'Submitted' : 'Pending'}</span>
                          </div>
                          <div className="inline-actions">
                            <input
                              className="input"
                              type="file"
                              accept="application/pdf"
                              onChange={(event) =>
                                setAssignmentFiles((prev) => ({
                                  ...prev,
                                  [assignment.id]: event.target.files?.[0] || null,
                                }))
                              }
                            />
                            <button type="button" className="btn btn-primary mini" onClick={() => submitAssignment(String(assignment.id))}>
                              Upload Submission
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!Array.isArray(selectedAcademic?.assignments) || selectedAcademic.assignments.length === 0) && (
                        <p className="muted small">No assignments posted for this subject.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </section>
        )}

        {active === 'exams' && (
          <section className="stack">
            <article className="card">
              <h2>Upcoming Exams</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(examData.upcoming_exams) ? examData.upcoming_exams : []).map((exam: Dict) => (
                      <tr key={exam.id}>
                        <td>{String(exam.exam_type || '').toUpperCase()}</td>
                        <td>
                          {exam.subject_code} - {exam.subject_title}
                        </td>
                        <td>{exam.exam_date}</td>
                        <td>{exam.exam_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>Hall Ticket</h2>
              <div className="hall-ticket">
                <p>
                  <strong>Name:</strong> {examData.student_name || '-'}
                </p>
                <p>
                  <strong>Enrollment:</strong> {examData.enrollment_number || '-'}
                </p>
                <p>
                  <strong>Department:</strong> {examData.department || '-'}
                </p>
                <p>
                  <strong>Semester:</strong> {examData.semester || '-'}
                </p>
                <p>
                  <strong>Hall:</strong> {examData.hall_ticket?.hall_no || '-'}
                </p>
                <p>
                  <strong>Seat:</strong> {examData.hall_ticket?.seat_no || '-'}
                </p>
                <p>
                  <strong>Issued:</strong> {formatDateTime(examData.hall_ticket?.issued_at)}
                </p>
              </div>
              <div className="top-gap">
                <Link href="/results" className="btn btn-primary inline-link">
                  Open Result Page
                </Link>
              </div>
            </article>
          </section>
        )}

        {active === 'results' && (
          <section className="stack">
            <article className="card">
              <h2>Exam Type Wise Results</h2>
              <p className="muted">Open each exam type to view detailed semester-wise marks in popup.</p>
              {examTypeGroups.length === 0 ? (
                <p className="muted top-gap">No results published yet.</p>
              ) : (
                <div className="manual-student-grid top-gap">
                  {examTypeGroups.map((group) => (
                    <button key={`result-group-${group.type}`} type="button" className="manual-student-card" onClick={() => setResultTypeModal(group.type)}>
                      <strong>{group.label}</strong>
                      <span>{group.entries.length} records</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="top-gap">
                <Link href="/results" className="btn btn-secondary inline-link">
                  Open Full Result View
                </Link>
              </div>
            </article>

            {resultTypeModal && (
              <div className="modal-backdrop" role="presentation" onClick={() => setResultTypeModal('')}>
                <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-head">
                    <h3>{resultTypeModal.toUpperCase()} Results</h3>
                    <button type="button" className="btn btn-ghost mini" onClick={() => setResultTypeModal('')}>
                      Close
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Semester</th>
                          <th>Subject</th>
                          <th>Marks</th>
                          <th>Max</th>
                          <th>Grade</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultTypeRecords.map((entry: Dict) => {
                          const marks = Number(entry.marks || 0);
                          const maxMarks = Math.max(Number(entry.max_marks || 100), 1);
                          const passed = marks >= 40;
                          return (
                            <tr key={`result-record-${resultTypeModal}-${entry.id}`}>
                              <td>{entry.semester || '-'}</td>
                              <td>
                                {entry.course_code} - {entry.course_title}
                              </td>
                              <td>{marks}</td>
                              <td>{maxMarks}</td>
                              <td>{gradeFromMarksValue(marks, maxMarks)}</td>
                              <td>
                                <span className={passed ? 'badge badge-green' : 'badge badge-red'}>{passed ? 'Pass' : 'Fail'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'fees' && (
          <section className="stack">
            <article className="card">
              <h2>Fees & Payments</h2>
              <p className="muted">Use Razorpay link to pay, then submit full or partial declaration for superadmin review.</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Amount</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Payment Declaration</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee: Dict) => (
                      <tr key={fee.id}>
                        <td>{fee.title}</td>
                        <td>{formatCurrency(Number(fee.amount || 0))}</td>
                        <td>{fee.due_date}</td>
                        <td>
                          <span className={statusBadgeClass(String(fee.status || 'pending'))}>{String(fee.status || 'pending')}</span>
                        </td>
                        <td>
                          {fee.student_claim ? (
                            <div>
                              <span className={statusBadgeClass(String(fee.student_claim.review_status || 'pending'))}>
                                {String(fee.student_claim.declared_status || '').toUpperCase()} | {String(fee.student_claim.review_status || 'pending')}
                              </span>
                              <p className="muted small top-gap">
                                Submitted: {formatDateTime(fee.student_claim.submitted_at)} | Amount:{' '}
                                {formatCurrency(Number(fee.student_claim.paid_amount || 0))}
                              </p>
                            </div>
                          ) : (
                            <span className="muted small">No declaration yet</span>
                          )}
                        </td>
                        <td>
                          <div className="stack">
                            {String(fee.status || '').toLowerCase() !== 'paid' && (
                              <button type="button" className="btn btn-primary mini" onClick={() => payFee(String(fee.id))}>
                                Open Razorpay
                              </button>
                            )}
                            <div className="inline-actions">
                              <select
                                className="select"
                                value={feeDeclarationForms[String(fee.id)]?.declared_status || 'full'}
                                onChange={(event) =>
                                  setFeeDeclarationForms((prev) => ({
                                    ...prev,
                                    [String(fee.id)]: {
                                      declared_status: event.target.value as 'full' | 'partial',
                                      paid_amount: prev[String(fee.id)]?.paid_amount || '',
                                      reference: prev[String(fee.id)]?.reference || '',
                                      notes: prev[String(fee.id)]?.notes || '',
                                    },
                                  }))
                                }
                              >
                                <option value="full">Full Payment</option>
                                <option value="partial">Partial Payment</option>
                              </select>
                              <input
                                className="input"
                                type="number"
                                min={1}
                                placeholder="Paid amount"
                                value={feeDeclarationForms[String(fee.id)]?.paid_amount || ''}
                                onChange={(event) =>
                                  setFeeDeclarationForms((prev) => ({
                                    ...prev,
                                    [String(fee.id)]: {
                                      declared_status: prev[String(fee.id)]?.declared_status || 'full',
                                      paid_amount: event.target.value,
                                      reference: prev[String(fee.id)]?.reference || '',
                                      notes: prev[String(fee.id)]?.notes || '',
                                    },
                                  }))
                                }
                              />
                            </div>
                            <input
                              className="input"
                              placeholder="Reference / UTR (optional)"
                              value={feeDeclarationForms[String(fee.id)]?.reference || ''}
                              onChange={(event) =>
                                setFeeDeclarationForms((prev) => ({
                                  ...prev,
                                  [String(fee.id)]: {
                                    declared_status: prev[String(fee.id)]?.declared_status || 'full',
                                    paid_amount: prev[String(fee.id)]?.paid_amount || '',
                                    reference: event.target.value,
                                    notes: prev[String(fee.id)]?.notes || '',
                                  },
                                }))
                              }
                            />
                            <button type="button" className="btn btn-secondary mini" onClick={() => submitFeeDeclaration(String(fee.id))}>
                              Submit Declaration
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {active === 'notices' && (
          <section className="stack">
            <article className="card">
              <h2>Campus Notices</h2>
              {notices.length === 0 ? (
                <p className="muted">No notices available right now.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Audience</th>
                        <th>Department</th>
                        <th>Message</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notices.map((notice: Dict) => (
                        <tr key={notice.id}>
                          <td>{notice.title}</td>
                          <td>{noticeAudienceLabel(notice.target_roles)}</td>
                          <td>{notice.department || 'All'}</td>
                          <td>{notice.body}</td>
                          <td>{formatDateTime(notice.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {active === 'account' && (
          <section className="stack">
            <article className="card">
              <h2>Profile</h2>
              <form className="form-grid three" onSubmit={updateProfile}>
                <input className="input" placeholder="Full name" value={profileForm.full_name} onChange={(event) => setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
                <input className="input" placeholder="Student contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={profileForm.student_phone} onChange={(event) => setProfileForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <input className="input" placeholder="Parent name" value={profileForm.parent_name} onChange={(event) => setProfileForm((prev) => ({ ...prev, parent_name: event.target.value }))} required />
                <input className="input" placeholder="Parent contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={profileForm.parent_phone} onChange={(event) => setProfileForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
                <input className="input" placeholder="Address line" value={profileForm.address_line} onChange={(event) => setProfileForm((prev) => ({ ...prev, address_line: event.target.value }))} required />
                <input
                  className="input"
                  placeholder="Pincode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={profileForm.pincode}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  onBlur={(event) => autofillProfilePincode(event.target.value)}
                  required
                />
                <input className="input" placeholder="State" value={profileForm.state} onChange={(event) => setProfileForm((prev) => ({ ...prev, state: event.target.value }))} required />
                <input className="input" placeholder="City" value={profileForm.city} onChange={(event) => setProfileForm((prev) => ({ ...prev, city: event.target.value }))} required />
                <button type="submit" className="btn btn-primary full-row">
                  Update Profile
                </button>
              </form>
            </article>

            <article className="card">
              <h2>Change Password</h2>
              <form className="form-grid two" onSubmit={updatePassword}>
                <PasswordInput value={passwordForm.current_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, current_password: value }))} placeholder="Current password" autoComplete="current-password" />
                <PasswordInput value={passwordForm.new_password} onChange={(value) => setPasswordForm((prev) => ({ ...prev, new_password: value }))} placeholder="New password" />
                <button type="submit" className="btn btn-primary full-row">
                  Update Password
                </button>
              </form>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

function AuthScreen({
  departments,
  onLogin,
  onRegister,
  loading,
}: {
  departments: Department[];
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (payload: Dict) => Promise<void>;
  loading: boolean;
}) {
  const [active, setActive] = useState<'login' | 'register'>('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState(EMPTY_STUDENT_SELF_FORM);

  const departmentOptions = departments.map((item) => item.name);

  async function fillPincode(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    try {
      const info = await lookupPincode(pincode);
      setRegisterForm((prev) => ({ ...prev, state: info.state || '', city: info.city || '' }));
    } catch {
      // keep manual entry if lookup fails
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await onLogin(loginForm.email, loginForm.password);
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    await onRegister({
      ...registerForm,
      role: 'student',
      year: Number(registerForm.year),
    });
    setRegisterForm(EMPTY_STUDENT_SELF_FORM);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-head">
          <h1>EduMate</h1>
          <p className="brand-subtitle">Simple, modern ERP access for students, faculty and admins.</p>
          <p className="muted small">Login to continue or submit a new student registration request for approval.</p>
        </div>

        <div className="switch-row">
          <button type="button" className={`switch-btn ${active === 'login' ? 'active' : ''}`} onClick={() => setActive('login')}>
            Login
          </button>
          <button type="button" className={`switch-btn ${active === 'register' ? 'active' : ''}`} onClick={() => setActive('register')}>
            New Student Registration
          </button>
        </div>

        {active === 'login' && (
          <form className="form-grid one" onSubmit={submitLogin}>
            <input className="input" type="email" placeholder="Email" value={loginForm.email} onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))} required />
            <PasswordInput value={loginForm.password} onChange={(value) => setLoginForm((prev) => ({ ...prev, password: value }))} placeholder="Password" autoComplete="current-password" />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        )}

        {active === 'register' && (
          <form className="form-grid two" onSubmit={submitRegister}>
            <input className="input" placeholder="Full name" value={registerForm.full_name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, full_name: event.target.value }))} required />
            <input className="input" type="email" placeholder="Email" value={registerForm.email} onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))} required />
            <PasswordInput value={registerForm.password} onChange={(value) => setRegisterForm((prev) => ({ ...prev, password: value }))} placeholder="Password" />
            <input className="input" placeholder="Roll number" inputMode="numeric" pattern="[0-9]*" value={registerForm.enrollment_number} onChange={(event) => setRegisterForm((prev) => ({ ...prev, enrollment_number: event.target.value.replace(/\D/g, '') }))} required />
            <select className="select" value={registerForm.department} onChange={(event) => setRegisterForm((prev) => ({ ...prev, department: event.target.value }))} required>
              <option value="">Select Department</option>
              {departmentOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select className="select" value={registerForm.year} onChange={(event) => setRegisterForm((prev) => ({ ...prev, year: event.target.value }))} required>
              <option value="">Select Year</option>
              {[1, 2, 3, 4, 5, 6].map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
            <select className="select" value={registerForm.gender} onChange={(event) => setRegisterForm((prev) => ({ ...prev, gender: event.target.value }))} required>
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <input className="input" placeholder="Student contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={registerForm.student_phone} onChange={(event) => setRegisterForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
            <input className="input" placeholder="Parent name" value={registerForm.parent_name} onChange={(event) => setRegisterForm((prev) => ({ ...prev, parent_name: event.target.value }))} required />
            <input className="input" placeholder="Parent contact" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={registerForm.parent_phone} onChange={(event) => setRegisterForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} required />
            <input className="input full-row" placeholder="Address line" value={registerForm.address_line} onChange={(event) => setRegisterForm((prev) => ({ ...prev, address_line: event.target.value }))} required />
            <input
              className="input"
              placeholder="Pincode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={registerForm.pincode}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
              onBlur={(event) => fillPincode(event.target.value)}
              required
            />
            <input className="input" placeholder="State" value={registerForm.state} onChange={(event) => setRegisterForm((prev) => ({ ...prev, state: event.target.value }))} required />
            <input className="input" placeholder="City" value={registerForm.city} onChange={(event) => setRegisterForm((prev) => ({ ...prev, city: event.target.value }))} required />
            <button type="submit" className="btn btn-primary full-row" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function HomePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [state, setState] = useState<Dict | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const role = state?.role;

  const notify = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (toast) setToast(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function loadAppState() {
    const payload = await apiJson<Dict>('/api/app/state');
    setState(payload);
  }

  async function loadDepartments() {
    const payload = await apiJson<Department[]>('/api/catalog/departments').catch(() => []);
    setDepartments(Array.isArray(payload) ? payload : []);
  }

  async function refreshPortal() {
    await Promise.all([loadAppState(), loadDepartments()]);
  }

  async function boot() {
    try {
      setLoading(true);
      const me = await apiJson<Dict>('/api/auth/me').catch(() => ({ user: null }));
      await loadDepartments();
      if (me.user) {
        await loadAppState();
      } else {
        setState(null);
      }
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    warmAttendanceService();
    boot();
  }, []);

  async function login(email: string, password: string) {
    try {
      setAuthPending(true);
      await apiJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      await refreshPortal();
      notify('Login successful.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setAuthPending(false);
    }
  }

  async function registerStudent(payload: Dict) {
    try {
      setAuthPending(true);
      await apiJson('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      notify('Registration submitted successfully. Wait for superadmin approval.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setAuthPending(false);
    }
  }

  async function logout() {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setState(null);
    notify('Logged out.', 'info');
  }

  async function runAction(action: string, payload: Dict = {}, refreshAfter = true) {
    try {
      const response = await apiJson<Dict>('/api/app/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      if (response.message) {
        notify(String(response.message), 'success');
      }
      if (refreshAfter) {
        await Promise.all([loadAppState(), loadDepartments()]);
      }
      return response;
    } catch (error) {
      notify((error as Error).message, 'error');
      throw error;
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader" />
        <p>Loading portal...</p>
      </div>
    );
  }

  return (
    <div className="app-bg">
      {!state && <AuthScreen departments={departments} onLogin={login} onRegister={registerStudent} loading={authPending} />}

      {state && role && (
        <>
          {(role === 'admin' || role === 'superadmin') && (
            <AdminSuperPortal state={state} departments={departments} runAction={runAction} refresh={refreshPortal} notify={notify} onLogout={logout} />
          )}
          {role === 'teacher' && <TeacherPortal state={state} runAction={runAction} notify={notify} onLogout={logout} />}
          {role === 'student' && <StudentPortal state={state} runAction={runAction} refresh={loadAppState} notify={notify} onLogout={logout} />}
        </>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
