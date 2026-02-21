import { ObjectId } from 'mongodb';
import { adminStats, listCourses, listFaculty, listFees, listStudents } from '@/lib/state';
import { ensureDbSetup, getDb, oid, toPublic } from '@/lib/db';
import { jsonError, jsonOk, requireUser, safeUser } from '@/lib/http';

function asObjectId(value: unknown): ObjectId | null {
  return value instanceof ObjectId ? value : null;
}

function todayDayName() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
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
        const [superadmins, registrationRequests, salaryConfigs, salaryRecords, credentialRows] = await Promise.all([
          db.collection('users').find({ role: 'superadmin', is_active: true }).sort({ created_at: -1 }).toArray(),
          db.collection('registration_requests').find({ status: 'pending' }).sort({ submitted_at: -1 }).toArray(),
          db.collection('salary_configs').find().sort({ designation: 1 }).toArray(),
          db.collection('salary_records').find().sort({ created_at: -1 }).limit(30).toArray(),
          db.collection('credential_vault').find().toArray(),
        ]);

        const enrichedSalaryRecords: Record<string, unknown>[] = [];
        for (const record of salaryRecords) {
          const facultyId = asObjectId(record.faculty_id);
          const facultyDoc = facultyId ? await db.collection('faculty').findOne({ _id: facultyId }) : null;
          const facultyUserId = facultyDoc && asObjectId(facultyDoc.user_id);
          const facultyUser = facultyUserId ? await db.collection('users').findOne({ _id: facultyUserId }) : null;
          enrichedSalaryRecords.push({
            ...(toPublic(record) as Record<string, unknown>),
            faculty_name: facultyUser?.full_name || '',
            employee_code: facultyDoc?.employee_code || '',
          });
        }

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
      const assignments = await db
        .collection('assignments')
        .find({ course_id: { $in: courseIds } })
        .sort({ created_at: -1 })
        .toArray();
      const econtents = courseIds.length
        ? await db.collection('econtents').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray()
        : [];
      const notices = await db
        .collection('notices')
        .find({
          $or: [{ target_roles: 'all' }, { target_roles: 'teacher' }, { created_by: user._id }],
        })
        .sort({ created_at: -1 })
        .limit(100)
        .toArray();
      const facultyDepartmentDoc = (await db.collection('departments').findOne({
        name: String(faculty.department || ''),
      })) as Record<string, unknown> | null;
      const facultyDepartmentTimetable = Array.isArray(facultyDepartmentDoc?.timetable)
        ? (facultyDepartmentDoc.timetable as Array<Record<string, unknown>>)
        : [];
      const facultyDepartmentClasses = Array.isArray(facultyDepartmentDoc?.classes)
        ? (facultyDepartmentDoc.classes as Array<Record<string, unknown>>)
        : [];
      const teacherTodayName = todayDayName();
      const teacherTodaySchedule = facultyDepartmentTimetable.find(
        (entry) => String(entry?.day || '').trim().toLowerCase() === teacherTodayName.toLowerCase(),
      );
      const teacherTodaySlots = Array.isArray(teacherTodaySchedule?.slots) ? (teacherTodaySchedule.slots as unknown[]) : [];
      const teacherTodayClasses = teacherTodaySlots
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
          };
        })
        .filter((entry) => entry !== null) as Array<Record<string, unknown>>;

      const activeSessions = await db.collection('attendance_sessions').find({ is_active: true }).sort({ started_at: -1 }).toArray();
      const enrollmentRows = await db.collection('enrollments').find({ course_id: { $in: courseIds } }).toArray();
      const studentIds = enrollmentRows
        .map((item) => item.student_id)
        .filter((value) => value instanceof ObjectId) as ObjectId[];
      const students = studentIds.length ? await db.collection('students').find({ _id: { $in: studentIds } }).toArray() : [];
      const studentUserIds = students
        .map((item) => item.user_id)
        .filter((value) => value instanceof ObjectId) as ObjectId[];
      const studentUsers = studentUserIds.length ? await db.collection('users').find({ _id: { $in: studentUserIds } }).toArray() : [];
      const submissions = assignments.length
        ? await db.collection('assignment_submissions').find({ assignment_id: { $in: assignments.map((item) => item._id) } }).sort({ submitted_at: -1 }).toArray()
        : [];
      const results = courseIds.length
        ? await db.collection('results').find({ course_id: { $in: courseIds } }).sort({ updated_at: -1 }).toArray()
        : [];

      const assignmentsWithCourse = assignments.map((assignment) => {
        const course = courses.find((item) => item._id.toString() === assignment.course_id.toString());
        return {
          ...(toPublic(assignment) as Record<string, unknown>),
          course_code: course?.code || '',
          course_title: course?.title || '',
        };
      });

      const econtentWithCourse = econtents.map((entry) => {
        const course = courses.find((item) => item._id.toString() === entry.course_id.toString());
        return {
          ...(toPublic(entry) as Record<string, unknown>),
          course_code: course?.code || '',
          course_title: course?.title || '',
        };
      });

      const sessions = activeSessions
        .filter((session) => courses.some((course) => course._id.toString() === session.course_id.toString()))
        .map((session) => {
          const course = courses.find((item) => item._id.toString() === session.course_id.toString());
          return {
            ...(toPublic(session) as Record<string, unknown>),
            course_code: course?.code || '',
            course_title: course?.title || '',
          };
        });

      const courseStudents = enrollmentRows.map((entry) => {
        const course = courses.find((item) => String(item._id) === String(entry.course_id));
        const student = students.find((item) => String(item._id) === String(entry.student_id));
        const studentUser = student ? studentUsers.find((item) => String(item._id) === String(student.user_id)) : null;
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
        const assignment = assignments.find((item) => String(item._id) === String(submission.assignment_id));
        const course = assignment ? courses.find((item) => String(item._id) === String(assignment.course_id)) : null;
        const student = students.find((item) => String(item._id) === String(submission.student_id));
        const studentUser = student ? studentUsers.find((item) => String(item._id) === String(student.user_id)) : null;
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
        const course = courses.find((item) => String(item._id) === String(result.course_id));
        const student = students.find((item) => String(item._id) === String(result.student_id));
        const studentUser = student ? studentUsers.find((item) => String(item._id) === String(student.user_id)) : null;
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
    const courses = await db.collection('courses').find({ _id: { $in: courseIds } }).toArray();

    const attendanceHistory = await db.collection('attendance').find({ student_id: student._id }).sort({ attendance_date: -1 }).toArray();
    const attendanceHistoryPayload = attendanceHistory.map((record) => {
      const course = courses.find((item) => item._id.toString() === record.course_id.toString());
      return {
        ...(toPublic(record) as Record<string, unknown>),
        course_code: course?.code || '',
        course_title: course?.title || '',
      };
    });

    const uniqueDays = new Set(attendanceHistory.map((item) => String(item.attendance_date))).size;
    const presentCount = attendanceHistory.filter((item) => item.status === 'present').length;
    const totalTrackedRecords = attendanceHistory.length;

    const fees = await db.collection('fee_ledgers').find({ student_id: student._id }).sort({ due_date: 1 }).toArray();
    const pendingFeeTotal = fees
      .filter((item) => String(item.status || 'pending') !== 'paid')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const activeSessions = await db
      .collection('attendance_sessions')
      .find({ is_active: true, allow_student_mark: true, course_id: { $in: courseIds } })
      .toArray();
    const activeSessionsPayload = activeSessions.map((session) => {
      const course = courses.find((item) => item._id.toString() === session.course_id.toString());
      return {
        ...(toPublic(session) as Record<string, unknown>),
        course_code: course?.code || '',
        course_title: course?.title || '',
      };
    });

    const econtentRows = courseIds.length
      ? await db.collection('econtents').find({ course_id: { $in: courseIds } }).sort({ created_at: -1 }).toArray()
      : [];

    const noticeRows = await db
      .collection('notices')
      .find({
        $or: [{ target_roles: 'all' }, { target_roles: 'student' }],
      })
      .sort({ created_at: -1 })
      .limit(150)
      .toArray();

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

    const academics: Record<string, unknown>[] = [];
    let assignmentTotal = 0;
    let assignmentSubmitted = 0;
    for (const course of courses) {
      const faculty = await db.collection('faculty').findOne({ _id: course.faculty_id });
      const facultyUser = faculty ? await db.collection('users').findOne({ _id: faculty.user_id }) : null;
      const assignments = await db.collection('assignments').find({ course_id: course._id }).sort({ created_at: -1 }).toArray();
      const econtentForCourse = econtentRows.filter((item) => String(item.course_id) === String(course._id));
      const assignmentPayload = [];
      for (const assignment of assignments) {
        const submission = await db
          .collection('assignment_submissions')
          .findOne({ assignment_id: assignment._id, student_id: student._id });
        assignmentTotal += 1;
        if (submission) assignmentSubmitted += 1;
        assignmentPayload.push({
          ...(toPublic(assignment) as Record<string, unknown>),
          submitted: Boolean(submission),
          submission: toPublic(submission),
        });
      }
      academics.push({
        course_id: course._id.toString(),
        course_code: course.code,
        course_title: course.title,
        semester: course.semester,
        faculty_name: facultyUser?.full_name || 'Unassigned',
        econtents: econtentForCourse.map((item) => toPublic(item)),
        assignments: assignmentPayload,
      });
    }

    const studentTodayName = todayDayName();
    const studentTodaySchedule = studentTimetable.find(
      (entry) => String(entry?.day || '').trim().toLowerCase() === studentTodayName.toLowerCase(),
    );
    const studentTodaySlots = Array.isArray(studentTodaySchedule?.slots) ? (studentTodaySchedule.slots as unknown[]) : [];
    const studentTodayClasses = studentTodaySlots
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
        };
      })
      .filter((entry) => entry !== null) as Array<Record<string, unknown>>;

    const semester = Math.min(Number(student.year || 1) * 2, 8);
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
