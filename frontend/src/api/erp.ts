import client from './client';
import type {
  AccountProfileResponse,
  AdminStats,
  AssignmentItem,
  AttendanceBatchResponse,
  AttendanceHistoryItem,
  AttendanceSession,
  AttendanceSummary,
  AuthResponse,
  Course,
  DepartmentCatalogItem,
  FaceProfile,
  FacultyListing,
  FeeItem,
  RegisterRequestResponse,
  RegistrationRequestItem,
  Result,
  Role,
  SalaryConfig,
  SalaryRecord,
  StudentAcademicCourse,
  StudentExamOverview,
  StudentFeeResponse,
  StudentListing,
  TeacherCourseReport,
  TeacherRosterItem,
} from '../types';

export function extractApiMessage(error: unknown): string {
  const detail =
    (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
    (error as { message?: string })?.message;
  return detail || 'Something went wrong. Please retry.';
}

export async function login(payload: { email: string; password: string }) {
  const { data } = await client.post<AuthResponse>('/auth/login', payload);
  return data;
}

export async function register(payload: {
  email: string;
  password: string;
  full_name: string;
  role: 'student';
  enrollment_number: string;
  department: string;
  year: number;
  gender: string;
  student_phone: string;
  parent_name: string;
  parent_phone: string;
  address_line: string;
  pincode: string;
  state: string;
  city: string;
}) {
  const { data } = await client.post<RegisterRequestResponse>('/auth/register', payload);
  return data;
}

export async function fetchDepartments() {
  const { data } = await client.get<DepartmentCatalogItem[]>('/catalog/departments');
  return data;
}

export async function lookupPincode(pincode: string) {
  const { data } = await client.get<{ pincode: string; state: string; city: string; source: string }>(`/catalog/pincode/${pincode}`);
  return data;
}

export async function fetchAdminStats() {
  const { data } = await client.get<AdminStats>('/admin/dashboard');
  return data;
}

export async function fetchStudents() {
  const { data } = await client.get<StudentListing[]>('/admin/students');
  return data;
}

export async function fetchFaculty() {
  const { data } = await client.get<FacultyListing[]>('/admin/faculty');
  return data;
}

export async function fetchCourses() {
  const { data } = await client.get<Course[]>('/admin/courses');
  return data;
}

export async function createStudent(payload: {
  email: string;
  password: string;
  full_name: string;
  enrollment_number: string;
  department: string;
  year: number;
  gender: string;
  student_phone: string;
  parent_name: string;
  parent_phone: string;
  address_line: string;
  pincode: string;
  state: string;
  city: string;
}) {
  const { data } = await client.post('/admin/students', payload);
  return data;
}

export async function createFaculty(payload: {
  email: string;
  password: string;
  full_name: string;
  employee_code: string;
  designation: string;
  department: string;
  faculty_phone: string;
}) {
  const { data } = await client.post('/admin/faculty', payload);
  return data;
}

export async function createCourse(payload: {
  code: string;
  title: string;
  faculty_id: string;
  semester: number;
  credits: number;
}) {
  const { data } = await client.post('/admin/courses', payload);
  return data;
}

export async function createEnrollment(payload: { student_id: string; course_id: string }) {
  const { data } = await client.post('/admin/enrollments', payload);
  return data;
}

export async function createFee(payload: {
  student_id: string;
  title: string;
  amount: number;
  due_date: string;
  notes: string;
}) {
  const { data } = await client.post('/admin/fees', payload);
  return data;
}

export async function fetchFeesForAdmin() {
  const { data } = await client.get<FeeItem[]>('/admin/fees');
  return data;
}

export async function updateFeeStatus(feeId: string, status: FeeItem['status']) {
  const { data } = await client.patch<FeeItem>(`/admin/fees/${feeId}`, { status });
  return data;
}

export async function createSuperAdmin(payload: { email: string; password: string; full_name: string }) {
  const { data } = await client.post('/admin/superadmins', payload);
  return data;
}

export async function fetchSuperAdmins() {
  const { data } = await client.get<
    {
      id: string;
      full_name: string;
      email: string;
      role: string;
      created_at: string;
    }[]
  >('/admin/superadmins');
  return data;
}

export async function fetchRegistrationRequests(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
  const { data } = await client.get<RegistrationRequestItem[]>('/admin/registration-requests', { params: { status } });
  return data;
}

export async function decideRegistrationRequest(
  requestId: string,
  payload: {
    action: 'approve' | 'reject';
    remarks?: string;
    full_name?: string;
    email?: string;
    password?: string;
    enrollment_number?: string;
    department?: string;
    year?: number;
    gender?: string;
    student_phone?: string;
    parent_name?: string;
    parent_phone?: string;
    address_line?: string;
    pincode?: string;
    state?: string;
    city?: string;
  },
) {
  const { data } = await client.patch(`/admin/registration-requests/${requestId}`, payload);
  return data;
}

export async function fetchSalaryConfigs() {
  const { data } = await client.get<SalaryConfig[]>('/admin/salary/configs');
  return data;
}

export async function upsertSalaryConfig(payload: { designation: string; monthly_salary: number }) {
  const { data } = await client.put('/admin/salary/configs', payload);
  return data;
}

export async function disburseSalary(payload: { month: string }) {
  const { data } = await client.post('/admin/salary/disburse', payload);
  return data;
}

export async function fetchSalaryRecords(month?: string) {
  const { data } = await client.get<SalaryRecord[]>('/admin/salary/records', { params: { month } });
  return data;
}

export async function fetchTeacherCourses() {
  const { data } = await client.get<Course[]>('/teacher/courses');
  return data;
}

export async function createTeacherCourse(payload: { code: string; title: string; semester: number; credits: number }) {
  const { data } = await client.post('/teacher/courses', payload);
  return data;
}

export async function fetchTeacherCourseReport(courseId: string) {
  const { data } = await client.get<TeacherCourseReport>(`/teacher/attendance-report/${courseId}`);
  return data;
}

export async function fetchTeacherCourseRoster(courseId: string) {
  const { data } = await client.get<TeacherRosterItem[]>(`/teacher/course-roster/${courseId}`);
  return data;
}

export async function downloadTeacherAttendanceCsv(courseId: string) {
  const { data, headers } = await client.get(`/teacher/attendance-export/${courseId}`, { responseType: 'blob' });
  const contentDisposition = headers['content-disposition'] as string | undefined;
  let filename = 'attendance_today.csv';
  const match = contentDisposition?.match(/filename=([^;]+)/i);
  if (match?.[1]) {
    filename = match[1].replace(/"/g, '');
  }
  return { blob: data as Blob, filename };
}

export async function submitResult(payload: {
  student_id: string;
  course_id: string;
  marks_obtained: number;
  max_marks: number;
}) {
  const { data } = await client.post('/teacher/results', payload);
  return data;
}

export async function createTeacherAssignment(payload: {
  course_id: string;
  title: string;
  description: string;
  due_date: string;
  attachment?: Blob | null;
}) {
  const form = new FormData();
  form.append('course_id', payload.course_id);
  form.append('title', payload.title);
  form.append('description', payload.description);
  form.append('due_date', payload.due_date);
  if (payload.attachment) {
    form.append('attachment', payload.attachment, 'assignment.pdf');
  }
  const { data } = await client.post('/teacher/assignments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchTeacherAssignments(courseId?: string) {
  const { data } = await client.get<AssignmentItem[]>('/teacher/assignments', { params: { course_id: courseId } });
  return data;
}

export async function fetchTeacherAssignmentSubmissions(assignmentId: string) {
  const { data } = await client.get<
    {
      id: string;
      student_name: string;
      enrollment_number: string;
      submission_path: string;
      submitted_at: string;
    }[]
  >(`/teacher/assignment-submissions/${assignmentId}`);
  return data;
}

export async function downloadTeacherSubmissionFile(submissionId: string) {
  const { data } = await client.get(`/teacher/assignment-submissions/${submissionId}/file`, { responseType: 'blob' });
  return data as Blob;
}

export async function fetchStudentProfile() {
  const { data } = await client.get('/student/profile');
  return data;
}

export async function fetchStudentAttendanceSummary() {
  const { data } = await client.get<AttendanceSummary>('/student/attendance');
  return data;
}

export async function fetchStudentAttendanceHistory() {
  const { data } = await client.get<AttendanceHistoryItem[]>('/student/attendance/history');
  return data;
}

export async function fetchStudentResults() {
  const { data } = await client.get<Result[]>('/student/results');
  return data;
}

export async function fetchStudentFees() {
  const { data } = await client.get<StudentFeeResponse>('/student/fees');
  return data;
}

export async function createStudentPaymentLink(feeId: string) {
  const { data } = await client.post<{ payment_link: string; message: string }>('/student/fees/pay', { fee_id: feeId });
  return data;
}

export async function fetchStudentAcademics() {
  const { data } = await client.get<StudentAcademicCourse[]>('/student/academics');
  return data;
}

export async function submitStudentAssignment(assignmentId: string, file: Blob) {
  const form = new FormData();
  form.append('file', file, 'submission.pdf');
  const { data } = await client.post(`/student/assignments/${assignmentId}/submit`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function downloadStudentAssignmentFile(assignmentId: string) {
  const { data } = await client.get(`/student/assignments/${assignmentId}/file`, { responseType: 'blob' });
  return data as Blob;
}

export async function fetchStudentExams() {
  const { data } = await client.get<StudentExamOverview>('/student/exams');
  return data;
}

export async function fetchAccountMe() {
  const { data } = await client.get<AccountProfileResponse>('/account/me');
  return data;
}

export async function updateAccountMe(payload: {
  full_name?: string;
  student_phone?: string;
  parent_name?: string;
  parent_phone?: string;
  faculty_phone?: string;
  address_line?: string;
  state?: string;
  city?: string;
  pincode?: string;
}) {
  const { data } = await client.patch<AccountProfileResponse>('/account/me', payload);
  return data;
}

export async function updateAccountPassword(payload: { current_password: string; new_password: string }) {
  const { data } = await client.patch('/account/password', payload);
  return data;
}

export async function markAttendance(payload: {
  student_id: string;
  course_id: string;
  attendance_date: string;
  marked_at: string;
  source: string;
}) {
  const { data } = await client.post('/attendance/mark', payload);
  return data;
}

export async function uploadFaceEncoding(payload: {
  student_id: string;
  encoding: number[];
  sample_image_path: string;
}) {
  const { data } = await client.post(`/attendance/face-encoding/${payload.student_id}`, {
    encoding: payload.encoding,
    sample_image_path: payload.sample_image_path,
  });
  return data;
}

export async function verifyFace(payload: { course_id: string; encoding: number[]; tolerance: number }) {
  const { data } = await client.post('/attendance/verify-face', payload);
  return data;
}

export async function fetchFaceEncodings() {
  const { data } = await client.get<FaceProfile[]>('/attendance/face-encodings');
  return data;
}

export async function fetchFaceEncodingsForCourse(courseId: string) {
  const { data } = await client.get<FaceProfile[]>('/attendance/face-encodings', { params: { course_id: courseId } });
  return data;
}

export async function registerFaceLive(studentId: string, images: Blob[]) {
  const form = new FormData();
  images.forEach((blob, index) => {
    form.append('images', blob, `capture_${index + 1}.jpg`);
  });
  const { data } = await client.post(`/attendance/register-face-live/${studentId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as {
    message: string;
    student_id: string;
    images_saved: number;
    valid_face_images: number;
    dataset_dir: string;
  };
}

export async function startAttendanceSession(payload: { course_id: string; allow_student_mark?: boolean }) {
  const { data } = await client.post<AttendanceSession>('/attendance/session/start', payload);
  return data;
}

export async function stopAttendanceSession(payload: { course_id: string }) {
  const { data } = await client.post<AttendanceSession>('/attendance/session/stop', payload);
  return data;
}

export async function fetchActiveAttendanceSessions() {
  const { data } = await client.get<AttendanceSession[]>('/attendance/sessions/active');
  return data;
}

export async function fetchStudentActiveAttendanceSessions() {
  const { data } = await client.get<AttendanceSession[]>('/attendance/sessions/student-active');
  return data;
}

export async function markAttendanceBatch(payload: {
  course_id: string;
  student_ids: string[];
  source: string;
}) {
  const { data } = await client.post<AttendanceBatchResponse>('/attendance/mark-batch', payload);
  return data;
}

export async function markStudentAttendanceLive(courseId: string, image: Blob) {
  const form = new FormData();
  form.append('course_id', courseId);
  form.append('image', image, 'capture.jpg');
  const { data } = await client.post('/attendance/mark-self-live', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
