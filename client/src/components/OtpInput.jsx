import React, { useRef } from 'react';

export default function OtpInput({ value, onChange, disabled = false }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');
  function replace(index, next) {
    const copy = [...digits];
    copy[index] = next;
    onChange(copy.join(''));
  }
  function input(index, event) {
    const digit = event.target.value.replace(/\D/g, '').slice(-1);
    replace(index, digit);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }
  function keyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus();
  }
  function paste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 6) - 1]?.focus();
  }
  return <div className="v-otp" onPaste={paste}>{digits.map((digit, index) => <input key={index} ref={node => { refs.current[index] = node; }} value={digit} onChange={event => input(index, event)} onKeyDown={event => keyDown(index, event)} inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${index + 1} of 6`} disabled={disabled} maxLength={1} />)}</div>;
}
