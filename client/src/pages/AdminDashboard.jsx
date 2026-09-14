import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Banknote, Download, Eye, Film, ReceiptText, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api.js';

const formatNames = { 'photo-story': 'Photo Story', editorial: 'Editorial Page', 'photo-reveal': 'Photo Reveal', canvas: 'Canvas', chapters: 'Chapters', album: 'Album' };
const nairaFromKobo = (value = 0) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value / 100);
const shortDate = value => value ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

function Status({ value }) {
  const calm = ['success', 'active', 'published', 'pro'].includes(value);
  const warning = ['pending', 'checkout_pending', 'canceling', 'past_due', 'partially_refunded', 'refund pending'].includes(value);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${calm ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : warning ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-white/[.05] text-white/55'}`}>{String(value || 'unknown').replaceAll('_', ' ')}</span>;
}

function Metric({ icon: Icon, label, value, note }) {
  return <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.4rem] border border-white/10 bg-white/[.035] p-5 sm:p-6">
    <div className="mb-6 flex items-center justify-between text-white/45"><span className="text-[11px] font-semibold uppercase tracking-[.16em]">{label}</span><Icon size={17} /></div>
    <p className="text-2xl font-medium tracking-[-.04em] text-white sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-white/40">{note}</p>
  </motion.article>;
}

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState('deliveries');
  const [analytics, setAnalytics] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refund, setRefund] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [analyticsRes, deliveriesRes, usersRes, paymentsRes] = await Promise.all([
        api.get('/v1/admin/analytics'), api.get('/v1/admin/deliveries', { params: { search } }),
        api.get('/v1/admin/users', { params: { search } }), api.get('/v1/admin/payments', { params: { search } })
      ]);
      setAnalytics(analyticsRes.data?.data || null); setDeliveries(deliveriesRes.data?.data || []);
      setUsers(usersRes.data?.data || []); setPayments(paymentsRes.data?.data || []);
    } catch (error) { toast.error(error.response?.data?.message || 'We could not load the admin records.'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(fetchAdminData, 250); return () => window.clearTimeout(timer); }, [fetchAdminData]);

  const updatePlan = async (userId, plan) => {
    try {
      await api.patch(`/v1/admin/users/${userId}/plan`, { plan, reason: plan === 'pro' ? 'Granted by Veylo support' : 'Changed by Veylo support' });
      toast.success(`Account changed to ${plan === 'pro' ? 'Pro' : 'Free'}.`); fetchAdminData();
    } catch (error) { toast.error(error.response?.data?.message || 'We could not change that plan.'); }
  };

  const openRefund = payment => { setRefund(payment); setRefundAmount(String(Math.max(0, payment.amountKobo - payment.refundedAmountKobo) / 100)); setRefundNote(''); };
  const submitRefund = async event => {
    event.preventDefault(); const amountKobo = Math.round(Number(refundAmount) * 100);
    if (!Number.isInteger(amountKobo) || amountKobo < 100) return toast.error('Enter a refund of at least ₦1.');
    try {
      setSubmitting(true); await api.post(`/v1/admin/payments/${refund._id}/refund`, { amountKobo, note: refundNote.trim() });
      toast.success('Paystack accepted the refund request.'); setRefund(null); await fetchAdminData();
    } catch (error) { toast.error(error.response?.data?.message || 'We could not start that refund.'); }
    finally { setSubmitting(false); }
  };

  const tabCount = useMemo(() => ({ deliveries: deliveries.length, users: users.length, payments: payments.length }), [deliveries, users, payments]);
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  return <div className="min-h-screen overflow-x-hidden bg-[#070709] px-4 pb-24 pt-28 text-white sm:px-6 md:px-8 lg:px-12"><div className="mx-auto max-w-7xl">
    <section className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0c0c10] px-5 py-7 sm:px-8 sm:py-9 md:px-10">
      <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#ff5a47]/10 blur-3xl" />
      <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between"><div className="max-w-2xl"><p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#ff9b8e]"><ShieldCheck size={16} /> Veylo administration</p><h1 className="text-3xl font-medium tracking-[-.05em] sm:text-4xl md:text-5xl">See what is happening across Veylo.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-white/50 sm:text-base">Accounts, client deliveries, subscriptions, and payments in one private workspace.</p></div>
        <button type="button" onClick={fetchAdminData} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-white/15 bg-white/[.06] px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 active:scale-95 md:self-auto"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
    </section>

    {analytics && <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Users} label="Accounts" value={analytics.totalUsers.toLocaleString()} note={`${analytics.proUsers.toLocaleString()} currently marked Pro`} /><Metric icon={Film} label="Deliveries" value={analytics.totalDeliveries.toLocaleString()} note={`${analytics.publishedDeliveries.toLocaleString()} live client links`} /><Metric icon={Eye} label="Client views" value={analytics.totalViews.toLocaleString()} note={`${analytics.totalDownloads.toLocaleString()} gallery downloads`} /><Metric icon={Banknote} label="Monthly revenue" value={nairaFromKobo(analytics.monthlyRecurringRevenueKobo)} note={`${analytics.activeSubscriptions.toLocaleString()} paid subscriptions`} /></section>}

    <section className="mt-9"><div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between"><div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[.025] p-1.5">{[['deliveries', Film, 'Deliveries'], ['users', Users, 'Accounts'], ['payments', ReceiptText, 'Payments']].map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all active:scale-95 sm:px-5 ${tab === key ? 'bg-white text-black' : 'text-white/50 hover:bg-white/[.06] hover:text-white'}`}><Icon size={15} /><span className="hidden sm:inline">{label}</span><span className="text-[10px] opacity-55">{tabCount[key]}</span></button>)}</div>
      <label className="relative block w-full lg:w-80"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" /><span className="sr-only">Search records</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this workspace" className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[.035] pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ff9b8e]/60" /></label></div>
      {loading && <div className="py-20 text-center text-sm text-white/45">Loading current records…</div>}

      {!loading && tab === 'deliveries' && <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{deliveries.map(item => <article key={item._id} className="rounded-[1.35rem] border border-white/10 bg-white/[.03] p-5 transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">{formatNames[item.format] || 'Delivery'}</p><h2 className="mt-2 text-lg font-medium text-white">{item.title || item.clientName || 'Untitled delivery'}</h2></div><Status value={item.status} /></div><p className="mt-4 text-sm text-white/50">{item.userId?.studioName || item.userId?.name || 'Unknown studio'}</p><div className="mt-6 flex items-center gap-5 border-t border-white/[.07] pt-4 text-xs text-white/40"><span className="flex items-center gap-1.5"><Eye size={14} />{item.viewsCount || 0}</span><span className="flex items-center gap-1.5"><Download size={14} />{item.downloadsCount || 0}</span><span className="ml-auto">{shortDate(item.updatedAt)}</span></div></article>)}{!deliveries.length && <p className="py-14 text-sm text-white/45">No deliveries match that search.</p>}</div>}

      {!loading && tab === 'users' && <div className="mt-5 overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[.025]"><div className="divide-y divide-white/[.07]">{users.map(account => <article key={account._id} className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-medium text-white">{account.name}</h2>{account.role === 'admin' && <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#ff9b8e]"><ShieldCheck size={12} /> Admin</span>}</div><p className="mt-1 truncate text-sm text-white/42">{account.email}</p><p className="mt-2 text-xs text-white/30">Joined {shortDate(account.createdAt)}</p></div><div className="flex items-center gap-3"><Status value={account.plan} /><label><span className="sr-only">Change plan for {account.name}</span><select value={account.plan === 'pro' ? 'pro' : 'free'} onChange={event => updatePlan(account._id, event.target.value)} className="min-h-11 rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60"><option value="free">Free</option><option value="pro">Pro</option></select></label></div></article>)}</div>{!users.length && <p className="p-10 text-sm text-white/45">No accounts match that search.</p>}</div>}

      {!loading && tab === 'payments' && <div className="mt-5 grid gap-3">{payments.map(payment => { const remaining = Math.max(0, payment.amountKobo - payment.refundedAmountKobo); const refundable = ['success', 'partially_refunded'].includes(payment.status) && remaining > 0 && !payment.refundPendingAmountKobo; return <article key={payment._id} className="grid gap-5 rounded-[1.35rem] border border-white/10 bg-white/[.03] p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(8rem,.7fr)_minmax(8rem,.7fr)_auto] md:items-center md:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-white">{payment.userId?.name || 'Unknown account'}</p><Status value={payment.refundPendingAmountKobo ? 'refund pending' : payment.status} /></div><p className="mt-1 truncate font-mono text-[11px] text-white/35">{payment.reference}</p><p className="mt-2 truncate text-xs text-white/40">{payment.userId?.email || 'No email'} · {shortDate(payment.paidAt || payment.createdAt)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-white/30">Payment</p><p className="mt-1 font-medium">{nairaFromKobo(payment.amountKobo)}</p></div><div><p className="text-[10px] uppercase tracking-wider text-white/30">Refunded</p><p className="mt-1 font-medium text-white/65">{nairaFromKobo(payment.refundedAmountKobo)}</p></div><button type="button" disabled={!refundable} onClick={() => openRefund(payment)} className="min-h-11 rounded-full border border-white/12 px-5 text-xs font-semibold transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[#ff9b8e]/50 enabled:hover:text-[#ffb1a7] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30">Refund</button></article>; })}{!payments.length && <p className="py-14 text-sm text-white/45">No payments match that search.</p>}</div>}
    </section>
  </div>

  {refund && <div className="fixed inset-0 z-[80] grid place-items-end bg-black/75 p-3 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="refund-title" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) setRefund(null); }}><motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={submitRefund} className="w-full max-w-lg rounded-[1.7rem] border border-white/12 bg-[#0c0c10] p-6 shadow-2xl sm:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff5a47]/12 text-[#ff9b8e]"><ReceiptText size={20} /></div><h2 id="refund-title" className="mt-5 text-2xl font-medium tracking-[-.035em]">Refund this payment</h2><p className="mt-2 text-sm leading-6 text-white/48">Paystack will return the money through the original payment method. Veylo will keep an audit record of this request.</p><div className="mt-6 grid gap-4"><label className="text-xs font-semibold text-white/60">Amount in naira<input type="number" min="1" max={(refund.amountKobo - refund.refundedAmountKobo) / 100} step="1" required value={refundAmount} onChange={event => setRefundAmount(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-base text-white outline-none focus:border-[#ff9b8e]/60" /></label><label className="text-xs font-semibold text-white/60">Reason for the audit record<textarea value={refundNote} onChange={event => setRefundNote(event.target.value)} maxLength={240} rows={3} placeholder="What happened?" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /></label></div><div className="mt-7 grid grid-cols-2 gap-3"><button type="button" disabled={submitting} onClick={() => setRefund(null)} className="min-h-12 rounded-full border border-white/12 text-sm font-semibold transition-transform active:scale-95">Keep payment</button><button type="submit" disabled={submitting} className="min-h-12 rounded-full bg-[#ff5a47] px-4 text-sm font-bold text-[#160907] transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">{submitting ? 'Sending…' : 'Send refund'}</button></div></motion.form></div>}
  </div>;
}
