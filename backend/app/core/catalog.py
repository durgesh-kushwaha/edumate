DEPARTMENT_CATALOG = [
    {
        'code': 'CSE',
        'name': 'Computer Science',
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
        'name': 'Electronics & Communication',
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
        'name': 'Mechanical Engineering',
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
