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
const MAX_SEMESTER_LIMIT = 20;
const EXTRA_SEMESTER_TEMPLATE_TITLES = ['Core Subject I', 'Core Subject II', 'Lab / Practical'];
const DATABASE_DELETABLE_COLLECTIONS = [
  'notices',
  'results',
  'assignments',
  'econtents',
  'fee_ledgers',
  'attendance',
  'attendance_sessions',
  'exam_schedules',
  'hall_tickets',
  'salary_records',
  'salary_configs',
  'registration_requests',
  'extra_classes',
  'courses',
] as const;

type DatabaseDeletableCollection = (typeof DATABASE_DELETABLE_COLLECTIONS)[number];

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
  return Math.min(Math.max(yearBucket * 2, 1), MAX_SEMESTER_LIMIT);
}

function maxSemesterFromYear(yearValue: unknown) {
  const year = Math.max(1, Number(yearValue || 1));
  return Math.min(Math.floor(year) * 2, MAX_SEMESTER_LIMIT);
}

function normalizeYear(value: unknown, fallback = 1) {
  const year = Number(value || fallback);
  if (!Number.isFinite(year)) return fallback;
  return Math.max(1, Math.floor(year));
}

function normalizeSemester(value: unknown, fallback = 1) {
  const semester = Number(value || fallback);
  if (!Number.isFinite(semester)) return fallback;
  return Math.min(Math.max(Math.floor(semester), 1), MAX_SEMESTER_LIMIT);
}

function generatedSemesterCourseCode(departmentCode: string, semester: number, index: number) {
  return `${departmentCode}S${semester}${String(index + 1).padStart(2, '0')}`;
}

function asObjectId(value: unknown): ObjectId | null {
  return value instanceof ObjectId ? value : null;
}

function uniqueObjectIds(values: unknown[]) {
  const map = new Map<string, ObjectId>();
  for (const value of values) {
    if (value instanceof ObjectId) {
      map.set(value.toString(), value);
    }
  }
  return [...map.values()];
}

function semesterTemplateTitles(semester: number, departmentCode: string) {
  return EXTRA_SEMESTER_TEMPLATE_TITLES.map((title, index) => {
    const suffix = semester > 8 ? `(${departmentCode} Sem ${semester} - ${index + 1})` : `(${departmentCode})`;
    return `${title} ${suffix}`;
  });
}

async function deleteFileBlobsByIds(
  db: Awaited<ReturnType<typeof getDb>>,
  fileIds: ObjectId[],
) {
  if (!fileIds.length) return;
  await db.collection('file_blobs').deleteMany({ _id: { $in: fileIds } });
}

async function seedDepartmentSemesterCourses(
  db: Awaited<ReturnType<typeof getDb>>,
  departmentName: string,
  departmentCode: string,
  semester: number,
) {
  const titles = semesterTemplateTitles(semester, departmentCode);
  const courseIds: ObjectId[] = [];
  for (const [index, title] of titles.entries()) {
    const code = generatedSemesterCourseCode(departmentCode, semester, index);
    await db.collection('courses').updateOne(
      { code },
      {
        $set: {
          code,
          title,
          department: departmentName,
          semester,
          credits: 4,
          updated_at: new Date(),
        },
        $setOnInsert: {
          faculty_id: null,
          created_at: new Date(),
        },
      },
      { upsert: true },
    );
    const course = await db.collection('courses').findOne({ code });
    if (course?._id instanceof ObjectId) {
      courseIds.push(course._id);
    }
  }
  return courseIds;
}

async function createExamSchedulesForSemester(
  db: Awaited<ReturnType<typeof getDb>>,
  departmentName: string,
  semester: number,
  courseIds: ObjectId[],
) {
  if (!courseIds.length) return;
  const courses = await db.collection('courses').find({ _id: { $in: courseIds } }).sort({ code: 1 }).limit(2).toArray();
  for (const [index, course] of courses.entries()) {
    const examType = index === 0 ? 'mid' : 'final';
    const month = String(((semester + 1) % 12) + 1).padStart(2, '0');
    const day = String(10 + index * 5).padStart(2, '0');
    await db.collection('exam_schedules').updateOne(
      { department: departmentName, semester, subject_code: course.code, exam_type: examType },
      {
        $set: {
          department: departmentName,
          semester,
          subject_code: course.code,
          subject_title: course.title,
          exam_date: `2026-${month}-${day}`,
          exam_time: index === 0 ? '10:00 AM - 1:00 PM' : '2:00 PM - 5:00 PM',
          exam_type: examType,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );
  }
}

async function deleteStudentCascade(
  db: Awaited<ReturnType<typeof getDb>>,
  student: Record<string, unknown>,
) {
  const studentId = asObjectId(student._id);
  const studentUserId = asObjectId(student.user_id);
  if (!studentId || !studentUserId) {
    throw new Error('Student account link is broken');
  }

  const submissions = await db.collection('assignment_submissions').find({ student_id: studentId }).toArray();
  const submissionFileIds = uniqueObjectIds(submissions.map((entry) => entry.submission_file_id));

  await Promise.all([
    db.collection('students').deleteOne({ _id: studentId }),
    db.collection('users').deleteOne({ _id: studentUserId, role: 'student' }),
    db.collection('enrollments').deleteMany({ student_id: studentId }),
    db.collection('attendance').deleteMany({ student_id: studentId }),
    db.collection('fee_ledgers').deleteMany({ student_id: studentId }),
    db.collection('hall_tickets').deleteMany({ student_id: studentId }),
    db.collection('results').deleteMany({ student_id: studentId }),
    db.collection('face_profiles').deleteMany({ student_id: studentId }),
    db.collection('assignment_submissions').deleteMany({ student_id: studentId }),
    db.collection('credential_vault').deleteOne({ user_id: studentUserId }),
    db.collection('registration_requests').deleteMany({
      $or: [{ approved_user_id: studentUserId }, { approved_student_id: studentId }],
    }),
  ]);

  await deleteFileBlobsByIds(db, submissionFileIds);
}

async function deleteFacultyCascade(
  db: Awaited<ReturnType<typeof getDb>>,
  faculty: Record<string, unknown>,
) {
  const facultyId = asObjectId(faculty._id);
  const facultyUserId = asObjectId(faculty.user_id);
  if (!facultyId || !facultyUserId) {
    throw new Error('Faculty account link is broken');
  }

  const facultyCourses = await db.collection('courses').find({ faculty_id: facultyId }).toArray();
  const facultyCourseIds = uniqueObjectIds(facultyCourses.map((course) => course._id));
  const assignmentQuery =
    facultyCourseIds.length > 0
      ? { $or: [{ teacher_user_id: facultyUserId }, { course_id: { $in: facultyCourseIds } }] }
      : { teacher_user_id: facultyUserId };
  const assignmentRows = await db.collection('assignments').find(assignmentQuery).toArray();
  const assignmentIds = uniqueObjectIds(assignmentRows.map((row) => row._id));
  const assignmentFileIds = uniqueObjectIds(assignmentRows.map((row) => row.attachment_file_id));
  const submissionRows = assignmentIds.length ? await db.collection('assignment_submissions').find({ assignment_id: { $in: assignmentIds } }).toArray() : [];
  const submissionFileIds = uniqueObjectIds(submissionRows.map((row) => row.submission_file_id));
  const econtentRows = await db
    .collection('econtents')
    .find({
      $or: [{ teacher_user_id: facultyUserId }, { teacher_faculty_id: facultyId }],
    })
    .toArray();
  const econtentFileIds = uniqueObjectIds(econtentRows.map((row) => row.attachment_file_id));
  const allFileIds = uniqueObjectIds([...assignmentFileIds, ...submissionFileIds, ...econtentFileIds]);

  await Promise.all([
    db.collection('courses').updateMany(
      { faculty_id: facultyId },
      { $set: { faculty_id: null, updated_at: new Date() } },
    ),
    db.collection('attendance_sessions').deleteMany({ started_by: facultyUserId }),
    db.collection('attendance').deleteMany({ marked_by: facultyUserId }),
    db.collection('assignments').deleteMany(assignmentIds.length ? { _id: { $in: assignmentIds } } : { _id: { $in: [] } }),
    db.collection('assignment_submissions').deleteMany(assignmentIds.length ? { assignment_id: { $in: assignmentIds } } : { _id: { $in: [] } }),
    db.collection('econtents').deleteMany({
      $or: [{ teacher_user_id: facultyUserId }, { teacher_faculty_id: facultyId }],
    }),
    db.collection('notices').deleteMany({ created_by: facultyUserId, created_by_role: 'teacher' }),
    db.collection('results').deleteMany({ generated_by: facultyUserId }),
    db.collection('extra_classes').deleteMany({
      $or: [{ created_by: facultyUserId }, { created_by_faculty_id: facultyId }],
    }),
    db.collection('salary_records').deleteMany({ faculty_id: facultyId }),
    db.collection('faculty').deleteOne({ _id: facultyId }),
    db.collection('users').deleteOne({ _id: facultyUserId, role: 'teacher' }),
    db.collection('credential_vault').deleteOne({ user_id: facultyUserId }),
  ]);

  await deleteFileBlobsByIds(db, allFileIds);
}

async function deleteDatabaseRecord(
  db: Awaited<ReturnType<typeof getDb>>,
  collectionName: DatabaseDeletableCollection,
  recordId: string,
) {
  const targetId = oid(recordId, 'record_id');

  if (collectionName === 'assignments') {
    const assignment = await db.collection('assignments').findOne({ _id: targetId });
    if (!assignment) return false;
    const submissions = await db.collection('assignment_submissions').find({ assignment_id: targetId }).toArray();
    const submissionFileIds = uniqueObjectIds(submissions.map((entry) => entry.submission_file_id));
    const assignmentFileIds = uniqueObjectIds([assignment.attachment_file_id]);
    await Promise.all([
      db.collection('assignment_submissions').deleteMany({ assignment_id: targetId }),
      db.collection('assignments').deleteOne({ _id: targetId }),
    ]);
    await deleteFileBlobsByIds(db, uniqueObjectIds([...assignmentFileIds, ...submissionFileIds]));
    return true;
  }

  if (collectionName === 'econtents') {
    const econtent = await db.collection('econtents').findOne({ _id: targetId });
    if (!econtent) return false;
    const fileIds = uniqueObjectIds([econtent.attachment_file_id]);
    await db.collection('econtents').deleteOne({ _id: targetId });
    await deleteFileBlobsByIds(db, fileIds);
    return true;
  }

  if (collectionName === 'courses') {
    const course = await db.collection('courses').findOne({ _id: targetId });
    if (!course) return false;

    const assignments = await db.collection('assignments').find({ course_id: targetId }).toArray();
    const assignmentIds = uniqueObjectIds(assignments.map((item) => item._id));
    const assignmentFileIds = uniqueObjectIds(assignments.map((item) => item.attachment_file_id));
    const submissions = assignmentIds.length ? await db.collection('assignment_submissions').find({ assignment_id: { $in: assignmentIds } }).toArray() : [];
    const submissionFileIds = uniqueObjectIds(submissions.map((entry) => entry.submission_file_id));
    const econtents = await db.collection('econtents').find({ course_id: targetId }).toArray();
    const econtentFileIds = uniqueObjectIds(econtents.map((item) => item.attachment_file_id));

    await Promise.all([
      db.collection('enrollments').deleteMany({ course_id: targetId }),
      db.collection('attendance').deleteMany({ course_id: targetId }),
      db.collection('attendance_sessions').deleteMany({ course_id: targetId }),
      db.collection('results').deleteMany({ course_id: targetId }),
      db.collection('assignments').deleteMany({ course_id: targetId }),
      db.collection('assignment_submissions').deleteMany(assignmentIds.length ? { assignment_id: { $in: assignmentIds } } : { _id: { $in: [] } }),
      db.collection('econtents').deleteMany({ course_id: targetId }),
      db.collection('extra_classes').deleteMany({ course_id: targetId }),
      db.collection('exam_schedules').deleteMany({
        department: String(course.department || ''),
        semester: Number(course.semester || 0),
        subject_code: String(course.code || ''),
      }),
      db.collection('courses').deleteOne({ _id: targetId }),
    ]);
    await deleteFileBlobsByIds(db, uniqueObjectIds([...assignmentFileIds, ...submissionFileIds, ...econtentFileIds]));
    return true;
  }

  const deleted = await db.collection(collectionName).deleteOne({ _id: targetId });
  return deleted.deletedCount > 0;
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
      const year = normalizeYear(payload.year, 1);
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
      const year = normalizeYear(payload.year, 1);
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
      if (!asObjectId(student.user_id)) return jsonError('Student account link is broken', 400);
      await deleteStudentCascade(db, student);
      return jsonOk({ message: 'Student and all linked data deleted' });
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
      if (!asObjectId(faculty.user_id)) return jsonError('Faculty account link is broken', 400);
      await deleteFacultyCascade(db, faculty);
      return jsonOk({ message: 'Faculty and all linked data deleted' });
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

    if (action === 'superadmin.add_department_semester') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const departmentName = String(payload.department || '').trim();
      const targetYear = normalizeYear(payload.year, 1);
      const semester = normalizeSemester(payload.semester, targetYear * 2);
      const section = String(payload.section || 'A').trim().toUpperCase() || 'A';
      const roomNumber = String(payload.room_number || '').trim();

      if (!departmentName) return jsonError('department is required', 400);
      if (!isDepartmentAllowed(departmentName)) return jsonError('Select a valid department', 400);

      const departmentDoc = await db.collection('departments').findOne({ name: departmentName }).catch(() => null);
      if (!departmentDoc) return jsonError('Department not found', 404);
      const departmentCode = String(departmentDoc.code || '').trim().toUpperCase();
      if (!departmentCode) return jsonError('Department code is missing', 400);

      const classEntry = {
        semester,
        section,
        room: roomNumber || `${departmentCode}-${String(semester).padStart(2, '0')}01`,
      };

      await db.collection('departments').updateOne(
        { _id: departmentDoc._id },
        { $pull: { classes: { semester, section } } } as any,
      );
      await db.collection('departments').updateOne(
        { _id: departmentDoc._id },
        ({
          $push: { classes: classEntry },
          $set: { updated_at: new Date() },
        } as any),
      );

      const courseIds = await seedDepartmentSemesterCourses(db, departmentName, departmentCode, semester);
      await createExamSchedulesForSemester(db, departmentName, semester, courseIds);

      const students = await db.collection('students').find({ department: departmentName }).toArray();
      let studentsMatched = 0;
      let enrollmentsCreated = 0;
      for (const student of students) {
        if (maxSemesterFromYear(student.year) < semester) continue;
        studentsMatched += 1;
        for (const courseId of courseIds) {
          const result = await db.collection('enrollments').updateOne(
            { student_id: student._id, course_id: courseId },
            { $setOnInsert: { created_at: new Date() } },
            { upsert: true },
          );
          if (result.upsertedCount > 0) enrollmentsCreated += 1;
        }
      }

      return jsonOk({
        message: `Semester ${semester} added for ${departmentCode}. Courses synced and ${enrollmentsCreated} enrollment(s) created.`,
        semester,
        department: departmentName,
        year: targetYear,
        students_matched: studentsMatched,
        enrollments_created: enrollmentsCreated,
      });
    }

    if (action === 'superadmin.database_delete') {
      if (user.role !== 'superadmin') return jsonError('Forbidden', 403);
      const collectionRaw = String(payload.collection || '').trim();
      const recordId = String(payload.record_id || '').trim();
      if (!collectionRaw || !recordId) return jsonError('collection and record_id are required', 400);
      const collection = DATABASE_DELETABLE_COLLECTIONS.find((entry) => entry === collectionRaw);
      if (!collection) {
        return jsonError('Collection is not allowed for database delete', 400);
      }
      const deleted = await deleteDatabaseRecord(db, collection, recordId).catch(() => false);
      if (!deleted) return jsonError('Record not found', 404);
      return jsonOk({ message: `Record deleted from ${collection}` });
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
      const semester = normalizeSemester(payload.semester, 1);
      const creditsRaw = Number(payload.credits || 4);
      if (!code || !title) return jsonError('Code and title are required', 400);
      if (department && !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      if (!Number.isFinite(creditsRaw) || creditsRaw <= 0) return jsonError('Credits must be a positive number', 400);
      const credits = Math.max(1, Math.floor(creditsRaw));

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
      const semester = normalizeSemester(payload.semester, 1);
      const creditsRaw = Number(payload.credits || 4);
      if (!code || !title) return jsonError('Code and title are required', 400);
      if (!Number.isFinite(creditsRaw) || creditsRaw <= 0) return jsonError('Credits must be a positive number', 400);
      const credits = Math.max(1, Math.floor(creditsRaw));

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

    if (action === 'teacher.create_extra_class') {
      if (user.role !== 'teacher') return jsonError('Forbidden', 403);
      const faculty = await db.collection('faculty').findOne({ user_id: user._id });
      if (!faculty) return jsonError('Faculty profile missing', 404);

      const courseId = String(payload.course_id || '').trim();
      const classDate = String(payload.class_date || new Date().toISOString().slice(0, 10)).trim();
      const classTime = String(payload.class_time || '').trim();
      const section = String(payload.section || 'A').trim().toUpperCase() || 'A';
      const roomNumber = String(payload.room_number || '').trim();
      const note = String(payload.note || '').trim();
      const departmentRaw = String(payload.department || '').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) return jsonError('class_date must be YYYY-MM-DD', 400);
      if (!classTime) return jsonError('class_time is required', 400);

      let mappedCourse: Record<string, unknown> | null = null;
      if (courseId) {
        mappedCourse = await db.collection('courses').findOne({ _id: oid(courseId) }).catch(() => null);
        if (!mappedCourse) return jsonError('Course not found', 404);
        if (String(mappedCourse.faculty_id || '') !== String(faculty._id)) {
          return jsonError('You can create extra class only for your assigned subject', 403);
        }
      }

      const department = departmentRaw || String(mappedCourse?.department || '');
      if (!department || !isDepartmentAllowed(department)) return jsonError('Select a valid department', 400);
      const semester = normalizeSemester(payload.semester, Number(mappedCourse?.semester || 1));

      const courseCode = String(payload.course_code || mappedCourse?.code || '').trim().toUpperCase();
      const courseTitle = String(payload.course_title || mappedCourse?.title || '').trim();
      if (!courseCode || !courseTitle) {
        return jsonError('Provide course subject details for extra class', 400);
      }

      const room = roomNumber || `${String(department).slice(0, 3).toUpperCase()}-${String(semester).padStart(2, '0')}X`;
      await db.collection('extra_classes').insertOne({
        course_id: mappedCourse?._id instanceof ObjectId ? mappedCourse._id : null,
        department,
        semester,
        section,
        room_number: room,
        class_date: classDate,
        class_time: classTime,
        course_code: courseCode,
        course_title: courseTitle,
        note: note || null,
        created_by: user._id,
        created_by_faculty_id: faculty._id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      return jsonOk({ message: 'Extra class created and added to daily schedule' });
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
