import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleHelp, Copy, ExternalLink, LoaderCircle, MessageCircle, RefreshCw, Send, ShieldCheck, Square, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import { trackEvent } from '../services/analytics.js';
import VeyloMarkdown from './VeyloMarkdown.jsx';
import './VeyloAssistant.css';

const INITIAL_SUGGESTIONS = {
  studio: ['Which format fits a large event?', 'How do I publish a delivery?', 'Why did one upload fail?'],
  delivery: ['How do I download one photograph?', 'Why will the music not play?', 'How do I open the captions?'],
  public: ['What is Veylo?', 'How does a client delivery work?', 'What is included with Pro?']
};

function surfaceForPath(pathname, user) {
  if (/^\/(?:d|story|volume)(?:\/|$)/.test(pathname)) return 'delivery';
  return user ? 'studio' : 'public';
}

function welcomeForSurface(surface) {
  if (surface === 'delivery') return 'I can help you use this Veylo delivery, including captions, audio, access and downloads.';
  if (surface === 'studio') return 'I can help with Veylo accounts, deliveries, formats, sharing, billing and support.';
  return 'I can answer questions about Veylo, client deliveries and getting started.';
}

function newMessage(role, content) {
  return { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role, content };
}

export default function VeyloAssistant({ user }) {
  const { pathname } = useLocation();
  const surface = useMemo(() => surfaceForPath(pathname, user), [pathname, user]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => [newMessage('assistant', welcomeForSurface('public'))]);
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS.public);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const launchRef = useRef(null);
  const panelRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    setSuggestions(INITIAL_SUGGESTIONS[surface]);
    if (!messages.some(message => message.role === 'user')) setMessages([newMessage('assistant', welcomeForSurface(surface))]);
  }, [surface]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, messages.length]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        window.setTimeout(() => launchRef.current?.focus(), 0);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), a[href]') || [])];
      if (focusable.length < 2) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const send = async (value, { appendUser = true } = {}) => {
    const content = String(value ?? input).trim();
    if (!content || status === 'sending') return;
    const userMessage = newMessage('user', content);
    const nextMessages = appendUser ? [...messages, userMessage] : messages;
    if (appendUser) setMessages(nextMessages);
    setInput('');
    setError('');
    setStatus('sending');
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    trackEvent('assistant.question.sent', { surface });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await api.post('/v1/assistant/chat', {
        surface,
        messages: nextMessages.slice(-12).map(message => ({ role: message.role, content: message.content }))
      }, { signal: controller.signal, timeout: 50000 });
      const data = response.data?.data || {};
      if (!data.answer) throw new Error('The answer was empty.');
      setMessages(current => [...current, newMessage('assistant', data.answer)]);
      if (Array.isArray(data.suggestions) && data.suggestions.length) setSuggestions(data.suggestions.slice(0, 4));
      setStatus('idle');
      trackEvent('assistant.answer.completed', { surface }, { durationMs: Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)), status: 'completed' });
    } catch (requestError) {
      if (requestError?.code === 'ERR_CANCELED' || controller.signal.aborted) { setStatus('idle'); return; }
      setStatus('error');
      setError(apiMessage(requestError, 'Veylo Help is temporarily unavailable. Try again or contact support.'));
      trackEvent('assistant.answer.failed', { surface }, { status: 'failed', errorCode: requestError?.response?.data?.code || requestError?.code || 'ASSISTANT_FAILED' });
    } finally {
      controllerRef.current = null;
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus('idle');
    trackEvent('assistant.response.stopped', { surface }, { status: 'stopped' });
  };

  const copyAnswer = async message => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(current => current === message.id ? '' : current), 1600);
    } catch {}
  };

  const retry = () => {
    const lastUser = [...messages].reverse().find(message => message.role === 'user');
    if (lastUser) send(lastUser.content, { appendUser: false });
  };

  return <>
    <button ref={launchRef} type="button" className={`veylo-assistant-launch${open ? ' is-open' : ''}`} onClick={() => { setOpen(true); trackEvent('assistant.opened', { surface }); }} aria-label="Open Veylo Help" aria-expanded={open} tabIndex={open ? -1 : 0}>
      <MessageCircle size={20} aria-hidden="true" /><span>Veylo Help</span>
    </button>
    {open && <>
      <button type="button" className="veylo-assistant-backdrop" onClick={() => { setOpen(false); launchRef.current?.focus(); }} aria-label="Close Veylo Help" />
      <aside ref={panelRef} className="veylo-assistant-panel" role="dialog" aria-modal="true" aria-labelledby="veylo-assistant-title">
        <header className="veylo-assistant-header">
          <div className="veylo-assistant-heading"><span className="veylo-assistant-mark"><CircleHelp size={20} aria-hidden="true" /></span><div><h2 id="veylo-assistant-title">Veylo Help</h2><p>Answers about Veylo only</p></div></div>
          <button type="button" className="veylo-assistant-icon-button" onClick={() => { setOpen(false); launchRef.current?.focus(); }} aria-label="Close Veylo Help"><X size={19} /></button>
        </header>
        <div className="veylo-assistant-disclosure"><ShieldCheck size={15} aria-hidden="true" /><span>This chat does not access private system or account data beyond the small status needed to answer your Veylo question.</span></div>
        <div className="veylo-assistant-messages" aria-live="polite" aria-busy={status === 'sending'}>
          {messages.map(message => <article className={`veylo-assistant-message is-${message.role}`} key={message.id}>
            <div className="veylo-assistant-message-label">{message.role === 'assistant' ? 'Veylo Help' : 'You'}</div>
            <VeyloMarkdown>{message.content}</VeyloMarkdown>
            {message.role === 'assistant' && <div className="veylo-assistant-message-actions"><button type="button" onClick={() => copyAnswer(message)} aria-label="Copy answer">{copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}<span>{copiedId === message.id ? 'Copied' : 'Copy'}</span></button></div>}
          </article>)}
          {status === 'sending' && <div className="veylo-assistant-thinking" role="status"><LoaderCircle size={16} className="veylo-assistant-spin" />Veylo Help is checking that…</div>}
          {status === 'error' && <div className="veylo-assistant-error" role="alert"><p>{error}</p><button type="button" onClick={retry}><RefreshCw size={14} />Try again</button><a href="/contact?subject=Something%20else"><ExternalLink size={14} />Contact support</a></div>}
          <div ref={endRef} />
        </div>
        <div className="veylo-assistant-suggestions" aria-label="Suggested questions">{suggestions.map(question => <button type="button" key={question} onClick={() => send(question)} disabled={status === 'sending'}>{question}</button>)}</div>
        <form className="veylo-assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="veylo-assistant-input">Ask Veylo Help</label>
          <textarea ref={inputRef} id="veylo-assistant-input" rows={1} maxLength={3000} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Ask about Veylo…" disabled={status === 'sending'} />
          {status === 'sending' ? <button type="button" className="veylo-assistant-send" onClick={stop} aria-label="Stop response"><Square size={16} fill="currentColor" /></button> : <button type="submit" className="veylo-assistant-send" disabled={!input.trim()} aria-label="Send question"><Send size={17} /></button>}
        </form>
        <p className="veylo-assistant-footnote">Do not send passwords, access codes, card details or private client information.</p>
      </aside>
    </>}
  </>;
}
