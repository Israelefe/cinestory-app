import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck } from 'lucide-react';
import api, { apiMessage } from '../../services/api.js';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import { ProPrice } from '../ProPricing.jsx';
import LibraryShell from './LibraryShell.jsx';
import WorkflowList from './WorkflowList.jsx';

export default function LibraryWorkflowAccess({ user, kind, showHistory = false, allowReadOnly = false, children }) {
  const { pathname } = useLocation();
  const reduced = useVeyloReducedMotion();
  const [attempt, setAttempt] = useState(0);
  const [access, setAccess] = useState({ key: '', mode: 'loading', error: '' });
  const key = `${user?.id || user?._id || ''}:${pathname}:${attempt}`;
  const selection = kind === 'preselection';
  const title = selection ? 'Photo Pre-selection' : 'Editor Links';
  const description = selection ? 'Let your clients choose the photographs they want edited.' : 'Send originals, receive edits, and review the finished work.';

  useEffect(() => {
    const controller = new AbortController();
    setAccess({ key, mode: 'loading', error: '' });
    api.get('/v1/billing/status', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const mode = data.data?.features?.storageMode;
      if (!['read-write', 'read-only', 'unavailable'].includes(mode)) throw new Error('Missing library access status.');
      setAccess({ key, mode, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setAccess({ key, mode: 'error', error: apiMessage(failure, 'Your plan could not be checked. Please try again.') });
    });
    return () => controller.abort();
  }, [key]);

  // A new route must finish its own check before mounting upload or draft hooks.
  const loading = access.key !== key || access.mode === 'loading';
  if (!loading && (access.mode === 'read-write' || allowReadOnly && access.mode !== 'error')) {
    const writable = access.mode === 'read-write';
    return typeof children === 'function' ? children(writable) : children;
  }

  return <LibraryShell title={title} description={description}>
    {loading ? <div className="lib-empty" role="status"><span className="lib-loader" />Checking your Pro access…</div> : access.error ? <div className="lib-error" role="alert">{access.error}<button type="button" onClick={() => setAttempt(current => current + 1)}>Try again</button></div> : <>
      <motion.section className="lib-empty lib-locked" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <BadgeCheck size={32} />
        <h2>{title} {selection ? 'is' : 'are'} included with Pro.</h2>
        <p>{selection ? 'Share a private link so your client can choose the photographs they want edited.' : 'Send originals to your editor and receive finished edits through a password-protected link.'}</p>
        {access.mode === 'read-only' && <p>Renew Pro to create or change links. You can still download or remove retained photographs in Photo Library.</p>}
        <Link to="/billing" className="lib-button lib-primary">{access.mode === 'read-only' ? 'Renew Pro' : 'Upgrade to Pro'}</Link>
        <p className="lib-fine"><ProPrice /> per month</p>
        <Link to="/library" className="lib-text-link">Open Photo Library</Link>
      </motion.section>
      {showHistory && <WorkflowList kind={kind} canCreate={false} />}
    </>}
  </LibraryShell>;
}
