import { useEffect, useState } from 'react';
import {
  createStudentPaymentLink,
  extractApiMessage,
  fetchFeesForAdmin,
  fetchStudentFees,
  updateFeeStatus,
} from '../api/erp';
import Loader from '../components/Loader';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import type { FeeItem, StudentFeeResponse } from '../types';

const EMPTY_STUDENT_FEES: StudentFeeResponse = { items: [], total_pending: 0 };

export default function FeesPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [adminFees, setAdminFees] = useState<FeeItem[]>([]);
  const [studentFees, setStudentFees] = useState<StudentFeeResponse>(EMPTY_STUDENT_FEES);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      if (role === 'admin' || role === 'superadmin') {
        setAdminFees(await fetchFeesForAdmin());
      } else if (role === 'student') {
        setStudentFees(await fetchStudentFees());
      }
    } catch (err: unknown) {
      setError(extractApiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [role]);

  if (role === 'teacher') {
    return (
      <SectionCard title="Fees & Payments">
        <p className="text-sm text-slate-700">Fee management is available for admin and student roles.</p>
      </SectionCard>
    );
  }

  if (loading) {
    return <Loader label="Loading fees..." />;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {feedback ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}

      {role === 'admin' || role === 'superadmin' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Fee Items" value={adminFees.length} />
            <StatCard label="Pending" value={adminFees.filter((item) => item.status === 'pending').length} />
            <StatCard
              label="Outstanding"
              value={`₹${adminFees
                .filter((item) => item.status === 'pending')
                .reduce((sum, item) => sum + item.amount, 0)
                .toLocaleString()}`}
            />
          </div>

          <SectionCard title="Fee Ledger" subtitle="Admin can update status after payment verification.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-2 py-2">Student</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Due Date</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Payment Link</th>
                  </tr>
                </thead>
                <tbody>
                  {adminFees.map((fee) => (
                    <tr key={fee.id} className="border-b border-slate-100">
                      <td className="px-2 py-2">{fee.student_name || fee.enrollment_number || '-'}</td>
                      <td className="px-2 py-2">{fee.title}</td>
                      <td className="px-2 py-2">₹{fee.amount.toLocaleString()}</td>
                      <td className="px-2 py-2">{new Date(fee.due_date).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        <select
                          className="form-field max-w-32"
                          value={fee.status}
                          onChange={(event) => {
                            const status = event.target.value as FeeItem['status'];
                            setError('');
                            setFeedback('');
                            void updateFeeStatus(fee.id, status)
                              .then(() => {
                                setFeedback('Fee status updated.');
                                return loadData();
                              })
                              .catch((err: unknown) => setError(extractApiMessage(err)));
                          }}
                        >
                          <option value="pending">pending</option>
                          <option value="paid">paid</option>
                          <option value="overdue">overdue</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <a className="text-sm text-cyan-700 underline" href={fee.payment_link} target="_blank" rel="noreferrer">
                          Razorpay Link
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {adminFees.length === 0 ? <p className="py-3 text-sm text-slate-500">No fee records found.</p> : null}
            </div>
          </SectionCard>
        </>
      ) : null}

      {role === 'student' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Pending Total" value={`₹${studentFees.total_pending.toLocaleString()}`} />
            <StatCard label="Items" value={studentFees.items.length} />
          </div>

          <SectionCard title="Pay Fees" subtitle="Open the payment link and complete payment.">
            <div className="space-y-3">
              {studentFees.items.map((fee) => (
                <article key={fee.id} className="rounded-2xl border border-slate-100 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{fee.title}</p>
                      <p className="text-xs text-slate-600">
                        Amount ₹{fee.amount.toLocaleString()} | Due {new Date(fee.due_date).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{fee.notes}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          'rounded-full px-2 py-1 text-xs font-semibold',
                          fee.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : fee.status === 'overdue'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700',
                        ].join(' ')}
                      >
                        {fee.status}
                      </span>
                      {fee.status !== 'paid' ? (
                        <button
                          className="primary-btn"
                          onClick={() => {
                            setError('');
                            setFeedback('');
                            void createStudentPaymentLink(fee.id)
                              .then((response) => {
                                window.open(response.payment_link, '_blank', 'noopener,noreferrer');
                                setFeedback('Payment page opened. Complete payment and wait for admin confirmation.');
                              })
                              .catch((err: unknown) => setError(extractApiMessage(err)));
                          }}
                        >
                          Pay Now
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {studentFees.items.length === 0 ? <p className="text-sm text-slate-500">No fee records found.</p> : null}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
