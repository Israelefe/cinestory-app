import { useEffect, useState } from 'react';
import api, { apiMessage } from '../services/api.js';

export function cleanBrandName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export default function useStudioNameAvailability(value, currentName = '') {
  const name = cleanBrandName(value);
  const [result, setResult] = useState({ name: '', state: 'idle', message: '' });
  const [attempt, setAttempt] = useState(0);
  const invalid = /[\p{Cc}\p{Cf}]/u.test(value) || name.length < 2 || name.length > 100;

  useEffect(() => {
    if (invalid || !name) return;
    const controller = new AbortController();
    let active = true;
    setResult({ name, state: 'checking', message: 'Checking this name…' });
    const timeout = setTimeout(async () => {
      try {
        const { data } = await api.get('/v1/auth/studio-name-availability', { params: { name }, signal: controller.signal, timeout: 15000 });
        if (!active) return;
        if (typeof data.available !== 'boolean') throw new Error('Invalid name availability response.');
        const ownName = cleanBrandName(currentName).toLowerCase() === name.toLowerCase();
        setResult({ name, state: data.available ? 'available' : 'taken', message: data.available ? (ownName ? 'This is your account’s name.' : 'This name is available.') : 'This name is already in use. Try another name.' });
      } catch (error) {
        if (active) setResult({ name, state: 'error', message: apiMessage(error, 'We could not check this name. Please try again.') });
      }
    }, 450);
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [name, invalid, currentName, attempt]);

  const state = !name ? 'idle' : invalid ? 'invalid' : result.name !== name ? 'checking' : result.state;
  const message = state === 'idle' ? 'Only one account can use each name.' : state === 'invalid' ? 'Use 2–100 visible characters for your Studio or Brand name.' : state === 'checking' ? 'Checking this name…' : result.message;
  return {
    state, message, canSubmit: state === 'available',
    reject: message => setResult({ name, state: 'taken', message }),
    retry: () => setAttempt(value => value + 1)
  };
}
