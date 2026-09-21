import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Banknote,
  Bot,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  Eye,
  Film,
  FileDown,
  HardDrive,
  KeyRound,
  LogOut,
  LockKeyhole,
  Mail,
  ReceiptText,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  StickyNote,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  X
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api.js';

const formatNames = {
  'photo-story': 'Photo Story',
  editorial: 'Editorial Page',
  'photo-reveal': 'Photo Reveal',
  canvas: 'Canvas',
  chapters: 'Chapters',
  album: 'Album',
  'event-coverage': 'Event Coverage',
  campaign: 'Campaign'
};

const nairaFromKobo = (value = 0) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(value / 100);

const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value))
    : '—';

const number = (value = 0) => Number(value || 0).toLocaleString('en-NG');

const bytes = (value = 0) => {
  const amount = Number(value || 0);
  if (!amount) return '0 GB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(amount) / Math.log(1024)));
  return `${(amount / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
};

function Status({ value }) {
  const calm = ['success', 'active', 'published', 'pro'].includes(value);
  const warning = [
    'pending',
    'checkout_pending',
    'canceling',
    'past_due',
    'partially_refunded',
    'refund pending'
  ].includes(value);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] ${
        calm
          ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
          : warning
          ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
          : 'border-white/10 bg-white/[.05] text-white/55'
      }`}
    >
      {String(value || 'unknown').replaceAll('_', ' ')}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, note }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between text-white/40">
        <span className="text-[11px] font-semibold uppercase tracking-[.16em]">{label}</span>
        <Icon size={17} />
      </div>
      <p className="text-2xl font-medium tracking-tight text-white sm:text-3xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-white/45">{note}</p>
    </motion.article>
  );
}

function HealthCard({ icon: Icon, label, health }) {
  const state = health?.status || 'unknown';
  const okay = ['healthy', 'idle', 'busy'].includes(state);
  const disabled = state === 'disabled';
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/45"><Icon size={15} />{label}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${okay ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : disabled ? 'border-white/10 bg-white/[.04] text-white/45' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
          {okay ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}{state}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/50">{health?.reason || (health?.latencyMs ? `${health.latencyMs}ms response` : disabled ? 'Not enabled in this environment.' : 'No recent status reported.')}</p>
    </article>
  );
}

export default function AdminDashboardPage({ admin, onLogout }) {
  const [tab, setTab] = useState('deliveries');
  const [analytics, setAnalytics] = useState(null);
  const [operations, setOperations] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refund, setRefund] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [panelErrors, setPanelErrors] = useState({});
  const [accountPlanFilter, setAccountPlanFilter] = useState('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState('all');
  const [accountSourceFilter, setAccountSourceFilter] = useState('all');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDetailLoading, setAccountDetailLoading] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountNote, setAccountNote] = useState('');
  const [accountNoteCategory, setAccountNoteCategory] = useState('general');
  const [supportReason, setSupportReason] = useState('');
  const [proExpiry, setProExpiry] = useState('');

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    const requests = {
      operations: api.get('/v1/admin/operations'),
      analytics: api.get('/v1/admin/analytics'),
      deliveries: api.get('/v1/admin/deliveries', { params: { search } }),
      users: api.get('/v1/admin/users', { params: { search, plan: accountPlanFilter, status: accountStatusFilter, acquisitionSource: accountSourceFilter } }),
      payments: api.get('/v1/admin/payments', { params: { search } })
    };
    const entries = Object.entries(requests);
    const results = await Promise.allSettled(entries.map(([, request]) => request));
    const nextErrors = {};
    results.forEach((result, index) => {
      const [key] = entries[index];
      if (result.status === 'fulfilled' && result.value.data?.success !== false) {
        const data = result.value.data?.data;
        if (key === 'operations') setOperations(data || null);
        if (key === 'analytics') setAnalytics(data || null);
        if (key === 'deliveries') setDeliveries(Array.isArray(data) ? data : []);
        if (key === 'users') setUsers(Array.isArray(data) ? data : []);
        if (key === 'payments') setPayments(Array.isArray(data) ? data : []);
        return;
      }
      const error = result.status === 'rejected' ? result.reason : new Error(result.value?.data?.message || 'This panel is unavailable.');
      nextErrors[key] = error.response?.data?.message || error.message || 'This panel is unavailable.';
    });
    setPanelErrors(nextErrors);
    if (Object.keys(nextErrors).length === entries.length) toast.error('The administration service is unavailable. Try again shortly.');
    setLoading(false);
  }, [accountPlanFilter, accountSourceFilter, accountStatusFilter, search]);

  useEffect(() => {
    const timer = window.setTimeout(fetchAdminData, 300);
    return () => window.clearTimeout(timer);
  }, [fetchAdminData]);

  const updatePlan = async (userId, plan) => {
    try {
      await api.patch(`/v1/admin/users/${userId}/plan`, {
        plan,
        reason: plan === 'pro' ? 'Granted by administrator' : 'Changed by administrator'
      });
      toast.success(`Account changed to ${plan === 'pro' ? 'Pro' : 'Free'}.`);
      fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change account plan.');
    }
  };

  const openAccount = async (account) => {
    setSelectedAccount({ account });
    setAccountNote('');
    setSupportReason('');
    setProExpiry('');
    setAccountDetailLoading(true);
    try {
      const response = await api.get(`/v1/admin/users/${account._id || account.id}`);
      setSelectedAccount(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open this account.');
      setSelectedAccount(null);
    } finally {
      setAccountDetailLoading(false);
    }
  };

  const refreshSelectedAccount = async () => {
    if (!selectedAccount?.account?._id && !selectedAccount?.account?.id && !selectedAccount?.account) return;
    const id = selectedAccount.account?._id || selectedAccount.account?.id || selectedAccount.account;
    try {
      const response = await api.get(`/v1/admin/users/${id}`);
      setSelectedAccount(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not refresh this account.');
    }
  };

  const accountId = selectedAccount?.account?.id || selectedAccount?.account?._id || selectedAccount?.account;

  const changeAccountStatus = async (status) => {
    if (!accountId) return;
    try {
      setAccountActionLoading(true);
      await api.patch(`/v1/admin/users/${accountId}/status`, { status, reason: status === 'suspended' ? 'Suspended during account review' : 'Reactivated after account review' });
      toast.success(status === 'suspended' ? 'Account suspended and sessions signed out.' : 'Account reactivated.');
      await Promise.all([fetchAdminData(), refreshSelectedAccount()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change this account status.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const changeAccountPlan = async (plan, expiresAt = '') => {
    if (!accountId) return;
    try {
      setAccountActionLoading(true);
      await api.patch(`/v1/admin/users/${accountId}/plan`, { plan, expiresAt: plan === 'pro' ? (expiresAt || undefined) : undefined, reason: plan === 'pro' ? 'Granted by administrator' : 'Removed by administrator' });
      toast.success(plan === 'pro' ? 'Pro access granted.' : 'Pro access removed.');
      await Promise.all([fetchAdminData(), refreshSelectedAccount()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change this account plan.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const forceLogoutAccount = async () => {
    if (!accountId) return;
    try {
      setAccountActionLoading(true);
      const response = await api.post(`/v1/admin/users/${accountId}/force-logout`, { reason: 'Signed out by administrator during support review' });
      toast.success(`${response.data?.revokedSessions || 0} session${response.data?.revokedSessions === 1 ? '' : 's'} signed out.`);
      await refreshSelectedAccount();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign this account out.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const saveAccountNote = async (event) => {
    event.preventDefault();
    if (!accountId || !accountNote.trim()) return;
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/users/${accountId}/notes`, { note: accountNote.trim(), category: accountNoteCategory });
      setAccountNote('');
      toast.success('Account note saved.');
      await refreshSelectedAccount();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save this note.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const exportAccount = async () => {
    if (!accountId) return;
    try {
      const response = await api.get(`/v1/admin/users/${accountId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `veylo-account-${accountId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Account export downloaded.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not export this account.');
    }
  };

  const createSupportAccess = async () => {
    if (!accountId || supportReason.trim().length < 8) return toast.error('Write a short support reason first.');
    try {
      setAccountActionLoading(true);
      const response = await api.post(`/v1/admin/users/${accountId}/support-access`, { reason: supportReason.trim() });
      const token = response.data?.data?.token;
      if (token && navigator.clipboard) await navigator.clipboard.writeText(token);
      setSupportReason('');
      toast.success('One-time read-only support code created and copied.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create support access.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const updateDeletionRequest = async (requestId, status) => {
    try {
      setAccountActionLoading(true);
      await api.patch(`/v1/admin/deletion-requests/${requestId}`, { status, resolutionNote: `Marked ${status} from the account workspace.` });
      toast.success('Deletion request updated.');
      await refreshSelectedAccount();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update this deletion request.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const openRefund = (payment) => {
    setRefund(payment);
    setRefundAmount(String(Math.max(0, payment.amountKobo - payment.refundedAmountKobo) / 100));
    setRefundNote('');
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    const amountKobo = Math.round(Number(refundAmount) * 100);
    if (!Number.isInteger(amountKobo) || amountKobo < 100) {
      return toast.error('Enter a refund of at least ₦1.');
    }
    try {
      setSubmitting(true);
      await api.post(`/v1/admin/payments/${refund._id}/refund`, {
        amountKobo,
        note: refundNote.trim()
      });
      toast.success('Paystack accepted the refund request.');
      setRefund(null);
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start that refund.');
    } finally {
      setSubmitting(false);
    }
  };

  const tabCount = useMemo(
    () => ({
      deliveries: deliveries.length,
      users: users.length,
      payments: payments.length
    }),
    [deliveries, users, payments]
  );

  return (
    <div className="min-h-screen bg-[#070709] text-white">
      {/* Top Admin Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070709]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[.04]">
              <img src="/veylo/veylo-mark.svg" alt="Veylo" className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium tracking-tight text-white">veylo</span>
              <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#ff9b8e]">
                Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-white">{admin?.name || admin?.username}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{admin?.role || 'superadmin'}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[.03] px-3.5 py-2 text-xs font-medium text-white/70 transition-colors hover:bg-white/[.08] hover:text-white"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-8">
        {/* Hero banner */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c10] p-6 sm:p-8 md:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#ff5a47]/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#ff9b8e]">
                <ShieldCheck size={16} /> Central Management
              </p>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Veylo Administrative Workspace
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/50 sm:text-base">
                Monitor live deliveries, manage photographer accounts, review revenue, and process refunds.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAdminData}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-white/15 bg-white/[.05] px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 active:scale-95 md:self-auto"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh data</span>
            </button>
          </div>
        </section>

        {/* Operations overview */}
        {panelErrors.operations && !operations && (
          <section className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">
            <div className="flex items-start gap-3"><TriangleAlert size={18} className="mt-0.5 shrink-0" /><div><strong>Operations data is unavailable.</strong><p className="mt-1 text-xs leading-5 text-amber-100/70">{panelErrors.operations}</p></div></div>
          </section>
        )}
        {operations && (
          <>
            <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Users} label="Accounts" value={number(operations.metrics?.accounts?.total)} note={`${number(operations.metrics?.accounts?.newLast30Days)} joined in the last 30 days`} />
              <MetricCard icon={ShieldCheck} label="Verified" value={number(operations.metrics?.accounts?.verified)} note={`${number(operations.metrics?.accounts?.onboardingCompleted)} finished studio setup`} />
              <MetricCard icon={Film} label="Active deliveries" value={number(operations.metrics?.deliveries?.active)} note={`${number(operations.metrics?.deliveries?.published)} published live`} />
              <MetricCard icon={HardDrive} label="Stored media" value={bytes(operations.metrics?.storage?.usedBytes)} note={`${number(operations.metrics?.storage?.nearLimitAccounts)} Pro accounts near their limit`} />
              <MetricCard icon={Bot} label="Failed jobs" value={number(operations.metrics?.jobs?.failedLast24Hours)} note={`${number(operations.metrics?.jobs?.queueDepth)} jobs currently queued or running`} />
              <MetricCard icon={Cloud} label="Failed uploads" value={number(operations.metrics?.uploads?.failedLast24Hours)} note="Recorded in the last 24 hours" />
              <MetricCard icon={Banknote} label="Payment issues" value={number(operations.metrics?.payments?.failedOrDisputedLast24Hours)} note={`${number(operations.metrics?.payments?.pastDueSubscriptions)} subscriptions past due`} />
              <MetricCard icon={Activity} label="Active Pro" value={number(operations.metrics?.accounts?.activePro)} note="Current plan or support grant" />
            </section>

            <section className="mt-6 rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Service health</p><h2 className="mt-1 text-xl font-medium">Can the platform do its work right now?</h2></div><span className="text-xs text-white/35">Updated {shortDate(operations.generatedAt)}</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <HealthCard icon={Database} label="Database" health={operations.providers?.database} />
                <HealthCard icon={Cloud} label="Cloudinary" health={operations.providers?.cloudinary} />
                <HealthCard icon={Bot} label="Delivery AI" health={operations.providers?.ai} />
                <HealthCard icon={Mail} label="Email" health={operations.providers?.email} />
                <HealthCard icon={Server} label="Paystack" health={operations.providers?.paystack} />
              </div>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-3">
              {(operations.workers || []).map(worker => <HealthCard key={worker.workerName} icon={Activity} label={`${worker.workerName} worker`} health={worker} />)}
            </section>
          </>
        )}

        {/* Platform Metrics */}
        {analytics && (
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Users}
              label="Accounts"
              value={analytics.totalUsers.toLocaleString()}
              note={`${analytics.proUsers.toLocaleString()} currently on Pro`}
            />
            <MetricCard
              icon={Film}
              label="Deliveries"
              value={analytics.totalDeliveries.toLocaleString()}
              note={`${analytics.publishedDeliveries.toLocaleString()} published live`}
            />
            <MetricCard
              icon={Eye}
              label="Client Views"
              value={analytics.totalViews.toLocaleString()}
              note={`${analytics.totalDownloads.toLocaleString()} gallery downloads`}
            />
            <MetricCard
              icon={Banknote}
              label="Monthly Revenue"
              value={nairaFromKobo(analytics.monthlyRecurringRevenueKobo)}
              note={`${analytics.activeSubscriptions.toLocaleString()} active paid subscriptions`}
            />
          </section>
        )}

        {/* Section Tabs & Search */}
        <section className="mt-10">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[.025] p-1.5">
              {[
                ['deliveries', Film, 'Deliveries'],
                ['users', Users, 'Accounts'],
                ['payments', ReceiptText, 'Payments']
              ].map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all active:scale-95 sm:px-5 ${
                    tab === key
                      ? 'bg-white text-black'
                      : 'text-white/50 hover:bg-white/[.06] hover:text-white'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="text-[10px] opacity-60">{tabCount[key]}</span>
                </button>
              ))}
            </div>

            <label className="relative block w-full lg:w-80">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records…"
                className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[.03] pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ff9b8e]/60"
              />
            </label>
          </div>

          {loading && (
            <div className="py-20 text-center text-sm text-white/45">
              Loading current records…
            </div>
          )}

          {/* Deliveries Tab */}
          {!loading && tab === 'deliveries' && (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {deliveries.map((item) => (
                <article
                  key={item._id}
                  className="rounded-2xl border border-white/10 bg-white/[.025] p-5 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">
                        {formatNames[item.format] || 'Delivery'}
                      </p>
                      <h2 className="mt-1.5 text-lg font-medium text-white">
                        {item.title || item.clientName || 'Untitled delivery'}
                      </h2>
                    </div>
                    <Status value={item.status} />
                  </div>
                  <p className="mt-4 text-xs text-white/50">
                    Studio: {item.userId?.studio?.name || item.userId?.name || 'Independent Photographer'}
                  </p>
                  <div className="mt-6 flex items-center gap-5 border-t border-white/[.07] pt-4 text-xs text-white/40">
                    <span className="flex items-center gap-1.5">
                      <Eye size={14} />
                      {item.viewsCount || 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Download size={14} />
                      {item.downloadsCount || 0}
                    </span>
                    <span className="ml-auto">{shortDate(item.updatedAt)}</span>
                  </div>
                </article>
              ))}
              {!deliveries.length && (
                <p className="col-span-full py-16 text-center text-sm text-white/45">
                  No deliveries match your search query.
                </p>
              )}
            </div>
          )}

          {/* Accounts Tab */}
          {!loading && tab === 'users' && (
            <div className="mt-6">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Plan
                  <select value={accountPlanFilter} onChange={(event) => setAccountPlanFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60">
                    <option value="all">All plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="studio">Studio</option>
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Status
                  <select value={accountStatusFilter} onChange={(event) => setAccountStatusFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60">
                    <option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Acquisition source
                  <input value={accountSourceFilter === 'all' ? '' : accountSourceFilter} onChange={(event) => setAccountSourceFilter(event.target.value || 'all')} placeholder="Any source" className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" />
                </label>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
                <div className="divide-y divide-white/[.07]">
                  {users.map((account) => (
                    <article key={account._id} className="grid gap-4 p-5 transition-colors hover:bg-white/[.035] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-6">
                      <button type="button" onClick={() => openAccount(account)} className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b8e]/70">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-medium text-white">{account.name}</h2>
                          {account.role === 'admin' && <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#ff9b8e]"><ShieldCheck size={12} /> Legacy Admin</span>}
                          <Status value={account.accountStatus || 'pending'} />
                        </div>
                        <p className="mt-1 truncate text-xs text-white/45">{account.email}</p>
                        <p className="mt-2 truncate text-xs text-white/30">{account.studio?.name || 'Independent photographer'} · {account.acquisition?.source || 'Source not recorded'} · Joined {shortDate(account.createdAt)}</p>
                      </button>
                      <div className="flex items-center gap-3">
                        <Status value={account.plan} />
                        <label><span className="sr-only">Change plan for {account.name}</span><select value={account.plan === 'pro' ? 'pro' : 'free'} onChange={(e) => updatePlan(account._id, e.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs text-white outline-none focus:border-[#ff9b8e]/60"><option value="free">Free</option><option value="pro">Pro</option></select></label>
                        <button type="button" onClick={() => openAccount(account)} className="min-h-10 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/65 transition-colors hover:border-[#ff9b8e]/50 hover:text-white">View</button>
                      </div>
                    </article>
                  ))}
                </div>
                {!users.length && <p className="p-12 text-center text-sm text-white/45">No accounts match your search query.</p>}
              </div>
            </div>
          )}

          {/* Payments Tab */}
          {!loading && tab === 'payments' && (
            <div className="mt-6 grid gap-4">
              {payments.map((payment) => {
                const remaining = Math.max(0, payment.amountKobo - payment.refundedAmountKobo);
                const refundable =
                  ['success', 'partially_refunded'].includes(payment.status) &&
                  remaining > 0 &&
                  !payment.refundPendingAmountKobo;

                return (
                  <article
                    key={payment._id}
                    className="grid gap-5 rounded-2xl border border-white/10 bg-white/[.025] p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(8rem,.7fr)_minmax(8rem,.7fr)_auto] md:items-center md:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-white">
                          {payment.userId?.name || 'Account'}
                        </p>
                        <Status
                          value={
                            payment.refundPendingAmountKobo
                              ? 'refund pending'
                              : payment.status
                          }
                        />
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-white/35">
                        {payment.reference}
                      </p>
                      <p className="mt-2 truncate text-xs text-white/40">
                        {payment.userId?.email || 'No email'} ·{' '}
                        {shortDate(payment.paidAt || payment.createdAt)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-white/30">Payment</p>
                      <p className="mt-1 font-medium">{nairaFromKobo(payment.amountKobo)}</p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-white/30">Refunded</p>
                      <p className="mt-1 font-medium text-white/65">
                        {nairaFromKobo(payment.refundedAmountKobo)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!refundable}
                      onClick={() => openRefund(payment)}
                      className="min-h-10 rounded-full border border-white/15 px-5 text-xs font-semibold transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[#ff9b8e]/50 enabled:hover:text-[#ffb1a7] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Refund
                    </button>
                  </article>
                );
              })}
              {!payments.length && (
                <p className="py-16 text-center text-sm text-white/45">
                  No payments match your search query.
                </p>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Account detail drawer */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="account-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountActionLoading) setSelectedAccount(null); }}>
          <motion.aside initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-white/10 bg-[#0c0c10] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0c0c10]/95 p-5 backdrop-blur sm:p-7">
              <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Account workspace</p><h2 id="account-detail-title" className="mt-1 truncate text-2xl font-medium">{selectedAccount.account?.name || 'Account'}</h2><p className="mt-1 truncate text-xs text-white/45">{selectedAccount.account?.email || ''}</p></div>
              <button type="button" aria-label="Close account details" onClick={() => setSelectedAccount(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:text-white"><X size={18} /></button>
            </div>
            {accountDetailLoading && <div className="p-7 text-sm text-white/45">Loading the account history…</div>}
            {!accountDetailLoading && selectedAccount.account && (
              <div className="space-y-6 p-5 sm:p-7">
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Status</p><div className="mt-2 flex items-center gap-2"><Status value={selectedAccount.account.accountStatus} /><Status value={selectedAccount.account.plan} /></div><p className="mt-3 text-xs text-white/45">{selectedAccount.account.emailVerified ? 'Email verified' : 'Email not verified'} · {selectedAccount.account.onboardingCompletedAt ? 'Onboarding complete' : `Onboarding step ${selectedAccount.account.onboardingStep || 1}`}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Storage</p><p className="mt-2 text-xl font-medium">{bytes(selectedAccount.storage?.bytes || selectedAccount.account.storageUsedBytes)}</p><p className="mt-1 text-xs text-white/45">{number(selectedAccount.storage?.count)} library assets · {selectedAccount.account.studio?.name || 'Independent photographer'}</p></div>
                </section>

                <section className="flex flex-wrap gap-2">
                  {selectedAccount.account.accountStatus === 'suspended' ? <button type="button" disabled={accountActionLoading} onClick={() => changeAccountStatus('active')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-4 text-xs font-bold text-[#07130e] disabled:opacity-50"><UserCheck size={15} /> Reactivate</button> : <button type="button" disabled={accountActionLoading} onClick={() => changeAccountStatus('suspended')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300/30 px-4 text-xs font-semibold text-amber-200 disabled:opacity-50"><UserX size={15} /> Suspend</button>}
                  {selectedAccount.account.plan !== 'pro' && <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] text-white/45">Pro expiry <input type="date" value={proExpiry} onChange={(event) => setProExpiry(event.target.value)} className="min-w-0 bg-transparent text-xs text-white outline-none" /></label>}
                  <button type="button" disabled={accountActionLoading} onClick={() => changeAccountPlan(selectedAccount.account.plan === 'pro' ? 'free' : 'pro', proExpiry)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 disabled:opacity-50"><ShieldCheck size={15} /> {selectedAccount.account.plan === 'pro' ? 'Remove Pro' : 'Grant Pro'}</button>
                  <button type="button" disabled={accountActionLoading} onClick={forceLogoutAccount} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 disabled:opacity-50"><LockKeyhole size={15} /> Sign out sessions</button>
                  <button type="button" onClick={exportAccount} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70"><FileDown size={15} /> Export account</button>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="flex items-center gap-2"><KeyRound size={15} className="text-[#ff9b8e]" /><h3 className="text-sm font-semibold">Read-only support access</h3></div><p className="mt-2 text-xs leading-5 text-white/45">Creates a one-time code that expires in 15 minutes. It cannot change the photographer’s account.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={supportReason} onChange={(event) => setSupportReason(event.target.value)} placeholder="Why does support need access?" className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><button type="button" disabled={accountActionLoading || supportReason.trim().length < 8} onClick={createSupportAccess} className="min-h-10 rounded-xl bg-[#ff5a47] px-4 text-xs font-bold text-[#160907] disabled:opacity-40">Create code</button></div></section>

                <section><div className="flex items-center gap-2"><StickyNote size={15} className="text-[#ff9b8e]" /><h3 className="text-sm font-semibold">Internal notes</h3></div><form onSubmit={saveAccountNote} className="mt-3 space-y-2"><div className="flex gap-2"><select value={accountNoteCategory} onChange={(event) => setAccountNoteCategory(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-[#141419] px-3 text-xs text-white outline-none"><option value="general">General</option><option value="support">Support</option><option value="billing">Billing</option><option value="privacy">Privacy</option><option value="technical">Technical</option></select><button type="submit" disabled={accountActionLoading || !accountNote.trim()} className="min-h-10 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-40">Save note</button></div><textarea value={accountNote} onChange={(event) => setAccountNote(event.target.value)} maxLength={2000} rows={3} placeholder="Write a note for the Veylo team…" className="w-full resize-y rounded-xl border border-white/10 bg-white/[.025] p-3 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /></form><div className="mt-3 space-y-2">{(selectedAccount.notes || []).slice(0, 5).map(note => <div key={note._id} className="rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex items-center justify-between gap-3"><Status value={note.category} /><span className="text-[10px] text-white/30">{shortDate(note.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/65">{note.note}</p></div>)}{!selectedAccount.notes?.length && <p className="text-xs text-white/35">No internal notes yet.</p>}</div></section>

                <section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Account history</h3><span className="text-xs text-white/35">{number((selectedAccount.deliveries || []).length)} deliveries · {number((selectedAccount.subscriptions || []).length)} subscriptions</span></div><div className="mt-3 grid gap-2">{(selectedAccount.deliveries || []).slice(0, 8).map(delivery => <div key={delivery.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{delivery.title || delivery.clientName || 'Untitled delivery'}</p><p className="mt-1 text-[11px] text-white/40">{formatNames[delivery.format] || delivery.format || 'Delivery'} · {number(delivery.photoCount)} photographs</p></div><Status value={delivery.status} /></div>)}{!selectedAccount.deliveries?.length && <p className="text-xs text-white/35">No delivery records yet.</p>}</div></section>

                {(selectedAccount.deletionRequests || []).length > 0 && <section><h3 className="text-sm font-semibold">Deletion requests</h3><div className="mt-3 space-y-2">{selectedAccount.deletionRequests.map(request => <div key={request._id} className="flex flex-col gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3 sm:flex-row sm:items-center sm:justify-between"><div><Status value={request.status} /><p className="mt-2 text-xs text-white/55">{request.reason || 'No reason provided.'}</p></div><select value={request.status} disabled={accountActionLoading || request.status === 'completed'} onChange={(event) => updateDeletionRequest(request._id, event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-[#141419] px-3 text-xs text-white outline-none"><option value={request.status}>{request.status}</option><option value="processing">Processing</option><option value="approved">Approve</option><option value="rejected">Reject</option><option value="completed">Complete</option></select></div>)}</div></section>}
              </div>
            )}
          </motion.aside>
        </div>
      )}

      {/* Refund Modal */}
      {refund && (
        <div
          className="fixed inset-0 z-50 grid place-items-end bg-black/80 p-4 backdrop-blur-sm sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setRefund(null);
          }}
        >
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={submitRefund}
            className="w-full max-w-lg rounded-3xl border border-white/12 bg-[#0c0c10] p-6 shadow-2xl sm:p-8"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff5a47]/10 text-[#ff9b8e]">
              <ReceiptText size={20} />
            </div>

            <h2 id="refund-title" className="mt-5 text-2xl font-medium tracking-tight">
              Issue Payment Refund
            </h2>
            <p className="mt-2 text-xs leading-5 text-white/50">
              Paystack will reverse the funds directly to the customer’s original payment method. An administrative audit log will record this action.
            </p>

            <div className="mt-6 space-y-4">
              <label className="block text-xs font-semibold text-white/60">
                Amount in Naira (₦)
                <input
                  type="number"
                  min="1"
                  max={(refund.amountKobo - refund.refundedAmountKobo) / 100}
                  step="1"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-[#ff9b8e]/60"
                />
              </label>

              <label className="block text-xs font-semibold text-white/60">
                Audit Reason
                <textarea
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  maxLength={240}
                  rows={3}
                  placeholder="Reason for approving this refund…"
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60"
                />
              </label>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setRefund(null)}
                className="min-h-11 rounded-full border border-white/12 text-xs font-semibold transition-transform active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-11 rounded-full bg-[#ff5a47] px-4 text-xs font-bold text-[#160907] transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                {submitting ? 'Processing…' : 'Confirm refund'}
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </div>
  );
}
