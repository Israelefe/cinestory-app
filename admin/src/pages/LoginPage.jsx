import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, UserRound, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { setAdminToken } from '../services/api.js';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Please enter both your username and password.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const { data } = await api.post('/v1/admin/auth/login', {
        username: cleanUsername,
        password
      });

      if (data.token) {
        setAdminToken(data.token);
      }
      toast.success(`Welcome back, ${data.admin?.name || data.admin?.username || 'Admin'}`);
      if (onLoginSuccess) {
        onLoginSuccess(data.admin);
      }
    } catch (err) {
      console.error('[admin/login]', err);
      let message = err.response?.data?.message;
      if (!message) {
        if (!err.response) {
          message = `Unable to reach the backend at "${api.defaults.baseURL || 'unknown'}". Please ensure your Render backend is running and VITE_API_URL is set on Cloudflare Pages.`;
        } else if (err.response.status === 404) {
          message = `API route not found (404) at ${api.defaults.baseURL}. Check your VITE_API_URL in Cloudflare Pages.`;
        } else if (err.response.status === 403) {
          message = `Access rejected (403): ${err.response.data?.message || 'CORS origin blocked by backend.'}`;
        } else {
          message = `Server returned status ${err.response.status}. Please check Render logs.`;
        }
      }
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-4 py-12 sm:px-6 md:px-8">
      {/* Subtle ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#ff5a47]/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[400px] rounded-full bg-[#ff9b8e]/5 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[.03] shadow-inner">
            <img src="/veylo/veylo-mark.svg" alt="Veylo" className="h-7 w-7" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[.18em] text-[#ff9b8e]">
            <ShieldCheck size={14} /> Admin Workspace
          </div>
          <h1 className="mt-4 text-3xl font-medium tracking-tight text-white sm:text-4xl">
            Veylo Administration
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Sign in with your administrator credentials to access platform controls.
          </p>
        </div>

        {/* Login form container */}
        <div className="rounded-3xl border border-white/10 bg-[#0c0c10] p-6 shadow-2xl sm:p-8">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/70">
                Username
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/40">
                  <UserRound size={17} />
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. superadmin"
                  className="w-full rounded-xl border border-white/10 bg-white/[.03] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ff9b8e]/60 focus:bg-white/[.05]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/70">
                Password
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/40">
                  <Lock size={17} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your admin password"
                  className="w-full rounded-xl border border-white/10 bg-white/[.03] py-3 pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ff9b8e]/60 focus:bg-white/[.05]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-white/40 transition-colors hover:text-white/80"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a47] py-3.5 text-sm font-semibold text-[#160907] transition-transform hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span>Signing in…</span>
              ) : (
                <>
                  <span>Sign in to Admin</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-white/35">
          Private administrative interface · Authorized personnel only
        </p>
      </motion.div>
    </div>
  );
}
