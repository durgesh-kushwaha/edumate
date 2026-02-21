import { Binary, ObjectId } from 'mongodb';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { DEPARTMENTS } from '@/lib/catalog';
import { ensureDbSetup, getDb, oid, upsertCredentialVault } from '@/lib/db';
import { jsonError, jsonOk, requireUser } from '@/lib/http';

type ActionBody = {
  action?: string;
  payload?: Record<string, unknown>;
};

const RAZORPAY_PAYMENT_LINK = 'https://razorpay.me/@zavraq';
const NOTICE_ROLE_TARGETS = ['student', 'teacher', 'admin', 'superadmin'] as const;

function isDepartmentAllowed(value: string) {
  return DEPARTMENTS.some((item) => item.name === value);
}

function requireDigits(value: string, length: number) {
  const regex = new RegExp(`^\\d{${length}}$`);
  return regex.test(value);
}

function getDepartmentSeed(name: string) {
  return DEPARTMENTS.find((item) => item.name === name);
}

function normalizeNoticeTargets(raw: unknown) {
  const values = Array.isArray(raw) ? raw : [raw];
  const normalized = values
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (normalized.includes('all')) {
    return ['all'];
  }
  return [...new Set(normalized.filter((entry): entry is (typeof NOTICE_ROLE_TARGETS)[number] => NOTICE_ROLE_TARGETS.includes(entry as never)))];
}

function guessSemesterFromSubjectCode(code: string) {
  const match = code.toUpperCase().match(/[A-Z]+(\d)\d{2}/);
  const yearBucket = Number(match?.[1] || 1);
  return Math.min(Math.max(yearBucket * 2, 1), 8);
}

function maxSemesterFromYear(yearValue: unknown) {
  const year = Math.max(1, Number(yearValue || 1));
  return Math.min(Math.floor(year) * 2, 8);
}

async function assignDepartmentSubjectsToFaculty(
  db: Awaited<ReturnType<typeof getDb>>,
  faculty: Record<string, unknown>,
  options?: { overwrite?: boolean },
) {
  const overwrite = Boolean(options?.overwrite);
  const departmentName = String(faculty.department || '');
  const employeeCode = String(faculty.employee_code || '').trim().toUpperCase();
  const facultyId = faculty._id instanceof ObjectId ? faculty._id : null;
  const department = getDepartmentSeed(departmentName);

  if (!facultyId || !department) {
    return { assigned: 0 };
  }

  let assigned = 0;
  for (const subject of department.subjects) {
    const existing = await db.collection('courses').findOne({ code: subject.code });
    if (!existing) {
      await db.collection('courses').insertOne({
        code: subject.code,
        title: subject.name,
        department: department.name,
        semester: guessSemesterFromSubjectCode(subject.code),
        credits: 4,
        faculty_id: facultyId,
        auto_assigned: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      assigned += 1;
      continue;
    }

    if (overwrite || !existing.faculty_id) {
      await db.collection('courses').updateOne(
        { _id: existing._id },
        {
          $set: {
            title: subject.name,
            department: department.name,
            semester: Number(existing.semester || guessSemesterFromSubjectCode(subject.code)),
            credits: Number(existing.credits || 4),
            faculty_id: facultyId,
            auto_assigned: true,
            updated_at: new Date(),
          },
        },
      );
      assigned += 1;
      continue;
    }

    const sectionCode = `${subject.code}-${employeeCode || String(facultyId).slice(-4)}`;
    await db.collection('courses').updateOne(
      { code: sectionCode },
      {
        $set: {
          code: sectionCode,
          title: `${subject.name} (${employeeCode || 'Section'})`,
          department: department.name,
          semester: guessSemesterFromSubjectCode(subject.code),
          credits: 4,
          faculty_id: facultyId,
          auto_assigned: true,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
        },
      },
      { upsert: true },
    );
    assigned += 1;
  }

  return { assigned };
}

async function saveFile(db: Awaited<ReturnType<typeof getDb>>, file: { name: string; mime: string; base64: string }) {
  const buffer = Buffer.from(file.base64, 'base64');
  const inserted = await db.collection('file_blobs').insertOne({
    name: file.name,
    mime: file.mime,
    content: new Binary(buffer),
    size: buffer.byteLength,
    created_at: new Date(),
  });
  return inserted.insertedId;
}

async function enrollStudentToDepartmentCourses(
  db: Awaited<ReturnType<typeof getDb>>,
  studentId: ObjectId,
  departmentName: string,
) {
  if (!departmentName) return { enrolled: 0 };
  const student = await db.collection('students').findOne({ _id: studentId });
  if (!student) return { enrolled: 0 };
  const maxSemester = maxSemesterFromYear(student.year);
  const courses = await db.collection('courses').find({ department: departmentName, semester: { $lte: maxSemester } }).toArray();
  const allowedCourseIds = courses.map((course) => course._id);
  if (allowedCourseIds.length > 0) {
    await db.collection('enrollments').deleteMany({
      student_id: studentId,
      course_id: { $nin: allowedCourseIds },
    });
  } else {
    await db.collection('enrollments').deleteMany({ student_id: studentId });
  }
  let enrolled = 0;
  for (const course of courses) {
    const result = await db.collection('enrollments').updateOne(
      { student_id: studentId, course_id: course._id },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      enrolled += 1;
    }
  }
  return { enrolled };
}

async function enrollDepartmentStudentsToCourse(
  db: Awaited<ReturnType<typeof getDb>>,
  courseId: ObjectId,
  departmentName: string,
) {
  if (!departmentName) return { enrolled: 0 };
  const course = await db.collection('courses').findOne({ _id: courseId });
  if (!course) return { enrolled: 0 };
  const courseSemester = Number(course.semester || 1);
  const students = await db.collection('students').find({ department: departmentName }).toArray();
  let enrolled = 0;
  for (const student of students) {
    if (maxSemesterFromYear(student.year) < courseSemester) {
      await db.collection('enrollments').deleteOne({ student_id: student._id, course_id: courseId });
      continue;
    }
    const result = await db.collection('enrollments').updateOne(
      { student_id: student._id, course_id: courseId },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      enrolled += 1;
    }
  }
  return { enrolled };
}

async function syncDepartmentEnrollments(
  db: Awaited<ReturnType<typeof getDb>>,
  departmentName?: string,
) {
  const studentFilter = departmentName ? { department: departmentName } : {};
  const students = await db.collection('students').find(studentFilter).toArray();
  let totalUpserts = 0;
  for (const student of students) {
    const dept = String(student.department || '');
    if (!dept) continue;
    const result = await enrollStudentToDepartmentCourses(db, student._id, dept);
    totalUpserts += result.enrolled;
  }
  return { students: students.length, enrollments_created: totalUpserts };
}

export async function POST(request: Request) {
  try {
    await ensureDbSetup();
    const { action, payload = {} } = (await request.json()) as ActionBody;
    if (!action) {
      return jsonError('Action is required', 400);
    }
    const user = await requireUser();
    const db = await getDb();

    if (action === 'admin.create_student') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const fullName = String(payload.full_name || '').trim();
      const enrollmentNumber = String(payload.enrollment_number || '').trim();
      const department = String(payload.department || '').trim();
      const year = Number(payload.year || 1);
      const gender = String(payload.gender || '').trim();
      const studentPhone = String(payload.student_phone || '').trim();
      const parentName = String(payload.parent_name || '').trim();
      const parentPhone = String(payload.parent_phone || '').trim();
      const addressLine = String(payload.address_line || '').trim();
      const pincode = String(payload.pincode || '').trim();
      const state = String(payload.state || '').trim();
      const city = String(payload.city || '').trim();

      if (!email || !password || !fullName) return jsonError('Name, email and password are required', 400);
      if (!/^\d+$/.test(enrollmentNumber)) return jsonError('Roll number must contain only numbers', 400);
      if (!isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      if (!requireDigits(studentPhone, 10) || !requireDigits(parentPhone, 10)) return jsonError('Phone numbers must be 10 digits', 400);
      if (!requireDigits(pincode, 6)) return jsonError('Pincode must be 6 digits', 400);

      const now = new Date();
      const insertedUser = await db.collection('users').insertOne({
        email,
        hashed_password: hashPassword(password),
        role: 'student',
        full_name: fullName,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      await upsertCredentialVault(db, insertedUser.insertedId, password);

      const insertedStudent = await db.collection('students').insertOne({
        user_id: insertedUser.insertedId,
        enrollment_number: enrollmentNumber,
        department,
        year,
        gender,
        student_phone: studentPhone,
        parent_name: parentName,
        parent_phone: parentPhone,
        address_line: addressLine,
        pincode,
        state,
        city,
        created_at: now,
        updated_at: now,
      });
      await enrollStudentToDepartmentCourses(db, insertedStudent.insertedId, department);
      return jsonOk({ message: 'Student created' });
    }

    if (action === 'superadmin.update_student') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const studentId = String(payload.student_id || '').trim();
      const email = String(payload.email || '').trim().toLowerCase();
      const fullName = String(payload.full_name || '').trim();
      const enrollmentNumber = String(payload.enrollment_number || '').trim();
      const department = String(payload.department || '').trim();
      const year = Number(payload.year || 1);
      const gender = String(payload.gender || '').trim();
      const studentPhone = String(payload.student_phone || '').trim();
      const parentName = String(payload.parent_name || '').trim();
      const parentPhone = String(payload.parent_phone || '').trim();
      const addressLine = String(payload.address_line || '').trim();
      const pincode = String(payload.pincode || '').trim();
      const stateName = String(payload.state || '').trim();
      const city = String(payload.city || '').trim();
      if (!studentId) return jsonError('student_id is required', 400);
      if (!email || !fullName || !enrollmentNumber) return jsonError('Name, email and roll number are required', 400);
      if (!/^\d+$/.test(enrollmentNumber)) return jsonError('Roll number must contain only numbers', 400);
      if (!isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      if (!requireDigits(studentPhone, 10) || !requireDigits(parentPhone, 10)) return jsonError('Phone numbers must be 10 digits', 400);
      if (!requireDigits(pincode, 6)) return jsonError('Pincode must be 6 digits', 400);

      const student = await db.collection('students').findOne({ _id: oid(studentId) }).catch(() => null);
      if (!student) return jsonError('Student not found', 404);
      const studentUserId = student.user_id instanceof ObjectId ? student.user_id : null;
      if (!studentUserId) return jsonError('Student account link is broken', 400);

      await db.collection('users').updateOne(
        { _id: studentUserId },
        { $set: { email, full_name: fullName, updated_at: new Date() } },
      );
      await db.collection('students').updateOne(
        { _id: student._id },
        {
          $set: {
            enrollment_number: enrollmentNumber,
            department,
            year,
            gender,
            student_phone: studentPhone,
            parent_name: parentName,
            parent_phone: parentPhone,
            address_line: addressLine,
            pincode,
            state: stateName,
            city,
            updated_at: new Date(),
          },
        },
      );
      await enrollStudentToDepartmentCourses(db, student._id, department);
      return jsonOk({ message: 'Student updated' });
    }

    if (action === 'superadmin.delete_student') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const studentId = String(payload.student_id || '').trim();
      if (!studentId) return jsonError('student_id is required', 400);

      const student = await db.collection('students').findOne({ _id: oid(studentId) }).catch(() => null);
      if (!student) return jsonError('Student not found', 404);
      const studentUserId = student.user_id instanceof ObjectId ? student.user_id : null;
      if (!studentUserId) return jsonError('Student account link is broken', 400);

      await Promise.all([
        db.collection('students').deleteOne({ _id: student._id }),
        db.collection('users').deleteOne({ _id: studentUserId, role: 'student' }),
        db.collection('enrollments').deleteMany({ student_id: student._id }),
        db.collection('attendance').deleteMany({ student_id: student._id }),
        db.collection('fee_ledgers').deleteMany({ student_id: student._id }),
        db.collection('hall_tickets').deleteMany({ student_id: student._id }),
        db.collection('results').deleteMany({ student_id: student._id }),
        db.collection('face_profiles').deleteMany({ student_id: student._id }),
        db.collection('assignment_submissions').deleteMany({ student_id: student._id }),
        db.collection('credential_vault').deleteOne({ user_id: studentUserId }),
      ]);
      return jsonOk({ message: 'Student deleted' });
    }

    if (action === 'admin.create_faculty') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const fullName = String(payload.full_name || '').trim();
      const employeeCode = String(payload.employee_code || '').trim();
      const designation = String(payload.designation || '').trim();
      const department = String(payload.department || '').trim();
      const facultyPhone = String(payload.faculty_phone || '').trim();

      if (!email || !password || !fullName || !employeeCode || !designation) {
        return jsonError('All faculty fields are required', 400);
      }
      if (!isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      if (!requireDigits(facultyPhone, 10)) return jsonError('Faculty phone must be 10 digits', 400);

      const now = new Date();
      const insertedUser = await db.collection('users').insertOne({
        email,
        hashed_password: hashPassword(password),
        role: 'teacher',
        full_name: fullName,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      await upsertCredentialVault(db, insertedUser.insertedId, password);

      const insertedFaculty = await db.collection('faculty').insertOne({
        user_id: insertedUser.insertedId,
        employee_code: employeeCode,
        designation,
        department,
        faculty_phone: facultyPhone,
        created_at: now,
        updated_at: now,
      });
      const faculty = await db.collection('faculty').findOne({ _id: insertedFaculty.insertedId });
      if (faculty) {
        await assignDepartmentSubjectsToFaculty(db, faculty);
        await syncDepartmentEnrollments(db, String(faculty.department || ''));
      }
      return jsonOk({ message: 'Faculty created and department subjects auto-assigned' });
    }

    if (action === 'superadmin.update_faculty') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const facultyId = String(payload.faculty_id || '').trim();
      const email = String(payload.email || '').trim().toLowerCase();
      const fullName = String(payload.full_name || '').trim();
      const employeeCode = String(payload.employee_code || '').trim();
      const designation = String(payload.designation || '').trim();
      const department = String(payload.department || '').trim();
      const facultyPhone = String(payload.faculty_phone || '').trim();
      const autoAssignSubjects = payload.auto_assign_subjects === true;
      if (!facultyId) return jsonError('faculty_id is required', 400);
      if (!email || !fullName || !employeeCode || !designation || !department || !facultyPhone) {
        return jsonError('All faculty fields are required', 400);
      }
      if (!isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      if (!requireDigits(facultyPhone, 10)) return jsonError('Faculty phone must be 10 digits', 400);

      const faculty = await db.collection('faculty').findOne({ _id: oid(facultyId) }).catch(() => null);
      if (!faculty) return jsonError('Faculty not found', 404);
      const facultyUserId = faculty.user_id instanceof ObjectId ? faculty.user_id : null;
      if (!facultyUserId) return jsonError('Faculty account link is broken', 400);

      await db.collection('users').updateOne(
        { _id: facultyUserId },
        { $set: { email, full_name: fullName, updated_at: new Date() } },
      );
      await db.collection('faculty').updateOne(
        { _id: faculty._id },
        {
          $set: {
            employee_code: employeeCode,
            designation,
            department,
            faculty_phone: facultyPhone,
            updated_at: new Date(),
          },
        },
      );

      if (autoAssignSubjects) {
        const updatedFaculty = await db.collection('faculty').findOne({ _id: faculty._id });
        if (updatedFaculty) {
          await assignDepartmentSubjectsToFaculty(db, updatedFaculty, { overwrite: true });
          await syncDepartmentEnrollments(db, String(updatedFaculty.department || ''));
        }
      }

      return jsonOk({ message: 'Faculty updated' });
    }

    if (action === 'superadmin.delete_faculty') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const facultyId = String(payload.faculty_id || '').trim();
      if (!facultyId) return jsonError('faculty_id is required', 400);
      const faculty = await db.collection('faculty').findOne({ _id: oid(facultyId) }).catch(() => null);
      if (!faculty) return jsonError('Faculty not found', 404);
      const facultyUserId = faculty.user_id instanceof ObjectId ? faculty.user_id : null;
      if (!facultyUserId) return jsonError('Faculty account link is broken', 400);

      await Promise.all([
        db.collection('courses').updateMany(
          { faculty_id: faculty._id },
          { $set: { faculty_id: null, updated_at: new Date() } },
        ),
        db.collection('salary_records').deleteMany({ faculty_id: faculty._id }),
        db.collection('faculty').deleteOne({ _id: faculty._id }),
        db.collection('users').deleteOne({ _id: facultyUserId, role: 'teacher' }),
        db.collection('credential_vault').deleteOne({ user_id: facultyUserId }),
      ]);

      return jsonOk({ message: 'Faculty deleted' });
    }

    if (action === 'superadmin.assign_department_subjects') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const facultyId = String(payload.faculty_id || '').trim();
      const overwrite = payload.overwrite === true;
      if (!facultyId) return jsonError('faculty_id is required', 400);
      const faculty = await db.collection('faculty').findOne({ _id: oid(facultyId) }).catch(() => null);
      if (!faculty) return jsonError('Faculty not found', 404);
      const result = await assignDepartmentSubjectsToFaculty(db, faculty, { overwrite });
      await syncDepartmentEnrollments(db, String(faculty.department || ''));
      return jsonOk({ message: `Assigned ${result.assigned} subject(s)` });
    }

    if (action === 'superadmin.assign_subject_to_faculty') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const facultyId = String(payload.faculty_id || '').trim();
      const courseId = String(payload.course_id || '').trim();
      if (!facultyId || !courseId) return jsonError('faculty_id and course_id are required', 400);

      const [faculty, course] = await Promise.all([
        db.collection('faculty').findOne({ _id: oid(facultyId) }).catch(() => null),
        db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null),
      ]);
      if (!faculty) return jsonError('Faculty not found', 404);
      if (!course) return jsonError('Course not found', 404);

      const facultyDepartment = String(faculty.department || '').trim();
      const courseDepartment = String(course.department || '').trim();
      if (facultyDepartment && courseDepartment && facultyDepartment !== courseDepartment) {
        return jsonError('You can assign only same-department subjects to this faculty', 400);
      }

      await db.collection('courses').updateOne(
        { _id: course._id },
        {
          $set: {
            faculty_id: faculty._id,
            updated_at: new Date(),
          },
        },
      );

      return jsonOk({ message: 'Subject assigned to faculty' });
    }

    if (action === 'superadmin.create_superadmin') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const fullName = String(payload.full_name || '').trim();
      if (!email || !password || !fullName) return jsonError('Name, email and password are required', 400);
      const insertedSuperadmin = await db.collection('users').insertOne({
        email,
        hashed_password: hashPassword(password),
        role: 'superadmin',
        full_name: fullName,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await upsertCredentialVault(db, insertedSuperadmin.insertedId, password);
      return jsonOk({ message: 'Superadmin created' });
    }

    if (action === 'superadmin.registration_decide') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const requestId = String(payload.request_id || '');
      const decision = String(payload.decision || '');
      const req = await db.collection('registration_requests').findOne({ _id: oid(requestId) });
      if (!req) return jsonError('Request not found', 404);
      if (req.status !== 'pending') return jsonError('Request already processed', 400);

      if (decision === 'reject') {
        await db.collection('registration_requests').updateOne(
          { _id: req._id },
          {
            $set: {
              status: 'rejected',
              remarks: String(payload.remarks || ''),
              reviewed_by: user._id,
              reviewed_at: new Date(),
              updated_at: new Date(),
            },
          },
        );
        return jsonOk({ message: 'Registration rejected' });
      }

      const now = new Date();
      const insertedUser = await db.collection('users').insertOne({
        email: req.email,
        hashed_password: req.hashed_password,
        role: 'student',
        full_name: req.full_name,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      const rawPassword = String(req.raw_password || '').trim();
      if (rawPassword) {
        await upsertCredentialVault(db, insertedUser.insertedId, rawPassword);
      }
      const insertedStudent = await db.collection('students').insertOne({
        user_id: insertedUser.insertedId,
        enrollment_number: req.enrollment_number,
        department: req.department,
        year: req.year,
        gender: req.gender,
        student_phone: req.student_phone,
        parent_name: req.parent_name,
        parent_phone: req.parent_phone,
        address_line: req.address_line,
        pincode: req.pincode,
        state: req.state,
        city: req.city,
        created_at: now,
        updated_at: now,
      });
      await enrollStudentToDepartmentCourses(db, insertedStudent.insertedId, String(req.department || ''));
      await db.collection('registration_requests').updateOne(
        { _id: req._id },
        {
          $set: {
            status: 'approved',
            remarks: String(payload.remarks || ''),
            reviewed_by: user._id,
            reviewed_at: now,
            approved_user_id: insertedUser.insertedId,
            approved_student_id: insertedStudent.insertedId,
            updated_at: now,
          },
        },
      );
      return jsonOk({ message: 'Registration approved' });
    }

    if (action === 'admin.create_course') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const code = String(payload.code || '').trim().toUpperCase();
      const title = String(payload.title || '').trim();
      const facultyId = String(payload.faculty_id || '').trim();
      const department = String(payload.department || '').trim();
      const semester = Number(payload.semester || 1);
      const credits = Number(payload.credits || 4);
      if (!code || !title) return jsonError('Code and title are required', 400);
      if (department && !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);

      const insertedCourse = await db.collection('courses').insertOne({
        code,
        title,
        faculty_id: facultyId ? oid(facultyId) : null,
        department: department || null,
        semester,
        credits,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await enrollDepartmentStudentsToCourse(db, insertedCourse.insertedId, department || '');
      return jsonOk({ message: 'Course created' });
    }

    if (action === 'teacher.create_course') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty) return jsonError('Faculty profile missing', 404);
      const code = String(payload.code || '').trim().toUpperCase();
      const title = String(payload.title || '').trim();
      const semester = Number(payload.semester || 1);
      const credits = Number(payload.credits || 4);
      if (!code || !title) return jsonError('Code and title are required', 400);

      const insertedCourse = await db.collection('courses').insertOne({
        code,
        title,
        department: faculty.department || null,
        faculty_id: faculty._id,
        semester,
        credits,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await enrollDepartmentStudentsToCourse(db, insertedCourse.insertedId, String(faculty.department || ''));
      return jsonOk({ message: 'Subject created' });
    }

    if (action === 'superadmin.sync_department_enrollments') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const department = String(payload.department || '').trim();
      if (department && !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      const result = await syncDepartmentEnrollments(db, department || undefined);
      return jsonOk({
        message: `Enrollment sync complete: ${result.enrollments_created} enrollment(s) created for ${result.students} student(s).`,
      });
    }

    if (action === 'admin.enroll_student') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const studentId = String(payload.student_id || '');
      const courseId = String(payload.course_id || '');
      await db.collection('enrollments').updateOne(
        { student_id: oid(studentId), course_id: oid(courseId) },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true },
      );
      return jsonOk({ message: 'Enrollment created' });
    }

    if (action === 'admin.create_fee') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const studentId = String(payload.student_id || '');
      const title = String(payload.title || '').trim();
      const amount = Number(payload.amount || 0);
      const dueDate = String(payload.due_date || '').trim();
      const notes = String(payload.notes || '').trim();
      if (!studentId || !title || amount <= 0 || !dueDate) return jsonError('Invalid fee payload', 400);
      await db.collection('fee_ledgers').insertOne({
        student_id: oid(studentId),
        title,
        amount,
        due_date: dueDate,
        notes,
        status: 'pending',
        created_by: user._id,
        payment_link: RAZORPAY_PAYMENT_LINK,
        student_claim: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return jsonOk({ message: 'Fee assigned' });
    }

    if (action === 'admin.update_fee_status') {
      if (!['admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const feeId = String(payload.fee_id || '');
      const status = String(payload.status || 'pending');
      if (!['pending', 'paid', 'overdue', 'partial', 'payment_review'].includes(status)) return jsonError('Invalid status', 400);
      await db.collection('fee_ledgers').updateOne({ _id: oid(feeId) }, { $set: { status, updated_at: new Date() } });
      return jsonOk({ message: 'Fee status updated' });
    }

    if (action === 'superadmin.review_fee_declaration') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const feeId = String(payload.fee_id || '').trim();
      const decision = String(payload.decision || '').trim().toLowerCase();
      const remarks = String(payload.remarks || '').trim();
      const approvedAmountRaw = Number(payload.approved_amount || 0);
      if (!feeId) return jsonError('fee_id is required', 400);
      if (!['approve_full', 'approve_partial', 'reject'].includes(decision)) {
        return jsonError('Invalid decision', 400);
      }

      const fee = await db.collection('fee_ledgers').findOne({ _id: oid(feeId) }).catch(() => null);
      if (!fee) return jsonError('Fee record not found', 404);
      const claim = fee.student_claim as Record<string, unknown> | null;
      if (!claim || String(claim.review_status || '') !== 'pending') {
        return jsonError('No pending student declaration found', 400);
      }

      let status = String(fee.status || 'pending');
      let reviewStatus = 'rejected';
      let approvedAmount = Number(claim.paid_amount || 0);

      if (decision === 'approve_full') {
        status = 'paid';
        reviewStatus = 'approved_full';
        approvedAmount = Number(fee.amount || approvedAmount || 0);
      } else if (decision === 'approve_partial') {
        status = 'partial';
        reviewStatus = 'approved_partial';
        approvedAmount = approvedAmountRaw > 0 ? approvedAmountRaw : Number(claim.paid_amount || 0);
        const feeAmount = Number(fee.amount || 0);
        if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || (feeAmount > 0 && approvedAmount >= feeAmount)) {
          return jsonError('Partial approved amount must be greater than 0 and less than total fee', 400);
        }
      } else {
        status = 'pending';
        reviewStatus = 'rejected';
      }

      await db.collection('fee_ledgers').updateOne(
        { _id: fee._id },
        {
          $set: {
            status,
            verified_paid_amount: approvedAmount || null,
            student_claim: {
              ...claim,
              review_status: reviewStatus,
              approved_amount: approvedAmount || null,
              review_remarks: remarks,
              reviewed_by: user._id,
              reviewed_at: new Date(),
            },
            updated_at: new Date(),
          },
        },
      );

      return jsonOk({ message: `Declaration ${reviewStatus.replace('_', ' ')}.` });
    }

    if (action === 'superadmin.create_notice') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const title = String(payload.title || '').trim();
      const body = String(payload.body || '').trim();
      const targets = normalizeNoticeTargets(payload.target_roles ?? payload.target_role);
      const department = String(payload.department || '').trim();
      const courseId = String(payload.course_id || '').trim();
      if (!title || !body) return jsonError('Title and notice text are required', 400);
      if (!targets.length) return jsonError('Select at least one target audience', 400);
      if (department && !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);

      let courseObjectId: ObjectId | null = null;
      if (courseId) {
        const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
        if (!course) return jsonError('Course not found', 404);
        courseObjectId = course._id;
      }

      await db.collection('notices').insertOne({
        title,
        body,
        target_roles: targets,
        department: department || null,
        course_id: courseObjectId,
        created_by: user._id,
        created_by_role: user.role,
        created_at: new Date(),
        updated_at: new Date(),
      });

      return jsonOk({ message: 'Notice published' });
    }

    if (action === 'superadmin.salary_config_upsert') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const designation = String(payload.designation || '').trim();
      const monthlySalary = Number(payload.monthly_salary || 0);
      if (!designation || monthlySalary <= 0) return jsonError('Invalid salary config', 400);
      await db.collection('salary_configs').updateOne(
        { designation },
        { $set: { designation, monthly_salary: monthlySalary, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
        { upsert: true },
      );
      return jsonOk({ message: 'Salary config saved' });
    }

    if (action === 'superadmin.salary_disburse') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const month = String(payload.month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return jsonError('Month should be YYYY-MM', 400);
      const configs = await db.collection('salary_configs').find().toArray();
      const map = new Map(configs.map((entry) => [entry.designation, Number(entry.monthly_salary || 0)]));
      const faculty = await db.collection('faculty').find().toArray();
      let processed = 0;
      for (const item of faculty) {
        const amount = map.get(String(item.designation)) || 0;
        if (amount <= 0) continue;
        await db.collection('salary_records').updateOne(
          { faculty_id: item._id, month },
          {
            $set: {
              faculty_id: item._id,
              designation: item.designation,
              amount,
              status: 'credited',
              updated_at: new Date(),
            },
            $setOnInsert: { created_at: new Date() },
          },
          { upsert: true },
        );
        processed += 1;
      }
      return jsonOk({ message: `Salary processed for ${processed} faculty member(s)` });
    }

    if (action === 'superadmin.reset_user_password') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const userId = String(payload.user_id || '').trim();
      const newPassword = String(payload.new_password || '').trim();
      if (!userId || !newPassword) return jsonError('user_id and new_password are required', 400);

      const target = await db.collection('users').findOne({ _id: oid(userId), is_active: true }).catch(() => null);
      if (!target) return jsonError('User not found', 404);

      await db.collection('users').updateOne(
        { _id: target._id },
        {
          $set: {
            hashed_password: hashPassword(newPassword),
            updated_at: new Date(),
          },
        },
      );
      await upsertCredentialVault(db, target._id, newPassword);
      return jsonOk({ message: 'Password reset completed' });
    }

    if (action === 'teacher.start_session') {
      if (!['teacher', 'admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '');
      const allowStudentMark = payload.allow_student_mark !== false;
      const course = await db.collection('courses').findOne({ _id: oid(courseId) });
      if (!course) return jsonError('Course not found', 404);
      if (user.role === 'teacher') {
        const faculty = await db.collection('faculty').findOne({ user_id: user._id });
        if (!faculty || faculty._id.toString() !== course.faculty_id.toString()) {
          return jsonError('You can start session only for your own subject', 403);
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      await db.collection('attendance_sessions').updateMany(
        { course_id: course._id, attendance_date: today, is_active: true },
        { $set: { is_active: false, closed_at: new Date(), updated_at: new Date() } },
      );
      await db.collection('attendance_sessions').insertOne({
        course_id: course._id,
        attendance_date: today,
        allow_student_mark: allowStudentMark,
        is_active: true,
        started_by: user._id,
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
      return jsonOk({ message: 'Attendance session started' });
    }

    if (action === 'teacher.stop_session') {
      if (!['teacher', 'admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '');
      const course = await db.collection('courses').findOne({ _id: oid(courseId) });
      if (!course) return jsonError('Course not found', 404);
      if (user.role === 'teacher') {
        const faculty = await db.collection('faculty').findOne({ user_id: user._id });
        if (!faculty || faculty._id.toString() !== course.faculty_id.toString()) {
          return jsonError('You can stop session only for your own subject', 403);
        }
      }
      const today = new Date().toISOString().slice(0, 10);
      await db.collection('attendance_sessions').updateMany(
        { course_id: course._id, attendance_date: today, is_active: true },
        { $set: { is_active: false, closed_at: new Date(), updated_at: new Date() } },
      );
      return jsonOk({ message: 'Attendance session stopped' });
    }

    if (action === 'attendance.mark_batch') {
      if (!['teacher', 'admin', 'superadmin'].includes(user.role)) return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '');
      const studentIds = Array.isArray(payload.student_ids) ? payload.student_ids.map((entry) => String(entry)) : [];
      const course = await db.collection('courses').findOne({ _id: oid(courseId) });
      if (!course) return jsonError('Course not found', 404);

      const today = new Date().toISOString().slice(0, 10);
      const session = await db.collection('attendance_sessions').findOne({
        course_id: course._id,
        attendance_date: today,
        is_active: true,
      });
      if (!session) return jsonError('Start session before marking attendance', 403);

      const marked: { student_id: string; name: string }[] = [];
      const alreadyMarked: { student_id: string; name: string }[] = [];
      const rejected: { student_id: string; reason: string }[] = [];

      for (const id of [...new Set(studentIds)]) {
        const student = await db.collection('students').findOne({ _id: oid(id) }).catch(() => null);
        if (!student) {
          rejected.push({ student_id: id, reason: 'student_not_found' });
          continue;
        }
        const enrolled = await db.collection('enrollments').findOne({ student_id: student._id, course_id: course._id });
        if (!enrolled) {
          rejected.push({ student_id: id, reason: 'not_enrolled' });
          continue;
        }
        const studentUser = await db.collection('users').findOne({ _id: student.user_id });
        const name = studentUser?.full_name || 'Unknown';

        const exists = await db.collection('attendance').findOne({
          student_id: student._id,
          course_id: course._id,
          attendance_date: today,
        });

        if (exists) {
          alreadyMarked.push({ student_id: id, name });
          continue;
        }

        await db.collection('attendance').insertOne({
          student_id: student._id,
          course_id: course._id,
          attendance_date: today,
          marked_at: new Date(),
          status: 'present',
          source: 'faculty_batch_mark',
          created_at: new Date(),
        });
        marked.push({ student_id: id, name });
      }

      return jsonOk({
        course_id: courseId,
        attendance_date: today,
        marked,
        already_marked: alreadyMarked,
        rejected,
        summary: {
          requested: studentIds.length,
          marked_count: marked.length,
          already_marked_count: alreadyMarked.length,
          rejected_count: rejected.length,
        },
      });
    }

    if (action === 'teacher.submit_manual_attendance') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '').trim();
      const attendanceDate = String(payload.attendance_date || new Date().toISOString().slice(0, 10)).trim();
      const topicCovered = String(payload.topic_covered || '').trim();
      const presentStudentIds = Array.isArray(payload.present_student_ids) ? payload.present_student_ids.map((entry) => String(entry || '').trim()) : [];
      if (!courseId) return jsonError('course_id is required', 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) return jsonError('attendance_date must be YYYY-MM-DD', 400);
      if (!topicCovered) return jsonError('topic_covered is required', 400);

      const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
      if (!course) return jsonError('Course not found', 404);

      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty || String(course.faculty_id || '') !== String(faculty._id)) {
        return jsonError('You can take attendance only for your own subject', 403);
      }

      const enrollments = await db.collection('enrollments').find({ course_id: course._id }).toArray();
      const enrolledStudentIds = enrollments
        .map((item) => (item.student_id instanceof ObjectId ? item.student_id : null))
        .filter((item): item is ObjectId => Boolean(item));
      if (!enrolledStudentIds.length) return jsonError('No enrolled students found for this subject', 400);

      const presentSet = new Set(presentStudentIds);
      const unknownSelections = [...presentSet].filter((id) => !enrolledStudentIds.some((sid) => sid.toString() === id));
      if (unknownSelections.length) {
        return jsonError('One or more selected students are not enrolled in this subject', 400);
      }

      let presentCount = 0;
      let absentCount = 0;
      for (const studentId of enrolledStudentIds) {
        const status = presentSet.has(studentId.toString()) ? 'present' : 'absent';
        if (status === 'present') presentCount += 1;
        if (status === 'absent') absentCount += 1;

        await db.collection('attendance').updateOne(
          {
            student_id: studentId,
            course_id: course._id,
            attendance_date: attendanceDate,
          },
          {
            $set: {
              student_id: studentId,
              course_id: course._id,
              attendance_date: attendanceDate,
              status,
              source: 'faculty_manual',
              topic_covered: topicCovered,
              marked_by: user._id,
              marked_at: new Date(),
              updated_at: new Date(),
            },
            $setOnInsert: {
              created_at: new Date(),
            },
          },
          { upsert: true },
        );
      }

      return jsonOk({
        message: `Manual attendance submitted. Present: ${presentCount}, Absent: ${absentCount}`,
        summary: {
          total_students: enrolledStudentIds.length,
          present_count: presentCount,
          absent_count: absentCount,
        },
      });
    }

    if (action === 'teacher.create_assignment') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '').trim();
      const title = String(payload.title || '').trim();
      const description = String(payload.description || '').trim();
      const dueDate = String(payload.due_date || '').trim();
      const file = payload.file as { name: string; mime: string; base64: string } | undefined;

      if (!courseId || !title || !dueDate) return jsonError('Course, title and due date are required', 400);
      const course = await db.collection('courses').findOne({ _id: oid(courseId) });
      if (!course) return jsonError('Course not found', 404);
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty || faculty._id.toString() !== course.faculty_id.toString()) {
        return jsonError('You can assign work only for your subject', 403);
      }

      let attachmentFileId: ObjectId | null = null;
      if (file?.base64) {
        attachmentFileId = await saveFile(db, file);
      }

      await db.collection('assignments').insertOne({
        course_id: course._id,
        title,
        description,
        due_date: dueDate,
        attachment_file_id: attachmentFileId,
        teacher_user_id: user._id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return jsonOk({ message: 'Assignment created' });
    }

    if (action === 'teacher.create_econtent') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const courseId = String(payload.course_id || '').trim();
      const title = String(payload.title || '').trim();
      const description = String(payload.description || '').trim();
      const contentType = String(payload.content_type || 'syllabus').trim().toLowerCase();
      const externalLink = String(payload.external_link || '').trim();
      const file = payload.file as { name: string; mime: string; base64: string } | undefined;
      if (!courseId || !title) return jsonError('Course and title are required', 400);
      if (!['syllabus', 'notes', 'reference', 'video', 'announcement'].includes(contentType)) {
        return jsonError('Invalid content_type', 400);
      }

      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty) return jsonError('Faculty profile missing', 404);
      const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
      if (!course) return jsonError('Course not found', 404);
      if (String(course.faculty_id || '') !== String(faculty._id)) {
        return jsonError('You can add e-content only for your assigned subject', 403);
      }

      let attachmentFileId: ObjectId | null = null;
      if (file?.base64) {
        attachmentFileId = await saveFile(db, file);
      }

      await db.collection('econtents').insertOne({
        course_id: course._id,
        title,
        description,
        content_type: contentType,
        external_link: externalLink || null,
        attachment_file_id: attachmentFileId,
        teacher_user_id: user._id,
        teacher_faculty_id: faculty._id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return jsonOk({ message: 'E-content published' });
    }

    if (action === 'teacher.create_notice') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const title = String(payload.title || '').trim();
      const body = String(payload.body || '').trim();
      const department = String(payload.department || '').trim();
      const courseId = String(payload.course_id || '').trim();
      if (!title || !body) return jsonError('Title and notice text are required', 400);

      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty) return jsonError('Faculty profile missing', 404);

      let courseObjectId: ObjectId | null = null;
      if (courseId) {
        const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
        if (!course) return jsonError('Course not found', 404);
        if (String(course.faculty_id || '') !== String(faculty._id)) {
          return jsonError('You can publish notice only for your assigned subject', 403);
        }
        courseObjectId = course._id;
      }

      if (department && !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      const targetDepartment = department || String(faculty.department || '');

      await db.collection('notices').insertOne({
        title,
        body,
        target_roles: ['student'],
        department: targetDepartment || null,
        course_id: courseObjectId,
        created_by: user._id,
        created_by_role: user.role,
        created_at: new Date(),
        updated_at: new Date(),
      });

      return jsonOk({ message: 'Student notice published' });
    }

    if (action === 'student.submit_assignment') {
      if (user.role !== 'student') return jsonError('Forbidden', 403);
      const assignmentId = String(payload.assignment_id || '');
      const file = payload.file as { name: string; mime: string; base64: string } | undefined;
      if (!assignmentId || !file?.base64) return jsonError('Assignment and PDF file are required', 400);
      const student = await db.collection('students').findOne({ user_id: user._id });
      if (!student) return jsonError('Student profile missing', 404);
      const assignment = await db.collection('assignments').findOne({ _id: oid(assignmentId) });
      if (!assignment) return jsonError('Assignment not found', 404);
      const enrolled = await db.collection('enrollments').findOne({ student_id: student._id, course_id: assignment.course_id });
      if (!enrolled) return jsonError('Assignment is not for your enrolled subject', 403);

      const fileId = await saveFile(db, file);
      await db.collection('assignment_submissions').updateOne(
        { assignment_id: assignment._id, student_id: student._id },
        {
          $set: {
            submission_file_id: fileId,
            submitted_at: new Date(),
            updated_at: new Date(),
          },
          $setOnInsert: {
            created_at: new Date(),
          },
        },
        { upsert: true },
      );
      return jsonOk({ message: 'Assignment submitted' });
    }

    if (action === 'teacher.grade_submission') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const submissionId = String(payload.submission_id || '').trim();
      const marks = Number(payload.marks || 0);
      const maxMarks = Math.max(Number(payload.max_marks || 100), 1);
      const remarks = String(payload.remarks || '').trim();
      if (!submissionId) return jsonError('submission_id is required', 400);
      if (!Number.isFinite(marks) || marks < 0 || marks > maxMarks) {
        return jsonError('Invalid marks value', 400);
      }

      const submission = await db.collection('assignment_submissions').findOne({ _id: oid(submissionId) }).catch(() => null);
      if (!submission) return jsonError('Submission not found', 404);
      const assignment = await db.collection('assignments').findOne({ _id: submission.assignment_id });
      if (!assignment) return jsonError('Assignment not found', 404);
      const course = await db.collection('courses').findOne({ _id: assignment.course_id });
      if (!course) return jsonError('Course not found', 404);
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty || String(course.faculty_id) !== String(faculty._id)) {
        return jsonError('You can evaluate only your own subject assignments', 403);
      }

      await db.collection('assignment_submissions').updateOne(
        { _id: submission._id },
        {
          $set: {
            marks,
            max_marks: maxMarks,
            remarks,
            evaluated_by: user._id,
            evaluated_at: new Date(),
            updated_at: new Date(),
          },
        },
      );

      await db.collection('results').updateOne(
        { student_id: submission.student_id, course_id: course._id, exam_type: 'assignment' },
        {
          $set: {
            marks,
            max_marks: maxMarks,
            remarks,
            generated_by: user._id,
            generated_at: new Date(),
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true },
      );

      return jsonOk({ message: 'Assignment evaluated and marks published' });
    }

    if (action === 'teacher.publish_result') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const studentId = String(payload.student_id || '').trim();
      const courseId = String(payload.course_id || '').trim();
      const examType = String(payload.exam_type || 'final').trim().toLowerCase();
      const marks = Number(payload.marks || 0);
      const maxMarks = Math.max(Number(payload.max_marks || 100), 1);
      const remarks = String(payload.remarks || '').trim();
      if (!studentId || !courseId) return jsonError('student_id and course_id are required', 400);
      if (!['mid', 'final', 'assignment', 'practical', 'viva'].includes(examType)) {
        return jsonError('Invalid exam_type', 400);
      }
      if (!Number.isFinite(marks) || marks < 0 || marks > maxMarks) {
        return jsonError('Invalid marks value', 400);
      }

      const student = await db.collection('students').findOne({ _id: oid(studentId) }).catch(() => null);
      if (!student) return jsonError('Student not found', 404);
      const course = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
      if (!course) return jsonError('Course not found', 404);
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty || String(course.faculty_id) !== String(faculty._id)) {
        return jsonError('You can publish result only for your own subject', 403);
      }

      const enrolled = await db.collection('enrollments').findOne({ student_id: student._id, course_id: course._id });
      if (!enrolled) return jsonError('Student is not enrolled in selected course', 403);

      await db.collection('results').updateOne(
        { student_id: student._id, course_id: course._id, exam_type: examType },
        {
          $set: {
            marks,
            max_marks: maxMarks,
            remarks,
            generated_by: user._id,
            generated_at: new Date(),
            updated_at: new Date(),
          },
          $setOnInsert: {
            created_at: new Date(),
          },
        },
        { upsert: true },
      );
      return jsonOk({ message: 'Result saved' });
    }

    if (action === 'student.pay_fee') {
      if (user.role !== 'student') return jsonError('Forbidden', 403);
      const feeId = String(payload.fee_id || '');
      const student = await db.collection('students').findOne({ user_id: user._id });
      if (!student) return jsonError('Student profile missing', 404);
      const fee = await db.collection('fee_ledgers').findOne({ _id: oid(feeId), student_id: student._id });
      if (!fee) return jsonError('Fee record not found', 404);
      return jsonOk({
        message: 'Payment link ready',
        payment_link: fee.payment_link || RAZORPAY_PAYMENT_LINK,
        amount: Number(fee.amount || 0),
      });
    }

    if (action === 'student.submit_fee_declaration') {
      if (user.role !== 'student') return jsonError('Forbidden', 403);
      const feeId = String(payload.fee_id || '').trim();
      const declaredStatus = String(payload.declared_status || '').trim().toLowerCase();
      const reference = String(payload.reference || '').trim();
      const notes = String(payload.notes || '').trim();
      const paidAmountRaw = Number(payload.paid_amount || 0);
      if (!feeId) return jsonError('fee_id is required', 400);
      if (!['full', 'partial'].includes(declaredStatus)) return jsonError('declared_status must be full or partial', 400);

      const student = await db.collection('students').findOne({ user_id: user._id });
      if (!student) return jsonError('Student profile missing', 404);
      const fee = await db.collection('fee_ledgers').findOne({ _id: oid(feeId), student_id: student._id });
      if (!fee) return jsonError('Fee record not found', 404);

      const feeAmount = Number(fee.amount || 0);
      let paidAmount = paidAmountRaw;
      if (declaredStatus === 'full') {
        paidAmount = paidAmount > 0 ? paidAmount : feeAmount;
        if (feeAmount > 0 && paidAmount < feeAmount) {
          return jsonError('For full declaration, paid amount must cover total fee', 400);
        }
      }
      if (declaredStatus === 'partial') {
        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
          return jsonError('Enter valid partial payment amount', 400);
        }
        if (feeAmount > 0 && paidAmount >= feeAmount) {
          return jsonError('Partial amount must be less than total fee', 400);
        }
      }

      await db.collection('fee_ledgers').updateOne(
        { _id: fee._id },
        {
          $set: {
            status: 'payment_review',
            payment_link: fee.payment_link || RAZORPAY_PAYMENT_LINK,
            student_claim: {
              declared_status: declaredStatus,
              paid_amount: paidAmount,
              reference,
              notes,
              review_status: 'pending',
              submitted_at: new Date(),
              reviewed_at: null,
              reviewed_by: null,
              review_remarks: '',
            },
            updated_at: new Date(),
          },
        },
      );

      return jsonOk({ message: 'Payment declaration submitted for superadmin review' });
    }

    if (action === 'account.update_profile') {
      const fullName = String(payload.full_name || '').trim();
      if (fullName) {
        await db.collection('users').updateOne({ _id: user._id }, { $set: { full_name: fullName, updated_at: new Date() } });
      }

      if (user.role === 'student') {
        const updates: Record<string, unknown> = { updated_at: new Date() };
        for (const key of ['student_phone', 'parent_name', 'parent_phone', 'address_line', 'pincode', 'state', 'city']) {
          if (payload[key] !== undefined) {
            updates[key] = String(payload[key] || '').trim();
          }
        }
        await db.collection('students').updateOne({ user_id: user._id }, { $set: updates });
      }

      if (user.role === 'teacher') {
        if (payload.faculty_phone !== undefined) {
          await db.collection('faculty').updateOne(
            { user_id: user._id },
            { $set: { faculty_phone: String(payload.faculty_phone || '').trim(), updated_at: new Date() } },
          );
        }
      }

      return jsonOk({ message: 'Profile updated' });
    }

    if (action === 'account.change_password') {
      const currentPassword = String(payload.current_password || '');
      const newPassword = String(payload.new_password || '');
      if (!currentPassword || !newPassword) return jsonError('Current and new password are required', 400);
      if (!verifyPassword(currentPassword, String(user.hashed_password || ''))) {
        return jsonError('Current password is incorrect', 400);
      }
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { hashed_password: hashPassword(newPassword), updated_at: new Date() } },
      );
      await upsertCredentialVault(db, user._id, newPassword);
      return jsonOk({ message: 'Password updated' });
    }

    return jsonError('Unknown action', 400);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return jsonError('Unauthorized', 401);
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return jsonError('Forbidden', 403);
    }
    if ((error as { code?: number })?.code === 11000) {
      return jsonError('Duplicate value detected', 409);
    }
    return jsonError('Action failed', 500);
  }
}
