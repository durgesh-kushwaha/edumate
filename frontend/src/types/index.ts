export type Role = 'superadmin' | 'admin' | 'teacher' | 'student';

export type UserToken = {
  sub: string;
  role: Role;
  exp: number;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  profile?: Record<string, unknown>;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: UserProfile;
};

export type RegisterRequestResponse = {
  request_id: string;
  status: 'pending';
  message: string;
};

export type AdminStats = {
  users: number;
  students: number;
  faculty: number;
  courses: number;
  pending_fees: number;
  attendance_records: number;
};

export type StudentListing = {
  user: UserProfile;
  student: {
    id: string;
    user_id: string;
    enrollment_number: string;
    department: string;
    year: number;
    gender?: string;
    student_phone?: string;
    parent_name?: string;
    parent_phone?: string;
    address_line?: string;
    pincode?: string;
    state?: string;
    city?: string;
  };
};

export type FacultyListing = {
  user: UserProfile;
  faculty: {
    id: string;
    user_id: string;
    employee_code: string;
    designation: string;
    department: string;
    faculty_phone?: string;
  };
};

export type Course = {
  id: string;
  code: string;
  title: string;
  faculty_id: string;
  faculty_name?: string;
  semester: number;
  credits: number;
};

export type Enrollment = {
  id: string;
  student_id: string;
  course_id: string;
  created_at: string;
};

export type Result = {
  id: string;
  student_id: string;
  course_id: string;
  marks_obtained: number;
  max_marks: number;
  grade: string;
  course_code?: string;
  course_title?: string;
};

export type AttendanceSummary = {
  student_id: string;
  attendance_percentage: number;
  present_records: number;
  tracked_days: number;
};

export type AttendanceHistoryItem = {
  id: string;
  attendance_date: string;
  marked_at: string;
  status: string;
  source: string;
  course_code?: string;
  course_title?: string;
};

export type FeeItem = {
  id: string;
  student_id: string;
  title: string;
  amount: number;
  due_date: string;
  notes: string;
  status: 'pending' | 'paid' | 'overdue';
  payment_link: string;
  student_name?: string;
  enrollment_number?: string;
  created_at: string;
};

export type StudentFeeResponse = {
  items: FeeItem[];
  total_pending: number;
};

export type TeacherCourseReport = {
  course_id: string;
  course_code: string;
  total_enrolled: number;
  present_records: number;
  today_present: number;
};

export type TeacherRosterItem = {
  student_id: string;
  name: string;
  enrollment_number: string;
  department: string;
  year: number;
};

export type FaceProfile = {
  student_id: string;
  student_name: string;
  enrollment_number: string;
  encoding: number[];
  sample_image_path: string;
  images_count?: number;
};

export type AttendanceBatchResponse = {
  course_id: string;
  attendance_date: string;
  marked: { student_id: string; name: string }[];
  already_marked: { student_id: string; name: string }[];
  rejected: { student_id: string; name?: string; reason: string }[];
  summary: {
    requested: number;
    marked_count: number;
    already_marked_count: number;
    rejected_count: number;
  };
};

export type DepartmentCatalogItem = {
  code: string;
  name: string;
  subjects: { code: string; name: string }[];
  timetable: { day: string; slots: string[] }[];
};

export type AttendanceSession = {
  id: string;
  course_id: string;
  attendance_date: string;
  allow_student_mark: boolean;
  is_active: boolean;
  course_code: string;
  course_title: string;
};

export type RegistrationRequestItem = {
  id: string;
  email: string;
  role: string;
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
  status: 'pending' | 'approved' | 'rejected';
  remarks?: string;
  submitted_at: string;
};

export type SalaryConfig = {
  id: string;
  designation: string;
  monthly_salary: number;
};

export type SalaryRecord = {
  id: string;
  month: string;
  amount: number;
  designation: string;
  faculty_name: string;
  employee_code: string;
};

export type AssignmentItem = {
  id: string;
  course_id: string;
  course_code?: string;
  course_title?: string;
  title: string;
  description: string;
  due_date: string;
  attachment_path?: string;
  submitted?: boolean;
  submission?: {
    id: string;
    submission_path: string;
    submitted_at: string;
  } | null;
};

export type StudentAcademicCourse = {
  course_id: string;
  course_code: string;
  course_title: string;
  semester: number;
  faculty_name: string;
  assignments: AssignmentItem[];
};

export type StudentExamOverview = {
  student_name: string;
  enrollment_number: string;
  department: string;
  semester: number;
  upcoming_exams: {
    id: string;
    subject_code: string;
    subject_title: string;
    exam_date: string;
    exam_time: string;
    exam_type: string;
  }[];
  hall_ticket: {
    id?: string;
    exam_session: string;
    hall_no: string;
    seat_no: string;
    semester: number;
    issued_at: string;
  };
  semester_results: {
    semester: number;
    results: (Result & { exam_type: string })[];
  }[];
};

export type AccountProfileResponse = {
  user: UserProfile;
  profile_kind: 'student' | 'faculty' | 'user';
  profile: Record<string, unknown> | null;
};
