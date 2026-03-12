import { ObjectId } from 'mongodb';
import { adminStats, listCourses, listFaculty, listFees, listStudents } from '@/lib/state';
import { ensureDbSetup, getDb, oid, toPublic } from '@/lib/db';
import { jsonError, jsonOk, requireUser, safeUser } from '@/lib/http';

const MAX_SEMESTER_LIMIT = 20;

function asObjectId(value: unknown): ObjectId | null {
  return value instanceof ObjectId ? value : null;
}

function todayDayName() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function classTimeSortKey(raw: unknown) {
  const input = String(raw || '').trim();
  const match = input.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1] || 0);
  const minute = Number(match[2] || 0);
  const meridian = String(match[3] || '').toUpperCase();
  if (meridian === 'PM' && hour < 12) hour += 12;
  if (meridian === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function parseTimetableSlot(raw: unknown) {
  const slot = String(raw || '').trim();
  const timeMatch = slot.match(/\b\d{1,2}:\d{2}\b/);
  const codeMatch = slot.toUpperCase().match(/[A-Z]{2,}\d{3}/);
  return {
    slot,
    class_time: timeMatch ? timeMatch[0] : '',
    course_code: codeMatch ? codeMatch[0] : '',
  };
}

function matchesTimetableCode(courseCode: unknown, timetableCode: string) {
  const source = String(courseCode || '').trim().toUpperCase();
  if (!source || !timetableCode) return false;
  return source === timetableCode || source.startsWith(`${timetableCode}-`);
}

export async function GET() {
  try {
    await ensureDbSetup();
    const user = await requireUser();
    const db = await getDb();

    const departments = (await db.collection('departments').find().sort({ code: 1 }).toArray()).map((item) => toPublic(item));

    if (user.role === 'superadmin' || user.role === 'admin') {
      const [stats, students, faculty, courses, fees, notices] = await Promise.all([
        adminStats(db),
        listStudents(db),
        listFaculty(db),
        listCourses(db),
        listFees(db),
        db
          .collection('notices')
          .find(
            user.role === 'superadmin'
              ? {}
              : {
                  $or: [{ target_roles: 'all' }, { target_roles: 'admin' }],
                },
          )
          .sort({ created_at: -1 })
          .limit(100)
          .toArray(),
      ]);

      const payload: Record<string, unknown> = {
        user: safeUser(user),
        role: user.role,
        departments,
        stats,
        students,
        faculty,
        courses,
        fees,
        notices: notices.map((item) => toPublic(item)),
      };

      if (user.role === 'superadmin') {
        const [
          superadmins,
          registrationRequests,
          salaryConfigs,
          salaryRecords,
          credentialRows,
          dbNotices,
          dbResults,
          dbAssignments,
          dbEcontents,
          dbExamSchedules,
          dbExtraClasses,
        ] = await Promise.all([
          db.collection('users').find({ role: 'superadmin', is_active: true }).sort({ created_at: -1 }).toArray(),
          db.collection('registration_requests').find({ status: 'pending' }).sort({ submitted_at: -1 }).toArray(),
          db.collection('salary_configs').find().sort({ designation: 1 }).toArray(),
          db.collection('salary_records').find().sort({ created_at: -1 }).limit(30).toArray(),
          db.collection('credential_vault').find().toArray(),
          db.collection('notices').find().sort({ created_at: -1 }).limit(120).toArray(),
          db.collection('results').find().sort({ updated_at: -1 }).limit(120).toArray(),
          db.collection('assignments').find().sort({ created_at: -1 }).limit(120).toArray(),
          db.collection('econtents').find().sort({ created_at: -1 }).limit(120).toArray(),
          db.collection('exam_schedules').find().sort({ exam_date: -1 }).limit(120).toArray(),
          db.collection('extra_classes').find().sort({ class_date: -1, class_time: -1 }).limit(120).toArray(),
        ]);

        const salaryFacultyIds = Array.from(
          new Set(
            salaryRecords
              .map((record) => asObjectId(record.faculty_id))
              .filter((value): value is ObjectId => value instanceof ObjectId)
              .map((value) => value.toString()),
          ),
        ).map((value) => oid(value));
        const salaryFacultyRows = salaryFacultyIds.length
          ? await db.collection('faculty').find({ _id: { $in: salaryFacultyIds } }).toArray()
          : [];
        const salaryFacultyUserIds = Array.from(
          new Set(
            salaryFacultyRows
              .map((row) => asObjectId(row.user_id))
              .filter((value): value is ObjectId => value instanceof ObjectId)
              .map((value) => value.toString()),
          ),
        ).map((value) => oid(value));
        const salaryFacultyUserRows = salaryFacultyUserIds.length
          ? await db.collection('users').find({ _id: { $in: salaryFacultyUserIds } }).toArray()
          : [];
        const salaryFacultyById = new Map(salaryFacultyRows.map((row) => [String(row._id), row]));
        const salaryFacultyUserById = new Map(salaryFacultyUserRows.map((row) => [String(row._id), row]));
        const enrichedSalaryRecords: Record<string, unknown>[] = salaryRecords.map((record) => {
          const facultyDoc = salaryFacultyById.get(String(record.faculty_id || ''));
          const facultyUser = facultyDoc ? salaryFacultyUserById.get(String(facultyDoc.user_id || '')) : null;
          return {
            ...(toPublic(record) as Record<string, unknown>),
            faculty_name: facultyUser?.full_name || '',
            employee_code: facultyDoc?.employee_code || '',
          };
        });

        payload.superadmins = superadmins.map((item) => toPublic(item));
        payload.registration_requests = registrationRequests.map((item) => toPublic(item));
        payload.salary_configs = salaryConfigs.map((item) => toPublic(item));
        payload.salary_records = enrichedSalaryRecords;
        payload.user_passwords = credentialRows.reduce(
          (acc, row) => {
            if (row.user_id instanceof ObjectId) {
              acc[row.user_id.toString()] = String(row.plain_password || '');
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        payload.database_records = {
          notices: dbNotices.map((item) => toPublic(item)),
          results: dbResults.map((item) => toPublic(item)),
          assignments: dbAssignments.map((item) => toPublic(item)),
          econtents: dbEcontents.map((item) => toPublic(item)),
          exam_schedules: dbExamSchedules.map((item) => toPublic(item)),
          extra_classes: dbExtraClasses.map((item) => toPublic(item)),
        };
      }

      return jsonOk(payload);
    }

    if (user.role === 'teacher') {
      const faculty = await db.collection('faculty').findOne({ user_id: oid(user._id.toString()) });
      if (!faculty) {
        return jsonError('Faculty profile not found', 404);
      }

      const courses = await db.collection('courses').find({ faculty_id: faculty._id }).sort({ semester: 1 }).toArray();
      const courseIds = courses.map((item) => item._id);

      // Parallel batch: all queries that depend only on courseIds/faculty/user
      const [assignments, econtents, notices, facultyDepartmentDoc, teacherExtraClassRows, activeSessions, enrollmentRows, results] = await Promise.all([
        db.collection('assignments').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray(),
        courseIds.length ? db.collection('econtents').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray() : Promise.resolve([]),
        db.collection('notices').find({ $or: [{ target_roles: 'all' }, { target_roles: 'teacher' }, { created_by: user._id }] }).sort({ created_at: -1 }).limit(100).toArray(),
        db.collection('departments').findOne({ name: String(faculty.department || '') }) as Promise<Record<string, unknown> | null>,
        db.collection('extra_classes').find({ created_by: user._id }).sort({ class_date: 1, class_time: 1 }).limit(120).toArray(),
        db.collection('attendance_sessions').find({ is_active: true }).sort({ started_at: -1 }).toArray(),
        db.collection('enrollments').find({ course_id: { $in: courseIds } }).toArray(),
        courseIds.length ? db.collection('results').find({ course_id: { $in: courseIds } }).sort({ updated_at: -1 }).toArray() : Promise.resolve([]),
      ]);

      const facultyDepartmentTimetable = Array.isArray(facultyDepartmentDoc?.timetable)
        ? (facultyDepartmentDoc.timetable as Array<Record<string, unknown>>)
        : [];
      const facultyDepartmentClasses = Array.isArray(facultyDepartmentDoc?.classes)
        ? (facultyDepartmentDoc.classes as Array<Record<string, unknown>>)
        : [];
      const teacherTodayName = todayDayName();
      const teacherTodayDate = todayDateKey();
      const teacherTodaySchedule = facultyDepartmentTimetable.find(
        (entry) => String(entry?.day || '').trim().toLowerCase() === teacherTodayName.toLowerCase(),
      );
      const teacherTodaySlots = Array.isArray(teacherTodaySchedule?.slots) ? (teacherTodaySchedule.slots as unknown[]) : [];
      const teacherRegularClasses = teacherTodaySlots
        .map((slotValue) => {
          const parsedSlot = parseTimetableSlot(slotValue);
          if (!parsedSlot.course_code) return null;
          const mappedCourse = courses.find((course) => matchesTimetableCode(course.code, parsedSlot.course_code));
          if (!mappedCourse) return null;
          const classInfo = facultyDepartmentClasses.find(
            (entry) => Number(entry?.semester || 0) === Number(mappedCourse.semester || 0),
          );
          return {
            day: teacherTodayName,
            slot: parsedSlot.slot,
            class_time: parsedSlot.class_time || parsedSlot.slot,
            course_id: mappedCourse._id.toString(),
            course_code: mappedCourse.code,
            course_title: mappedCourse.title,
            semester: Number(mappedCourse.semester || 0),
            section: String(classInfo?.section || 'A'),
            room_number: String(classInfo?.room || '-'),
            class_type: 'regular',
          };
        })
        .filter((entry) => entry !== null) as Array<Record<string, unknown>>;
      const teacherTodayExtraClasses = teacherExtraClassRows
        .filter((entry) => String(entry.class_date || '') === teacherTodayDate)
        .map((entry) => ({
          id: String(entry._id),
          day: teacherTodayName,
          slot: `${String(entry.class_time || '')} ${String(entry.course_code || '').trim()}`.trim(),
          class_time: String(entry.class_time || '-'),
          course_id: entry.course_id instanceof ObjectId ? entry.course_id.toString() : '',
          course_code: String(entry.course_code || ''),
          course_title: String(entry.course_title || ''),
          semester: Number(entry.semester || 0),
          section: String(entry.section || 'A'),
          room_number: String(entry.room_number || '-'),
          class_type: 'extra',
          note: String(entry.note || ''),
          department: String(entry.department || ''),
          class_date: String(entry.class_date || ''),
        }));
      const teacherTodayClasses = [...teacherRegularClasses, ...teacherTodayExtraClasses].sort(
        (a, b) => classTimeSortKey(a.class_time) - classTimeSortKey(b.class_time),
      );

      // Parallel batch 2: queries depending on batch 1 results
      const studentIds = enrollmentRows
        .map((item) => item.student_id)
        .filter((value) => value instanceof ObjectId) as ObjectId[];
      const [students, submissions] = await Promise.all([
        studentIds.length ? db.collection('students').find({ _id: { $in: studentIds } }).toArray() : Promise.resolve([]),
        assignments.length ? db.collection('assignment_submissions').find({ assignment_id: { $in: assignments.map((item) => item._id) } }).sort({ submitted_at: -1 }).toArray() : Promise.resolve([]),
      ]);
      const studentUserIds = students
        .map((item) => item.user_id)
        .filter((value) => value instanceof ObjectId) as ObjectId[];
      const studentUsers = studentUserIds.length ? await db.collection('users').find({ _id: { $in: studentUserIds } }).toArray() : [];

      const courseById = new Map(courses.map((c) => [String(c._id), c]));
      const studentById = new Map(students.map((s) => [String(s._id), s]));
      const studentUserById = new Map(studentUsers.map((u) => [String(u._id), u]));
      const assignmentById = new Map(assignments.map((a) => [String(a._id), a]));

      const assignmentsWithCourse = assignments.map((assignment) => {
        const course = courseById.get(String(assignment.course_id));
        return {
          ...(toPublic(assignment) as Record<string, unknown>),
          course_code: course?.code || '',
          course_title: course?.title || '',
        };
      });

      const econtentWithCourse = econtents.map((entry) => {
        const course = courseById.get(String(entry.course_id));
        return {
          ...(toPublic(entry) as Record<string, unknown>),
          course_code: course?.code || '',
          course_title: course?.title || '',
        };
      });

      const courseIdSet = new Set(courses.map((c) => String(c._id)));
      const sessions = activeSessions
        .filter((session) => courseIdSet.has(String(session.course_id)))
        .map((session) => {
          const course = courseById.get(String(session.course_id));
          return {
            ...(toPublic(session) as Record<string, unknown>),
            course_code: course?.code || '',
            course_title: course?.title || '',
          };
        });

      const courseStudents = enrollmentRows.map((entry) => {
        const course = courseById.get(String(entry.course_id));
        const student = studentById.get(String(entry.student_id));
        const studentUser = student ? studentUserById.get(String(student.user_id)) : null;
        return {
          id: `${String(entry.course_id)}:${String(entry.student_id)}`,
          course_id: String(entry.course_id),
          course_code: course?.code || '',
          course_title: course?.title || '',
          student_id: String(entry.student_id),
          student_name: studentUser?.full_name || 'Unknown',
          enrollment_number: student?.enrollment_number || '',
          department: student?.department || '',
        };
      });

      const enrichedSubmissions = submissions.map((submission) => {
        const assignment = assignmentById.get(String(submission.assignment_id));
        const course = assignment ? courseById.get(String(assignment.course_id)) : null;
        const student = studentById.get(String(submission.student_id));
        const studentUser = student ? studentUserById.get(String(student.user_id)) : null;
        return {
          ...(toPublic(submission) as Record<string, unknown>),
          assignment_title: assignment?.title || '',
          course_id: assignment?.course_id ? String(assignment.course_id) : '',
          course_code: course?.code || '',
          course_title: course?.title || '',
          student_name: studentUser?.full_name || '',
          enrollment_number: student?.enrollment_number || '',
        };
      });

      const enrichedResults = results.map((result) => {
        const course = courseById.get(String(result.course_id));
        const student = studentById.get(String(result.student_id));
        const studentUser = student ? studentUserById.get(String(student.user_id)) : null;
        return {
          ...(toPublic(result) as Record<string, unknown>),
          course_code: course?.code || '',
          course_title: course?.title || '',
          student_name: studentUser?.full_name || '',
          enrollment_number: student?.enrollment_number || '',
        };
      });

      return jsonOk({
        user: safeUser(user),
        role: 'teacher',
        departments,
        faculty: toPublic(faculty),
        today_day: teacherTodayName,
        today_classes: teacherTodayClasses,
        extra_classes: teacherExtraClassRows.map((entry) => toPublic(entry)),
        courses: courses.map((item) => toPublic(item)),
        assignments: assignmentsWithCourse,
        econtents: econtentWithCourse,
        active_sessions: sessions,
        course_students: courseStudents,
        submissions: enrichedSubmissions,
        results: enrichedResults,
        notices: notices.map((item) => toPublic(item)),
      });
    }

    const student = await db.collection('students').findOne({ user_id: oid(user._id.toString()) });
    if (!student) {
      return jsonError('Student profile not found', 404);
    }

    const enrollments = await db.collection('enrollments').find({ student_id: student._id }).toArray();
    const courseIds = enrollments.map((item) => item.course_id).filter((value) => value instanceof ObjectId) as ObjectId[];

    const [courses, attendanceHistory, fees, activeSessions, econtentRows, noticeRows] = await Promise.all([
      db.collection('courses').find({ _id: { $in: courseIds } }).toArray(),
      db.collection('attendance').find({ student_id: student._id }).sort({ attendance_date: -1 }).toArray(),
      db.collection('fee_ledgers').find({ student_id: student._id }).sort({ due_date: 1 }).toArray(),
      db.collection('attendance_sessions').find({ is_active: true, allow_student_mark: true, course_id: { $in: courseIds } }).toArray(),
      courseIds.length
        ? db.collection('econtents').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray()
        : Promise.resolve([]),
      db.collection('notices').find({ $or: [{ target_roles: 'all' }, { target_roles: 'student' }] }).sort({ created_at: -1 }).limit(150).toArray(),
    ]);

    const courseMap = new Map(courses.map((c) => [String(c._id), c]));

    const attendanceHistoryPayload = attendanceHistory.map((record) => {
      const course = courseMap.get(String(record.course_id));
      return {
        ...(toPublic(record) as Record<string, unknown>),
        course_code: course?.code || '',
        course_title: course?.title || '',
      };
    });

    const uniqueDays = new Set(attendanceHistory.map((item) => String(item.attendance_date))).size;
    const presentCount = attendanceHistory.filter((item) => item.status === 'present').length;
    const totalTrackedRecords = attendanceHistory.length;

    const pendingFeeTotal = fees
      .filter((item) => String(item.status || 'pending') !== 'paid')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const activeSessionsPayload = activeSessions.map((session) => {
      const course = courseMap.get(String(session.course_id));
      return {
        ...(toPublic(session) as Record<string, unknown>),
        course_code: course?.code || '',
        course_title: course?.title || '',
      };
    });

    const courseIdSet = new Set(courseIds.map((item) => item.toString()));
    const notices = noticeRows
      .filter((notice) => {
        const noticeDepartment = String(notice.department || '');
        if (noticeDepartment && noticeDepartment !== String(student.department || '')) {
          return false;
        }
        const noticeCourseId = notice.course_id instanceof ObjectId ? notice.course_id.toString() : '';
        if (noticeCourseId && !courseIdSet.has(noticeCourseId)) {
          return false;
        }
        return true;
      })
      .map((notice) => toPublic(notice));

    const rawDepartmentDoc = (await db.collection('departments').findOne({
      name: String(student.department || ''),
    })) as Record<string, unknown> | null;
    const studentTimetable = Array.isArray(rawDepartmentDoc?.timetable)
      ? (rawDepartmentDoc.timetable as Array<Record<string, unknown>>)
      : [];
    const departmentClasses = Array.isArray(rawDepartmentDoc?.classes)
      ? (rawDepartmentDoc.classes as Array<Record<string, unknown>>)
      : [];

    const facultyIds = Array.from(
      new Set(
        courses
          .map((course) => asObjectId(course.faculty_id))
          .filter((value): value is ObjectId => value instanceof ObjectId)
          .map((value) => value.toString()),
      ),
    ).map((value) => oid(value));
    const [facultyRows, assignmentRows] = await Promise.all([
      facultyIds.length ? db.collection('faculty').find({ _id: { $in: facultyIds } }).toArray() : Promise.resolve([]),
      courseIds.length ? db.collection('assignments').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray() : Promise.resolve([]),
    ]);
    const facultyUserIds = Array.from(
      new Set(
        facultyRows
          .map((row) => asObjectId(row.user_id))
          .filter((value): value is ObjectId => value instanceof ObjectId)
          .map((value) => value.toString()),
      ),
    ).map((value) => oid(value));
    const assignmentIds = assignmentRows.map((item) => item._id);
    const [facultyUsers, submissionRows] = await Promise.all([
      facultyUserIds.length ? db.collection('users').find({ _id: { $in: facultyUserIds } }).toArray() : Promise.resolve([]),
      assignmentIds.length
        ? db.collection('assignment_submissions').find({ assignment_id: { $in: assignmentIds }, student_id: student._id }).toArray()
        : Promise.resolve([]),
    ]);
    const facultyById = new Map(facultyRows.map((row) => [String(row._id), row]));
    const facultyUserById = new Map(facultyUsers.map((row) => [String(row._id), row]));
    const submissionByAssignmentId = new Map(submissionRows.map((row) => [String(row.assignment_id), row]));
    const assignmentsByCourse = new Map<string, Record<string, unknown>[]>();
    for (const assignment of assignmentRows) {
      const key = String(assignment.course_id || '');
      const existing = assignmentsByCourse.get(key);
      if (existing) {
        existing.push(assignment as Record<string, unknown>);
      } else {
        assignmentsByCourse.set(key, [assignment as Record<string, unknown>]);
      }
    }
    const econtentByCourse = new Map<string, Record<string, unknown>[]>();
    for (const entry of econtentRows) {
      const key = String(entry.course_id || '');
      const existing = econtentByCourse.get(key);
      if (existing) {
        existing.push(entry as Record<string, unknown>);
      } else {
        econtentByCourse.set(key, [entry as Record<string, unknown>]);
      }
    }

    const academics: Record<string, unknown>[] = [];
    let assignmentTotal = 0;
    let assignmentSubmitted = 0;
    for (const course of courses) {
      const faculty = facultyById.get(String(course.faculty_id || ''));
      const facultyUser = faculty ? facultyUserById.get(String(faculty.user_id || '')) : null;
      const assignments = assignmentsByCourse.get(String(course._id)) || [];
      const assignmentPayload = assignments.map((assignment) => {
        const submission = submissionByAssignmentId.get(String(assignment._id)) || null;
        assignmentTotal += 1;
        if (submission) assignmentSubmitted += 1;
        return {
          ...(toPublic(assignment) as Record<string, unknown>),
          submitted: Boolean(submission),
          submission: toPublic(submission),
        };
      });

      academics.push({
        course_id: course._id.toString(),
        course_code: course.code,
        course_title: course.title,
        semester: course.semester,
        faculty_name: facultyUser?.full_name || 'Unassigned',
        econtents: (econtentByCourse.get(String(course._id)) || []).map((item) => toPublic(item)),
        assignments: assignmentPayload,
      });
    }

    const studentTodayName = todayDayName();
    const studentTodayDate = todayDateKey();
    const currentSemester = Math.min(Math.max(Number(student.year || 1) * 2, 1), MAX_SEMESTER_LIMIT);
    const studentTodaySchedule = studentTimetable.find(
      (entry) => String(entry?.day || '').trim().toLowerCase() === studentTodayName.toLowerCase(),
    );
    const studentTodaySlots = Array.isArray(studentTodaySchedule?.slots) ? (studentTodaySchedule.slots as unknown[]) : [];
    const studentRegularClasses = studentTodaySlots
      .map((slotValue) => {
        const parsedSlot = parseTimetableSlot(slotValue);
        if (!parsedSlot.course_code) return null;
        const mappedCourse = courses.find((course) => matchesTimetableCode(course.code, parsedSlot.course_code));
        if (!mappedCourse) return null;
        const mappedAcademic = academics.find((entry) => String(entry.course_id || '') === mappedCourse._id.toString());
        const classInfo = departmentClasses.find(
          (entry) => Number(entry?.semester || 0) === Number(mappedCourse.semester || 0),
        );
        return {
          day: studentTodayName,
          slot: parsedSlot.slot,
          class_time: parsedSlot.class_time || parsedSlot.slot,
          course_id: mappedCourse._id.toString(),
          course_code: mappedCourse.code,
          course_title: mappedCourse.title,
          faculty_name: String(mappedAcademic?.faculty_name || 'Unassigned'),
          semester: Number(mappedCourse.semester || 0),
          section: String(classInfo?.section || 'A'),
          room_number: String(classInfo?.room || '-'),
          class_type: 'regular',
        };
      })
      .filter((entry) => entry !== null) as Array<Record<string, unknown>>;
    const extraClassRows = await db
      .collection('extra_classes')
      .find({
        class_date: studentTodayDate,
        department: String(student.department || ''),
        semester: currentSemester,
      })
      .sort({ class_time: 1 })
      .toArray();
    const extraClassCreatorIds = Array.from(
      new Set(
        extraClassRows
          .map((entry) => asObjectId(entry.created_by))
          .filter((value): value is ObjectId => value instanceof ObjectId)
          .map((value) => value.toString()),
      ),
    ).map((value) => oid(value));
    const extraClassCreators = extraClassCreatorIds.length
      ? await db.collection('users').find({ _id: { $in: extraClassCreatorIds } }).toArray()
      : [];
    const extraClassCreatorMap = new Map(extraClassCreators.map((row) => [String(row._id), row]));
    const studentExtraClasses = extraClassRows.map((entry) => ({
      id: String(entry._id),
      day: studentTodayName,
      slot: `${String(entry.class_time || '')} ${String(entry.course_code || '').trim()}`.trim(),
      class_time: String(entry.class_time || '-'),
      course_id: entry.course_id instanceof ObjectId ? entry.course_id.toString() : '',
      course_code: String(entry.course_code || ''),
      course_title: String(entry.course_title || ''),
      faculty_name: String(extraClassCreatorMap.get(String(entry.created_by || ''))?.full_name || 'Faculty'),
      semester: Number(entry.semester || 0),
      section: String(entry.section || 'A'),
      room_number: String(entry.room_number || '-'),
      class_type: 'extra',
      note: String(entry.note || ''),
    }));
    const studentTodayClasses = [...studentRegularClasses, ...studentExtraClasses].sort(
      (a, b) => classTimeSortKey(a.class_time) - classTimeSortKey(b.class_time),
    );

    const semester = currentSemester;
    const exams = await db.collection('exam_schedules').find({ department: student.department, semester }).sort({ exam_date: 1 }).toArray();

    let hallTicket = await db.collection('hall_tickets').findOne({ student_id: student._id, semester });
    if (!hallTicket) {
      const created = {
        student_id: student._id,
        semester,
        exam_session: `Semester ${semester} Examination`,
        hall_no: `H-${semester}12`,
        seat_no: String(student.enrollment_number || '').slice(-6),
        issued_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      await db.collection('hall_tickets').insertOne(created);
      hallTicket = await db.collection('hall_tickets').findOne({ student_id: student._id, semester });
    }

    const rawResults = await db.collection('results').find({ student_id: student._id }).toArray();
    const resultCourseIds = rawResults
      .map((item) => (item.course_id instanceof ObjectId ? item.course_id : null))
      .filter((item): item is ObjectId => Boolean(item));
    const resultCourses = resultCourseIds.length ? await db.collection('courses').find({ _id: { $in: resultCourseIds } }).toArray() : [];
    const semesterMap = new Map<number, Record<string, unknown>[]>();
    for (const result of rawResults) {
      const course =
        courses.find((item) => item._id.toString() === result.course_id.toString()) ||
        resultCourses.find((item) => item._id.toString() === result.course_id.toString());
      const sem = Number(course?.semester || 0);
      if (!semesterMap.has(sem)) {
        semesterMap.set(sem, []);
      }
      semesterMap.get(sem)?.push({
        ...(toPublic(result) as Record<string, unknown>),
        course_code: course?.code || '',
        course_title: course?.title || '',
        exam_type: result.exam_type || 'final',
      });
    }

    const resultTrend = Array.from(semesterMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([semesterKey, results]) => {
        const percentages = results
          .map((entry) => {
            const marks = Number(entry.marks || 0);
            const maxMarks = Math.max(Number(entry.max_marks || 100), 1);
            return (marks / maxMarks) * 100;
          })
          .filter((value) => Number.isFinite(value));
        const average = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : 0;
        return {
          semester: semesterKey,
          percentage: Number(average.toFixed(2)),
          exams_count: percentages.length,
        };
      });

    return jsonOk({
      user: safeUser(user),
      role: 'student',
      departments,
      profile: toPublic(student),
      student_timetable: toPublic(studentTimetable),
      today_day: studentTodayName,
      today_classes: studentTodayClasses,
      attendance_summary: {
        student_id: student._id.toString(),
        attendance_percentage: Number(((presentCount / Math.max(1, totalTrackedRecords)) * 100).toFixed(2)),
        present_records: presentCount,
        tracked_days: uniqueDays,
        total_records: totalTrackedRecords,
      },
      attendance_history: attendanceHistoryPayload,
      performance_summary: {
        assignments_total: assignmentTotal,
        assignments_submitted: assignmentSubmitted,
        assignments_pending: Math.max(assignmentTotal - assignmentSubmitted, 0),
        result_trend: resultTrend,
      },
      fees: {
        items: fees.map((item) => toPublic(item)),
        total_pending: pendingFeeTotal,
      },
      active_sessions: activeSessionsPayload,
      academics,
      notices,
      exams: {
        student_name: user.full_name,
        enrollment_number: student.enrollment_number,
        department: student.department,
        semester,
        upcoming_exams: exams.map((item) => toPublic(item)),
        hall_ticket: toPublic(hallTicket),
        semester_results: Array.from(semesterMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([semesterKey, results]) => ({ semester: semesterKey, results })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return jsonError('Unauthorized', 401);
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return jsonError('Forbidden', 403);
    }
    return jsonError('Unable to load state', 500);
  }
}
