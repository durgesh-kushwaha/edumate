import { Binary, MongoClient, ObjectId } from 'mongodb';
import { DEPARTMENTS, DEFAULT_PASSWORD, DESIGNATION_SALARY_DEFAULTS } from './catalog';
import { hashPassword } from './auth';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'eduvision_nexus_v2';
const APP_SETUP_VERSION = 7;
const APP_SETUP_DOC_ID = 'edumate-web-setup';
const SUPERADMIN_SEED_EMAIL = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@edumate.local').trim().toLowerCase();
const SUPERADMIN_SEED_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD || DEFAULT_PASSWORD;
const SUPERADMIN_SEED_NAME = (process.env.SEED_SUPERADMIN_NAME || 'Default Superadmin').trim();
const MAX_SEMESTER_LIMIT = 20;

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
  mongoReady?: Promise<MongoClient>;
  mongoSetupDone?: boolean;
  mongoSetupReady?: Promise<void>;
};

function now() {
  return new Date();
}

export function oid(id: string, field = 'id') {
  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${field}`);
  }
  return new ObjectId(id);
}

export function toPublic<T>(value: T): unknown {
  if (value instanceof ObjectId) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Binary) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toPublic(entry));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'hashed_password' || key === 'plain_password' || key === 'raw_password') {
        continue;
      }
      if (key === '_id') {
        output.id = toPublic(raw);
        continue;
      }
      const converted = toPublic(raw);
      if (converted !== undefined) {
        output[key] = converted;
      }
    }
    return output;
  }
  return value;
}

function guessSemesterFromSubjectCode(code: string) {
  const normalized = code.toUpperCase();
  const match = normalized.match(/[A-Z]+(\d)\d{2}/);
  if (!match) {
    return 2;
  }
  const yearBucket = Number(match[1] || 1);
  return Math.min(Math.max(yearBucket * 2, 1), MAX_SEMESTER_LIMIT);
}

function maxSemesterFromYear(yearValue: unknown) {
  const year = Math.max(1, Number(yearValue || 1));
  return Math.min(Math.floor(year) * 2, MAX_SEMESTER_LIMIT);
}

const SEMESTER_SUBJECT_TEMPLATES: Record<number, string[]> = {
  1: ['Foundation Course I', 'General English', 'Environmental Studies'],
  2: ['Foundation Course II', 'Communication Skills', 'General Elective I'],
  3: ['Core Subject I', 'Core Subject II', 'Skill Development'],
  4: ['Core Subject III', 'Core Subject IV', 'General Elective II'],
  5: ['Advanced Core I', 'Elective I', 'Practical / Project I'],
  6: ['Advanced Core II', 'Elective II', 'Practical / Project II'],
  7: ['Specialization I', 'Project Phase I', 'Seminar'],
  8: ['Specialization II', 'Project Phase II', 'Professional Ethics'],
};

function generatedSemesterCourseCode(departmentCode: string, semester: number, index: number) {
  return `${departmentCode}S${semester}${String(index + 1).padStart(2, '0')}`;
}

export async function upsertCredentialVault(db: Awaited<ReturnType<typeof getDb>>, userId: ObjectId, plainPassword: string) {
  await db.collection('credential_vault').updateOne(
    { user_id: userId },
    {
      $set: {
        plain_password: plainPassword,
        updated_at: now(),
      },
      $setOnInsert: {
        created_at: now(),
      },
    },
    { upsert: true },
  );
}

async function seedCredentialVault(db: Awaited<ReturnType<typeof getDb>>, userId: ObjectId, plainPassword: string) {
  const existing = await db.collection('credential_vault').findOne({ user_id: userId });
  if (!existing) {
    await upsertCredentialVault(db, userId, plainPassword);
  }
}

async function getClient() {
  if (globalForMongo.mongoClient) {
    return globalForMongo.mongoClient;
  }
  if (!globalForMongo.mongoReady) {
    const client = new MongoClient(MONGODB_URI);
    globalForMongo.mongoReady = client.connect();
  }
  globalForMongo.mongoClient = await globalForMongo.mongoReady;
  return globalForMongo.mongoClient;
}

async function ensureIndexes() {
  const db = await getDb();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('students').createIndex({ user_id: 1 }, { unique: true }),
    db.collection('students').createIndex({ enrollment_number: 1 }, { unique: true }),
    db.collection('faculty').createIndex({ user_id: 1 }, { unique: true }),
    db.collection('faculty').createIndex({ employee_code: 1 }, { unique: true }),
    db.collection('courses').createIndex({ code: 1 }, { unique: true }),
    db.collection('enrollments').createIndex({ student_id: 1, course_id: 1 }, { unique: true }),
    db.collection('attendance').createIndex({ student_id: 1, course_id: 1, attendance_date: 1 }, { unique: true }),
    db.collection('attendance_sessions').createIndex({ course_id: 1, attendance_date: 1, is_active: 1 }),
    db.collection('fee_ledgers').createIndex({ student_id: 1, status: 1 }),
    db.collection('fee_ledgers').createIndex({ 'student_claim.review_status': 1, status: 1 }),
    db.collection('registration_requests').createIndex({ email: 1, status: 1 }),
    db.collection('salary_configs').createIndex({ designation: 1 }, { unique: true }),
    db.collection('salary_records').createIndex({ faculty_id: 1, month: 1 }, { unique: true }),
    db.collection('assignments').createIndex({ course_id: 1, created_at: -1 }),
    db.collection('assignment_submissions').createIndex({ assignment_id: 1, student_id: 1 }, { unique: true }),
    db.collection('file_blobs').createIndex({ created_at: -1 }),
    db.collection('credential_vault').createIndex({ user_id: 1 }, { unique: true }),
    db.collection('results').createIndex({ student_id: 1, course_id: 1, exam_type: 1 }, { unique: true }),
    db.collection('notices').createIndex({ created_at: -1 }),
    db.collection('notices').createIndex({ target_roles: 1, created_at: -1 }),
    db.collection('econtents').createIndex({ course_id: 1, created_at: -1 }),
    db.collection('extra_classes').createIndex({ class_date: 1, department: 1, semester: 1 }),
    db.collection('extra_classes').createIndex({ created_by: 1, class_date: -1 }),
  ]);
}

async function ensureDefaultUsersAndData() {
  const db = await getDb();

  const superadmin = await db.collection('users').findOne({ email: SUPERADMIN_SEED_EMAIL });
  let superadminId = superadmin?._id;
  if (!superadmin) {
    const inserted = await db.collection('users').insertOne({
      email: SUPERADMIN_SEED_EMAIL,
      hashed_password: hashPassword(SUPERADMIN_SEED_PASSWORD),
      role: 'superadmin',
      full_name: SUPERADMIN_SEED_NAME,
      is_active: true,
      created_at: now(),
      updated_at: now(),
    });
    superadminId = inserted.insertedId;
  } else {
    await db.collection('users').updateOne(
      { _id: superadmin._id },
      {
        $set: {
          role: 'superadmin',
          full_name: SUPERADMIN_SEED_NAME,
          hashed_password: hashPassword(SUPERADMIN_SEED_PASSWORD),
          is_active: true,
          updated_at: now(),
        },
      },
    );
    superadminId = superadmin._id;
  }
  if (superadminId) {
    await upsertCredentialVault(db, superadminId, SUPERADMIN_SEED_PASSWORD);
  }

  const admin = await db.collection('users').findOne({ email: 'admin@eduvision.com' });
  let adminId = admin?._id;
  if (!admin) {
    const inserted = await db.collection('users').insertOne({
      email: 'admin@eduvision.com',
      hashed_password: hashPassword(DEFAULT_PASSWORD),
      role: 'admin',
      full_name: 'Campus Admin',
      is_active: true,
      created_at: now(),
      updated_at: now(),
    });
    adminId = inserted.insertedId;
  }
  if (adminId) {
    await seedCredentialVault(db, adminId, DEFAULT_PASSWORD);
  }

  const sampleTeacherSeeds = [
    { email: 'teacher@eduvision.com', full_name: 'Teacher User', employee_code: 'EMP001', designation: 'Assistant Professor', faculty_phone: '9876543210' },
    { email: 'teacher2@eduvision.com', full_name: 'Aditi Sharma', employee_code: 'EMP002', designation: 'Assistant Professor', faculty_phone: '9876543211' },
    { email: 'teacher3@eduvision.com', full_name: 'Rahul Verma', employee_code: 'EMP003', designation: 'Associate Professor', faculty_phone: '9876543212' },
    { email: 'teacher4@eduvision.com', full_name: 'Neha Singh', employee_code: 'EMP004', designation: 'Lecturer', faculty_phone: '9876543213' },
  ];

  let teacherUserId: ObjectId | null = null;
  let facultyId: ObjectId | null = null;
  const cseFacultyIds: ObjectId[] = [];

  for (const [index, seed] of sampleTeacherSeeds.entries()) {
    const existingTeacherUser = await db.collection('users').findOne({ email: seed.email });
    let teacherUserRecordId = existingTeacherUser?._id || null;
    if (!existingTeacherUser) {
      const inserted = await db.collection('users').insertOne({
        email: seed.email,
        hashed_password: hashPassword(DEFAULT_PASSWORD),
        role: 'teacher',
        full_name: seed.full_name,
        is_active: true,
        created_at: now(),
        updated_at: now(),
      });
      teacherUserRecordId = inserted.insertedId;
    }

    if (!teacherUserRecordId) continue;
    await seedCredentialVault(db, teacherUserRecordId, DEFAULT_PASSWORD);

    const existingFaculty = await db.collection('faculty').findOne({ user_id: teacherUserRecordId });
    let facultyRecordId = existingFaculty?._id || null;
    if (!existingFaculty) {
      const insertedFaculty = await db.collection('faculty').insertOne({
        user_id: teacherUserRecordId,
        employee_code: seed.employee_code,
        designation: seed.designation,
        department: 'BTech - Computer Science',
        faculty_phone: seed.faculty_phone,
        created_at: now(),
        updated_at: now(),
      });
      facultyRecordId = insertedFaculty.insertedId;
    } else {
      await db.collection('faculty').updateOne(
        { _id: existingFaculty._id },
        {
          $set: {
            employee_code: seed.employee_code,
            designation: seed.designation,
            department: 'BTech - Computer Science',
            faculty_phone: seed.faculty_phone,
            updated_at: now(),
          },
        },
      );
    }

    if (facultyRecordId) {
      cseFacultyIds.push(facultyRecordId);
      if (index === 0) {
        teacherUserId = teacherUserRecordId;
        facultyId = facultyRecordId;
      }
    }
  }

  const studentUser = await db.collection('users').findOne({ email: 'student@eduvision.com' });
  let studentUserId = studentUser?._id;
  if (!studentUser) {
    const inserted = await db.collection('users').insertOne({
      email: 'student@eduvision.com',
      hashed_password: hashPassword(DEFAULT_PASSWORD),
      role: 'student',
      full_name: 'Student User',
      is_active: true,
      created_at: now(),
      updated_at: now(),
    });
    studentUserId = inserted.insertedId;
  }
  if (studentUserId) {
    await seedCredentialVault(db, studentUserId, DEFAULT_PASSWORD);
  }

  const studentDoc = await db.collection('students').findOne({ user_id: studentUserId });
  let studentId = studentDoc?._id;
  if (!studentDoc && studentUserId) {
    const inserted = await db.collection('students').insertOne({
      user_id: studentUserId,
      enrollment_number: '2026001',
      department: 'BTech - Computer Science',
      year: 2,
      gender: 'Male',
      student_phone: '9999999999',
      parent_name: 'Parent User',
      parent_phone: '8888888888',
      address_line: 'Sector 18',
      pincode: '201301',
      state: 'Uttar Pradesh',
      city: 'Noida',
      created_at: now(),
      updated_at: now(),
    });
    studentId = inserted.insertedId;
  }

  for (const entry of DESIGNATION_SALARY_DEFAULTS) {
    await db.collection('salary_configs').updateOne(
      { designation: entry.designation },
      {
        $set: { designation: entry.designation, monthly_salary: entry.monthly_salary, updated_at: now() },
        $setOnInsert: { created_at: now() },
      },
      { upsert: true },
    );
  }

  const pickCseFaculty = (semester: number, index: number) => {
    if (cseFacultyIds.length > 0) {
      return cseFacultyIds[(semester + index) % cseFacultyIds.length];
    }
    return facultyId || null;
  };

  for (const department of DEPARTMENTS) {
    await db.collection('departments').updateOne(
      { code: department.code },
      { $set: { ...department, updated_at: now() }, $setOnInsert: { created_at: now() } },
      { upsert: true },
    );

    for (const [subjectIndex, subject] of department.subjects.entries()) {
      const guessedSemester = guessSemesterFromSubjectCode(subject.code);
      const assignedFaculty = department.code === 'CSE' ? pickCseFaculty(guessedSemester, subjectIndex) : null;
      const existing = await db.collection('courses').findOne({ code: subject.code });
      if (existing) {
        const setPayload: Record<string, unknown> = {
          title: subject.name,
          department: department.name,
          semester: Number(existing.semester || guessedSemester),
          credits: Number(existing.credits || 4),
          updated_at: now(),
        };
        if (department.code === 'CSE' && assignedFaculty) {
          setPayload.faculty_id = assignedFaculty;
        }
        await db.collection('courses').updateOne(
          { _id: existing._id },
          {
            $set: setPayload,
          },
        );
      } else {
        await db.collection('courses').insertOne({
          code: subject.code,
          title: subject.name,
          department: department.name,
          semester: guessedSemester,
          credits: 4,
          faculty_id: department.code === 'CSE' && assignedFaculty ? assignedFaculty : null,
          created_at: now(),
          updated_at: now(),
        });
      }
    }

    for (const [semesterText, titles] of Object.entries(SEMESTER_SUBJECT_TEMPLATES)) {
      const semester = Number(semesterText);
      for (const [index, title] of titles.entries()) {
        const code = generatedSemesterCourseCode(department.code, semester, index);
        const assignedFaculty = department.code === 'CSE' ? pickCseFaculty(semester, index) : null;
        const setPayload: Record<string, unknown> = {
          code,
          title: `${title} (${department.code})`,
          department: department.name,
          semester,
          credits: 4,
          updated_at: now(),
        };
        if (department.code === 'CSE' && assignedFaculty) {
          setPayload.faculty_id = assignedFaculty;
        }
        await db.collection('courses').updateOne(
          { code },
          {
            $set: setPayload,
            $setOnInsert: { created_at: now() },
          },
          { upsert: true },
        );
      }
    }
  }

  const allStudents = await db.collection('students').find().toArray();
  for (const student of allStudents) {
    const maxSemester = maxSemesterFromYear(student.year);
    const departmentCourses = await db.collection('courses').find({ department: student.department, semester: { $lte: maxSemester } }).toArray();
    const allowedCourseIds = departmentCourses.map((course) => course._id);
    if (allowedCourseIds.length > 0) {
      await db.collection('enrollments').deleteMany({
        student_id: student._id,
        course_id: { $nin: allowedCourseIds },
      });
    } else {
      await db.collection('enrollments').deleteMany({ student_id: student._id });
    }
    for (const course of departmentCourses) {
      await db.collection('enrollments').updateOne(
        { student_id: student._id, course_id: course._id },
        { $setOnInsert: { created_at: now() } },
        { upsert: true },
      );
    }
  }

  for (const department of DEPARTMENTS) {
    for (let semester = 1; semester <= 8; semester += 1) {
      const semesterCourses = await db.collection('courses').find({ department: department.name, semester }).sort({ code: 1 }).limit(2).toArray();
      for (const [index, course] of semesterCourses.entries()) {
        const examType = index === 0 ? 'mid' : 'final';
        const month = String(((semester + 1) % 12) + 1).padStart(2, '0');
        const day = String(8 + index * 5).padStart(2, '0');
        await db.collection('exam_schedules').updateOne(
          { department: department.name, semester, subject_code: course.code, exam_type: examType },
          {
            $set: {
              department: department.name,
              semester,
              subject_code: course.code,
              subject_title: course.title,
              exam_date: `2026-${month}-${day}`,
              exam_time: index === 0 ? '10:00 AM - 1:00 PM' : '2:00 PM - 5:00 PM',
              exam_type: examType,
              updated_at: now(),
            },
            $setOnInsert: { created_at: now() },
          },
          { upsert: true },
        );
      }
    }
  }

  if (studentId) {
    const studentProfile = await db.collection('students').findOne({ _id: studentId });
    const departmentName = String(studentProfile?.department || 'BTech - Computer Science');
    const studentMaxSemester = maxSemesterFromYear(studentProfile?.year || 2);

    await db.collection('hall_tickets').deleteMany({ student_id: studentId, semester: { $gt: studentMaxSemester } });

    const beyondSemesterCourseIds = (
      await db.collection('courses').find({ semester: { $gt: studentMaxSemester } }, { projection: { _id: 1 } }).toArray()
    ).map((course) => course._id);
    if (beyondSemesterCourseIds.length > 0) {
      await db.collection('results').deleteMany({ student_id: studentId, course_id: { $in: beyondSemesterCourseIds } });
    }

    for (let semester = 1; semester <= studentMaxSemester; semester += 1) {
      await db.collection('hall_tickets').updateOne(
        { student_id: studentId, semester },
        {
          $set: {
            exam_session: `Semester ${semester} Examination`,
            hall_no: `H-${semester}12`,
            seat_no: '26001',
            issued_at: now(),
            updated_at: now(),
          },
          $setOnInsert: { created_at: now() },
        },
        { upsert: true },
      );
    }

    for (let semester = 1; semester <= studentMaxSemester; semester += 1) {
      const semesterCourses = await db.collection('courses').find({ department: departmentName, semester }).sort({ code: 1 }).limit(2).toArray();
      for (const [index, course] of semesterCourses.entries()) {
        const examType = index === 0 ? 'mid' : 'final';
        const marks = Math.min(92, 55 + semester * 4 + index * 3);
        await db.collection('results').updateOne(
          { student_id: studentId, course_id: course._id, exam_type: examType },
          {
            $set: {
              marks,
              max_marks: 100,
              remarks: marks >= 75 ? 'Good performance' : 'Needs consistent revision',
              generated_by: teacherUserId || adminId || null,
              generated_at: now(),
              updated_at: now(),
            },
            $setOnInsert: { created_at: now() },
          },
          { upsert: true },
        );
      }
    }
  }

  if (adminId && studentId) {
    await db.collection('fee_ledgers').updateOne(
      { student_id: studentId, title: 'Semester 4 Tuition' },
      {
        $set: {
          amount: 25000,
          due_date: '2026-03-01',
          status: 'pending',
          notes: 'Pay before exam registration',
          payment_link: 'https://razorpay.me/@zavraq',
          updated_at: now(),
        },
        $setOnInsert: { created_by: adminId, created_at: now() },
      },
      { upsert: true },
    );
  }

  if (superadminId) {
    await db.collection('notices').updateOne(
      { title: 'Welcome to EduMate', created_by_role: 'superadmin' },
      {
        $set: {
          title: 'Welcome to EduMate',
          body: 'Check your timetable, attendance, assignments and notices daily for smooth academic progress.',
          target_roles: ['student'],
          department: null,
          course_id: null,
          created_by: superadminId,
          created_by_role: 'superadmin',
          updated_at: now(),
        },
        $setOnInsert: { created_at: now() },
      },
      { upsert: true },
    );
    await db.collection('notices').updateOne(
      { title: 'Exam Preparation Advisory', created_by_role: 'superadmin' },
      {
        $set: {
          title: 'Exam Preparation Advisory',
          body: 'Prepare semester-wise and keep assignment submissions complete before exam week.',
          target_roles: ['student'],
          department: null,
          course_id: null,
          created_by: superadminId,
          created_by_role: 'superadmin',
          updated_at: now(),
        },
        $setOnInsert: { created_at: now() },
      },
      { upsert: true },
    );
  }
}

export async function getDb() {
  const client = await getClient();
  return client.db(MONGODB_DB);
}

export async function ensureDbSetup() {
  if (globalForMongo.mongoSetupDone) {
    return;
  }
  if (!globalForMongo.mongoSetupReady) {
    globalForMongo.mongoSetupReady = (async () => {
      const db = await getDb();
      const setupCollection = db.collection<{
        key: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>('app_setup');
      const state = (await setupCollection.findOne({ key: APP_SETUP_DOC_ID })) as
        | { version?: number }
        | null;
      if (Number(state?.version || 0) >= APP_SETUP_VERSION) {
        globalForMongo.mongoSetupDone = true;
        return;
      }

      await ensureIndexes();
      await ensureDefaultUsersAndData();
      await setupCollection.updateOne(
        { key: APP_SETUP_DOC_ID },
        {
          $set: { key: APP_SETUP_DOC_ID, version: APP_SETUP_VERSION, updated_at: now() },
          $setOnInsert: { created_at: now() },
        },
        { upsert: true },
      );
      globalForMongo.mongoSetupDone = true;
    })().catch((error) => {
      globalForMongo.mongoSetupReady = undefined;
      console.error('Database setup failed during ensureDbSetup', error);
      throw error;
    });
  }
  await globalForMongo.mongoSetupReady;
}
