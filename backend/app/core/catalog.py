DEPARTMENT_CATALOG = [
    # ── BTech Programs ──
    {
        'code': 'CSE',
        'name': 'BTech - Computer Science',
        'subjects': [
            {'code': 'CS201', 'name': 'Data Structures'},
            {'code': 'CS202', 'name': 'Database Management Systems'},
            {'code': 'CS203', 'name': 'Operating Systems'},
            {'code': 'CS204', 'name': 'Computer Networks'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 CS201', '11:00 CS202', '14:00 CS203']},
            {'day': 'Tuesday', 'slots': ['10:00 CS204', '13:00 CS201 Lab']},
            {'day': 'Wednesday', 'slots': ['09:00 CS202', '12:00 CS203']},
            {'day': 'Thursday', 'slots': ['09:00 CS204', '11:00 CS201']},
            {'day': 'Friday', 'slots': ['10:00 CS202 Lab', '14:00 CS203']},
        ],
    },
    {
        'code': 'ECE',
        'name': 'BTech - Electronics & Communication',
        'subjects': [
            {'code': 'EC201', 'name': 'Digital Electronics'},
            {'code': 'EC202', 'name': 'Signals & Systems'},
            {'code': 'EC203', 'name': 'Microprocessors'},
            {'code': 'EC204', 'name': 'Communication Theory'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['10:00 EC201', '12:00 EC202']},
            {'day': 'Tuesday', 'slots': ['09:00 EC203 Lab', '14:00 EC204']},
            {'day': 'Wednesday', 'slots': ['10:00 EC202', '13:00 EC203']},
            {'day': 'Thursday', 'slots': ['11:00 EC204', '14:00 EC201']},
            {'day': 'Friday', 'slots': ['09:00 EC202 Lab', '12:00 EC203']},
        ],
    },
    {
        'code': 'ME',
        'name': 'BTech - Mechanical Engineering',
        'subjects': [
            {'code': 'ME201', 'name': 'Thermodynamics'},
            {'code': 'ME202', 'name': 'Fluid Mechanics'},
            {'code': 'ME203', 'name': 'Machine Design'},
            {'code': 'ME204', 'name': 'Manufacturing Processes'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 ME201', '11:00 ME202']},
            {'day': 'Tuesday', 'slots': ['10:00 ME203', '14:00 ME204']},
            {'day': 'Wednesday', 'slots': ['09:00 ME202 Lab', '12:00 ME201']},
            {'day': 'Thursday', 'slots': ['10:00 ME204', '13:00 ME203']},
            {'day': 'Friday', 'slots': ['09:00 ME201 Tutorial', '11:00 ME202']},
        ],
    },
    {
        'code': 'CE',
        'name': 'BTech - Civil Engineering',
        'subjects': [
            {'code': 'CE201', 'name': 'Surveying'},
            {'code': 'CE202', 'name': 'Structural Analysis'},
            {'code': 'CE203', 'name': 'Geotechnical Engineering'},
            {'code': 'CE204', 'name': 'Transportation Engineering'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 CE201', '11:00 CE202']},
            {'day': 'Tuesday', 'slots': ['10:00 CE203', '13:00 CE204']},
            {'day': 'Wednesday', 'slots': ['09:00 CE202 Lab', '12:00 CE201']},
            {'day': 'Thursday', 'slots': ['10:00 CE204', '14:00 CE203']},
            {'day': 'Friday', 'slots': ['09:00 CE201 Tutorial', '11:00 CE202']},
        ],
    },
    {
        'code': 'EE',
        'name': 'BTech - Electrical Engineering',
        'subjects': [
            {'code': 'EE201', 'name': 'Circuit Theory'},
            {'code': 'EE202', 'name': 'Electrical Machines'},
            {'code': 'EE203', 'name': 'Power Systems'},
            {'code': 'EE204', 'name': 'Control Systems'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['10:00 EE201', '12:00 EE202']},
            {'day': 'Tuesday', 'slots': ['09:00 EE203', '14:00 EE204']},
            {'day': 'Wednesday', 'slots': ['10:00 EE202 Lab', '13:00 EE201']},
            {'day': 'Thursday', 'slots': ['09:00 EE204', '11:00 EE203']},
            {'day': 'Friday', 'slots': ['10:00 EE201 Tutorial', '14:00 EE202']},
        ],
    },
    # ── BCA ──
    {
        'code': 'BCA',
        'name': 'BCA - Computer Applications',
        'subjects': [
            {'code': 'CA201', 'name': 'Programming in C'},
            {'code': 'CA202', 'name': 'Web Technologies'},
            {'code': 'CA203', 'name': 'Data Structures'},
            {'code': 'CA204', 'name': 'Computer Organization'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 CA201', '11:00 CA202']},
            {'day': 'Tuesday', 'slots': ['10:00 CA203', '14:00 CA204']},
            {'day': 'Wednesday', 'slots': ['09:00 CA201 Lab', '12:00 CA202']},
            {'day': 'Thursday', 'slots': ['10:00 CA204', '14:00 CA203']},
            {'day': 'Friday', 'slots': ['09:00 CA202 Lab', '11:00 CA201']},
        ],
    },
    # ── BSc Programs ──
    {
        'code': 'BSC-PHY',
        'name': 'BSc - Physics',
        'subjects': [
            {'code': 'PH201', 'name': 'Classical Mechanics'},
            {'code': 'PH202', 'name': 'Electromagnetism'},
            {'code': 'PH203', 'name': 'Quantum Mechanics'},
            {'code': 'PH204', 'name': 'Optics'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 PH201', '11:00 PH202']},
            {'day': 'Tuesday', 'slots': ['10:00 PH203', '14:00 PH204']},
            {'day': 'Wednesday', 'slots': ['09:00 PH201 Lab', '12:00 PH202']},
            {'day': 'Thursday', 'slots': ['10:00 PH204', '14:00 PH203']},
            {'day': 'Friday', 'slots': ['09:00 PH202 Lab', '11:00 PH201']},
        ],
    },
    {
        'code': 'BSC-CHEM',
        'name': 'BSc - Chemistry',
        'subjects': [
            {'code': 'CH201', 'name': 'Organic Chemistry'},
            {'code': 'CH202', 'name': 'Inorganic Chemistry'},
            {'code': 'CH203', 'name': 'Physical Chemistry'},
            {'code': 'CH204', 'name': 'Analytical Chemistry'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 CH201', '11:00 CH202']},
            {'day': 'Tuesday', 'slots': ['10:00 CH203', '14:00 CH204']},
            {'day': 'Wednesday', 'slots': ['09:00 CH201 Lab', '12:00 CH202']},
            {'day': 'Thursday', 'slots': ['10:00 CH204', '14:00 CH203']},
            {'day': 'Friday', 'slots': ['09:00 CH202 Lab', '11:00 CH201']},
        ],
    },
    {
        'code': 'BSC-MATH',
        'name': 'BSc - Mathematics',
        'subjects': [
            {'code': 'MT201', 'name': 'Real Analysis'},
            {'code': 'MT202', 'name': 'Linear Algebra'},
            {'code': 'MT203', 'name': 'Differential Equations'},
            {'code': 'MT204', 'name': 'Probability & Statistics'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 MT201', '11:00 MT202']},
            {'day': 'Tuesday', 'slots': ['10:00 MT203', '14:00 MT204']},
            {'day': 'Wednesday', 'slots': ['09:00 MT201 Tutorial', '12:00 MT202']},
            {'day': 'Thursday', 'slots': ['10:00 MT204', '14:00 MT203']},
            {'day': 'Friday', 'slots': ['09:00 MT202 Tutorial', '11:00 MT201']},
        ],
    },
    # ── BCom ──
    {
        'code': 'BCOM',
        'name': 'BCom - Commerce',
        'subjects': [
            {'code': 'CO201', 'name': 'Financial Accounting'},
            {'code': 'CO202', 'name': 'Business Law'},
            {'code': 'CO203', 'name': 'Cost Accounting'},
            {'code': 'CO204', 'name': 'Taxation'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 CO201', '11:00 CO202']},
            {'day': 'Tuesday', 'slots': ['10:00 CO203', '14:00 CO204']},
            {'day': 'Wednesday', 'slots': ['09:00 CO201', '12:00 CO202']},
            {'day': 'Thursday', 'slots': ['10:00 CO204', '14:00 CO203']},
            {'day': 'Friday', 'slots': ['09:00 CO202 Tutorial', '11:00 CO201']},
        ],
    },
    # ── BBA ──
    {
        'code': 'BBA',
        'name': 'BBA - Business Administration',
        'subjects': [
            {'code': 'BA201', 'name': 'Principles of Management'},
            {'code': 'BA202', 'name': 'Marketing Management'},
            {'code': 'BA203', 'name': 'Organizational Behavior'},
            {'code': 'BA204', 'name': 'Business Economics'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 BA201', '11:00 BA202']},
            {'day': 'Tuesday', 'slots': ['10:00 BA203', '14:00 BA204']},
            {'day': 'Wednesday', 'slots': ['09:00 BA202', '12:00 BA201']},
            {'day': 'Thursday', 'slots': ['11:00 BA204', '14:00 BA203']},
            {'day': 'Friday', 'slots': ['10:00 BA201 Tutorial', '12:00 BA202']},
        ],
    },
    # ── BA Programs ──
    {
        'code': 'BA-ENG',
        'name': 'BA - English',
        'subjects': [
            {'code': 'EN201', 'name': 'English Literature'},
            {'code': 'EN202', 'name': 'Linguistics'},
            {'code': 'EN203', 'name': 'Creative Writing'},
            {'code': 'EN204', 'name': 'Modern Poetry'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 EN201', '11:00 EN202']},
            {'day': 'Tuesday', 'slots': ['10:00 EN203', '14:00 EN204']},
            {'day': 'Wednesday', 'slots': ['09:00 EN201', '12:00 EN202']},
            {'day': 'Thursday', 'slots': ['10:00 EN204', '14:00 EN203']},
            {'day': 'Friday', 'slots': ['09:00 EN202 Tutorial', '11:00 EN201']},
        ],
    },
    {
        'code': 'BA-ECO',
        'name': 'BA - Economics',
        'subjects': [
            {'code': 'EC201', 'name': 'Microeconomics'},
            {'code': 'EC202', 'name': 'Macroeconomics'},
            {'code': 'EC203', 'name': 'Indian Economy'},
            {'code': 'EC204', 'name': 'Statistics for Economics'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 EC201', '11:00 EC202']},
            {'day': 'Tuesday', 'slots': ['10:00 EC203', '14:00 EC204']},
            {'day': 'Wednesday', 'slots': ['09:00 EC201', '12:00 EC202']},
            {'day': 'Thursday', 'slots': ['10:00 EC204', '14:00 EC203']},
            {'day': 'Friday', 'slots': ['09:00 EC202 Tutorial', '11:00 EC201']},
        ],
    },
    {
        'code': 'BA-PSY',
        'name': 'BA - Psychology',
        'subjects': [
            {'code': 'PS201', 'name': 'General Psychology'},
            {'code': 'PS202', 'name': 'Developmental Psychology'},
            {'code': 'PS203', 'name': 'Social Psychology'},
            {'code': 'PS204', 'name': 'Abnormal Psychology'},
        ],
        'timetable': [
            {'day': 'Monday', 'slots': ['09:00 PS201', '11:00 PS202']},
            {'day': 'Tuesday', 'slots': ['10:00 PS203', '14:00 PS204']},
            {'day': 'Wednesday', 'slots': ['09:00 PS201', '12:00 PS202']},
            {'day': 'Thursday', 'slots': ['10:00 PS204', '14:00 PS203']},
            {'day': 'Friday', 'slots': ['09:00 PS202 Tutorial', '11:00 PS201']},
        ],
    },
]

DESIGNATION_SALARY_DEFAULTS = [
    {'designation': 'Assistant Professor', 'monthly_salary': 55000},
    {'designation': 'Associate Professor', 'monthly_salary': 78000},
    {'designation': 'Professor', 'monthly_salary': 105000},
    {'designation': 'Lecturer', 'monthly_salary': 42000},
]

PINCODE_FALLBACK = {
    '110001': {'state': 'Delhi', 'city': 'New Delhi'},
    '122001': {'state': 'Haryana', 'city': 'Gurugram'},
    '201301': {'state': 'Uttar Pradesh', 'city': 'Noida'},
    '400001': {'state': 'Maharashtra', 'city': 'Mumbai'},
    '560001': {'state': 'Karnataka', 'city': 'Bengaluru'},
    '700001': {'state': 'West Bengal', 'city': 'Kolkata'},
    '500001': {'state': 'Telangana', 'city': 'Hyderabad'},
}
