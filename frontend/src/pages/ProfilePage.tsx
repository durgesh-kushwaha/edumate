import { useEffect, useState } from 'react';
import { extractApiMessage, fetchAccountMe, lookupPincode, updateAccountMe, updateAccountPassword } from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';

type ProfileForm = {
  full_name: string;
  student_phone: string;
  parent_name: string;
  parent_phone: string;
  faculty_phone: string;
  address_line: string;
  pincode: string;
  state: string;
  city: string;
};

const INITIAL_FORM: ProfileForm = {
  full_name: '',
  student_phone: '',
  parent_name: '',
  parent_phone: '',
  faculty_phone: '',
  address_line: '',
  pincode: '',
  state: '',
  city: '',
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [profileKind, setProfileKind] = useState<'student' | 'faculty' | 'user'>('user');
  const [form, setForm] = useState<ProfileForm>(INITIAL_FORM);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    void fetchAccountMe()
      .then((data) => {
        setProfileKind(data.profile_kind);
        const profile = (data.profile || {}) as Record<string, unknown>;
        setForm({
          full_name: data.user.full_name || '',
          student_phone: String(profile.student_phone || ''),
          parent_name: String(profile.parent_name || ''),
          parent_phone: String(profile.parent_phone || ''),
          faculty_phone: String(profile.faculty_phone || ''),
          address_line: String(profile.address_line || ''),
          pincode: String(profile.pincode || ''),
          state: String(profile.state || ''),
          city: String(profile.city || ''),
        });
      })
      .catch((err: unknown) => setError(extractApiMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Loader label="Loading profile..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      <SectionCard title="Profile Details" subtitle="Update your personal/contact information.">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setFeedback('');
            void updateAccountMe({
              full_name: form.full_name,
              student_phone: form.student_phone,
              parent_name: form.parent_name,
              parent_phone: form.parent_phone,
              faculty_phone: form.faculty_phone,
              address_line: form.address_line,
              pincode: form.pincode,
              state: form.state,
              city: form.city,
            })
              .then(() => setFeedback('Profile updated successfully.'))
              .catch((err: unknown) => setError(extractApiMessage(err)));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="form-field" placeholder="Full Name" value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} />

            {profileKind === 'student' ? (
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Student Contact" value={form.student_phone} onChange={(event) => setForm((prev) => ({ ...prev, student_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            ) : null}

            {profileKind === 'student' ? (
              <input className="form-field" placeholder="Parent Name" value={form.parent_name} onChange={(event) => setForm((prev) => ({ ...prev, parent_name: event.target.value }))} />
            ) : null}

            {profileKind === 'student' ? (
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Parent Contact" value={form.parent_phone} onChange={(event) => setForm((prev) => ({ ...prev, parent_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            ) : null}

            {profileKind === 'faculty' ? (
              <input className="form-field" inputMode="numeric" maxLength={10} placeholder="Faculty Contact" value={form.faculty_phone} onChange={(event) => setForm((prev) => ({ ...prev, faculty_phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            ) : null}
          </div>

          {profileKind === 'student' ? (
            <>
              <textarea className="form-field min-h-20" placeholder="Address" value={form.address_line} onChange={(event) => setForm((prev) => ({ ...prev, address_line: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="form-field"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Pincode"
                  value={form.pincode}
                  onChange={(event) => setForm((prev) => ({ ...prev, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  onBlur={() => {
                    if (form.pincode.length !== 6) {
                      return;
                    }
                    void lookupPincode(form.pincode)
                      .then((result) => setForm((prev) => ({ ...prev, state: result.state, city: result.city })))
                      .catch(() => {
                        // No-op
                      });
                  }}
                />
                <input className="form-field" placeholder="State" value={form.state} onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))} />
                <input className="form-field" placeholder="City" value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
              </div>
            </>
          ) : null}

          <button className="primary-btn">Save Profile</button>
        </form>
      </SectionCard>

      <SectionCard title="Change Password">
        <form
          className="grid gap-3 sm:max-w-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setFeedback('');
            void updateAccountPassword(passwordForm)
              .then(() => {
                setFeedback('Password updated successfully.');
                setPasswordForm({ current_password: '', new_password: '' });
              })
              .catch((err: unknown) => setError(extractApiMessage(err)));
          }}
        >
          <div className="flex gap-2">
            <input
              className="form-field"
              type={showCurrentPassword ? 'text' : 'password'}
              placeholder="Current Password"
              value={passwordForm.current_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))}
            />
            <button type="button" className="soft-btn" onClick={() => setShowCurrentPassword((prev) => !prev)}>
              {showCurrentPassword ? 'Hide' : 'View'}
            </button>
          </div>

          <div className="flex gap-2">
            <input
              className="form-field"
              type={showNewPassword ? 'text' : 'password'}
              placeholder="New Password"
              value={passwordForm.new_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
            />
            <button type="button" className="soft-btn" onClick={() => setShowNewPassword((prev) => !prev)}>
              {showNewPassword ? 'Hide' : 'View'}
            </button>
          </div>

          <button className="primary-btn">Update Password</button>
        </form>
      </SectionCard>
    </div>
  );
}
