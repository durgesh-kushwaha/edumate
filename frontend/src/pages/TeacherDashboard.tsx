import { useEffect, useState } from 'react';
import client from '../api/client';

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<any[]>([]);
  useEffect(() => { client.get('/teacher/courses').then((r) => setCourses(r.data)); }, []);
  return <div className="space-y-3">{courses.map((course) => <div key={course.id} className="bg-white p-4 rounded shadow">{course.code} - {course.title}</div>)}</div>;
}
