import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { DEPARTMENTS, SUPERADMIN_EMAIL } from '@/lib/catalog';
import { ensureDbSetup, getDb } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

function validDepartment(value: string) {
  return DEPARTMENTS.some((item) => item.name === value);
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbSetup();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      role?: string;
      full_name?: string;
      enrollment_number?: string;
      department?: string;
      year?: number;
      gender?: string;
      student_phone?: string;
      parent_name?: string;
      parent_phone?: string;
      address_line?: string;
      pincode?: string;
      state?: string;
      city?: string;
    };

    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const role = (body.role || 'student').trim().toLowerCase();
    const fullName = (body.full_name || '').trim();
    const roll = String(body.enrollment_number || '').trim();
    const department = String(body.department || '').trim();
    const year = Number(body.year || 1);
    const gender = String(body.gender || '').trim();
    const studentPhone = String(body.student_phone || '').trim();
    const parentName = String(body.parent_name || '').trim();
    const parentPhone = String(body.parent_phone || '').trim();
    const addressLine = String(body.address_line || '').trim();
    const pincode = String(body.pincode || '').trim();
    const state = String(body.state || '').trim();
    const city = String(body.city || '').trim();

    if (!email || !password || !fullName) {
      return jsonError('Name, email and password are required', 400);
    }
    if (email === SUPERADMIN_EMAIL.toLowerCase()) {
      return jsonError('This email is reserved for superadmin account', 400);
    }
    if (role !== 'student') {
      return jsonError('Only student self-registration is allowed', 400);
    }
    if (!/^\d+$/.test(roll)) {
      return jsonError('Roll number must contain only numbers', 400);
    }
    if (!validDepartment(department)) {
      return jsonError('Select a valid department', 400);
    }
    if (!Number.isFinite(year) || year < 1 || year > 6) {
      return jsonError('Year must be between 1 and 6', 400);
    }
    if (!/^\d{10}$/.test(studentPhone) || !/^\d{10}$/.test(parentPhone)) {
      return jsonError('Student and parent contact must be 10 digits', 400);
    }
    if (!/^\d{6}$/.test(pincode)) {
      return jsonError('Pincode must be 6 digits', 400);
    }

    const db = await getDb();
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return jsonError('Email already exists', 409);
    }

    const existingPending = await db.collection('registration_requests').findOne({ email, status: 'pending' });
    if (existingPending) {
      return jsonError('A pending registration request already exists for this email', 409);
    }

    const inserted = await db.collection('registration_requests').insertOne({
      email,
      hashed_password: hashPassword(password),
      raw_password: password,
      role: 'student',
      full_name: fullName,
      enrollment_number: roll,
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
      status: 'pending',
      remarks: '',
      submitted_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return jsonOk(
      {
        request_id: inserted.insertedId.toString(),
        status: 'pending',
        message: 'Registration submitted. Superadmin approval is required before login.',
      },
      201,
    );
  } catch {
    return jsonError('Unable to submit registration', 500);
  }
}
