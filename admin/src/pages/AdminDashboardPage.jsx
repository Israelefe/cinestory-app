import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  Banknote,
  Bot,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  Download,
  Eye,
  Film,
  FileDown,
  Globe2,
  HardDrive,
  KeyRound,
  LogOut,
  LockKeyhole,
  Mail,
  MessageCircle,
  Mic2,
  Music2,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
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

function ConfigToggle({ label, checked, onChange, note }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-4 transition-colors hover:border-white/20"><span className="min-w-0"><span className="block text-xs font-semibold text-white">{label}</span>{note && <span className="mt-1 block text-[11px] leading-5 text-white/40">{note}</span>}</span><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff7867]" /></label>;
}

function SecurityCreateAdminPanel({ value, onChange, onSubmit, disabled }) {
  return <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Add an administrator</p><h2 className="mt-1 text-xl font-medium">Give a trusted teammate a scoped role</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/45">Passwords are shown only in this form. Ask the new administrator to set up an authenticator on their first visit.</p></div><form onSubmit={onSubmit} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Full name" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><input required value={value.username} onChange={(event) => onChange({ ...value, username: event.target.value.replace(/\s/g, '') })} placeholder="Username" autoCapitalize="none" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><input required minLength={12} value={value.password} onChange={(event) => onChange({ ...value, password: event.target.value })} placeholder="Temporary password (12+ chars)" type="password" className="min-h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><select value={value.role} onChange={(event) => onChange({ ...value, role: event.target.value })} className="min-h-10 rounded-xl border border-white/10 bg-[#141419] px-3 text-xs text-white outline-none focus:border-[#ff9b8e]/60"><option value="operations">Operations</option><option value="finance">Finance</option><option value="support">Support</option><option value="analyst">Analyst</option><option value="read-only">Read-only</option><option value="superadmin">Superadmin</option></select><button type="submit" disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50"><Users size={14} />Create account</button></form></section>;
}

function SecurityProviderPanel({ providers = {}, secretStatus = {}, admins = [], onStatusChange, disabled, currentAdminId }) {
  return <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Provider and secret status</p><h2 className="mt-1 text-xl font-medium">Keys are never shown here</h2><p className="mt-2 text-xs leading-5 text-white/45">This panel only reports whether required providers are configured. It never returns a token, password, or API key.</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(secretStatus).map(([key, configured]) => <div key={key} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold capitalize text-white">{key}</span><Status value={configured ? 'active' : 'attention'} /></div><p className="mt-2 text-[11px] text-white/40">{configured ? 'Configured on the server' : 'Not configured'}</p></div>)}{Object.entries(providers).map(([key, provider]) => <div key={`provider-${key}`} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-white">{provider.provider || key}</span><Status value={provider.configured ? 'active' : 'attention'} /></div><p className="mt-2 truncate text-[11px] text-white/40">{provider.model || provider.from || 'Provider configuration'}</p></div>)}</div><div className="mt-6 border-t border-white/10 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Account status</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{admins.map(adminRecord => <label key={adminRecord.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] px-3 py-2.5 text-xs text-white/65"><span className="truncate">{adminRecord.name}</span><select value={adminRecord.accountStatus} disabled={disabled || String(adminRecord.id) === String(currentAdminId)} onChange={(event) => onStatusChange(adminRecord, event.target.value)} className="min-h-8 rounded-lg border border-white/10 bg-[#141419] px-2 text-[11px] text-white outline-none focus:border-[#ff9b8e]/60"><option value="active">Active</option><option value="suspended">Suspended</option></select></label>)}</div></div></section>;
}

export default function AdminDashboardPage({ admin, onLogout }) {
  const [tab, setTab] = useState('deliveries');
  const [analytics, setAnalytics] = useState(null);
  const [operations, setOperations] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [financeOverview, setFinanceOverview] = useState(null);
  const [financeReconciliation, setFinanceReconciliation] = useState(null);
  const [financeReconciling, setFinanceReconciling] = useState(false);
  const [aiJobs, setAiJobs] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [accessOverview, setAccessOverview] = useState(null);
  const [volumeJobs, setVolumeJobs] = useState([]);
  const [storageOverview, setStorageOverview] = useState(null);
  const [storageScan, setStorageScan] = useState(null);
  const [storageScanLoading, setStorageScanLoading] = useState(false);
  const [musicOverview, setMusicOverview] = useState(null);
  const [portfolioOverview, setPortfolioOverview] = useState(null);
  const [supportOverview, setSupportOverview] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [runtimeConfigSaving, setRuntimeConfigSaving] = useState(false);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityActionLoading, setSecurityActionLoading] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [newAdmin, setNewAdmin] = useState({ username: '', name: '', password: '', role: 'support' });
  const [selectedSupportTicket, setSelectedSupportTicket] = useState(null);
  const [supportDetailLoading, setSupportDetailLoading] = useState(false);
  const [supportReply, setSupportReply] = useState('');
  const [supportInternal, setSupportInternal] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [volumeDetailLoading, setVolumeDetailLoading] = useState(false);
  const [volumeCategoryFilter, setVolumeCategoryFilter] = useState('all');
  const [volumeStatusFilter, setVolumeStatusFilter] = useState('all');
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
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('all');
  const [deliveryFormatFilter, setDeliveryFormatFilter] = useState('all');
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [deliveryDetailLoading, setDeliveryDetailLoading] = useState(false);
  const [aiJobStatusFilter, setAiJobStatusFilter] = useState('all');
  const [aiJobTypeFilter, setAiJobTypeFilter] = useState('all');

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    const requests = {
      operations: api.get('/v1/admin/operations'),
      analytics: api.get('/v1/admin/analytics'),
      deliveries: api.get('/v1/admin/deliveries', { params: { search, status: deliveryStatusFilter, format: deliveryFormatFilter } }),
      users: api.get('/v1/admin/users', { params: { search, plan: accountPlanFilter, status: accountStatusFilter, acquisitionSource: accountSourceFilter } }),
      finance: api.get('/v1/admin/finance', { params: { search } }),
      aiJobs: api.get('/v1/admin/ai/jobs', { params: { search, status: aiJobStatusFilter, type: aiJobTypeFilter } }),
      access: api.get('/v1/admin/client-access', { params: { search } }),
      volume: api.get('/v1/admin/volume', { params: { search, category: volumeCategoryFilter, status: volumeStatusFilter } }),
      storage: api.get('/v1/admin/storage', { params: { search } }),
      musicNarration: api.get('/v1/admin/music-narration', { params: { search } }),
      portfolio: api.get('/v1/admin/portfolios', { params: { search } }),
      support: api.get('/v1/admin/support/tickets', { params: { search } }),
      configuration: api.get('/v1/admin/configuration'),
      security: api.get('/v1/admin/security')
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
        if (key === 'finance') { setFinanceOverview(data || null); setPayments(Array.isArray(data?.payments) ? data.payments : []); }
        if (key === 'aiJobs') { setAiJobs(Array.isArray(data) ? data : []); setAiSummary(result.value.data?.summary || null); }
        if (key === 'access') setAccessOverview(data || null);
        if (key === 'volume') setVolumeJobs(Array.isArray(data) ? data : []);
        if (key === 'storage') setStorageOverview(data || null);
        if (key === 'musicNarration') setMusicOverview(data || null);
        if (key === 'portfolio') setPortfolioOverview(data || null);
        if (key === 'support') setSupportOverview(data || null);
        if (key === 'configuration') setRuntimeConfig(data || null);
        if (key === 'security') setSecurityOverview(data || null);
        return;
      }
      const error = result.status === 'rejected' ? result.reason : new Error(result.value?.data?.message || 'This panel is unavailable.');
      nextErrors[key] = error.response?.data?.message || error.message || 'This panel is unavailable.';
    });
    setPanelErrors(nextErrors);
    if (Object.keys(nextErrors).length === entries.length) toast.error('The administration service is unavailable. Try again shortly.');
    setLoading(false);
  }, [accountPlanFilter, accountSourceFilter, accountStatusFilter, aiJobStatusFilter, aiJobTypeFilter, deliveryFormatFilter, deliveryStatusFilter, search, volumeCategoryFilter, volumeStatusFilter]);

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

  const openDelivery = async (delivery) => {
    setSelectedDelivery({ summary: delivery });
    setDeliveryDetailLoading(true);
    try {
      const response = await api.get(`/v1/admin/deliveries/${delivery.id || delivery._id || delivery.publicId}`);
      setSelectedDelivery(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open this delivery.');
      setSelectedDelivery(null);
    } finally {
      setDeliveryDetailLoading(false);
    }
  };

  const refreshSelectedDelivery = async () => {
    const id = selectedDelivery?.id || selectedDelivery?.summary?.id || selectedDelivery?.publicId || selectedDelivery?.summary?.publicId;
    if (!id) return;
    try {
      const response = await api.get(`/v1/admin/deliveries/${id}`);
      setSelectedDelivery(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not refresh this delivery.');
    }
  };

  const openVolume = async (job) => {
    setSelectedVolume({ summary: job });
    setVolumeDetailLoading(true);
    try {
      const response = await api.get(`/v1/admin/volume/${job.id || job.publicId}`);
      setSelectedVolume(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open this volume delivery.');
      setSelectedVolume(null);
    } finally {
      setVolumeDetailLoading(false);
    }
  };

  const refreshSelectedVolume = async () => {
    const id = selectedVolume?.id || selectedVolume?.summary?.id || selectedVolume?.publicId || selectedVolume?.summary?.publicId;
    if (!id) return;
    try {
      const response = await api.get(`/v1/admin/volume/${id}`);
      setSelectedVolume(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not refresh this volume delivery.');
    }
  };

  const volumeAction = async (action, message, body = {}) => {
    const id = selectedVolume?.id || selectedVolume?.summary?.id || selectedVolume?.publicId || selectedVolume?.summary?.publicId;
    if (!id) return;
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/volume/${id}/${action}`, body);
      toast.success(message);
      await Promise.all([fetchAdminData(), refreshSelectedVolume()]);
    } catch (error) {
      toast.error(error.response?.data?.message || `Could not ${action} this volume delivery.`);
    } finally {
      setAccountActionLoading(false);
    }
  };

  const deleteSelectedVolume = async () => {
    const id = selectedVolume?.id || selectedVolume?.summary?.id || selectedVolume?.publicId || selectedVolume?.summary?.publicId;
    if (!id || !window.confirm('Delete this volume delivery and its recipient links?')) return;
    try {
      setAccountActionLoading(true);
      await api.delete(`/v1/admin/volume/${id}`, { data: { reason: 'Deleted from the admin volume workspace' } });
      toast.success('Volume delivery deleted.');
      setSelectedVolume(null);
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete this volume delivery.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const deliveryAction = async (action, message) => {
    const id = selectedDelivery?.id || selectedDelivery?.summary?.id || selectedDelivery?.publicId || selectedDelivery?.summary?.publicId;
    if (!id) return;
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/deliveries/${id}/${action}`, { reason: message });
      toast.success(message);
      await Promise.all([fetchAdminData(), refreshSelectedDelivery()]);
    } catch (error) {
      toast.error(error.response?.data?.message || `Could not ${action.replace('-', ' ')} this delivery.`);
    } finally {
      setAccountActionLoading(false);
    }
  };

  const deleteSelectedDelivery = async () => {
    const id = selectedDelivery?.id || selectedDelivery?.summary?.id || selectedDelivery?.publicId || selectedDelivery?.summary?.publicId;
    if (!id || !window.confirm('Delete this delivery and close its client link?')) return;
    try {
      setAccountActionLoading(true);
      await api.delete(`/v1/admin/deliveries/${id}`, { data: { reason: 'Deleted from the admin delivery workspace' } });
      toast.success('Delivery deleted.');
      setSelectedDelivery(null);
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete this delivery.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const retrySelectedJob = async (jobId) => {
    const id = selectedDelivery?.id || selectedDelivery?.summary?.id || selectedDelivery?.publicId || selectedDelivery?.summary?.publicId;
    if (!id || !jobId) return;
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/deliveries/${id}/jobs/${jobId}/retry`);
      toast.success('Job queued again.');
      await Promise.all([fetchAdminData(), refreshSelectedDelivery()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not retry this job.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const retryAiJob = async (jobId) => {
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/ai/jobs/${jobId}/retry`);
      toast.success('AI job queued again.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not retry this AI job.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const cancelAiJob = async (jobId) => {
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/ai/jobs/${jobId}/cancel`);
      toast.success('AI job cancellation requested.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not cancel this AI job.');
    } finally {
      setAccountActionLoading(false);
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
      payments: payments.length,
      aiJobs: aiJobs.length,
      access: accessOverview?.deliveries?.length || 0,
      volume: volumeJobs.length,
      storage: storageOverview?.accounts?.length || 0,
      musicNarration: musicOverview?.catalogue?.filtered || 0,
      portfolio: portfolioOverview?.portfolios?.length || 0,
      support: supportOverview?.tickets?.length || 0,
      configuration: runtimeConfig ? 1 : 0,
      security: securityOverview?.summary?.adminCount || 0
    }),
    [accessOverview, aiJobs, deliveries, users, payments, volumeJobs, storageOverview, musicOverview, portfolioOverview, supportOverview, runtimeConfig, securityOverview]
  );

  const runStorageScan = async () => {
    setStorageScanLoading(true);
    try {
      const response = await api.post('/v1/admin/storage/scan');
      setStorageScan(response.data?.data || null);
      toast.success('Cloudinary reference scan completed.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'We could not scan Cloudinary references.');
    } finally {
      setStorageScanLoading(false);
    }
  };

  const reconcileFinance = async () => {
    setFinanceReconciling(true);
    try {
      const response = await api.get('/v1/admin/finance/reconcile');
      setFinanceReconciliation(response.data?.data || null);
      toast.success('Paystack reconciliation completed.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Paystack reconciliation could not be completed.');
    } finally {
      setFinanceReconciling(false);
    }
  };

  const exportFinanceCsv = async () => {
    try {
      const response = await api.get('/v1/admin/finance/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'veylo-finance-export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.message || 'We could not export finance records.');
    }
  };

  const unpublishPortfolio = async (portfolio) => {
    if (!portfolio?.id || !window.confirm(`Make ${portfolio.studioName || 'this portfolio'} private?`)) return;
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/portfolios/${portfolio.id}/unpublish`, { reason: 'Made private from the portfolio operations workspace' });
      toast.success('Portfolio is now private.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not make this portfolio private.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const openSupportTicket = async (ticket) => {
    setSelectedSupportTicket({ summary: ticket });
    setSupportReply('');
    setModerationReason('');
    setSupportInternal(false);
    setSupportDetailLoading(true);
    try {
      const response = await api.get(`/v1/admin/support/tickets/${ticket.id}`);
      setSelectedSupportTicket(response.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open this support request.');
      setSelectedSupportTicket(null);
    } finally {
      setSupportDetailLoading(false);
    }
  };

  const updateSupportTicket = async (body, successMessage = 'Support request updated.') => {
    const id = selectedSupportTicket?.id || selectedSupportTicket?.summary?.id;
    if (!id) return;
    try {
      setAccountActionLoading(true);
      const response = await api.patch(`/v1/admin/support/tickets/${id}`, body);
      setSelectedSupportTicket(current => ({ ...(current || {}), ...(response.data?.data || {}) }));
      setSupportReply('');
      toast.success(successMessage);
      await fetchAdminData();
      const detail = await api.get(`/v1/admin/support/tickets/${id}`);
      setSelectedSupportTicket(detail.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update this support request.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const moderateSupport = async (action, targetType = 'delivery') => {
    const id = selectedSupportTicket?.id || selectedSupportTicket?.summary?.id;
    if (!id || moderationReason.trim().length < 8) return toast.error('Write the reason for this moderation action first.');
    const targetId = selectedSupportTicket?.resourceId || selectedSupportTicket?.delivery?.publicId || selectedSupportTicket?.summary?.delivery?.publicId || '';
    try {
      setAccountActionLoading(true);
      await api.post(`/v1/admin/support/tickets/${id}/moderate`, { action, targetType, targetId, reason: moderationReason.trim() });
      toast.success(action === 'takedown' ? 'The reported item was made private.' : 'Moderation action recorded.');
      setModerationReason('');
      await fetchAdminData();
      const detail = await api.get(`/v1/admin/support/tickets/${id}`);
      setSelectedSupportTicket(detail.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not apply that moderation action.');
    } finally {
      setAccountActionLoading(false);
    }
  };

  const setRuntimeConfigField = (section, key, value) => setRuntimeConfig(current => ({ ...current, [section]: { ...(current?.[section] || {}), [key]: value } }));

  const saveRuntimeConfig = async () => {
    if (!runtimeConfig) return;
    const payload = {
      plans: {
        free: { deliveriesPerMonth: Number(runtimeConfig.plans?.free?.deliveriesPerMonth), photosPerDelivery: Number(runtimeConfig.plans?.free?.photosPerDelivery), personalStorageBytes: Number(runtimeConfig.plans?.free?.personalStorageBytes || 0), portfolio: Boolean(runtimeConfig.plans?.free?.portfolio), branding: runtimeConfig.plans?.free?.branding, formats: runtimeConfig.plans?.free?.formats || [] },
        pro: { deliveriesPerMonth: runtimeConfig.plans?.pro?.deliveriesPerMonth === null ? null : Number(runtimeConfig.plans?.pro?.deliveriesPerMonth), photosPerDelivery: Number(runtimeConfig.plans?.pro?.photosPerDelivery), personalStorageBytes: Number(runtimeConfig.plans?.pro?.personalStorageBytes || 0), portfolio: Boolean(runtimeConfig.plans?.pro?.portfolio), branding: runtimeConfig.plans?.pro?.branding, formats: runtimeConfig.plans?.pro?.formats || [] }
      },
      formats: Object.values(runtimeConfig.formats || {}),
      featureFlags: runtimeConfig.featureFlags || {},
      maintenance: runtimeConfig.maintenance || { enabled: false, message: 'Veylo is briefly offline for maintenance. Please try again shortly.' },
      narration: { enabled: runtimeConfig.narration?.enabled !== false, defaultVoiceId: runtimeConfig.narration?.defaultVoiceId },
      retention: runtimeConfig.retention || {},
      rateLimits: runtimeConfig.rateLimits || {},
      emailTemplates: runtimeConfig.emailTemplates || []
    };
    try {
      setRuntimeConfigSaving(true);
      const response = await api.patch('/v1/admin/configuration', payload);
      setRuntimeConfig(response.data?.data || runtimeConfig);
      toast.success('Runtime configuration saved.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save runtime configuration.');
    } finally {
      setRuntimeConfigSaving(false);
    }
  };

  const startTwoFactorSetup = async () => {
    try {
      setSecurityActionLoading(true);
      const response = await api.post('/v1/admin/security/2fa/setup', {});
      setTwoFactorSetup(response.data?.data || null);
      setTwoFactorCode('');
      toast.success('Authenticator setup is ready. Add the account, then verify the code.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start two-factor setup.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const enableTwoFactor = async () => {
    if (!/^\d{6}$/.test(twoFactorCode)) return toast.error('Enter the six-digit code from your authenticator app.');
    try {
      setSecurityActionLoading(true);
      await api.post('/v1/admin/security/2fa/enable', { code: twoFactorCode });
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      toast.success('Two-factor authentication is enabled.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not enable two-factor authentication.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const forceLogoutAdmin = async (adminRecord) => {
    if (!adminRecord?.id || !window.confirm(`Sign out every active session for ${adminRecord.name || adminRecord.username}?`)) return;
    try {
      setSecurityActionLoading(true);
      const response = await api.post(`/v1/admin/security/admins/${adminRecord.id}/force-logout`, { reason: 'Signed out from the security workspace.' });
      toast.success(`${number(response.data?.data?.revokedSessions)} session(s) signed out.`);
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign out those sessions.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const updateAdminRole = async (adminRecord, role) => {
    if (!adminRecord?.id || !role || role === adminRecord.role) return;
    try {
      setSecurityActionLoading(true);
      await api.patch(`/v1/admin/security/admins/${adminRecord.id}`, { role });
      toast.success('Administrator role updated.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update that administrator role.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const updateAdminStatus = async (adminRecord, accountStatus) => {
    if (!adminRecord?.id || !accountStatus || accountStatus === adminRecord.accountStatus) return;
    try {
      setSecurityActionLoading(true);
      await api.patch(`/v1/admin/security/admins/${adminRecord.id}`, { accountStatus });
      toast.success(accountStatus === 'active' ? 'Administrator reactivated.' : 'Administrator suspended and signed out.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update that administrator status.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const createAdminAccount = async (event) => {
    event.preventDefault();
    if (newAdmin.name.trim().length < 2 || newAdmin.username.trim().length < 3 || newAdmin.password.length < 12) return toast.error('Use a name, a valid username, and a password of at least 12 characters.');
    try {
      setSecurityActionLoading(true);
      await api.post('/v1/admin/security/admins', { ...newAdmin, username: newAdmin.username.trim().toLowerCase(), name: newAdmin.name.trim() });
      setNewAdmin({ username: '', name: '', password: '', role: 'support' });
      toast.success('Administrator account created.');
      await fetchAdminData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create that administrator account.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const exportAdminAudit = async () => {
    try {
      const response = await api.get('/v1/admin/security/audit/export?format=csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'veylo-admin-audit.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Audit log export downloaded.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not export the audit log.');
    }
  };

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
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[.025] p-1.5 sm:grid-cols-4 md:grid-cols-12">
              {[
                ['deliveries', Film, 'Deliveries'],
                ['users', Users, 'Accounts'],
                ['portfolio', Globe2, 'Portfolio'],
                ['support', MessageCircle, 'Support'],
                ['configuration', Settings2, 'Config'],
                ['payments', ReceiptText, 'Payments'],
                ['aiJobs', Bot, 'AI jobs'],
                ['access', Eye, 'Client access'],
                ['volume', Users, 'Volume'],
                ['storage', HardDrive, 'Storage'],
                ['musicNarration', Music2, 'Music & voice'],
                ['security', LockKeyhole, 'Security']
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
            <div className="mt-6">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Format
                  <select value={deliveryFormatFilter} onChange={(event) => setDeliveryFormatFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All formats</option>{Object.entries(formatNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Delivery status
                  <select value={deliveryStatusFilter} onChange={(event) => setDeliveryStatusFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All statuses</option><option value="draft">Draft</option><option value="review">Review</option><option value="published">Published</option><option value="archived">Archived</option><option value="failed">Failed jobs</option></select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {deliveries.map((item) => (
                  <button key={item.id || item.publicId} type="button" onClick={() => openDelivery(item)} className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-left transition-transform hover:-translate-y-0.5 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b8e]/70">
                    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">{formatNames[item.format] || 'Delivery'}</p><h2 className="mt-1.5 truncate text-lg font-medium text-white">{item.title || item.clientName || 'Untitled delivery'}</h2></div><Status value={item.effectiveStatus || item.status} /></div>
                    <p className="mt-4 truncate text-xs text-white/50">{item.photographer?.studio || item.photographer?.name || 'Independent photographer'} · {item.clientName || 'No client name'}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-white/45"><span>{number(item.photoCount)} photos</span><span>{item.captions?.completed || 0}/{item.captions?.total || 0} captions</span><span>{item.music?.status === 'ready' ? 'Music ready' : 'No music'}</span></div>
                    <div className="mt-5 flex items-center gap-4 border-t border-white/[.07] pt-4 text-xs text-white/40"><span className="flex items-center gap-1.5"><Eye size={14} />{item.viewsCount || 0}</span><span className="flex items-center gap-1.5"><Download size={14} />{item.downloadsCount || 0}</span><span className="ml-auto">{shortDate(item.updatedAt)}</span></div>
                  </button>
                ))}
                {!deliveries.length && <p className="col-span-full py-16 text-center text-sm text-white/45">No deliveries match these filters.</p>}
              </div>
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

          {/* Portfolio and public pages tab */}
          {!loading && tab === 'portfolio' && (
            <div className="mt-6 grid gap-4">
              {panelErrors.portfolio && !portfolioOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Portfolio data is unavailable. {panelErrors.portfolio}</div>}
              {portfolioOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard icon={Globe2} label="Public portfolios" value={number(portfolioOverview.summary?.published)} note={`${number(portfolioOverview.summary?.draft)} saved drafts`} />
                  <MetricCard icon={TriangleAlert} label="Needs attention" value={number(portfolioOverview.summary?.broken)} note={`${number(portfolioOverview.summary?.jobsFailed)} failed direction jobs`} />
                  <MetricCard icon={Eye} label="Portfolio views" value={number(portfolioOverview.summary?.views)} note={`${number(portfolioOverview.summary?.uniqueVisitors)} unique visitors · last 90 days`} />
                  <MetricCard icon={MessageCircle} label="Enquiries" value={number(portfolioOverview.summary?.enquiryClicks)} note={`${number(portfolioOverview.summary?.whatsappClicks)} WhatsApp clicks · ${number(portfolioOverview.summary?.instagramClicks)} Instagram clicks`} />
                </section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Public pages</p><h2 className="mt-1 text-xl font-medium">Portfolio health and demand</h2><p className="mt-2 text-xs leading-5 text-white/45">Views, project opens, social clicks, broken photographs, redirect history, and direction jobs for the last 90 days.</p></div><span className="text-xs text-white/35">Updated {shortDate(portfolioOverview.generatedAt)}</span></div>
                  <div className="mt-5 space-y-3">
                    {(portfolioOverview.portfolios || []).map(portfolio => <article key={portfolio.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Status value={portfolio.status} />{portfolio.broken && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-amber-200"><TriangleAlert size={12} />Needs attention</span>}<span className="truncate text-xs text-white/45">@{portfolio.handle}</span></div><h3 className="mt-2 truncate text-base font-semibold text-white">{portfolio.studioName}</h3><p className="mt-1 truncate text-xs text-white/40">{portfolio.owner?.name || 'Owner account missing'}{portfolio.owner?.email ? ` · ${portfolio.owner.email}` : ''} · {portfolio.owner?.plan || 'unknown plan'}</p></div><div className="flex flex-wrap gap-2"><a href={portfolio.publicPath} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/70 transition-colors hover:border-[#ff9b8e]/50 hover:text-white"><Eye size={14} />Open public page</a>{portfolio.status === 'published' && <button type="button" disabled={accountActionLoading} onClick={() => unpublishPortfolio(portfolio)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/25 px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-300/10 disabled:opacity-50">Make private</button>}</div></div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/50 sm:grid-cols-4 lg:grid-cols-8"><span>Photos <strong className="ml-1 text-white">{number(portfolio.itemCount)}</strong></span><span>Missing <strong className={`ml-1 ${portfolio.missingItemCount ? 'text-amber-200' : 'text-white'}`}>{number(portfolio.missingItemCount)}</strong></span><span>Views <strong className="ml-1 text-white">{number(portfolio.metrics?.views)}</strong></span><span>Unique <strong className="ml-1 text-white">{number(portfolio.metrics?.uniqueVisitors)}</strong></span><span>Projects <strong className="ml-1 text-white">{number(portfolio.metrics?.projectOpens)}</strong></span><span>Enquiries <strong className="ml-1 text-white">{number(portfolio.metrics?.enquiryClicks)}</strong></span><span>Redirects <strong className="ml-1 text-white">{number(portfolio.previousHandles?.active)}</strong></span><span>Job <strong className="ml-1 text-white">{portfolio.latestJob?.status || 'none'}</strong></span></div>
                      {(portfolio.brokenReasons || []).length > 0 && <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[.05] px-3 py-2 text-xs leading-5 text-amber-100/80">{portfolio.brokenReasons.join(' · ')}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35"><span>{number(portfolio.metrics?.filterUses)} category filters</span><span>{number(portfolio.metrics?.instagramClicks)} Instagram clicks</span><span>{number(portfolio.metrics?.whatsappClicks)} WhatsApp clicks</span><span>{number(portfolio.previousHandles?.expired)} expired redirects</span>{portfolio.latestJob?.errorMessage && <span className="text-amber-200/70">{portfolio.latestJob.errorMessage}</span>}</div>
                    </article>)}
                    {!portfolioOverview.portfolios?.length && <p className="py-12 text-center text-sm text-white/45">No portfolios match this search.</p>}
                  </div>
                </section>
              </>}
            </div>
          )}

          {/* Support and moderation tab */}
          {!loading && tab === 'support' && (
            <div className="mt-6 grid gap-4">
              {panelErrors.support && !supportOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Support data is unavailable. {panelErrors.support}</div>}
              {supportOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><MetricCard icon={MessageCircle} label="All requests" value={number(supportOverview.summary?.total)} note="Support, privacy, and moderation queue" /><MetricCard icon={AlertCircle} label="Open" value={number(supportOverview.summary?.open)} note={`${number(supportOverview.summary?.urgent)} urgent requests`} /><MetricCard icon={Clock3} label="Pending" value={number(supportOverview.summary?.pending)} note={`${number(supportOverview.summary?.high)} high-priority requests`} /><MetricCard icon={ShieldCheck} label="Privacy" value={number(supportOverview.summary?.privacy)} note="Deletion and privacy requests" /><MetricCard icon={TriangleAlert} label="Reports" value={number(Number(supportOverview.summary?.abuse || 0) + Number(supportOverview.summary?.copyright || 0))} note={`${number(supportOverview.summary?.abuse)} abuse · ${number(supportOverview.summary?.copyright)} copyright`} /></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Support and moderation</p><h2 className="mt-1 text-xl font-medium">Requests that need a human reply</h2><p className="mt-2 text-xs leading-5 text-white/45">Every request has an owner, status, priority, response history, and moderation trail. Open one to reply, assign it, or make a reported delivery or portfolio private.</p></div><span className="text-xs text-white/35">Updated {shortDate(supportOverview.generatedAt)}</span></div><div className="mt-5 space-y-2">{(supportOverview.tickets || []).map(ticket => <button key={ticket.id} type="button" onClick={() => openSupportTicket(ticket)} className="w-full rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b8e]/70"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Status value={ticket.status} /><Status value={ticket.priority} /><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#ff9b8e]">{ticket.category}</span><span className="font-mono text-[10px] text-white/35">{ticket.ticketNumber}</span></div><h3 className="mt-2 truncate text-sm font-semibold text-white">{ticket.subject}</h3><p className="mt-1 truncate text-xs text-white/40">{ticket.requester?.name || 'Requester'} · {ticket.requester?.email || 'No reply email'}{ticket.account?.studio ? ` · ${ticket.account.studio}` : ''}</p></div><span className="shrink-0 text-xs text-white/35">{shortDate(ticket.updatedAt)}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40"><span>{number(ticket.messageCount)} messages</span><span>{number(ticket.internalNoteCount)} internal notes</span><span>{ticket.assignedAdmin?.name ? `Assigned to ${ticket.assignedAdmin.name}` : 'Unassigned'}</span>{ticket.delivery?.publicId && <span>Delivery {ticket.delivery.publicId}</span>}</div></button>)}{!supportOverview.tickets?.length && <p className="py-12 text-center text-sm text-white/45">No support requests match this search.</p>}</div></section>
              </>}
            </div>
          )}

          {/* Security and audit tab */}
          {!loading && tab === 'security' && (
            <div className="mt-6 space-y-5">
              {securityOverview && <SecurityCreateAdminPanel value={newAdmin} onChange={setNewAdmin} onSubmit={createAdminAccount} disabled={securityActionLoading} />}
              {securityOverview && <SecurityProviderPanel providers={securityOverview.providers} secretStatus={securityOverview.secretStatus} admins={securityOverview.admins} onStatusChange={updateAdminStatus} disabled={securityActionLoading} currentAdminId={admin?.id || admin?._id} />}
              {panelErrors.security && !securityOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Security data is unavailable for this role. {panelErrors.security}</div>}
              {securityOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard icon={Users} label="Administrators" value={number(securityOverview.summary?.adminCount)} note={`${number(securityOverview.summary?.activeAdminCount)} active accounts`} />
                  <MetricCard icon={LockKeyhole} label="Two-factor" value={number(securityOverview.summary?.twoFactorEnabled)} note="Administrators using an authenticator" />
                  <MetricCard icon={Activity} label="Active sessions" value={number(securityOverview.summary?.activeSessions)} note={`${number(securityOverview.summary?.failedLogins24h)} failed sign-ins in 24 hours`} />
                  <MetricCard icon={ShieldCheck} label="Audit records" value={number(securityOverview.summary?.auditEvents)} note={`${number(securityOverview.summary?.hashedAuditEvents)} records carry an integrity hash`} />
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Your sign-in protection</p><h2 className="mt-1 text-xl font-medium">Authenticator app</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/45">Two-factor codes are checked before an administrator session is created. Veylo never stores the readable secret after setup.</p></div><Status value={securityOverview.admins?.find(item => String(item.id) === String(admin?.id || admin?._id))?.twoFactorEnabled ? 'active' : 'not enabled'} /></div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" disabled={securityActionLoading} onClick={startTwoFactorSetup} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-black transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"><KeyRound size={14} />{securityOverview.admins?.find(item => String(item.id) === String(admin?.id || admin?._id))?.twoFactorEnabled ? 'Replace authenticator' : 'Set up authenticator'}</button>{twoFactorSetup && <span className="text-xs text-amber-200">Keep this setup panel open until the code is verified.</span>}</div>
                  {twoFactorSetup && <div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.05] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-amber-200/70">Secret (show once)</p><p className="mt-2 break-all font-mono text-sm tracking-[.12em] text-amber-100">{twoFactorSetup.secret}</p><p className="mt-3 break-all text-[11px] leading-5 text-amber-100/65">If your authenticator supports it, add this URI: {twoFactorSetup.otpauthUri}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Verify the current code<input value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Six digits" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm tracking-[.25em] text-white outline-none focus:border-[#ff9b8e]/60" /></label><button type="button" disabled={securityActionLoading || !/^\d{6}$/.test(twoFactorCode)} onClick={enableTwoFactor} className="mt-3 min-h-10 w-full rounded-xl bg-[#ff5a47] px-4 text-xs font-bold text-[#160907] disabled:opacity-40">{securityActionLoading ? 'Checking…' : 'Enable two-factor'}</button></div></div>}
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Admin accounts</p><h2 className="mt-1 text-xl font-medium">Who can change Veylo?</h2><p className="mt-2 text-xs leading-5 text-white/45">Roles limit configuration, finance, support, and operational actions. Suspended accounts cannot create sessions.</p></div><span className="text-xs text-white/35">Updated {shortDate(securityOverview.generatedAt)}</span></div><div className="mt-5 space-y-2">{(securityOverview.admins || []).map(adminRecord => <article key={adminRecord.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{adminRecord.name}</p><Status value={adminRecord.accountStatus} />{adminRecord.twoFactorEnabled && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[.12em] text-emerald-300"><LockKeyhole size={12} />2FA</span>}</div><p className="mt-1 truncate text-xs text-white/40">@{adminRecord.username} · Last sign-in {shortDate(adminRecord.lastLoginAt)}</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><select value={adminRecord.role === 'admin' ? 'superadmin' : adminRecord.role} disabled={securityActionLoading || String(adminRecord.id) === String(admin?.id || admin?._id)} onChange={(event) => updateAdminRole(adminRecord, event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-[#141419] px-3 text-xs text-white outline-none focus:border-[#ff9b8e]/60"><option value="superadmin">Superadmin</option><option value="operations">Operations</option><option value="finance">Finance</option><option value="support">Support</option><option value="analyst">Analyst</option><option value="read-only">Read-only</option></select><button type="button" disabled={securityActionLoading} onClick={() => forceLogoutAdmin(adminRecord)} className="min-h-10 rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/70 transition-colors hover:border-amber-300/40 hover:text-amber-100 disabled:opacity-50">Sign out sessions</button></div></div></article>)}{!securityOverview.admins?.length && <p className="py-10 text-center text-sm text-white/45">No administrator accounts found.</p>}</div></section>

                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Current sessions</p><h2 className="mt-1 text-xl font-medium">Device and network history</h2></div><span className="text-xs text-white/35">{number(securityOverview.sessions?.length)} active</span></div><div className="mt-5 space-y-2">{(securityOverview.sessions || []).slice(0, 12).map(session => <div key={session.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{session.admin?.name || 'Unknown administrator'} · {session.deviceLabel}</p><p className="mt-1 truncate text-[11px] text-white/40">{session.ipAddress || 'No IP'} · Last seen {shortDate(session.lastSeenAt)}</p></div>{session.twoFactorVerified && <Status value="verified" />}</div></div>)}{!securityOverview.sessions?.length && <p className="py-8 text-sm text-white/45">No active sessions.</p>}</div></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Sign-in attempts</p><h2 className="mt-1 text-xl font-medium">Recent access checks</h2></div><span className="text-xs text-white/35">{number(securityOverview.loginAttempts?.length)} records</span></div><div className="mt-5 space-y-2">{(securityOverview.loginAttempts || []).slice(0, 12).map(item => <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{item.username || 'Unknown username'} · {item.reason || 'attempt'}</p><p className="mt-1 truncate text-[11px] text-white/40">{item.ipAddress || 'No IP'} · {shortDate(item.createdAt)}</p></div><Status value={item.success ? 'success' : 'failed'} /></div>)}{!securityOverview.loginAttempts?.length && <p className="py-8 text-sm text-white/45">No sign-in attempts recorded.</p>}</div></div></section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Immutable audit trail</p><h2 className="mt-1 text-xl font-medium">Every sensitive change has a record</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/45">Records include the administrator, action, before-and-after values where available, IP/device context, and a chained integrity hash. Audit rows cannot be edited or deleted through the application.</p></div><button type="button" onClick={exportAdminAudit} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 transition-colors hover:border-[#ff9b8e]/50 hover:text-white"><FileDown size={14} />Export audit CSV</button></div><div className="mt-5 space-y-2">{(securityOverview.audit || []).slice(0, 20).map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{item.action}</p><p className="mt-1 truncate text-[11px] text-white/40">{item.resourceType || 'Record'} {item.resourceId || ''} · {item.ipAddress || 'No IP'}</p></div><span className="shrink-0 text-[11px] text-white/35">{shortDate(item.createdAt)}</span></div><p className="mt-2 break-all font-mono text-[10px] text-white/25">{item.eventHash || 'Hash unavailable'}</p></article>)}{!securityOverview.audit?.length && <p className="py-10 text-center text-sm text-white/45">No audit records yet.</p>}</div></section>
              </>}
            </div>
          )}

          {/* Configuration tab */}
          {!loading && tab === 'configuration' && (
            <div className="mt-6 grid gap-4">
              {panelErrors.configuration && !runtimeConfig && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Runtime configuration is unavailable. {panelErrors.configuration}</div>}
              {runtimeConfig && <>
                <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6 md:flex-row md:items-center md:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Configuration</p><h2 className="mt-1 text-xl font-medium">What the product is allowed to do</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/45">Changes here affect new requests and worker behaviour. Provider keys never appear in this view; only safe configuration and health are shown.</p></div><button type="button" disabled={runtimeConfigSaving} onClick={saveRuntimeConfig} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-xs font-bold text-black transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"><Save size={15} />{runtimeConfigSaving ? 'Saving…' : 'Save configuration'}</button></section>
                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-red-300/15 bg-red-300/[.04] p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-red-200/70">Maintenance</p><h3 className="mt-1 text-xl font-medium">Pause client traffic</h3><p className="mt-2 text-xs leading-5 text-white/45">Admin, sign-in, and support remain available while public product requests receive a clear 503 response.</p></div><ConfigToggle label="" checked={runtimeConfig.maintenance?.enabled} onChange={(value) => setRuntimeConfigField('maintenance', 'enabled', value)} /></div><label className="mt-4 block text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Maintenance message<textarea value={runtimeConfig.maintenance?.message || ''} onChange={(event) => setRuntimeConfigField('maintenance', 'message', event.target.value)} maxLength={240} rows={3} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60" /></label></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Feature flags</p><h3 className="mt-1 text-xl font-medium">Product surfaces</h3><div className="mt-4 grid gap-2 sm:grid-cols-2"><ConfigToggle label="AI delivery pipeline" checked={runtimeConfig.featureFlags?.deliveryPipeline} onChange={(value) => setRuntimeConfigField('featureFlags', 'deliveryPipeline', value)} note="Analysis, direction, revisions, and narration jobs" /><ConfigToggle label="Veylo Portfolio" checked={runtimeConfig.featureFlags?.portfolio} onChange={(value) => setRuntimeConfigField('featureFlags', 'portfolio', value)} /><ConfigToggle label="Music catalogue" checked={runtimeConfig.featureFlags?.music} onChange={(value) => setRuntimeConfigField('featureFlags', 'music', value)} /><ConfigToggle label="Narration" checked={runtimeConfig.featureFlags?.narration} onChange={(value) => setRuntimeConfigField('featureFlags', 'narration', value)} /><ConfigToggle label="Volume deliveries" checked={runtimeConfig.featureFlags?.volumeDeliveries} onChange={(value) => setRuntimeConfigField('featureFlags', 'volumeDeliveries', value)} /><ConfigToggle label="Optional analytics" checked={runtimeConfig.featureFlags?.optionalAnalytics} onChange={(value) => setRuntimeConfigField('featureFlags', 'optionalAnalytics', value)} note="Still respects visitor consent when enabled" /></div></div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Formats and plans</p><h3 className="mt-1 text-xl font-medium">Availability and limits</h3></div><span className="text-xs text-white/35">Prices are in Nigerian Naira</span></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><div className="grid gap-2 sm:grid-cols-2">{Object.values(runtimeConfig.formats || {}).map(format => <ConfigToggle key={format.id} label={format.label} checked={format.enabled} onChange={(value) => setRuntimeConfig(current => ({ ...current, formats: { ...(current.formats || {}), [format.id]: { ...format, enabled: value } } }))} note={format.id} />)}</div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Free</p><label className="mt-3 block text-xs text-white/55">Deliveries / month<input type="number" min="0" max="100000" value={runtimeConfig.plans?.free?.deliveriesPerMonth ?? ''} onChange={(event) => setRuntimeConfig(current => ({ ...current, plans: { ...current.plans, free: { ...current.plans.free, deliveriesPerMonth: event.target.value === '' ? 0 : Number(event.target.value) } } }))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label><label className="mt-3 block text-xs text-white/55">Photos / delivery<input type="number" min="1" max="5000" value={runtimeConfig.plans?.free?.photosPerDelivery ?? ''} onChange={(event) => setRuntimeConfig(current => ({ ...current, plans: { ...current.plans, free: { ...current.plans.free, photosPerDelivery: Number(event.target.value) } } }))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Pro</p><label className="mt-3 block text-xs text-white/55">Monthly price (₦)<input type="number" min="0" max="100000000" value={runtimeConfig.plans?.pro?.monthlyPriceNaira ?? ''} onChange={(event) => setRuntimeConfig(current => ({ ...current, plans: { ...current.plans, pro: { ...current.plans.pro, monthlyPriceNaira: Number(event.target.value) } } }))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label><label className="mt-3 block text-xs text-white/55">Photos / delivery<input type="number" min="1" max="5000" value={runtimeConfig.plans?.pro?.photosPerDelivery ?? ''} onChange={(event) => setRuntimeConfig(current => ({ ...current, plans: { ...current.plans, pro: { ...current.plans.pro, photosPerDelivery: Number(event.target.value) } } }))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label><p className="mt-3 text-[11px] text-white/35">Storage: {bytes(runtimeConfig.plans?.pro?.personalStorageBytes)}</p></div></div></div></section>
                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Narration and catalogue</p><h3 className="mt-1 text-xl font-medium">Audio defaults</h3><label className="mt-4 flex items-center gap-3 text-sm text-white/70"><input type="checkbox" checked={runtimeConfig.narration?.enabled !== false} onChange={(event) => setRuntimeConfigField('narration', 'enabled', event.target.checked)} className="h-4 w-4 accent-[#ff7867]" />Narration is available to photographers</label><label className="mt-4 block text-xs text-white/55">Default voice<select value={runtimeConfig.narration?.defaultVoiceId || ''} onChange={(event) => setRuntimeConfigField('narration', 'defaultVoiceId', event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60">{(runtimeConfig.narration?.voices || []).map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.presentation} · {voice.tone}</option>)}</select></label><p className="mt-4 text-xs text-white/40">{number(runtimeConfig.music?.catalogueCount)} approved Pixabay tracks · {runtimeConfig.music?.verifiedCatalogue ? 'catalogue verified' : 'verification needed'}.</p></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Providers</p><h3 className="mt-1 text-xl font-medium">Safe configuration status</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(runtimeConfig.providers || {}).map(([key, provider]) => <div key={key} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-white">{provider.provider || key}</span><Status value={provider.configured ? 'active' : 'disabled'} /></div><p className="mt-2 text-[11px] leading-5 text-white/40">{provider.model || provider.from || (provider.enabled === false ? 'Disabled' : 'Configured')}</p></div>)}</div></div></section>
                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Retention rules</p><h3 className="mt-1 text-xl font-medium">When retained Pro data is removed</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['proRetentionDays','Pro retention (days)'],['orphanUploadHours','Orphan upload wait (hours)'],['workerIntervalHours','Worker interval (hours)']].map(([key,label]) => <label key={key} className="text-xs text-white/55">{label}<input type="number" min="1" max={key === 'proRetentionDays' ? 3650 : 168} value={runtimeConfig.retention?.[key] ?? ''} onChange={(event) => setRuntimeConfigField('retention', key, Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label>)}</div></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Rate limits</p><h3 className="mt-1 text-xl font-medium">Abuse and load protection</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(runtimeConfig.rateLimits || {}).map(([key,value]) => <label key={key} className="text-xs text-white/55">{key.replace(/([A-Z])/g, ' $1')}<input type="number" min="1" value={value} onChange={(event) => setRuntimeConfigField('rateLimits', key, Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ff9b8e]/60" /></label>)}</div></div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Email templates</p><h3 className="mt-1 text-xl font-medium">Which system emails may send</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(runtimeConfig.emailTemplates || []).map(template => <ConfigToggle key={template.id} label={template.label} checked={template.enabled} onChange={(value) => setRuntimeConfig(current => ({ ...current, emailTemplates: (current.emailTemplates || []).map(item => item.id === template.id ? { ...item, enabled: value } : item) }))} note={template.id} />)}</div></section>
              </>}
            </div>
          )}

          {/* Payments Tab */}
          {!loading && tab === 'payments' && (
            <div className="mt-6 grid gap-4">
              {panelErrors.finance && !financeOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Finance data is unavailable. {panelErrors.finance}</div>}
              {financeOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={Banknote} label="Gross collected" value={nairaFromKobo(financeOverview.summary?.grossKobo)} note={`${number(financeOverview.summary?.successful)} successful payment records`} /><MetricCard icon={Banknote} label="Net after refunds" value={nairaFromKobo(financeOverview.summary?.netKobo)} note={`${nairaFromKobo(financeOverview.summary?.refundedKobo)} refunded`} /><MetricCard icon={TriangleAlert} label="Payment issues" value={number(Number(financeOverview.summary?.failed || 0) + Number(financeOverview.summary?.disputed || 0))} note={`${number(financeOverview.summary?.pastDueSubscriptions)} subscriptions past due`} /><MetricCard icon={ReceiptText} label="Billing events" value={number(financeOverview.summary?.billingEvents)} note={`${number(financeOverview.summary?.failedBillingEvents)} webhook failures`} /></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Finance operations</p><h2 className="mt-1 text-xl font-medium">Paystack and subscription health</h2><p className="mt-2 text-xs leading-5 text-white/45">Last {number(financeOverview.windowDays)} days · {number(financeOverview.summary?.renewalEvents)} renewal events · {number(financeOverview.summary?.cancellationEvents)} cancellations · {number(financeOverview.summary?.refundEvents)} refund events · {number(financeOverview.summary?.disputeEvents)} disputes.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={reconcileFinance} disabled={financeReconciling || financeOverview.reconciliation?.status !== 'ready'} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/75 transition-colors hover:border-[#ff9b8e]/50 hover:text-white disabled:opacity-40"><RefreshCw size={14} className={financeReconciling ? 'animate-spin' : ''} />{financeReconciling ? 'Checking Paystack…' : 'Reconcile Paystack'}</button><button type="button" onClick={exportFinanceCsv} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black transition-transform hover:-translate-y-0.5 active:scale-95"><FileDown size={14} />Export CSV</button></div></div>{financeReconciliation && <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Paystack records</p><p className="mt-2 text-xl font-medium">{number(financeReconciliation.paystackTransactions)}</p><p className="mt-1 text-xs text-white/45">{number(financeReconciliation.localMatches)} matched locally</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Missing locally</p><p className="mt-2 text-xl font-medium">{number(financeReconciliation.missingLocal?.length)}</p><p className="mt-1 text-xs text-white/45">Provider payments without a Veylo record</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Amount mismatches</p><p className="mt-2 text-xl font-medium">{number(financeReconciliation.amountMismatches?.length)}</p><p className="mt-1 text-xs text-white/45">Local and Paystack amounts differ</p></div></div>}</section>
                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Subscriptions</p><h2 className="mt-1 text-xl font-medium">Current plan states</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(financeOverview.subscriptions || {}).map(([status, count]) => <div key={status} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-white/35">{status.replaceAll('_', ' ')}</p><p className="mt-2 text-xl font-medium">{number(count)}</p></div>)}</div></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Manual Pro access</p><h2 className="mt-1 text-xl font-medium">Active support grants</h2><p className="mt-2 text-sm text-white/45">{number(financeOverview.manualProGrants?.length)} current manual grants with recorded reasons and expiry.</p><div className="mt-4 space-y-2">{(financeOverview.manualProGrants || []).slice(0, 8).map(grant => <div key={grant.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{grant.name}</p><p className="truncate text-[11px] text-white/40">{grant.reason || 'No reason recorded'}</p></div><span className="shrink-0 text-[11px] text-white/45">{grant.expiresAt ? shortDate(grant.expiresAt) : 'No expiry'}</span></div>)}</div></div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Webhook events</p><h2 className="mt-1 text-xl font-medium">What Paystack has told Veylo</h2><div className="mt-5 space-y-2">{(financeOverview.events || []).slice(0, 40).map(event => <div key={event.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[.025] p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-white/65">{event.eventType} · {event.status}{event.failure ? ` · ${event.failure}` : ''}</span><span className="text-xs text-white/40">attempt {number(event.attempts)} · {shortDate(event.createdAt)}</span></div>)}{!financeOverview.events?.length && <p className="text-sm text-white/45">No billing events in this window.</p>}</div></section>
              </>}
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

          {/* AI jobs tab */}
          {!loading && tab === 'aiJobs' && (
            <div className="mt-6">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Job status
                  <select value={aiJobStatusFilter} onChange={(event) => setAiJobStatusFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="failed">Failed</option><option value="stale">Stale</option><option value="cancelled">Cancelled</option><option value="review">Completed for review</option></select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Job type
                  <select value={aiJobTypeFilter} onChange={(event) => setAiJobTypeFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All AI work</option><option value="analyze">Analysis</option><option value="direct">Creative direction</option><option value="revise">Revision</option><option value="narrate">Narration</option><option value="portfolio">Portfolio</option></select>
                </label>
              </div>
              {aiSummary && <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><MetricCard icon={Activity} label="Queue depth" value={number(aiSummary.queueDepth)} note={`${number(aiSummary.stale)} stale jobs`} /><MetricCard icon={TriangleAlert} label="Failed today" value={number(aiSummary.failedLast24Hours)} note={`${number(aiSummary.captionFailures)} caption failures`} /><MetricCard icon={Bot} label="Timing failures" value={number(aiSummary.timingFailures)} note={`${number(aiSummary.staleNarration)} stale narrations`} />{(aiSummary.providerLatency || []).slice(0, 2).map(provider => <MetricCard key={provider.provider} icon={Server} label={provider.provider} value={`${number(provider.averageMs)}ms`} note={`${number(provider.samples)} samples · max ${number(provider.maxMs)}ms`} />)}</div>}
              <div className="space-y-3">{aiJobs.map(job => <article key={`${job.kind}-${job.id}`} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[#ff9b8e]">{job.type}</span><Status value={job.status} /><span className="text-[11px] text-white/35">{job.provider}</span></div><p className="mt-2 truncate text-sm font-medium text-white">{job.delivery?.title || job.portfolio?.studioName || 'AI job'}</p><p className="mt-1 truncate text-xs text-white/40">{job.delivery?.photographer || job.portfolio?.handle || 'No owner'} · {job.stage} · {number(job.progress)}% · attempt {number(job.attempts)}</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-white/35">{job.providerLatencyMs ? `${number(job.providerLatencyMs)}ms provider` : 'No latency yet'}{job.promptVersion ? ` · ${job.promptVersion}` : ''}{job.renderVersion ? ` · ${job.renderVersion}` : ''}</span>{job.rawStatus === 'failed' && <button type="button" disabled={accountActionLoading} onClick={() => retryAiJob(job.id)} className="min-h-9 rounded-lg border border-amber-300/30 px-3 text-[11px] font-semibold text-amber-200 disabled:opacity-50">Retry</button>}{['queued', 'running'].includes(job.rawStatus) && <button type="button" disabled={accountActionLoading} onClick={() => cancelAiJob(job.id)} className="min-h-9 rounded-lg border border-white/15 px-3 text-[11px] font-semibold text-white/60 disabled:opacity-50">Cancel</button>}</div></div>{job.errorMessage && <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3 text-xs leading-5 text-amber-100/80">{job.errorCode || 'AI job error'}: {job.errorMessage}</p>}</article>)}{!aiJobs.length && <p className="py-16 text-center text-sm text-white/45">No AI jobs match these filters.</p>}</div>
            </div>
          )}

          {/* Client access tab */}
          {!loading && tab === 'access' && (
            <div className="mt-6">
              {accessOverview ? <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={Eye} label="Delivery opens" value={number(accessOverview.totals?.opens)} note={`${number(accessOverview.totals?.uniqueVisitors)} unique visitor records`} /><MetricCard icon={Users} label="Repeat visitors" value={number(accessOverview.totals?.repeatVisitors)} note={`${number(accessOverview.totals?.expiredLinks)} expired links`} /><MetricCard icon={Download} label="Downloads" value={number(accessOverview.totals?.downloadsCompleted)} note={`${number(accessOverview.totals?.downloadsRequested)} download requests`} /><MetricCard icon={ShieldCheck} label="Access issues" value={number(accessOverview.totals?.pinFailures)} note={`${number(accessOverview.totals?.revokedLinks)} revoked links`} /></div>
                <div className="mb-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ff9b8e]">Volume access</p><h3 className="mt-1 text-lg font-medium">Recipient code activity</h3></div><span className="text-xs text-white/35">Last {number(accessOverview.windowDays)} days</span></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-white/40">Requests</p><p className="mt-1 text-xl font-medium">{number(accessOverview.totals?.volumeAccessCodeRequests)}</p></div><div><p className="text-xs text-white/40">Verified</p><p className="mt-1 text-xl font-medium">{number(accessOverview.totals?.volumeAccessCodeVerified)}</p></div><div><p className="text-xs text-white/40">Failures</p><p className="mt-1 text-xl font-medium">{number(accessOverview.totals?.volumeAccessCodeFailures)}</p></div><div><p className="text-xs text-white/40">Gallery opens</p><p className="mt-1 text-xl font-medium">{number(accessOverview.totals?.volumeGalleryOpens)}</p></div></div></div>
                <div className="space-y-3">{(accessOverview.deliveries || []).map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.14em] text-[#ff9b8e]">{formatNames[item.format] || item.format || 'Delivery'}</p><h3 className="mt-1 truncate text-sm font-semibold text-white">{item.title}</h3><p className="mt-1 truncate text-xs text-white/40">{item.photographer} · {item.publicId}</p></div><div className="flex items-center gap-2"><Status value={item.revoked ? 'revoked' : item.expired ? 'expired' : item.status} /><span className="text-xs text-white/35">{number(item.shareGrants?.active)} active grants</span></div></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4 lg:grid-cols-8"><span>Opens <strong className="ml-1 text-white">{number(item.opens)}</strong></span><span>Unique <strong className="ml-1 text-white">{number(item.uniqueVisitors)}</strong></span><span>Repeat <strong className="ml-1 text-white">{number(item.repeatVisitors)}</strong></span><span>PIN fails <strong className="ml-1 text-white">{number(item.pinFailures)}</strong></span><span>Downloads <strong className="ml-1 text-white">{number(item.downloadsCompleted)}</strong></span><span>Likes <strong className="ml-1 text-white">{number(item.likes)}</strong></span><span>Grant opens <strong className="ml-1 text-white">{number(item.shareGrants?.opens)}</strong></span><span>Grant downloads <strong className="ml-1 text-white">{number(item.shareGrants?.downloads)}</strong></span></div></article>)}{!accessOverview.deliveries?.length && <p className="py-16 text-center text-sm text-white/45">No client access records match your search.</p>}</div>
              </> : <div className="py-16 text-center text-sm text-white/45">Client access activity is unavailable.</div>}
            </div>
          )}

          {/* Music and narration tab */}
          {!loading && tab === 'musicNarration' && (
            <div className="mt-6 space-y-5">
              {panelErrors.musicNarration && !musicOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Music and narration data is unavailable. {panelErrors.musicNarration}</div>}
              {musicOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={Music2} label="Approved tracks" value={number(musicOverview.catalogue?.total)} note={`${number(musicOverview.catalogue?.available)} files available and hash-verified`} /><MetricCard icon={TriangleAlert} label="Catalogue issues" value={number(Number(musicOverview.catalogue?.unavailable || 0) + Number(musicOverview.catalogue?.hashMismatches || 0))} note={`${number(musicOverview.catalogue?.contentIdRegistered)} tracks marked Content ID registered`} /><MetricCard icon={Mic2} label="Narration jobs" value={number(musicOverview.narration?.jobs?.total)} note={`${number(musicOverview.narration?.jobs?.completed)} completed · ${number(musicOverview.narration?.jobs?.failed)} failed`} /><MetricCard icon={Activity} label="Alignment failures" value={number(musicOverview.narration?.timingFailures)} note={`${number(musicOverview.narration?.staleDeliveries)} stale narration records`} /></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Audio health</p><h2 className="mt-1 text-xl font-medium">Can photographers and clients hear the right thing?</h2></div><span className="text-xs text-white/35">Updated {shortDate(musicOverview.generatedAt)}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><HealthCard icon={Music2} label="Soundtrack catalogue" health={musicOverview.health?.catalogue} /><HealthCard icon={Mic2} label="Deepgram Flux" health={musicOverview.health?.deepgram} /><HealthCard icon={Music2} label="Soundtrack playback" health={{ status: musicOverview.soundtrack?.playbackFailures ? 'attention' : 'healthy', reason: `${number(musicOverview.soundtrack?.playbackFailures)} playback failures · ${number(musicOverview.soundtrack?.previewFailures)} preview failures in the last ${number(musicOverview.windowDays)} days.` }} /><HealthCard icon={Mic2} label="Narration playback" health={{ status: musicOverview.narration?.playbackFailures ? 'attention' : 'healthy', reason: `${number(musicOverview.narration?.playbackFailures)} playback failures · ${number(musicOverview.narration?.jobs?.queued)} jobs queued or running.` }} /></div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Narrator usage</p><h2 className="mt-1 text-xl font-medium">Voice and generation health</h2></div><span className="text-xs text-white/35">Default: {musicOverview.narration?.defaultVoiceId}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(musicOverview.narration?.voices || []).map(voice => <article key={voice.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{voice.name}</p>{voice.id === musicOverview.narration?.defaultVoiceId && <Status value="active" />}</div><p className="mt-1 text-xs text-white/45">{voice.provider} · {voice.tone}</p><p className="mt-4 text-xs text-white/55">{number(voice.jobs)} jobs · {number(voice.deliveries)} deliveries</p><p className="mt-1 text-xs text-white/40">{voice.averageGenerationMs ? `${number(Math.round(voice.averageGenerationMs))}ms average generation` : 'No completed generation timing yet'}</p></article>)}</div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Soundtrack catalogue</p><h2 className="mt-1 text-xl font-medium">Source, licence and selection records</h2><p className="mt-2 text-xs leading-5 text-white/45">Each row is checked against its private local file and the stored Pixabay SHA-256. Selection counts include photographer replacements and creative-director choices.</p></div><span className="text-xs text-white/35">{number(musicOverview.catalogue?.filtered)} shown</span></div><div className="mt-5 space-y-2">{(musicOverview.catalogue?.tracks || []).map(track => <article key={track.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ff9b8e]">{track.category}</span><Status value={track.file?.hashMatches ? 'verified' : track.file?.available ? 'hash mismatch' : 'unavailable'} /></div><h3 className="mt-1 truncate text-sm font-semibold text-white">{track.title}</h3><p className="mt-1 truncate text-xs text-white/40">{track.creator} · {track.genre} · {track.mood}</p></div><div className="flex shrink-0 items-center gap-2 text-xs text-white/45"><span>{number(track.usage?.lifetimeSelections)} selections</span><span>{track.contentIdRegistered ? 'Content ID marked' : 'No Content ID mark'}</span></div></div><div className="mt-3 grid gap-2 text-xs text-white/50 sm:grid-cols-2 lg:grid-cols-4"><span>{track.durationSec}s · {track.tempo} tempo</span><span>{track.narrationFit} narration fit</span><span>{number(track.usage?.photographerSelections)} photographer · {number(track.usage?.creativeDirectorSelections)} AI</span><span>{number(track.usage?.replacements)} replacements · {number(track.usage?.currentDeliveries)} live deliveries</span></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/40"><a className="text-[#ff9b8e] hover:underline" href={track.sourcePageUrl} target="_blank" rel="noreferrer">Pixabay source</a><a className="text-[#ff9b8e] hover:underline" href={track.licenseUrl} target="_blank" rel="noreferrer">Licence</a><span>{track.file?.actualSha256 ? `SHA-256 ${track.file.actualSha256.slice(0, 16)}…` : 'No local hash'}</span>{track.usage?.neverSelected && <span className="text-amber-200">Never selected</span>}</div></article>)}{!musicOverview.catalogue?.tracks?.length && <p className="py-16 text-center text-sm text-white/45">No soundtrack records match this search.</p>}</div></section>
                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Audio events</p><h2 className="mt-1 text-xl font-medium">Preview, playback and timing errors</h2></div><div className="mt-5 space-y-2">{(musicOverview.events || []).map(item => <div key={`${item.name}-${item.status}-${item.errorCode}`} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[.025] p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-white/65">{item.name}{item.errorCode ? ` · ${item.errorCode}` : ''}</span><span className="text-xs text-white/40">{number(item.count)} events{item.averageMs ? ` · ${number(Math.round(item.averageMs))}ms average` : ''}</span></div>)}{!musicOverview.events?.length && <p className="text-sm text-white/45">No audio events in this window.</p>}</div></section>
              </>}
            </div>
          )}

          {/* Storage and media tab */}
          {!loading && tab === 'storage' && (
            <div className="mt-6 space-y-5">
              {panelErrors.storage && !storageOverview && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 text-sm text-amber-100">Storage health is unavailable. {panelErrors.storage}</div>}
              {storageOverview && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard icon={HardDrive} label="Library" value={bytes(storageOverview.totals?.library?.bytes)} note={`${number(storageOverview.totals?.library?.files)} personal-library files`} />
                  <MetricCard icon={Film} label="Delivery photos" value={bytes(storageOverview.totals?.deliveryPhotos?.bytes)} note={`${number(storageOverview.totals?.deliveryPhotos?.files)} delivery copies`} />
                  <MetricCard icon={Cloud} label="Audio" value={bytes(Number(storageOverview.totals?.soundtrack?.bytes || 0) + Number(storageOverview.totals?.narration?.bytes || 0))} note={`${number(Number(storageOverview.totals?.soundtrack?.files || 0) + Number(storageOverview.totals?.narration?.files || 0))} soundtrack and narration files`} />
                  <MetricCard icon={ShieldCheck} label="Hashes missing" value={number(storageOverview.hashes?.missing)} note={`${number(storageOverview.hashes?.verified)} files have a verified Cloudinary etag`} />
                  <MetricCard icon={TriangleAlert} label="Failed uploads" value={number(storageOverview.failures?.uploadsLast24Hours)} note="Recorded in the last 24 hours" />
                  <MetricCard icon={TriangleAlert} label="Failed deletes" value={number(storageOverview.failures?.deletesInWindow)} note={`Last ${number(storageOverview.windowDays)} days`} />
                  <MetricCard icon={Database} label="Tracked media" value={bytes(storageOverview.totals?.allTrackedBytes)} note={`${number(storageOverview.totals?.allTrackedFiles)} database records`} />
                  <MetricCard icon={Activity} label="Growth window" value={`${number(storageOverview.windowDays)} days`} note="Upload events grouped by day and surface" />
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Storage health</p><h2 className="mt-1 text-xl font-medium">Are media and cleanup systems healthy?</h2></div><span className="text-xs text-white/35">Updated {shortDate(storageOverview.generatedAt)}</span></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><HealthCard icon={Cloud} label="Cloudinary" health={storageOverview.health?.cloudinary} /><HealthCard icon={RefreshCw} label="Retention" health={storageOverview.health?.retention} /><HealthCard icon={Database} label="Database references" health={storageOverview.health?.databaseReferences} /><HealthCard icon={ShieldCheck} label="File hashes" health={storageOverview.health?.hashes} /></div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Provider references</p><h2 className="mt-1 text-xl font-medium">Find orphaned or missing media</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/45">This reads authenticated Cloudinary resources and compares them with Veylo records. It never deletes a file from this screen.</p></div><button type="button" onClick={runStorageScan} disabled={storageScanLoading} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/75 transition-colors hover:border-[#ff9b8e]/50 hover:text-white disabled:opacity-50"><RefreshCw size={14} className={storageScanLoading ? 'animate-spin' : ''} />{storageScanLoading ? 'Scanning…' : 'Run Cloudinary scan'}</button></div>
                  {(storageScan || storageOverview.scan) && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Scan status</p><p className="mt-2 text-lg font-medium text-white">{(storageScan || storageOverview.scan).status}</p><p className="mt-1 text-xs leading-5 text-white/45">{(storageScan || storageOverview.scan).reason || (storageScan || storageOverview.scan).message || 'No scan has been run.'}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Reference results</p><p className="mt-2 text-xs leading-5 text-white/55">Images: <span className="text-white">{(storageScan || storageOverview.scan).orphaned?.image?.count ?? '—'} orphaned</span> · {(storageScan || storageOverview.scan).missingDatabaseRecords?.image?.count ?? '—'} missing records</p><p className="mt-1 text-xs leading-5 text-white/55">Audio: <span className="text-white">{(storageScan || storageOverview.scan).orphaned?.video?.count ?? '—'} orphaned</span> · {(storageScan || storageOverview.scan).missingDatabaseRecords?.video?.count ?? '—'} missing records</p></div></div>}
                </section>

                <section className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Account storage</p><h2 className="mt-1 text-xl font-medium">Who is using space?</h2></div><span className="text-xs text-white/35">Top {number(storageOverview.accounts?.length)} accounts</span></div><div className="mt-5 space-y-2">{(storageOverview.accounts || []).map(account => <div key={account.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{account.studio || account.name}</p><p className="truncate text-xs text-white/40">{account.email} · {account.plan}</p></div><span className="text-sm font-medium text-white">{bytes(account.storage?.reportedBytes)}{account.storage?.limitBytes ? <span className="ml-1 text-xs text-white/40">/ {bytes(account.storage.limitBytes)}</span> : null}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${account.storage?.percent >= 80 ? 'bg-amber-300' : 'bg-[#ff7867]'}`} style={{ width: `${Math.min(100, account.storage?.percent || 0)}%` }} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40"><span>{number(account.storage?.libraryFiles)} library files</span><span>{bytes(account.storage?.deliveryBytes)} delivery media</span><span className={account.storage?.discrepancyBytes ? 'text-amber-200' : ''}>{account.storage?.discrepancyBytes ? `${bytes(Math.abs(account.storage.discrepancyBytes))} reported/recorded difference` : 'Usage reconciled'}</span></div></div>)}{!storageOverview.accounts?.length && <p className="py-10 text-center text-sm text-white/45">No accounts match this search.</p>}</div></section>

                <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Library formats</p><h2 className="mt-1 text-xl font-medium">File mix</h2></div><div className="mt-5 space-y-3">{(storageOverview.formats || []).map(item => <div key={item.format} className="flex items-center justify-between gap-3 text-xs"><span className="uppercase tracking-[.12em] text-white/55">{item.format}</span><span className="text-white/75">{number(item.files)} · {bytes(item.bytes)}</span></div>)}{!storageOverview.formats?.length && <p className="text-sm text-white/45">No library files yet.</p>}</div></div><div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Upload growth</p><h2 className="mt-1 text-xl font-medium">Recent media added</h2></div><div className="mt-5 space-y-2">{(storageOverview.growth || []).slice(-14).map(item => <div key={`${item.day}-${item.surface}`} className="flex items-center justify-between gap-3 text-xs"><span className="text-white/55">{item.day} · {item.surface}</span><span className="text-white/75">{number(item.files)} · {bytes(item.bytes)}</span></div>)}{!storageOverview.growth?.length && <p className="text-sm text-white/45">No upload events in this window.</p>}</div></div></section>
              </>}
            </div>
          )}

          {/* Volume delivery tab */}
          {!loading && tab === 'volume' && (
            <div className="mt-6">
              <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Category<select value={volumeCategoryFilter} onChange={(event) => setVolumeCategoryFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All categories</option><option value="school">School</option><option value="sports">Sports</option><option value="corporate">Corporate</option><option value="other">Other</option></select></label><label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Status<select value={volumeStatusFilter} onChange={(event) => setVolumeStatusFilter(event.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div>
              <div className="space-y-3">{volumeJobs.map(job => <button key={job.id || job.publicId} type="button" onClick={() => openVolume(job)} className="w-full rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9b8e]/70 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ff9b8e]">{job.category}</span><Status value={job.access?.revoked ? 'revoked' : job.access?.expired ? 'expired' : job.status} /></div><h3 className="mt-1 truncate text-sm font-semibold text-white">{job.title}</h3><p className="mt-1 truncate text-xs text-white/40">{job.organisation} · {job.photographer}</p></div><span className="text-xs text-white/35">{job.publicId}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/55 sm:grid-cols-4 lg:grid-cols-8"><span>Recipients <strong className="ml-1 text-white">{number(job.recipientCount)}</strong></span><span>Photos <strong className="ml-1 text-white">{number(job.assignedPhotoCount)}</strong></span><span>Unmatched <strong className="ml-1 text-white">{number(job.unmatchedRecipients)}</strong></span><span>Ambiguous <strong className="ml-1 text-white">{number(job.ambiguousFiles)}</strong></span><span>Code requests <strong className="ml-1 text-white">{number(job.activity?.codeRequests)}</strong></span><span>Verified <strong className="ml-1 text-white">{number(job.activity?.codeVerified)}</strong></span><span>Gallery opens <strong className="ml-1 text-white">{number(job.activity?.galleryOpens)}</strong></span><span>Downloads <strong className="ml-1 text-white">{number(job.activity?.downloads)}</strong></span></div></button>)}{!volumeJobs.length && <p className="py-16 text-center text-sm text-white/45">No volume deliveries match these filters.</p>}</div>
            </div>
          )}
        </section>
      </main>

      {/* Support ticket detail drawer */}
      {selectedSupportTicket && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="support-ticket-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountActionLoading) setSelectedSupportTicket(null); }}>
          <motion.aside initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-white/10 bg-[#0c0c10] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0c0c10]/95 p-5 backdrop-blur sm:p-7"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Support request</p><h2 id="support-ticket-title" className="mt-1 truncate text-2xl font-medium">{selectedSupportTicket.subject || selectedSupportTicket.summary?.subject || 'Support request'}</h2><p className="mt-2 truncate font-mono text-xs text-white/40">{selectedSupportTicket.ticketNumber || selectedSupportTicket.summary?.ticketNumber || ''}</p></div><button type="button" aria-label="Close support request" onClick={() => setSelectedSupportTicket(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:text-white"><X size={18} /></button></div>
            {supportDetailLoading && <div className="p-7 text-sm text-white/45">Loading the request history…</div>}
            {!supportDetailLoading && <div className="space-y-6 p-5 sm:p-7"><section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Requester</p><p className="mt-2 text-sm font-semibold text-white">{selectedSupportTicket.requester?.name || 'Unknown requester'}</p><p className="mt-1 break-all text-xs text-white/45">{selectedSupportTicket.requester?.email || 'No reply email'}</p>{selectedSupportTicket.account?.name && <p className="mt-2 text-xs text-white/40">Account: {selectedSupportTicket.account.name} · {selectedSupportTicket.account.plan || 'unknown plan'}</p>}</div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Related work</p><p className="mt-2 text-sm font-semibold text-white">{selectedSupportTicket.delivery?.title || selectedSupportTicket.delivery?.publicId || selectedSupportTicket.resourceId || 'No delivery attached'}</p><p className="mt-1 text-xs text-white/45">{selectedSupportTicket.delivery?.status || selectedSupportTicket.resourceType || 'General support request'}</p></div></section><section className="grid gap-3 sm:grid-cols-3"><label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Status<select value={selectedSupportTicket.status || 'open'} onChange={(event) => updateSupportTicket({ status: event.target.value })} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#141419] px-3 text-xs normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Priority<select value={selectedSupportTicket.priority || 'normal'} onChange={(event) => updateSupportTicket({ priority: event.target.value })} className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#141419] px-3 text-xs normal-case tracking-normal text-white outline-none focus:border-[#ff9b8e]/60"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><div className="flex items-end"><button type="button" disabled={accountActionLoading} onClick={() => updateSupportTicket({ assignedAdminId: admin?._id || admin?.id }, 'Assigned to you.')} className="min-h-10 w-full rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/70 transition-colors hover:border-[#ff9b8e]/50 hover:text-white disabled:opacity-50">{selectedSupportTicket.assignedAdmin?.name ? `Assigned to ${selectedSupportTicket.assignedAdmin.name}` : 'Assign to me'}</button></div></section><section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Conversation and internal notes</h3><span className="text-xs text-white/35">{number(selectedSupportTicket.messages?.length)} entries</span></div><div className="mt-3 space-y-2">{(selectedSupportTicket.messages || []).map(message => <article key={message._id || `${message.createdAt}-${message.message}`} className={`rounded-2xl border p-4 ${message.internal ? 'border-amber-300/15 bg-amber-300/[.05]' : 'border-white/10 bg-white/[.025]'}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/45">{message.internal ? 'Internal note' : message.authorType === 'admin' ? 'Reply from Veylo' : 'Requester'}</span><span className="text-[10px] text-white/30">{shortDate(message.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">{message.message}</p></article>)}</div><form onSubmit={(event) => { event.preventDefault(); if (supportReply.trim()) updateSupportTicket({ message: supportReply.trim(), internal: supportInternal }, supportInternal ? 'Internal note added.' : 'Reply recorded.'); }} className="mt-4 space-y-3"><textarea value={supportReply} onChange={(event) => setSupportReply(event.target.value)} rows={4} maxLength={4000} placeholder="Write a clear reply or internal note…" className="w-full resize-y rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs text-white/55"><input type="checkbox" checked={supportInternal} onChange={(event) => setSupportInternal(event.target.checked)} />Keep this as an internal note</label><button type="submit" disabled={accountActionLoading || !supportReply.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-40"><Send size={14} />{supportInternal ? 'Add note' : 'Record reply'}</button></div></form></section><section className="rounded-2xl border border-red-300/15 bg-red-300/[.04] p-4"><div className="flex items-center gap-2"><TriangleAlert size={15} className="text-amber-200" /><h3 className="text-sm font-semibold">Moderation actions</h3></div><p className="mt-2 text-xs leading-5 text-white/45">Use a specific reason. A takedown archives the related delivery or makes the related portfolio private, revokes its public link, and writes an audit record.</p><textarea value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} rows={3} maxLength={1000} placeholder="Why should this item be taken down or reviewed?" className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-[#ff9b8e]/60" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={accountActionLoading || moderationReason.trim().length < 8 || !selectedSupportTicket.delivery?.publicId} onClick={() => moderateSupport('takedown', 'delivery')} className="min-h-10 rounded-xl border border-red-300/25 px-3 text-xs font-semibold text-red-200 disabled:opacity-40">Take down delivery</button><button type="button" disabled={accountActionLoading || moderationReason.trim().length < 8 || selectedSupportTicket.resourceType !== 'portfolio'} onClick={() => moderateSupport('takedown', 'portfolio')} className="min-h-10 rounded-xl border border-red-300/25 px-3 text-xs font-semibold text-red-200 disabled:opacity-40">Make portfolio private</button><button type="button" disabled={accountActionLoading || moderationReason.trim().length < 8} onClick={() => moderateSupport('copyright_hold', selectedSupportTicket.resourceType === 'portfolio' ? 'portfolio' : 'delivery')} className="min-h-10 rounded-xl border border-amber-300/25 px-3 text-xs font-semibold text-amber-200 disabled:opacity-40">Record copyright hold</button></div></section></div>}
          </motion.aside>
        </div>
      )}

      {/* Volume delivery detail drawer */}
      {selectedVolume && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="volume-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountActionLoading) setSelectedVolume(null); }}>
          <motion.aside initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-white/10 bg-[#0c0c10] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0c0c10]/95 p-5 backdrop-blur sm:p-7"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Volume delivery</p><h2 id="volume-detail-title" className="mt-1 truncate text-2xl font-medium">{selectedVolume.title || selectedVolume.summary?.title || 'Volume delivery'}</h2><p className="mt-2 truncate text-xs text-white/45">{selectedVolume.organisation || selectedVolume.summary?.organisation || ''} · {selectedVolume.category || selectedVolume.summary?.category || ''}</p></div><button type="button" aria-label="Close volume details" onClick={() => setSelectedVolume(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:text-white"><X size={18} /></button></div>
            {volumeDetailLoading && <div className="p-7 text-sm text-white/45">Loading recipient records…</div>}
            {!volumeDetailLoading && selectedVolume.subjects && <div className="space-y-6 p-5 sm:p-7"><section className="flex flex-wrap gap-2">{selectedVolume.status !== 'published' && selectedVolume.status !== 'archived' && <button type="button" disabled={accountActionLoading} onClick={() => volumeAction('publish', 'Volume delivery published.')} className="min-h-10 rounded-xl bg-emerald-300 px-4 text-xs font-bold text-[#07130e] disabled:opacity-50">Publish</button>}{selectedVolume.status === 'archived' ? <button type="button" disabled={accountActionLoading} onClick={() => volumeAction('restore', 'Volume delivery restored.')} className="min-h-10 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">Restore</button> : <button type="button" disabled={accountActionLoading} onClick={() => volumeAction('archive', 'Volume delivery archived.')} className="min-h-10 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 disabled:opacity-50">Archive</button>}{selectedVolume.access?.link && <a href={selectedVolume.access.link} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70">Open recipient portal</a>}<button type="button" disabled={accountActionLoading} onClick={deleteSelectedVolume} className="min-h-10 rounded-xl border border-red-300/25 px-4 text-xs font-semibold text-red-200 disabled:opacity-50">Delete</button></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Recipients</p><p className="mt-2 text-xl font-medium">{number(selectedVolume.recipientCount)}</p><p className="mt-1 text-xs text-white/45">{number(selectedVolume.recipientsWithoutPhotos)} without photographs</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Assignments</p><p className="mt-2 text-xl font-medium">{number(selectedVolume.assignedPhotoCount)}</p><p className="mt-1 text-xs text-white/45">{number(selectedVolume.unmatchedRecipients)} unmatched recipients</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Access codes</p><p className="mt-2 text-xl font-medium">{number(selectedVolume.accessCodes?.active)}</p><p className="mt-1 text-xs text-white/45">{number(selectedVolume.accessCodes?.expired)} expired · {number(selectedVolume.accessCodes?.attempts)} attempts</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Recipient activity</p><p className="mt-2 text-xl font-medium">{number(selectedVolume.activity?.galleryOpens)}</p><p className="mt-1 text-xs text-white/45">{number(selectedVolume.activity?.downloads)} downloads</p></div></section><section className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Assignment health</h3><span className="text-xs text-white/35">{selectedVolume.assignmentCheckedAt ? `Checked ${shortDate(selectedVolume.assignmentCheckedAt)}` : 'Not checked'}</span></div><p className="mt-3 text-xs leading-5 text-white/55">{number(selectedVolume.ambiguousFiles)} ambiguous filenames · {number(selectedVolume.duplicateRecipientCodes)} duplicate recipient codes</p>{selectedVolume.unmatchedFilenames?.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-100/70">Unmatched or ambiguous files: {selectedVolume.unmatchedFilenames.join(', ')}</p>}</section><section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Recipients</h3><span className="text-xs text-white/35">{number(selectedVolume.subjects.length)} records</span></div><div className="mt-3 space-y-2">{selectedVolume.subjects.slice(0, 100).map(subject => <div key={subject.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{subject.displayName}</p><p className="mt-1 text-[11px] text-white/40">{subject.recipientCode}</p></div><span className={`text-[11px] ${subject.hasPhotos ? 'text-emerald-300' : 'text-amber-200'}`}>{number(subject.photoCount)} photos</span></div>)}</div></section></div>}
          </motion.aside>
        </div>
      )}

      {/* Delivery detail drawer */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountActionLoading) setSelectedDelivery(null); }}>
          <motion.aside initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-white/10 bg-[#0c0c10] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0c0c10]/95 p-5 backdrop-blur sm:p-7">
              <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ff9b8e]">Delivery workspace</p><h2 id="delivery-detail-title" className="mt-1 truncate text-2xl font-medium">{selectedDelivery.title || selectedDelivery.clientName || 'Delivery'}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><Status value={selectedDelivery.effectiveStatus || selectedDelivery.rawStatus || selectedDelivery.status} /><span className="text-xs text-white/40">{formatNames[selectedDelivery.format] || selectedDelivery.format || 'Format not selected'} · {selectedDelivery.photographer?.studio || selectedDelivery.photographer?.name || 'Independent photographer'}</span></div></div>
              <button type="button" aria-label="Close delivery details" onClick={() => setSelectedDelivery(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60 transition-colors hover:border-white/25 hover:text-white"><X size={18} /></button>
            </div>
            {deliveryDetailLoading && <div className="p-7 text-sm text-white/45">Loading delivery details…</div>}
            {!deliveryDetailLoading && selectedDelivery.title !== undefined && (
              <div className="space-y-6 p-5 sm:p-7">
                <section className="flex flex-wrap gap-2">
                  {selectedDelivery.rawStatus !== 'published' && selectedDelivery.rawStatus !== 'archived' && <button type="button" disabled={accountActionLoading} onClick={() => deliveryAction('publish', 'Delivery published.')} className="min-h-10 rounded-xl bg-emerald-300 px-4 text-xs font-bold text-[#07130e] disabled:opacity-50">Publish</button>}
                  {selectedDelivery.rawStatus === 'archived' ? <button type="button" disabled={accountActionLoading} onClick={() => deliveryAction('restore', 'Delivery restored.')} className="min-h-10 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">Restore</button> : <button type="button" disabled={accountActionLoading} onClick={() => deliveryAction('archive', 'Delivery archived.')} className="min-h-10 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 disabled:opacity-50">Archive</button>}
                  {selectedDelivery.rawStatus === 'published' && !selectedDelivery.access?.linkRevoked && <button type="button" disabled={accountActionLoading} onClick={() => deliveryAction('revoke-link', 'Client link revoked.')} className="min-h-10 rounded-xl border border-amber-300/30 px-4 text-xs font-semibold text-amber-200 disabled:opacity-50">Revoke link</button>}
                  {selectedDelivery.previewUrl && <a href={selectedDelivery.previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 hover:border-[#ff9b8e]/50">Open client view</a>}
                  <button type="button" disabled={accountActionLoading} onClick={deleteSelectedDelivery} className="min-h-10 rounded-xl border border-red-300/25 px-4 text-xs font-semibold text-red-200 disabled:opacity-50">Delete</button>
                </section>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Photographs</p><p className="mt-2 text-xl font-medium">{number(selectedDelivery.photoCount)}</p><p className="mt-1 text-xs text-white/45">{bytes(selectedDelivery.fileBytes)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Captions</p><p className="mt-2 text-xl font-medium">{number(selectedDelivery.captions?.completed)}/{number(selectedDelivery.captions?.total)}</p><p className="mt-1 text-xs text-white/45">{selectedDelivery.captions?.status || 'missing'}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Soundtrack</p><p className="mt-2 text-xl font-medium">{selectedDelivery.music?.status || 'missing'}</p><p className="mt-1 text-xs text-white/45">{selectedDelivery.music?.trackId || 'No selected track'}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.14em] text-white/35">Narration</p><p className="mt-2 text-xl font-medium">{selectedDelivery.narration?.status || 'missing'}</p><p className="mt-1 text-xs text-white/45">{selectedDelivery.narration?.timingStatus || selectedDelivery.narration?.voiceId || 'No timing reported'}</p></div></section>

                <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Client access</h3><Status value={selectedDelivery.access?.linkRevoked ? 'revoked' : selectedDelivery.access?.hasPin ? 'pin protected' : 'open'} /></div><div className="mt-4 grid gap-3 text-xs text-white/55 sm:grid-cols-2"><p>Expires: <span className="text-white/75">{selectedDelivery.access?.expiresAt ? shortDate(selectedDelivery.access.expiresAt) : 'No expiry'}</span></p><p>PIN: <span className="text-white/75">{selectedDelivery.access?.hasPin ? 'Configured (hidden)' : 'None'}</span></p><p>Individual downloads: <span className="text-white/75">{selectedDelivery.access?.allowIndividualDownloads ? 'Allowed' : 'Off'}</span></p><p>Download all: <span className="text-white/75">{selectedDelivery.access?.allowDownloadAll ? 'Allowed' : 'Off'}</span></p><p>Likes: <span className="text-white/75">{selectedDelivery.access?.allowLikes ? 'Allowed' : 'Off'}</span></p><p>Share grants: <span className="text-white/75">{number(selectedDelivery.shareGrants?.total)} total · {number(selectedDelivery.shareGrants?.active)} active</span></p></div></section>

                <section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">AI job history</h3><span className="text-xs text-white/35">{selectedDelivery.currentJob ? `${selectedDelivery.currentJob.type} is ${selectedDelivery.currentJob.status}` : 'No job running'}</span></div><div className="mt-3 space-y-2">{(selectedDelivery.jobs || []).map(job => <div key={job.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-white">{job.type}</span><Status value={job.status} /></div><p className="mt-1 text-[11px] text-white/40">{job.stage || 'queued'} · {number(job.progress)}% · attempt {number(job.attempts)}</p>{job.errorMessage && <p className="mt-1 text-[11px] text-amber-200/80">{job.errorCode || 'Job error'}: {job.errorMessage}</p>}</div>{job.status === 'failed' && <button type="button" disabled={accountActionLoading} onClick={() => retrySelectedJob(job.id)} className="min-h-9 rounded-lg border border-amber-300/30 px-3 text-[11px] font-semibold text-amber-200 disabled:opacity-50">Retry</button>}</div>)}{!selectedDelivery.jobs?.length && <p className="text-xs text-white/35">No AI jobs recorded.</p>}</div></section>

                <section><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Role links</h3><span className="text-xs text-white/35">Organizer · vendor · guest</span></div><div className="mt-3 space-y-2">{(selectedDelivery.shareGrants || []).map(grant => <div key={grant.id} className="rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex flex-wrap items-center gap-2"><Status value={grant.role} /><span className="text-xs font-semibold text-white">{grant.label}</span>{grant.revokedAt && <Status value="revoked" />}</div><p className="mt-2 text-[11px] text-white/45">{number(grant.assetCount)} photos · {number(grant.sectionCount)} sections · {grant.allowDownloadAll ? 'download all allowed' : 'download all off'}{grant.expiresAt ? ` · expires ${shortDate(grant.expiresAt)}` : ''}</p>{grant.usageTerms && <p className="mt-1 text-[11px] leading-5 text-white/40">{grant.usageTerms}</p>}</div>)}{!selectedDelivery.shareGrants?.length && <p className="text-xs text-white/35">No role links created.</p>}</div></section>

                <section><h3 className="text-sm font-semibold">Photographs and captions</h3><div className="mt-3 space-y-2">{(selectedDelivery.assets || []).slice(0, 30).map(asset => { const caption = (selectedDelivery.captions || []).find(item => item.assetId === asset.assetId); return <div key={asset.assetId} className="rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex items-start justify-between gap-3"><p className="truncate text-xs font-semibold text-white">{asset.originalFilename || asset.assetId}</p><span className="shrink-0 text-[11px] text-white/35">{bytes(asset.bytes)}</span></div><p className="mt-2 text-xs leading-5 text-white/55">{caption?.caption || 'Caption missing'}</p></div>; })}{!selectedDelivery.assets?.length && <p className="text-xs text-white/35">No photographs recorded.</p>}</div></section>
              </div>
            )}
          </motion.aside>
        </div>
      )}

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
