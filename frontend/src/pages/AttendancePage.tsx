import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadTeacherAttendanceCsv,
  extractApiMessage,
  fetchActiveAttendanceSessions,
  fetchCourses,
  fetchFaceEncodings,
  fetchFaceEncodingsForCourse,
  fetchStudentActiveAttendanceSessions,
  fetchStudentAttendanceHistory,
  fetchStudents,
  fetchTeacherCourses,
  markAttendanceBatch,
  markStudentAttendanceLive,
  registerFaceLive,
  startAttendanceSession,
  stopAttendanceSession,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import type { AttendanceHistoryItem, AttendanceSession, Course, FaceProfile, StudentListing } from '../types';
import {
  boxToBlob,
  captureVideoFrame,
  detectFacesInVideo,
  isFaceDetectorSupported,
  matchFacesFromFrame,
  type FaceBox,
  type FaceMatchResult,
} from '../utils/face';

type CaptureFrame = {
  id: string;
  url: string;
  blob: Blob;
};

const MATCH_TOLERANCE = 0.58;

function createCaptureId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function largestFace(faces: FaceBox[]) {
  if (faces.length === 0) {
    return null;
  }
  return [...faces].sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to capture frame'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
}

export default function AttendancePage() {
  const { role } = useAuth();
  const isAdminLike = role === 'admin' || role === 'superadmin';
  const isTeacherLike = role === 'teacher' || isAdminLike;
  const isStudent = role === 'student';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [activeSessions, setActiveSessions] = useState<AttendanceSession[]>([]);

  const [faceProfiles, setFaceProfiles] = useState<FaceProfile[]>([]);
  const [registeredStudentIds, setRegisteredStudentIds] = useState<Set<string>>(new Set());
  const [students, setStudents] = useState<StudentListing[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<FaceMatchResult[]>([]);

  const [registerStudentId, setRegisterStudentId] = useState('');
  const [capturedFrames, setCapturedFrames] = useState<CaptureFrame[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedFramesRef = useRef<CaptureFrame[]>([]);

  const selectedCourse = useMemo(
    () => courses.find((item) => item.id === selectedCourseId),
    [courses, selectedCourseId],
  );

  const isSessionActiveForCourse = useMemo(
    () => activeSessions.some((session) => session.course_id === selectedCourseId && session.is_active),
    [activeSessions, selectedCourseId],
  );

  const recognizedStudents = useMemo(() => {
    const map = new Map<string, FaceMatchResult>();
    for (const face of detectedFaces) {
      if (!face.student_id) {
        continue;
      }
      const existing = map.get(face.student_id);
      if (!existing || face.distance < existing.distance) {
        map.set(face.student_id, face);
      }
    }
    return Array.from(map.values());
  }, [detectedFaces]);

  const registerStudent = useMemo(
    () => students.find((student) => student.student.id === registerStudentId),
    [students, registerStudentId],
  );

  const registerAlreadyExists = registerStudentId ? registeredStudentIds.has(registerStudentId) : false;

  const canMarkAttendance = isSessionActiveForCourse && selectedCourseId && recognizedStudents.length > 0;

  useEffect(() => {
    capturedFramesRef.current = capturedFrames;
  }, [capturedFrames]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }

  function cleanupCapturedFrames() {
    for (const frame of capturedFramesRef.current) {
      URL.revokeObjectURL(frame.url);
    }
    setCapturedFrames([]);
  }

  async function startCamera() {
    if (!isFaceDetectorSupported()) {
      setError('Live face scan is supported in Chrome/Edge.');
      return;
    }
    setError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    }
  }

  async function loadProfiles(targetCourseId: string) {
    const [courseProfiles, allProfiles] = await Promise.all([
      targetCourseId ? fetchFaceEncodingsForCourse(targetCourseId) : Promise.resolve([]),
      fetchFaceEncodings(),
    ]);
    setFaceProfiles(courseProfiles);
    setRegisteredStudentIds(new Set(allProfiles.map((profile) => profile.student_id)));
  }

  async function loadStaffSessions() {
    try {
      setActiveSessions(await fetchActiveAttendanceSessions());
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    }
  }

  async function loadStudentData() {
    const [historyData, sessionData] = await Promise.all([
      fetchStudentAttendanceHistory(),
      fetchStudentActiveAttendanceSessions(),
    ]);
    setHistory(historyData);
    setActiveSessions(sessionData);
    setSelectedCourseId((prev) => {
      if (prev && sessionData.some((session) => session.course_id === prev)) {
        return prev;
      }
      return sessionData[0]?.course_id || '';
    });
  }

  async function bootstrap() {
    setLoading(true);
    setError('');
    try {
      if (isStudent) {
        await loadStudentData();
      } else {
        const courseData = role === 'teacher' ? await fetchTeacherCourses() : await fetchCourses();
        setCourses(courseData);
        const initialCourse = courseData[0]?.id || '';
        setSelectedCourseId(initialCourse);

        if (isAdminLike) {
          const studentData = await fetchStudents();
          setStudents(studentData);
          setRegisterStudentId(studentData[0]?.student.id || '');
        }

        await Promise.all([loadProfiles(initialCourse), loadStaffSessions()]);
      }
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
    return () => {
      stopCamera();
      cleanupCapturedFrames();
    };
  }, [role]);

  useEffect(() => {
    if (!selectedCourseId || isStudent) {
      return;
    }
    void loadProfiles(selectedCourseId).catch((err: unknown) => setError(extractApiMessage(err)));
    setDetectedFaces([]);
  }, [selectedCourseId, isStudent]);

  useEffect(() => {
    if (!isStudent) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadStudentData().catch((err: unknown) => setError(extractApiMessage(err)));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [isStudent, selectedCourseId]);

  if (loading) {
    return <Loader label="Loading attendance..." />;
  }

  if (isStudent) {
    return (
      <div className="space-y-6">
        {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

        <SectionCard title="Live Attendance Session" subtitle="Faculty must start a subject session before you can mark attendance.">
          <div className="grid gap-4 lg:grid-cols-[1fr,auto]">
            <select className="form-field" value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
              <option value="">Select Active Subject</option>
              {activeSessions.map((session) => (
                <option key={session.id} value={session.course_id}>
                  {session.course_code} - {session.course_title}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              {cameraOn ? (
                <button className="soft-btn" onClick={stopCamera}>Stop Camera</button>
              ) : (
                <button className="soft-btn" onClick={() => void startCamera()}>Start Camera</button>
              )}
              <button
                className="primary-btn"
                disabled={!cameraOn || !selectedCourseId}
                onClick={() => {
                  if (!videoRef.current || !selectedCourseId) {
                    return;
                  }
                  setError('');
                  setFeedback('');
                  void (async () => {
                    try {
                      const frame = captureVideoFrame(videoRef.current as HTMLVideoElement);
                      const blob = await canvasToBlob(frame);
                      await markStudentAttendanceLive(selectedCourseId, blob);
                      setFeedback('Attendance marked successfully.');
                      await loadStudentData();
                    } catch (err: unknown) {
                      setError(extractApiMessage(err));
                    }
                  })();
                }}
              >
                Mark My Attendance
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/85">
            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
          </div>
          {activeSessions.length === 0 ? <p className="mt-3 text-sm text-slate-500">No active session from faculty right now.</p> : null}
        </SectionCard>

        <SectionCard title="Attendance History" subtitle="Track your daily attendance records.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Marked By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 text-slate-800">
                    <td className="px-2 py-2">{item.attendance_date}</td>
                    <td className="px-2 py-2">
                      {item.course_code || '-'} - {item.course_title || '-'}
                    </td>
                    <td className="px-2 py-2">{item.status}</td>
                    <td className="px-2 py-2">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 ? <p className="py-3 text-sm text-slate-500">No attendance records yet.</p> : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered Faces" value={faceProfiles.length} />
        <StatCard label="Detected Faces" value={detectedFaces.length} />
        <StatCard label="Recognized Students" value={recognizedStudents.length} />
        <StatCard label="Selected Subject" value={selectedCourse ? selectedCourse.code : 'None'} />
      </div>

      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      <SectionCard
        title="Subject Attendance Session"
        subtitle="Faculty starts session, scans faces, and marks attendance. Student marking is enabled during active session."
        actions={
          <div className="flex flex-wrap gap-2">
            {cameraOn ? (
              <button className="soft-btn" onClick={stopCamera}>
                Stop Camera
              </button>
            ) : (
              <button className="soft-btn" onClick={() => void startCamera()}>
                Start Camera
              </button>
            )}
            {isSessionActiveForCourse ? (
              <button
                className="primary-btn"
                disabled={!selectedCourseId}
                onClick={() => {
                  if (!selectedCourseId) {
                    return;
                  }
                  setError('');
                  void stopAttendanceSession({ course_id: selectedCourseId })
                    .then(async () => {
                      setFeedback('Attendance session stopped.');
                      await loadStaffSessions();
                    })
                    .catch((err: unknown) => setError(extractApiMessage(err)));
                }}
              >
                Stop Session
              </button>
            ) : (
              <button
                className="primary-btn"
                disabled={!selectedCourseId}
                onClick={() => {
                  if (!selectedCourseId) {
                    return;
                  }
                  setError('');
                  void startAttendanceSession({ course_id: selectedCourseId, allow_student_mark: true })
                    .then(async () => {
                      setFeedback('Attendance session started. Students can now mark attendance.');
                      await loadStaffSessions();
                    })
                    .catch((err: unknown) => setError(extractApiMessage(err)));
                }}
              >
                Start Attendance Session
              </button>
            )}
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[1.15fr,1fr]">
          <div className="space-y-3">
            <select
              className="form-field"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
            >
              <option value="">Select Subject</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.title}
                </option>
              ))}
            </select>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/85">
              <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
            </div>

            <p className="text-xs text-slate-600">Face match sensitivity is auto-optimized by the system.</p>

            <div className="flex flex-wrap gap-2">
              <button
                className="primary-btn"
                disabled={!cameraOn || !selectedCourseId || !isSessionActiveForCourse}
                onClick={() => {
                  if (!videoRef.current) {
                    return;
                  }
                  setError('');
                  setFeedback('');
                  void (async () => {
                    try {
                      const video = videoRef.current as HTMLVideoElement;
                      const frameCanvas = captureVideoFrame(video);
                      const faces = await detectFacesInVideo(video, 10);
                      const matches = matchFacesFromFrame(frameCanvas, faces, faceProfiles, MATCH_TOLERANCE);
                      setDetectedFaces(matches);

                      if (faces.length === 0) {
                        setFeedback('No faces detected in this frame.');
                        return;
                      }

                      const named = matches.filter((item) => item.student_id).map((item) => item.student_name);
                      setFeedback(`${faces.length} faces detected. ${named.length} recognized${named.length ? `: ${named.join(', ')}` : ''}.`);
                    } catch (err: unknown) {
                      setError(extractApiMessage(err));
                    }
                  })();
                }}
              >
                Scan Faces
              </button>

              <button
                className="primary-btn"
                disabled={!canMarkAttendance}
                onClick={() => {
                  setError('');
                  setFeedback('');
                  void markAttendanceBatch({
                    course_id: selectedCourseId,
                    student_ids: recognizedStudents.map((item) => item.student_id as string),
                    source: 'faculty_click_mark',
                  })
                    .then((response) => {
                      const markedNames = response.marked.map((item) => item.name);
                      const duplicateNames = response.already_marked.map((item) => item.name);
                      const parts = [
                        `${response.summary.marked_count} marked`,
                        `${response.summary.already_marked_count} already marked`,
                      ];
                      if (markedNames.length) {
                        parts.push(`Marked: ${markedNames.join(', ')}`);
                      }
                      if (duplicateNames.length) {
                        parts.push(`Already: ${duplicateNames.join(', ')}`);
                      }
                      setFeedback(parts.join(' | '));
                    })
                    .catch((err: unknown) => setError(extractApiMessage(err)));
                }}
              >
                Mark Attendance
              </button>

              {isTeacherLike ? (
                <button
                  className="soft-btn"
                  disabled={!selectedCourseId}
                  onClick={() => {
                    setError('');
                    void downloadTeacherAttendanceCsv(selectedCourseId)
                      .then(({ blob, filename }) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        link.click();
                        URL.revokeObjectURL(url);
                      })
                      .catch((err: unknown) => setError(extractApiMessage(err)));
                  }}
                >
                  Download Today Attendance
                </button>
              ) : null}
            </div>

            {!isSessionActiveForCourse ? <p className="text-xs text-amber-700">Start attendance session before scan and mark.</p> : null}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Detected Faces</h3>
            <div className="space-y-2">
              {detectedFaces.map((face, index) => (
                <div key={`${face.student_id || 'unknown'}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-900">{face.student_name}</p>
                  <p className="text-xs text-slate-500">
                    {face.enrollment_number || 'Unknown roll'} | match score {(1 - Math.min(face.distance, 1)).toFixed(2)}
                  </p>
                </div>
              ))}
              {detectedFaces.length === 0 ? <p className="text-sm text-slate-500">No face scan yet.</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>

      {isAdminLike ? (
        <SectionCard
          title="Register Student Face"
          subtitle="Capture multiple images for one student. Already registered students are locked."
          actions={<button className="soft-btn" onClick={cleanupCapturedFrames}>Clear Captures</button>}
        >
          <div className="grid gap-5 xl:grid-cols-[1fr,1.1fr]">
            <div className="space-y-3">
              <select
                className="form-field"
                value={registerStudentId}
                onChange={(event) => setRegisterStudentId(event.target.value)}
              >
                <option value="">Select Student</option>
                {students.map((student) => (
                  <option key={student.student.id} value={student.student.id}>
                    {student.user.full_name} ({student.student.enrollment_number})
                  </option>
                ))}
              </select>

              {registerStudent ? (
                <p className="text-sm text-slate-600">
                  {registerStudent.student.department} | Year {registerStudent.student.year}
                </p>
              ) : null}

              {registerAlreadyExists ? (
                <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-700">
                  Face is already registered for this student.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  className="primary-btn"
                  disabled={!cameraOn || !registerStudentId || registerAlreadyExists}
                  onClick={() => {
                    if (!videoRef.current) {
                      return;
                    }
                    setError('');
                    void (async () => {
                      try {
                        const video = videoRef.current as HTMLVideoElement;
                        const frameCanvas = captureVideoFrame(video);
                        const faces = await detectFacesInVideo(video, 6);
                        const face = largestFace(faces);
                        if (!face) {
                          setError('No face detected. Please face the camera and try again.');
                          return;
                        }
                        const blob = await boxToBlob(frameCanvas, face);
                        const url = URL.createObjectURL(blob);
                        setCapturedFrames((prev) => [...prev, { id: createCaptureId(), blob, url }]);
                      } catch (err: unknown) {
                        setError(extractApiMessage(err));
                      }
                    })();
                  }}
                >
                  Capture Face
                </button>

                <button
                  className="primary-btn"
                  disabled={capturedFrames.length < 4 || !registerStudentId || registerAlreadyExists}
                  onClick={() => {
                    setError('');
                    setFeedback('');
                    void registerFaceLive(
                      registerStudentId,
                      capturedFrames.map((frame) => frame.blob),
                    )
                      .then(async (response) => {
                        setFeedback(
                          `${response.message}. ${response.valid_face_images} clear images saved for ${registerStudent?.user.full_name || 'student'}.`,
                        );
                        cleanupCapturedFrames();
                        await loadProfiles(selectedCourseId);
                      })
                      .catch((err: unknown) => setError(extractApiMessage(err)));
                  }}
                >
                  Register Face
                </button>
              </div>

              <p className="text-xs text-slate-500">Capture at least 4 clear photos from slightly different angles.</p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Captured Images ({capturedFrames.length})</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {capturedFrames.map((frame) => (
                  <figure key={frame.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950/90">
                    <img src={frame.url} alt="Student face" className="aspect-square w-full object-cover" />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
