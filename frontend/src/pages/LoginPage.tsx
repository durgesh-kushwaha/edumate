import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractApiMessage, fetchDepartments, login as loginRequest, lookupPincode, register as registerRequest } from '../api/erp';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'register';

type DepartmentOption = {
  code: string;
  name: string;
};

const INITIAL_REGISTER = {
  full_name: '',
  email: '',
  password: '',
  enrollment_number: '',
  department: '',
  year: 1,
  gender: '',
  student_phone: '',
  parent_name: '',
  parent_phone: '',
  address_line: '',
  pincode: '',
  state: '',
  city: '',
};

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [registerForm, setRegisterForm] = useState(INITIAL_REGISTER);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void fetchDepartments()
      .then((items) => {
        const options = items.map((item) => ({ code: item.code, name: item.name }));
        setDepartmentOptions(options);
      })
      .catch(() => {
        // Keep registration functional even if catalog API is unavailable.
      });
  }, []);

  const canLookupPincode = useMemo(() => registerForm.pincode.length === 6, [registerForm.pincode]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const response = await loginRequest({ email, password });
        login(response.access_token, response.user);
        navigate('/dashboard');
      } else {
        const response = await registerRequest({
          ...registerForm,
          role: 'student',
        });
        setInfo(response.message);
        setMode('login');
        setRegisterForm(INITIAL_REGISTER);
      }
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_88%_6%,rgba(16,185,129,0.18),transparent_26%)]" />
      <div className="surface-card relative mx-auto grid max-w-6xl gap-8 rounded-3xl p-6 lg:grid-cols-[1.1fr,1fr] lg:p-10">
        <div className="rounded-3xl bg-slate-950 p-6 text-slate-100 shadow-[0_22px_40px_rgba(15,23,42,0.35)]">
          <p className="inline-flex rounded-full bg-cyan-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950">
            EduVision Nexus
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Campus Portal</h1>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">
            Student registrations are reviewed by superadmin before account activation.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/70 p-3 text-sm text-slate-100">Live attendance workflow</div>
            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/70 p-3 text-sm text-slate-100">Faculty controlled sessions</div>
            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/70 p-3 text-sm text-slate-100">Assignments and exams</div>
            <div className="rounded-2xl border border-slate-700/90 bg-slate-900/70 p-3 text-sm text-slate-100">Profile and fee tracking</div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200/90 bg-white/94 p-5 shadow-[0_20px_32px_rgba(15,23,42,0.12)]">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100/90 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                mode === 'login' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white',
              ].join(' ')}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                mode === 'register' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white',
              ].join(' ')}
            >
              Student Registration
            </button>
          </div>

          {mode === 'login' ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Email</span>
                <input required type="email" className="form-field" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-slate-700">Password</span>
                <div className="flex gap-2">
                  <input
                    required
                    minLength={8}
                    type={showPassword ? 'text' : 'password'}
                    className="form-field"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button type="button" className="soft-btn" onClick={() => setShowPassword((prev) => !prev)}>
                    {showPassword ? 'Hide' : 'View'}
                  </button>
                </div>
              </label>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  className="form-field"
                  placeholder="Full Name"
                  value={registerForm.full_name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, full_name: event.target.value }))}
                />
                <input
                  required
                  type="email"
                  className="form-field"
                  placeholder="Email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <input
                  required
                  minLength={8}
                  type={showPassword ? 'text' : 'password'}
                  className="form-field"
                  placeholder="Password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                />
                <button type="button" className="soft-btn" onClick={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? 'Hide' : 'View'}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-field"
                  placeholder="Roll Number"
                  value={registerForm.enrollment_number}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, enrollment_number: event.target.value.replace(/\D/g, '') }))
                  }
                />
                <select
                  className="form-field"
                  required
                  value={registerForm.department}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, department: event.target.value }))}
                >
                  <option value="">Select Department</option>
                  {departmentOptions.map((item) => (
                    <option key={item.code} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  className="form-field"
                  value={registerForm.year}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, year: Number(event.target.value) }))}
                >
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  className="form-field"
                  required
                  value={registerForm.gender}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, gender: event.target.value }))}
                >
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  className="form-field"
                  placeholder="Student Contact"
                  value={registerForm.student_phone}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))
                  }
                />
                <input
                  required
                  className="form-field"
                  placeholder="Parent Name"
                  value={registerForm.parent_name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, parent_name: event.target.value }))}
                />
              </div>

              <input
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                className="form-field"
                placeholder="Parent Contact"
                value={registerForm.parent_phone}
                onChange={(event) =>
                  setRegisterForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))
                }
              />

              <textarea
                required
                className="form-field min-h-20"
                placeholder="Address Line"
                value={registerForm.address_line}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, address_line: event.target.value }))}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="form-field"
                  placeholder="Pincode"
                  value={registerForm.pincode}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  onBlur={() => {
                    if (!canLookupPincode) {
                      return;
                    }
                    void lookupPincode(registerForm.pincode)
                      .then((result) => setRegisterForm((prev) => ({ ...prev, state: result.state, city: result.city })))
                      .catch(() => {
                        // no-op
                      });
                  }}
                />
                <input
                  required
                  className="form-field"
                  placeholder="State"
                  value={registerForm.state}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, state: event.target.value }))}
                />
                <input
                  required
                  className="form-field"
                  placeholder="City"
                  value={registerForm.city}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, city: event.target.value }))}
                />
              </div>
            </div>
          )}

          {error ? <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {info ? <p className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{info}</p> : null}

          <button disabled={loading} className="primary-btn mt-4 w-full">
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Submit For Approval'}
          </button>
        </form>
      </div>
    </div>
  );
}
