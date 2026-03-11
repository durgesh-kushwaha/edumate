export type DepartmentSeed = {
  code: string;
  name: string;
  subjects: { code: string; name: string }[];
  timetable: { day: string; slots: string[] }[];
  classes: { semester: number; section: string; room: string }[];
};

export const DEPARTMENTS: DepartmentSeed[] = [
  {
    code: 'CSE',
    name: 'Computer Science',
    subjects: [
      { code: 'CS201', name: 'Data Structures' },
      { code: 'CS202', name: 'Database Management Systems' },
      { code: 'CS203', name: 'Operating Systems' },
      { code: 'CS204', name: 'Computer Networks' },
    ],
    timetable: [
      { day: 'Monday', slots: ['09:00 CS201', '11:00 CS202', '14:00 CS203'] },
      { day: 'Tuesday', slots: ['10:00 CS204', '13:00 CS201 Lab'] },
      { day: 'Wednesday', slots: ['09:00 CS202', '12:00 CS203'] },
      { day: 'Thursday', slots: ['09:00 CS204', '11:00 CS201'] },
      { day: 'Friday', slots: ['10:00 CS202 Lab', '14:00 CS203'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'CSE-201' },
      { semester: 4, section: 'A', room: 'CSE-301' },
      { semester: 6, section: 'A', room: 'CSE-401' },
    ],
  },
  {
    code: 'ECE',
    name: 'Electronics & Communication',
    subjects: [
      { code: 'EC201', name: 'Digital Electronics' },
      { code: 'EC202', name: 'Signals & Systems' },
      { code: 'EC203', name: 'Microprocessors' },
      { code: 'EC204', name: 'Communication Theory' },
    ],
    timetable: [
      { day: 'Monday', slots: ['10:00 EC201', '12:00 EC202'] },
      { day: 'Tuesday', slots: ['09:00 EC203 Lab', '14:00 EC204'] },
      { day: 'Wednesday', slots: ['10:00 EC202', '13:00 EC203'] },
      { day: 'Thursday', slots: ['11:00 EC204', '14:00 EC201'] },
      { day: 'Friday', slots: ['09:00 EC202 Lab', '12:00 EC203'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'ECE-210' },
      { semester: 4, section: 'A', room: 'ECE-310' },
      { semester: 6, section: 'A', room: 'ECE-410' },
    ],
  },
  {
    code: 'ME',
    name: 'Mechanical Engineering',
    subjects: [
      { code: 'ME201', name: 'Thermodynamics' },
      { code: 'ME202', name: 'Fluid Mechanics' },
      { code: 'ME203', name: 'Machine Design' },
      { code: 'ME204', name: 'Manufacturing Processes' },
    ],
    timetable: [
      { day: 'Monday', slots: ['09:00 ME201', '11:00 ME202'] },
      { day: 'Tuesday', slots: ['10:00 ME203', '14:00 ME204'] },
      { day: 'Wednesday', slots: ['09:00 ME202 Lab', '12:00 ME201'] },
      { day: 'Thursday', slots: ['10:00 ME204', '13:00 ME203'] },
      { day: 'Friday', slots: ['09:00 ME201 Tutorial', '11:00 ME202'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'ME-220' },
      { semester: 4, section: 'A', room: 'ME-320' },
      { semester: 6, section: 'A', room: 'ME-420' },
    ],
  },
  {
    code: 'CE',
    name: 'Civil Engineering',
    subjects: [
      { code: 'CE201', name: 'Surveying' },
      { code: 'CE202', name: 'Structural Analysis' },
      { code: 'CE203', name: 'Geotechnical Engineering' },
      { code: 'CE204', name: 'Transportation Engineering' },
    ],
    timetable: [
      { day: 'Monday', slots: ['09:00 CE201', '11:00 CE202'] },
      { day: 'Tuesday', slots: ['10:00 CE203', '13:00 CE204'] },
      { day: 'Wednesday', slots: ['09:00 CE202 Lab', '12:00 CE201'] },
      { day: 'Thursday', slots: ['10:00 CE204', '14:00 CE203'] },
      { day: 'Friday', slots: ['09:00 CE201 Tutorial', '11:00 CE202'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'CE-230' },
      { semester: 4, section: 'A', room: 'CE-330' },
      { semester: 6, section: 'A', room: 'CE-430' },
    ],
  },
  {
    code: 'EEE',
    name: 'Electrical Engineering',
    subjects: [
      { code: 'EE201', name: 'Circuit Theory' },
      { code: 'EE202', name: 'Electrical Machines' },
      { code: 'EE203', name: 'Power Systems' },
      { code: 'EE204', name: 'Control Systems' },
    ],
    timetable: [
      { day: 'Monday', slots: ['10:00 EE201', '12:00 EE202'] },
      { day: 'Tuesday', slots: ['09:00 EE203', '14:00 EE204'] },
      { day: 'Wednesday', slots: ['10:00 EE202 Lab', '13:00 EE201'] },
      { day: 'Thursday', slots: ['09:00 EE204', '11:00 EE203'] },
      { day: 'Friday', slots: ['10:00 EE201 Tutorial', '14:00 EE202'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'EEE-210' },
      { semester: 4, section: 'A', room: 'EEE-310' },
      { semester: 6, section: 'A', room: 'EEE-410' },
    ],
  },
  {
    code: 'BBA',
    name: 'Business Administration',
    subjects: [
      { code: 'BA201', name: 'Financial Accounting' },
      { code: 'BA202', name: 'Organizational Behavior' },
      { code: 'BA203', name: 'Marketing Management' },
      { code: 'BA204', name: 'Business Economics' },
    ],
    timetable: [
      { day: 'Monday', slots: ['09:00 BA201', '11:00 BA202'] },
      { day: 'Tuesday', slots: ['10:00 BA203', '14:00 BA204'] },
      { day: 'Wednesday', slots: ['09:00 BA202', '12:00 BA201'] },
      { day: 'Thursday', slots: ['11:00 BA204', '14:00 BA203'] },
      { day: 'Friday', slots: ['10:00 BA201 Tutorial', '12:00 BA202'] },
    ],
    classes: [
      { semester: 2, section: 'A', room: 'BBA-201' },
      { semester: 4, section: 'A', room: 'BBA-301' },
      { semester: 6, section: 'A', room: 'BBA-401' },
    ],
  },
];

export const DESIGNATION_SALARY_DEFAULTS = [
  { designation: 'Lecturer', monthly_salary: 42000 },
  { designation: 'Assistant Professor', monthly_salary: 55000 },
  { designation: 'Associate Professor', monthly_salary: 78000 },
  { designation: 'Professor', monthly_salary: 105000 },
];

export const PINCODE_FALLBACK: Record<string, { state: string; city: string }> = {
  '110001': { state: 'Delhi', city: 'New Delhi' },
  '122001': { state: 'Haryana', city: 'Gurugram' },
  '201301': { state: 'Uttar Pradesh', city: 'Noida' },
  '226001': { state: 'Uttar Pradesh', city: 'Lucknow' },
  '273001': { state: 'Uttar Pradesh', city: 'Gorakhpur' },
  '273015': { state: 'Uttar Pradesh', city: 'Gorakhpur' },
  '400001': { state: 'Maharashtra', city: 'Mumbai' },
  '560001': { state: 'Karnataka', city: 'Bengaluru' },
  '600001': { state: 'Tamil Nadu', city: 'Chennai' },
  '700001': { state: 'West Bengal', city: 'Kolkata' },
  '500001': { state: 'Telangana', city: 'Hyderabad' },
  '302001': { state: 'Rajasthan', city: 'Jaipur' },
  '380001': { state: 'Gujarat', city: 'Ahmedabad' },
  '411001': { state: 'Maharashtra', city: 'Pune' },
  '452001': { state: 'Madhya Pradesh', city: 'Indore' },
  '462001': { state: 'Madhya Pradesh', city: 'Bhopal' },
  '800001': { state: 'Bihar', city: 'Patna' },
};
export const DEFAULT_PASSWORD = 'Pass@1234';
