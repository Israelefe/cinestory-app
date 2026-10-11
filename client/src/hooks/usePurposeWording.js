import { useEffect, useRef, useState } from 'react';
import api from '../services/api.js';

async function requestPurposeSuggestion(payload, signal) {
  const deadline = Date.now() + 120_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await api.post('/v1/deliveries/v3/assist', payload, { signal, timeout: Math.max(1, deadline - Date.now()) });
    } catch (error) {
      const retryable = attempt === 0 && !signal.aborted
        && [502, 503, 504].includes(error.response?.status)
        && !error.response?.data?.code;
      if (!retryable || Date.now() + 1000 >= deadline) throw error;

      await new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(signal.reason || Object.assign(new Error('Request canceled.'), { name: 'AbortError' }));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 1000);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    }
  }
}

// Both creation forms use the same request checks and original-wording history.
export function usePurposeWording({ purpose, setPurpose, shootType, initialOriginalPurpose = '', busy, action, setError }) {
  const [originalPurpose, setOriginalPurpose] = useState(initialOriginalPurpose);
  const [purposeFeedback, setPurposeFeedback] = useState('');
  const revision = useRef(0);
  const request = useRef(null);
  const pending = useRef(false);
  useEffect(() => () => request.current?.abort(), []);

  function invalidate() {
    revision.current += 1;
  }

  function editPurpose(value) {
    invalidate();
    setPurpose(value);
    setOriginalPurpose('');
    setPurposeFeedback('');
  }

  function revert() {
    invalidate();
    setPurpose(originalPurpose);
    setOriginalPurpose('');
    setPurposeFeedback('Your original wording is back.');
  }

  async function improve() {
    if (busy || pending.current) return;
    if (!purpose.trim() || !shootType) { setError('Enter the shoot type and purpose first.'); return; }
    const source = purpose.trim();
    const sourceRevision = revision.current;
    const controller = new AbortController();
    pending.current = true;
    request.current = controller;
    setPurposeFeedback('');
    await action('improve', async () => {
      try {
        const { data } = await requestPurposeSuggestion({ mode: 'improve', purpose: source, shootType }, controller.signal);
        if (controller.signal.aborted) return;
        if (sourceRevision !== revision.current) { setPurposeFeedback('You changed the details while Veylo was working. Your latest words have been kept.'); return; }
        const suggestion = data.data;
        const improved = typeof suggestion?.improved === 'string' ? suggestion.improved.trim() : '';
        if (!improved || suggestion.sourcePurpose !== source || suggestion.meaningPreserved !== true) throw new Error('Veylo could not check that suggestion against your words. Your text has been kept. Please try again.');
        if (improved === source) { setPurposeFeedback('No wording changes were suggested. Your text is unchanged.'); return; }
        setOriginalPurpose(current => current || purpose);
        setPurpose(improved);
        setPurposeFeedback('Wording improved. Your original is saved so you can restore it.');
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (sourceRevision !== revision.current) { setPurposeFeedback('You changed the details while Veylo was working. Your latest words have been kept.'); return; }
        setPurposeFeedback('Veylo could not improve the wording. Your text has been kept. Please try again.');
        throw failure;
      } finally {
        pending.current = false;
        if (request.current === controller) request.current = null;
      }
    });
  }

  return { originalPurpose, purposeFeedback, improve, editPurpose, invalidate, revert };
}
