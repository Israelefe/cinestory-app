import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowLeft, BadgeCheck, CalendarClock, Check, CreditCard, ExternalLink, Image, Receipt, RefreshCw, ShieldCheck, X } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { toast } from 'react-toastify';

const features = [
  ['Deliveries', 'Unlimited under fair use'],
  ['Photos in one delivery', 'Up to 500'],
  ['Client branding', 'Your studio'],
  ['Portfolio', 'Included'],
  ['Personal image storage', '50 GB'],
  ['Delivery hosting', 'Kept outside your 50 GB']
];

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(value));
}

function money(kobo) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format((kobo || 0) / 100);
}

export default function BillingPage({ onPlanChanged }) {
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const verificationStarted = useRef('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/v1/billing/status');
      setData(response.data.data);
    } catch (requestError) {
      setError(apiMessage(requestError, 'We could not open your billing details.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const reference = params.get('reference') || params.get('trxref');
    if (!reference || verificationStarted.current === reference) return;
    verificationStarted.current = reference;
    let active = true;
    setWorking('verify');
    api.post(`/v1/billing/verify/${encodeURIComponent(reference)}`).then(response => {
      if (!active) return;
      setData(response.data.data);
      onPlanChanged?.(response.data.data.plan);
      setParams({}, { replace: true });
      toast.success('Veylo Pro is active');
    }).catch(requestError => {
      if (active) setError(apiMessage(requestError, 'Paystack has not confirmed this payment yet.'));
    }).finally(() => { if (active) setWorking(''); });
    return () => { active = false; };
  }, [params, setParams, onPlanChanged]);

  async function checkout() {
    setWorking('checkout');
    setError('');
    try {
      const response = await api.post('/v1/billing/checkout');
      window.location.assign(response.data.data.authorizationUrl);
    } catch (requestError) {
      setError(apiMessage(requestError, 'We could not open Paystack. Please try again.'));
      setWorking('');
    }
  }

  async function changeSubscription(action) {
    setWorking(action);
    setError('');
    try {
      const response = await api.post(`/v1/billing/${action}`);
      setData(response.data.data);
      onPlanChanged?.(response.data.data.plan);
      setConfirmCancel(false);
      toast.success(response.data.message);
    } catch (requestError) {
      setError(apiMessage(requestError, `We could not ${action} your subscription.`));
    } finally { setWorking(''); }
  }

  async function manageCard() {
    setWorking('manage-link');
    setError('');
    try {
      const response = await api.post('/v1/billing/manage-link');
      window.location.assign(response.data.data.link);
    } catch (requestError) {
      setError(apiMessage(requestError, 'We could not open Paystack billing.'));
      setWorking('');
    }
  }

  const state = data?.subscription?.status || 'free';
  const isPro = data?.plan === 'pro';
  const statusCopy = useMemo(() => {
    if (state === 'canceling') return `Pro remains active until ${dateLabel(data?.subscription?.paidThrough)}.`;
    if (state === 'past_due') return `Your payment needs attention. Pro remains available until ${dateLabel(data?.subscription?.graceEndsAt)}.`;
    if (isPro) return `Your next monthly payment is due around ${dateLabel(data?.subscription?.paidThrough)}.`;
    return 'Use Free for three published deliveries each month, with up to 100 photos in each one.';
  }, [data, isPro, state]);

  if (loading) return <div className="v-billing-page"><div className="v-billing-state"><RefreshCw className="v-spin" /><strong>Opening billing…</strong></div></div>;

  return <div className="v-billing-page">
    <div className="v-billing-glow" aria-hidden="true" />
    <div className="v-billing-wrap">
      <motion.header className="v-billing-heading" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
        <Link to="/dashboard"><ArrowLeft size={16} />Back to my deliveries</Link>
        <p><CreditCard size={15} />Plan and billing</p>
        <h1>Your Veylo plan.</h1>
        <span>See what your account includes, check past payments, or manage your monthly Pro subscription.</span>
      </motion.header>

      {error && <div className="v-billing-error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="v-billing-grid">
        <motion.article className={`v-billing-current ${isPro ? 'is-pro' : ''}`} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .05 }}>
          <header><div><small>CURRENT PLAN</small><h2>{isPro ? 'Veylo Pro' : 'Veylo Free'}</h2></div>{isPro ? <BadgeCheck size={26} /> : <Image size={26} />}</header>
          <div className="v-billing-price"><strong>{isPro ? '₦25,000' : '₦0'}</strong><span>/ month</span></div>
          <p>{statusCopy}</p>
          {state === 'past_due' && <div className="v-billing-notice"><AlertCircle size={17} /><span>Paystack does not retry a failed subscription payment. Start a new checkout to keep Pro after the grace period.</span></div>}
          <div className="v-billing-actions">
            {(!isPro || state === 'past_due') && <button type="button" className="v-billing-primary" onClick={checkout} disabled={Boolean(working) || !data?.billingAvailable}>{working === 'checkout' ? 'Opening Paystack…' : state === 'past_due' ? 'Renew Pro' : 'Choose Pro'}<ExternalLink size={16} /></button>}
            {isPro && data?.subscription?.canManageCard && <button type="button" onClick={manageCard} disabled={Boolean(working)}>Manage payment method<ExternalLink size={15} /></button>}
            {isPro && state === 'active' && <button type="button" onClick={() => setConfirmCancel(true)} disabled={Boolean(working)}>Cancel subscription</button>}
            {state === 'canceling' && <button type="button" className="v-billing-primary" onClick={() => changeSubscription('resume')} disabled={Boolean(working)}>{working === 'resume' ? 'Restoring Pro…' : 'Keep my Pro plan'}<RefreshCw size={15} /></button>}
          </div>
          {!data?.billingAvailable && <small className="v-billing-unavailable">Online billing is being connected. Your current plan still works.</small>}
        </motion.article>

        <motion.article className="v-billing-includes" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .1 }}>
          <header><small>VEYLO PRO</small><h2>For regular client delivery.</h2><p>One monthly plan for photographers and studios delivering finished work every week.</p></header>
          <div>{features.map(([label, value]) => <div key={label}><Check size={16} /><span><small>{label}</small><strong>{value}</strong></span></div>)}</div>
          <footer><ShieldCheck size={17} /><span>Pay securely through Paystack by card or Nigerian Direct Debit. Cancel before the next renewal whenever you need to.</span></footer>
        </motion.article>
      </section>

      <motion.section className="v-billing-history" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .15 }}>
        <header><div><p><Receipt size={15} />Payment history</p><h2>Your Pro payments.</h2></div><CalendarClock size={23} /></header>
        {data?.payments?.length ? <div className="v-billing-payment-list">{data.payments.map(payment => <article key={payment._id}><div><strong>{money(payment.amountKobo)}</strong><span>{dateLabel(payment.paidAt || payment.createdAt)}</span></div><span className={`is-${payment.status}`}>{payment.status.replaceAll('_', ' ')}</span><small>{payment.reference}</small></article>)}</div> : <div className="v-billing-empty"><Receipt size={21} /><p>No Pro payments yet.</p><span>Your Paystack receipts will appear here after your first payment.</span></div>}
      </motion.section>
    </div>

    {confirmCancel && <div className="v-billing-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmCancel(false); }}><motion.div className="v-billing-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title" initial={reduced ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <button type="button" onClick={() => setConfirmCancel(false)} aria-label="Close"><X size={17} /></button>
      <CalendarClock size={25} />
      <p>BEFORE YOU CANCEL</p>
      <h2 id="cancel-title">Use Pro until the month ends.</h2>
      <span>Your existing client links will keep working. After the paid month, they will show Veylo branding. Your portfolio and personal storage become private for 30 days.</span>
      <div><button type="button" onClick={() => setConfirmCancel(false)}>Keep Pro</button><button type="button" onClick={() => changeSubscription('cancel')} disabled={Boolean(working)}>{working === 'cancel' ? 'Cancelling…' : 'Cancel at month end'}</button></div>
    </motion.div></div>}
  </div>;
}
