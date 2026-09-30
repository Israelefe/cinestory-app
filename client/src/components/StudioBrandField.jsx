import React from 'react';
import { Check, CircleAlert, LoaderCircle, LockKeyhole } from 'lucide-react';

export default function StudioBrandField({ id, value, onChange, availability, lockedUntil = '', disabled = false }) {
  const error = ['taken', 'invalid', 'error'].includes(availability.state);
  return <div className="v-field v-brand-field">
    <label htmlFor={id}>Studio or Brand name</label>
    <div className={`v-brand-input is-${availability.state}`}>
      <input id={id} value={value} onChange={event => onChange(event.target.value)} minLength={2} maxLength={100} autoComplete="organization" placeholder="For example, Amara Studios" required disabled={disabled || Boolean(lockedUntil)} aria-invalid={error || undefined} aria-describedby={`${id}-help`} />
      {lockedUntil ? <LockKeyhole size={17} aria-hidden="true" /> : availability.state === 'checking' ? <LoaderCircle size={18} className="v-brand-spinner" aria-hidden="true" /> : availability.state === 'available' ? <Check size={18} aria-hidden="true" /> : error ? <CircleAlert size={18} aria-hidden="true" /> : null}
    </div>
    <div id={`${id}-help`} className={`v-brand-feedback is-${availability.state}`} role="status" aria-live="polite">
      <span>{lockedUntil ? `You can change this name again on ${lockedUntil}.` : availability.message}</span>
      {availability.state === 'error' && <button type="button" onClick={availability.retry}>Check again</button>}
    </div>
  </div>;
}
