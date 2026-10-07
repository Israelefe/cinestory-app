import { ProPrice, PricingNotice, useProPricing } from '../components/ProPricing.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { AlertCircle, ArrowLeft, BadgeCheck, CalendarClock, Check, CreditCard, ExternalLink, Image, Receipt, RefreshCw, ShieldCheck, X } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { toast } from 'react-toastify';

const features = [
  ['Deliveries', 'Unlimited under fair use'],
  ['Photos in one delivery', 'Up to 500'],
  ['Client branding', 'Your studio'],
  ['Portfolio', 'Included'],
  ['Client photo preselection', 'Private links'],
  ['Editor handoff', 'Password-protected'],
  ['Personal image storage', '100 GB in the Image Library'],
  ['Delivery hosting', 'Separate from library storage']
];

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(value));
}

function money(kobo) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format((kobo || 0) / 100);
}

export default function BillingPage({ onPlanChanged }) {
  const reduced = useVeyloReducedMotion();
  const { pricing, setPricing } = useProPricing();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const verificationJobs = useRef(new Map());
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const dialog = useRef(null);

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
    if (!pricing?.quote) return;
    setData(current => current ? { ...current, pricing, billingAvailable: pricing.billingAvailable ?? current.billingAvailable } : current);
  }, [pricing]);

  const callbackReference = params.get('reference') || params.get('trxref') || '';
  useEffect(() => {
    if (!callbackReference) return;
    let active = true;
    setWorking('verify');
    if (!verificationJobs.current.has(callbackReference)) verificationJobs.current.set(callbackReference, api.post(`/v1/billing/verify/${encodeURIComponent(callbackReference)}`));
    verificationJobs.current.get(callbackReference).then(response => {
      if (!active) return;
      setData(response.data.data);
      onPlanChanged?.(response.data.data.plan);
      if (response.data.confirmed) {
        setParams({}, { replace: true });
        toast.success(response.data.data.plan === 'pro' ? 'Payment confirmed. Pro is active.' : 'Payment confirmed. Review your current access below.');
      } else setError(response.data.message);
    }).catch(requestError => {
      if (active) setError(apiMessage(requestError, 'Paystack has not confirmed this payment yet.'));
    }).finally(() => { if (active) setWorking(''); });
    return () => { active = false; };
  }, [callbackReference, verificationAttempt, setParams, onPlanChanged]);

  useEffect(() => {
    if (!confirmCancel) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    const keyboard = event => {
      if (event.key === 'Escape' && !working) setConfirmCancel(false);
      if (event.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll('button:not([disabled]), a[href]') || [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [confirmCancel, working]);

  async function checkPayment(reference) {
    setWorking('verify'); setError('');
    try {
      const response = await api.post(`/v1/billing/verify/${encodeURIComponent(reference)}`);
      setData(response.data.data); onPlanChanged?.(response.data.data.plan);
      if (!response.data.confirmed) setError(response.data.message);
    } catch (error) { setError(apiMessage(error, 'We could not confirm payment yet.')); }
    finally { setWorking(''); }
  }

  async function loadMorePayments() {
    setWorking('history');
    try {
      const response = await api.get('/v1/billing/status', { params: { paymentsBefore: data.paymentsNextCursor } });
      setData(current => ({ ...current, payments: [...current.payments, ...response.data.data.payments], paymentsNextCursor: response.data.data.paymentsNextCursor }));
    } catch (error) { setError(apiMessage(error, 'We could not load older payments.')); }
    finally { setWorking(''); }
  }

  async function checkout() {
    setWorking('checkout');
    setError('');
    try {
      const response = await api.post('/v1/billing/checkout', { quote: data?.pricing?.quote || pricing?.quote });
      const target = new URL(response.data.data.authorizationUrl);
      if (target.protocol !== 'https:' || target.hostname !== 'checkout.paystack.com') throw new Error('Invalid checkout address.');
      window.location.assign(target.toString());
    } catch (requestError) {
      if (requestError.response?.data?.code === 'PRICE_CHANGED') {
        const updated = requestError.response.data.pricing;
        setData(current => ({ ...current, pricing: updated }));
        setPricing?.(updated);
      }
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
  const paidTimeRemains = isPro && Date.parse(data?.subscription?.paidThrough || '') > Date.now();
  const canManagePaymentMethod = isPro && ['active', 'past_due'].includes(state)
    && !data?.cancellationPending && !data?.subscription?.cancelRequestedAt && data?.subscription?.canManageCard;
  const canResume = state === 'canceling' && paidTimeRemains && !data?.cancellationPending
    && !data?.canCancel && data?.subscription?.canResume;
  const statusCopy = useMemo(() => {
    if (state === 'canceling') {
      if (data?.cancellationPending) return `Cancellation is awaiting confirmation.${paidTimeRemains ? ` Pro remains active until ${dateLabel(data.subscription.paidThrough)}.` : ''}`;
      if (data?.canCancel) return 'This subscription is canceled. Another renewal schedule still needs to be stopped.';
      return paidTimeRemains ? `Subscription canceled. Future renewals are off. Pro remains active until ${dateLabel(data.subscription.paidThrough)}.` : 'Your subscription is canceled. The paid access has ended.';
    }
    if (state === 'past_due') return isPro && data?.subscription?.graceEndsAt ? `Your payment needs attention. Pro remains available until ${dateLabel(data.subscription.graceEndsAt)}.` : 'Your payment needs attention. The paid access has ended.';
    if (isPro && !data?.subscription?.paidThrough) return 'Pro access was granted by support. There is no scheduled charge shown here.';
    if (isPro) return `Your next monthly payment is due around ${dateLabel(data?.subscription?.paidThrough)}.`;
    return 'Use Free for three published deliveries each month, with up to 100 photos in each one.';
  }, [data, isPro, paidTimeRemains, state]);

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

      {callbackReference && <button className="v-billing-retry" type="button" disabled={Boolean(working)} onClick={() => { verificationJobs.current.delete(callbackReference); setVerificationAttempt(value => value + 1); }}>Check returned payment again</button>}
      {data?.duplicateSchedules && <div className="v-billing-notice" role="status">More than one recurring schedule was found. Cancellation stops all linked schedules. Email payment@veylo.com.ng to review any duplicate charge.</div>}
      {data?.cancellationPending && <div className="v-billing-notice" role="status">Cancellation still needs confirmation. We are retrying it. Contact payment@veylo.com.ng before your renewal date.</div>}
      {error && <div className="v-billing-error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="v-billing-grid">
        <motion.article className={`v-billing-current ${isPro ? 'is-pro' : ''}`} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .05 }}>
          <header><div><small>CURRENT PLAN</small><h2>{isPro ? 'Veylo Pro' : 'Veylo Free'}</h2></div>{isPro ? <BadgeCheck size={26} /> : <Image size={26} />}</header>
          <div className="v-billing-price"><strong>{isPro ? data?.subscription?.amountKobo ? money(data.subscription.amountKobo) : 'Support grant' : '₦0'}</strong><span>/ month</span></div>
          <p>{statusCopy}</p>
          {state === 'past_due' && <div className="v-billing-notice"><AlertCircle size={17} /><span>A replacement checkout stops your old renewal schedule first and uses the new price shown alongside this plan. Email payment@veylo.com.ng if you need help recovering a payment.</span></div>}
          <div className="v-billing-actions">
            {(!isPro || state === 'past_due') && <button type="button" className="v-billing-primary" onClick={checkout} disabled={Boolean(working) || !data?.billingAvailable || !data?.pricing?.quote}>{working === 'checkout' ? 'Opening Paystack…' : state === 'past_due' ? 'Renew Pro' : 'Choose Pro'}<ExternalLink size={16} /></button>}
            {canManagePaymentMethod && <button type="button" onClick={manageCard} disabled={Boolean(working)}>Manage payment method<ExternalLink size={15} /></button>}
            {data?.canCancel && <button type="button" onClick={() => setConfirmCancel(true)} disabled={Boolean(working)}>Cancel subscription</button>}
            {canResume && <button type="button" onClick={() => changeSubscription('resume')} disabled={Boolean(working)}>{working === 'resume' ? 'Resuming…' : 'Resume subscription'}<RefreshCw size={15} /></button>}
          </div>
          {canResume && <p>Resuming turns monthly renewals back on.</p>}
          {(!isPro || state === 'past_due') && <p className="v-billing-consent">By choosing Pro, you agree to the <Link to="/terms">Terms</Link> and <Link to="/refund-policy">Refund Policy</Link>. Paystack will charge the displayed checkout price in NGN each month until you cancel.</p>}
          {!data?.billingAvailable && <small className="v-billing-unavailable">Checkout is temporarily unavailable. Email payment@veylo.com.ng for help.</small>}
        </motion.article>

        <motion.article className="v-billing-includes" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .1 }}>
          <header><small>VEYLO PRO</small><p className="v-billing-offer"><ProPrice /> / month</p><PricingNotice /><h2>For regular client delivery.</h2><p>One monthly plan for photographers and studios delivering finished work every week.</p></header>
          <div>{features.map(([label, value]) => <div key={label}><Check size={16} /><span><small>{label}</small><strong>{value}</strong></span></div>)}</div>
          <footer><ShieldCheck size={17} /><span>Pay securely through Paystack. Cancel before the next renewal whenever you need to.</span></footer>
        </motion.article>
      </section>

      <motion.section className="v-billing-history" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .15 }}>
        <header><div><p><Receipt size={15} />Payment history</p><h2>Your Pro payments.</h2></div><CalendarClock size={23} /></header>
        {data?.payments?.length ? <div className="v-billing-payment-list">{data.payments.map(payment => <article key={payment._id}><div><strong>{money(payment.amountKobo)}</strong><span>{dateLabel(payment.paidAt || payment.createdAt)}</span></div><span className={`is-${payment.status}`}>{payment.status.replaceAll('_', ' ')}</span><small>{payment.reference}</small>{payment.refundedAmountKobo > 0 && <small>Refunded: {money(payment.refundedAmountKobo)}</small>}{data?.refunds?.filter(refund => refund.paymentId === payment._id).map(refund => <small key={refund._id}>Refund: {money(refund.amountKobo)} · {refund.status}</small>)}{payment.refundPendingAmountKobo > 0 && <small>Refund being reviewed or processed: {money(payment.refundPendingAmountKobo)}</small>}{payment.status === 'pending' && <button type="button" disabled={Boolean(working)} onClick={() => checkPayment(payment.reference)}>Check payment</button>}</article>)}</div> : <div className="v-billing-empty"><Receipt size={21} /><p>No Pro payments yet.</p><span>Your Paystack receipts will appear here after your first payment.</span></div>}
      {data?.paymentsNextCursor && <button type="button" className="v-billing-retry" disabled={Boolean(working)} onClick={loadMorePayments}>Load older payments</button>}
      </motion.section><p className="v-billing-help"><Link to="/refund-policy">Refund policy</Link> · Payment help: <a href="mailto:payment@veylo.com.ng">payment@veylo.com.ng</a></p>
    </div>

    {confirmCancel && <div className="v-billing-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmCancel(false); }}><motion.div className="v-billing-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cancel-title" initial={reduced ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <button type="button" onClick={() => setConfirmCancel(false)} aria-label="Close"><X size={17} /></button>
      <CalendarClock size={25} />
      <p>BEFORE YOU CANCEL</p>
      <h2 id="cancel-title">Stop future renewals.</h2>
      <span>Pro continues through {dateLabel(data?.subscription?.paidThrough) || 'any remaining paid time'}. Existing client links keep working. After Pro ends, your portfolio and personal storage stay private for {data?.retentionDays || 30} days. Cancellation does not automatically request a refund.</span>
      <div><button type="button" onClick={() => setConfirmCancel(false)}>Keep Pro</button><button type="button" onClick={() => changeSubscription('cancel')} disabled={Boolean(working)}>{working === 'cancel' ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
    </motion.div></div>}
  </div>;
}
