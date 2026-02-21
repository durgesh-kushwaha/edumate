import { useEffect, useMemo, useState } from 'react';
import {
  createCourse,
  createEnrollment,
  createFaculty,
  createFee,
  createStudent,
  createSuperAdmin,
  decideRegistrationRequest,
  disburseSalary,
  extractApiMessage,
  fetchAdminStats,
  fetchCourses,
  fetchDepartments,
  fetchFaculty,
  fetchFeesForAdmin,
  fetchRegistrationRequests,
  fetchSalaryConfigs,
  fetchSalaryRecords,
  fetchStudents,
  fetchSuperAdmins,
  upsertSalaryConfig,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import type { AdminStats, Course, FacultyListing, FeeItem, RegistrationRequestItem, SalaryConfig, SalaryRecord, StudentListing } from '../types';

const INITIAL_STATS: AdminStats = {
  users: 0,
  students: 0,
  faculty: 0,
  courses: 0,
  pending_fees: 0,
  attendance_records: 0,
};

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        className="form-field"
        type={show ? 'text' : 'password'}
        placeholder="Password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="soft-btn whitespace-nowrap" onClick={onToggle}>
        {show ? 'Hide' : 'View'}
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const { role } = useAuth();
  const isSuperAdmin = role === 'superadmin';

  const [stats, setStats] = useState<AdminStats>(INITIAL_STATS);
  const [students, setStudents] = useState<StudentListing[]>([]);
  const [faculty, setFaculty] = useState<FacultyListing[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [superAdmins, setSuperAdmins] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [departments, setDepartments] = useState<{ code: string; name: string }[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequestItem[]>([]);
  const [salaryConfigs, setSalaryConfigs] = useState<SalaryConfig[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showFacultyPassword, setShowFacultyPassword] = useState(false);
  const [showSuperAdminPassword, setShowSuperAdminPassword] = useState(false);

  const [studentForm, setStudentForm] = useState({
    full_name: '',
    email: '',
    password: '',
    enrollment_number: '',
    department: '',
    year: 1,
    gender: '',
    student_phone: '',
    parent_name: '',
    parent_phone: '',
    address_line: '',
    pincode: '',
    state: '',
    city: '',
  });

  const [facultyForm, setFacultyForm] = useState({
    full_name: '',
    email: '',
    password: '',
    employee_code: '',
    designation: '',
    department: '',
    faculty_phone: '',
  });

  const [superAdminForm, setSuperAdminForm] = useState({
    full_name: '',
    email: '',
    password: '',
  });

  const [courseForm, setCourseForm] = useState({
    code: '',
    title: '',
    faculty_id: '',
    semester: 1,
    credits: 4,
  });

  const [enrollmentForm, setEnrollmentForm] = useState({
    student_id: '',
    course_id: '',
  });

  const [feeForm, setFeeForm] = useState({
    student_id: '',
    title: '',
    amount: 0,
    due_date: '',
    notes: '',
  });

  const [salaryForm, setSalaryForm] = useState({
    designation: 'Assistant Professor',
    monthly_salary: 55000,
  });
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0, 7));

  const studentOptions = useMemo(
    () =>
      students.map((entry) => ({
        id: entry.student.id,
        label: `${entry.user.full_name} (${entry.student.enrollment_number})`,
      })),
    [students],
  );

  const facultyOptions = useMemo(
    () =>
      faculty.map((entry) => ({
        id: entry.faculty.id,
        label: `${entry.user.full_name} (${entry.faculty.employee_code})`,
      })),
    [faculty],
  );

  async function loadData() {
    setError('');
    try {
      const [statsData, studentsData, facultyData, coursesData, feesData, departmentData] = await Promise.all([
        fetchAdminStats(),
        fetchStudents(),
        fetchFaculty(),
        fetchCourses(),
        fetchFeesForAdmin(),
        fetchDepartments(),
      ]);

      setStats(statsData);
      setStudents(studentsData);
      setFaculty(facultyData);
      setCourses(coursesData);
      setFees(feesData);
      setDepartments(departmentData.map((item) => ({ code: item.code, name: item.name })));

      setCourseForm((prev) => ({ ...prev, faculty_id: prev.faculty_id || facultyData[0]?.faculty.id || '' }));
      setEnrollmentForm((prev) => ({
        student_id: prev.student_id || studentsData[0]?.student.id || '',
        course_id: prev.course_id || coursesData[0]?.id || '',
      }));
      setFeeForm((prev) => ({ ...prev, student_id: prev.student_id || studentsData[0]?.student.id || '' }));

      if (isSuperAdmin) {
        const [superAdminData, pendingRegistrations, configs, records] = await Promise.all([
          fetchSuperAdmins(),
          fetchRegistrationRequests('pending'),
          fetchSalaryConfigs(),
          fetchSalaryRecords(),
        ]);
        setSuperAdmins(superAdminData.map((item) => ({ id: item.id, full_name: item.full_name, email: item.email })));
        setRegistrationRequests(pendingRegistrations);
        setSalaryConfigs(configs);
        setSalaryRecords(records);
      }

    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [isSuperAdmin]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setError('');
    setFeedback('');
    try {
      await action();
      await loadData();
      setFeedback(successMessage);
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    }
  }

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Students" value={stats.students} />
        <StatCard label="Faculty" value={stats.faculty} />
        <StatCard label="Courses" value={stats.courses} />
        <StatCard label="Pending Fees" value={`₹${stats.pending_fees.toLocaleString()}`} />
        <StatCard label="Attendance Entries" value={stats.attendance_records} />
      </div>

      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Create Student">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction(() => createStudent(studentForm), 'Student account created.');
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="form-field" placeholder="Full Name" value={studentForm.full_name} onChange={(event) => setStudentForm((prev) => ({ ...prev, full_name: event.target.value }))} />
              <input className="form-field" type="email" placeholder="Email" value={studentForm.email} onChange={(event) => setStudentForm((prev) => ({ ...prev, email: event.target.value }))} />
              <input className="form-field" inputMode="numeric" placeholder="Roll Number" value={studentForm.enrollment_number} onChange={(event) => setStudentForm((prev) => ({ ...prev, enrollment_number: event.target.value.replace(/\D/g, '') }))} />
              <select className="form-field" value={studentForm.department} onChange={(event) => setStudentForm((prev) => ({ ...prev, department: event.target.value }))}>
                <option value="">Select Department</option>
                {departments.map((department) => (
                  <option key={department.code} value={department.name}>{department.name}</option>
                ))}
              </select>
              <select className="form-field" value={studentForm.year} onChange={(event) => setStudentForm((prev) => ({ ...prev, year: Number(event.target.value) }))}>
                {[1, 2, 3, 4, 5, 6].map((year) => (
                  <option key={year} value={year}>Year {year}</option>
                ))}
              </select>
              <select className="form-field" value={studentForm.gender} onChange={(event) => setStudentForm((prev) => ({ ...prev, gender: event.target.value }))}>
                <option value="">Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Student Contact" value={studentForm.student_phone} onChange={(event) => setStudentForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              <input className="form-field" placeholder="Parent Name" value={studentForm.parent_name} onChange={(event) => setStudentForm((prev) => ({ ...prev, parent_name: event.target.value }))} />
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Parent Contact" value={studentForm.parent_phone} onChange={(event) => setStudentForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              <input className="form-field" inputMode="numeric" maxLength={6} placeholder="Pincode" value={studentForm.pincode} onChange={(event) => setStudentForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} />
              <input className="form-field" placeholder="State" value={studentForm.state} onChange={(event) => setStudentForm((prev) => ({ ...prev, state: event.target.value }))} />
              <input className="form-field" placeholder="City" value={studentForm.city} onChange={(event) => setStudentForm((prev) => ({ ...prev, city: event.target.value }))} />
            </div>
            <textarea className="form-field min-h-20" placeholder="Address" value={studentForm.address_line} onChange={(event) => setStudentForm((prev) => ({ ...prev, address_line: event.target.value }))} />
            <PasswordInput
              value={studentForm.password}
              onChange={(value) => setStudentForm((prev) => ({ ...prev, password: value }))}
              show={showStudentPassword}
              onToggle={() => setShowStudentPassword((prev) => !prev)}
            />
            <button className="primary-btn">Create Student</button>
          </form>
        </SectionCard>

        <SectionCard title="Create Faculty">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction(() => createFaculty(facultyForm), 'Faculty account created.');
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="form-field" placeholder="Full Name" value={facultyForm.full_name} onChange={(event) => setFacultyForm((prev) => ({ ...prev, full_name: event.target.value }))} />
              <input className="form-field" type="email" placeholder="Email" value={facultyForm.email} onChange={(event) => setFacultyForm((prev) => ({ ...prev, email: event.target.value }))} />
              <input className="form-field" placeholder="Employee Code" value={facultyForm.employee_code} onChange={(event) => setFacultyForm((prev) => ({ ...prev, employee_code: event.target.value }))} />
              <input className="form-field" placeholder="Designation" value={facultyForm.designation} onChange={(event) => setFacultyForm((prev) => ({ ...prev, designation: event.target.value }))} />
              <select className="form-field" value={facultyForm.department} onChange={(event) => setFacultyForm((prev) => ({ ...prev, department: event.target.value }))}>
                <option value="">Select Department</option>
                {departments.map((department) => (
                  <option key={department.code} value={department.name}>{department.name}</option>
                ))}
              </select>
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Faculty Contact" value={facultyForm.faculty_phone} onChange={(event) => setFacultyForm((prev) => ({ ...prev, faculty_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            </div>
            <PasswordInput
              value={facultyForm.password}
              onChange={(value) => setFacultyForm((prev) => ({ ...prev, password: value }))}
              show={showFacultyPassword}
              onToggle={() => setShowFacultyPassword((prev) => !prev)}
            />
            <button className="primary-btn">Create Faculty</button>
          </form>
        </SectionCard>
      </div>

      {isSuperAdmin ? (
        <SectionCard title="Create Superadmin" subtitle="Superadmin can create another superadmin.">
          <div className="grid gap-5 xl:grid-cols-[1fr,1.2fr]">
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction(() => createSuperAdmin(superAdminForm), 'Superadmin account created.');
              }}
            >
              <input className="form-field" placeholder="Full Name" value={superAdminForm.full_name} onChange={(event) => setSuperAdminForm((prev) => ({ ...prev, full_name: event.target.value }))} />
              <input className="form-field" type="email" placeholder="Email" value={superAdminForm.email} onChange={(event) => setSuperAdminForm((prev) => ({ ...prev, email: event.target.value }))} />
              <PasswordInput
                value={superAdminForm.password}
                onChange={(value) => setSuperAdminForm((prev) => ({ ...prev, password: value }))}
                show={showSuperAdminPassword}
                onToggle={() => setShowSuperAdminPassword((prev) => !prev)}
              />
              <button className="primary-btn">Create Superadmin</button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {superAdmins.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-2 py-2">{item.full_name}</td>
                      <td className="px-2 py-2">{item.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {isSuperAdmin ? (
        <SectionCard title="Pending Student Registrations">
          <div className="space-y-3">
            {registrationRequests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{request.full_name} ({request.enrollment_number})</p>
                    <p className="text-xs text-slate-600">{request.email} | {request.department} | Year {request.year}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="primary-btn"
                      onClick={() => {
                        void runAction(() => decideRegistrationRequest(request.id, { action: 'approve' }), 'Registration approved.');
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="soft-btn"
                      onClick={() => {
                        void runAction(() => decideRegistrationRequest(request.id, { action: 'reject', remarks: 'Rejected by superadmin' }), 'Registration rejected.');
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {registrationRequests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : null}
          </div>
        </SectionCard>
      ) : null}

      {isSuperAdmin ? (
        <SectionCard title="Faculty Salary Management" subtitle="Salary is configured by designation and disbursed monthly.">
          <div className="grid gap-5 xl:grid-cols-[1fr,1.4fr]">
            <div className="grid gap-3">
              <input className="form-field" placeholder="Designation" value={salaryForm.designation} onChange={(event) => setSalaryForm((prev) => ({ ...prev, designation: event.target.value }))} />
              <input className="form-field" type="number" min={1} placeholder="Monthly Salary" value={salaryForm.monthly_salary} onChange={(event) => setSalaryForm((prev) => ({ ...prev, monthly_salary: Number(event.target.value) }))} />
              <button className="primary-btn" onClick={() => void runAction(() => upsertSalaryConfig(salaryForm), 'Salary config saved.')}>Save Salary Config</button>

              <div className="grid grid-cols-[1fr,auto] gap-2">
                <input className="form-field" type="month" value={salaryMonth} onChange={(event) => setSalaryMonth(event.target.value)} />
                <button className="primary-btn" onClick={() => void runAction(() => disburseSalary({ month: salaryMonth }), 'Salary disbursed.')}>Disburse</button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-2 py-2">Designation</th>
                      <th className="px-2 py-2">Monthly Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryConfigs.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{item.designation}</td>
                        <td className="px-2 py-2">₹{item.monthly_salary.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-2 py-2">Faculty</th>
                      <th className="px-2 py-2">Month</th>
                      <th className="px-2 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryRecords.slice(0, 8).map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{item.faculty_name}</td>
                        <td className="px-2 py-2">{item.month}</td>
                        <td className="px-2 py-2">₹{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Create Course">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!courseForm.faculty_id) {
                setError('Select faculty before creating a course.');
                return;
              }
              void runAction(() => createCourse(courseForm), 'Course created.');
            }}
          >
            <input className="form-field" placeholder="Course Code" value={courseForm.code} onChange={(event) => setCourseForm((prev) => ({ ...prev, code: event.target.value }))} />
            <input className="form-field" placeholder="Course Title" value={courseForm.title} onChange={(event) => setCourseForm((prev) => ({ ...prev, title: event.target.value }))} />
            <select className="form-field" value={courseForm.faculty_id} onChange={(event) => setCourseForm((prev) => ({ ...prev, faculty_id: event.target.value }))}>
              <option value="">Select Faculty</option>
              {facultyOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input className="form-field" type="number" min={1} max={8} value={courseForm.semester} onChange={(event) => setCourseForm((prev) => ({ ...prev, semester: Number(event.target.value) }))} />
              <input className="form-field" type="number" min={1} max={6} value={courseForm.credits} onChange={(event) => setCourseForm((prev) => ({ ...prev, credits: Number(event.target.value) }))} />
            </div>
            <button className="primary-btn">Create Course</button>
          </form>
        </SectionCard>

        <SectionCard title="Enroll Student">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!enrollmentForm.student_id || !enrollmentForm.course_id) {
                setError('Choose student and course for enrollment.');
                return;
              }
              void runAction(() => createEnrollment(enrollmentForm), 'Enrollment completed.');
            }}
          >
            <select className="form-field" value={enrollmentForm.student_id} onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, student_id: event.target.value }))}>
              <option value="">Select Student</option>
              {studentOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <select className="form-field" value={enrollmentForm.course_id} onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, course_id: event.target.value }))}>
              <option value="">Select Course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code} - {course.title}</option>
              ))}
            </select>
            <button className="primary-btn">Enroll</button>
          </form>
        </SectionCard>

        <SectionCard title="Assign Fee">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!feeForm.student_id) {
                setError('Select student before assigning fee.');
                return;
              }
              void runAction(() => createFee(feeForm), 'Fee assigned.');
            }}
          >
            <select className="form-field" value={feeForm.student_id} onChange={(event) => setFeeForm((prev) => ({ ...prev, student_id: event.target.value }))}>
              <option value="">Select Student</option>
              {studentOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <input className="form-field" placeholder="Fee Title" value={feeForm.title} onChange={(event) => setFeeForm((prev) => ({ ...prev, title: event.target.value }))} />
            <input className="form-field" type="number" min={1} value={feeForm.amount || ''} onChange={(event) => setFeeForm((prev) => ({ ...prev, amount: Number(event.target.value) }))} />
            <input className="form-field" type="date" value={feeForm.due_date} onChange={(event) => setFeeForm((prev) => ({ ...prev, due_date: event.target.value }))} />
            <textarea className="form-field min-h-20" placeholder="Notes" value={feeForm.notes} onChange={(event) => setFeeForm((prev) => ({ ...prev, notes: event.target.value }))} />
            <button className="primary-btn">Assign Fee</button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Recent Students">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Roll Number</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Year</th>
              </tr>
            </thead>
            <tbody>
              {students.slice(0, 8).map((entry) => (
                <tr key={entry.student.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{entry.user.full_name}</td>
                  <td className="px-2 py-2">{entry.student.enrollment_number}</td>
                  <td className="px-2 py-2">{entry.student.department}</td>
                  <td className="px-2 py-2">{entry.student.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Recent Fees">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {fees.slice(0, 8).map((fee) => (
                <tr key={fee.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{fee.student_name || fee.enrollment_number || '-'}</td>
                  <td className="px-2 py-2">{fee.title}</td>
                  <td className="px-2 py-2">₹{fee.amount.toLocaleString()}</td>
                  <td className="px-2 py-2">{fee.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
