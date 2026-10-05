import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, BadgeCheck, Check, ChevronDown, CircleHelp, Clapperboard, Copy, Download, ExternalLink, Headphones, Image, LoaderCircle, MessageCircle, RefreshCw, RotateCcw, Send, ShieldCheck, Square, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import { trackEvent } from '../services/analytics.js';
import VeyloMarkdown from './VeyloMarkdown.jsx';
import './VeyloAssistant.css';

const STARTERS = {
  delivery: [
    { icon: Download, label: 'Download photos', question: 'How do I download one photograph?' },
    { icon: Headphones, label: 'Music & audio', question: 'Why will the music not play?' },
    { icon: MessageCircle, label: 'Read captions', question: 'How do I open the captions?' }
  ],
  studio: [
    { icon: Clapperboard, label: 'Choose a format', question: 'Which format fits a large event?' },
    { icon: Send, label: 'Publish & share', question: 'How do I publish a delivery?' },
    { icon: Image, label: 'Upload help', question: 'Why did one upload fail?' }
  ],
  public: [
    { icon: CircleHelp, label: 'Getting started', question: 'What is Veylo?' },
    { icon: Image, label: 'Client deliveries', question: 'How does a client delivery work?' },
    { icon: BadgeCheck, label: 'Plans & pricing', question: 'What is included with Pro?' }
  ]
};
const CHAT_STORAGE_PREFIX = 'veylo_help_chat_v2_';
const MAX_QUESTION = 3000;

function newMessage(role, content, state = 'complete') {
  return { id: globalThis.crypto?.randomUUID?.() || `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`, role, content, state };
}
function loadMessages(key) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(message => ['assistant', 'user'].includes(message?.role) && typeof message?.content === 'string' && message.content.trim())
      .slice(-30).map(message => ({
        ...newMessage(message.role, message.content.slice(0, message.role === 'user' ? MAX_QUESTION : 6000)),
        state: message.role === 'user' && message.state !== 'complete' ? 'stopped' : 'complete'
      }));
  } catch { return []; }
}
function saveMessages(key, messages) {
  try { window.sessionStorage.setItem(key, JSON.stringify(messages.slice(-30).map(({ role, content, state }) => ({ role, content, state })))); } catch {}
}

export default function VeyloAssistant({ user }) {
  const { pathname } = useLocation();
  const surface = /^\/(?:d|story|volume)(?:\/|$)/.test(pathname) ? 'delivery' : user ? 'studio' : 'public';
  // Changing identity remounts the chat, isolating history and cancelling old work.
  const identity = user?.id || user?._id || (user ? 'signed-in' : 'guest');
  const chatKey = `${CHAT_STORAGE_PREFIX}${identity}_${surface}`;
  return <AssistantChat key={chatKey} chatKey={chatKey} surface={surface} pathname={pathname} />;
}

function AssistantChat({ chatKey, surface, pathname }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => loadMessages(chatKey));
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [viewport, setViewport] = useState(null);
  const messagesRef = useRef(messages);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const launchRef = useRef(null);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const controllerRef = useRef(null);
  const copyTimerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const starters = STARTERS[surface] || STARTERS.public;
  const hasConversation = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const canRetry = lastMessage?.role === 'user' && ['failed', 'stopped'].includes(lastMessage.state);

  const updateMessages = next => { messagesRef.current = next; setMessages(next); };
  const scrollToLatest = (smooth = false) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickToBottomRef.current = true;
    setAwayFromBottom(false);
  };
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => launchRef.current?.focus());
  };

  useEffect(() => { saveMessages(chatKey, messages); }, [chatKey, messages]);
  useEffect(() => () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    window.clearTimeout(copyTimerRef.current);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const syncViewport = () => {
      const visual = window.visualViewport;
      setViewport(visual ? { height: visual.height, inset: Math.max(0, window.innerHeight - visual.height - visual.offsetTop) } : null);
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    const frame = window.requestAnimationFrame(() => {
      // Let phone users choose when to open the keyboard.
      (window.matchMedia('(min-width: 768px)').matches ? inputRef : closeRef).current?.focus();
      scrollToLatest();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = [];
    let child = panelRef.current;
    while (child && child !== document.body) {
      for (const sibling of child.parentElement?.children || []) {
        if (sibling !== child && sibling instanceof HTMLElement && !sibling.classList.contains('veylo-assistant-backdrop')) {
          siblings.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      child = child.parentElement;
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), a[href], summary') || [])]
        .filter(element => element.getClientRects().length && !element.closest('[inert]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach(([element, inert]) => { element.inert = inert; });
      window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  useEffect(() => { if (open && stickToBottomRef.current) scrollToLatest(); }, [open, messages, status]);
  useEffect(() => {
    if (!open || !inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 136)}px`;
  }, [open, input]);

  const send = async (value = input, { retryId } = {}) => {
    const content = String(value).trim();
    // A synchronous lock also catches duplicate submissions in the same render.
    if (!content || content.length > MAX_QUESTION || controllerRef.current) return;
    const current = messagesRef.current;
    const question = retryId ? current.find(message => message.id === retryId && message.role === 'user') : newMessage('user', content, 'sending');
    if (!question) return;
    const next = retryId ? current.map(message => message.id === retryId ? { ...message, state: 'sending' } : message) : [...current, question];
    const history = next.filter(message => message.state === 'complete' || message.id === question.id).slice(-12);
    const controller = new AbortController();
    controllerRef.current = controller;
    updateMessages(next);
    if (!retryId) setInput('');
    setError(''); setSuggestions([]); setStatus('sending');
    stickToBottomRef.current = true;
    const startedAt = performance.now();
    trackEvent('assistant.question.sent', { surface });
    try {
      const response = await api.post('/v1/assistant/chat', {
        surface, messages: history.map(({ role, content }) => ({ role, content }))
      }, { signal: controller.signal, timeout: 50000 });
      if (controllerRef.current !== controller || controller.signal.aborted) return;
      const data = response.data?.data;
      if (typeof data?.answer !== 'string' || !data.answer.trim()) throw new Error('The answer was empty.');
      updateMessages([
        ...messagesRef.current.map(message => message.id === question.id ? { ...message, state: 'complete' } : message),
        newMessage('assistant', data.answer.trim().slice(0, 6000))
      ]);
      setSuggestions(Array.isArray(data.suggestions) ? [...new Set(data.suggestions.filter(item => typeof item === 'string' && item.trim() && item.length <= 200))].slice(0, 3) : []);
      setStatus('idle');
      trackEvent('assistant.answer.completed', { surface }, { durationMs: Math.round(performance.now() - startedAt), status: 'completed' });
    } catch (requestError) {
      if (controllerRef.current !== controller || controller.signal.aborted) return;
      updateMessages(messagesRef.current.map(message => message.id === question.id ? { ...message, state: 'failed' } : message));
      setStatus('error');
      setError(apiMessage(requestError, 'We could not get an answer. Try again in a moment.'));
      trackEvent('assistant.answer.failed', { surface }, { status: 'failed', errorCode: requestError?.response?.data?.code || requestError?.code || 'ASSISTANT_FAILED' });
    } finally {
      // A cancelled request must never unlock its replacement.
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };
  const stop = () => {
    controllerRef.current?.abort(); controllerRef.current = null;
    updateMessages(messagesRef.current.map(message => message.state === 'sending' ? { ...message, state: 'stopped' } : message));
    setStatus('idle');
    trackEvent('assistant.response.stopped', { surface }, { status: 'stopped' });
  };
  const startNewChat = () => {
    controllerRef.current?.abort(); controllerRef.current = null;
    window.clearTimeout(copyTimerRef.current);
    updateMessages([]); setStatus('idle'); setError(''); setInput(''); setSuggestions([]); setCopiedId('');
    stickToBottomRef.current = true;
  };
  const copyAnswer = async message => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(''), 1800);
    } catch { setError('Copy is unavailable in this browser. You can select the answer to copy it.'); }
  };
  const panelStyle = viewport ? { '--assistant-viewport-height': `${viewport.height}px`, '--assistant-keyboard-inset': `${viewport.inset}px` } : undefined;

  return <>
    <button ref={launchRef} type="button" className={`veylo-assistant-launch${open ? ' is-open' : ''}${pathname === '/portfolio/manage' ? ' is-portfolio-editor' : ''}`} onClick={() => { setOpen(true); trackEvent('assistant.opened', { surface }); }} aria-label="Open Veylo Help" aria-expanded={open} aria-controls={open ? 'veylo-assistant-panel' : undefined} tabIndex={open ? -1 : 0}>
      <MessageCircle size={20} aria-hidden="true" /><span>Veylo Help</span>
    </button>
    {open && <>
      <button type="button" className="veylo-assistant-backdrop" onClick={close} aria-label="Close Veylo Help backdrop" tabIndex={-1} />
      <aside ref={panelRef} id="veylo-assistant-panel" className={`veylo-assistant-panel${pathname === '/portfolio/manage' ? ' is-portfolio-editor' : ''}`} style={panelStyle} role="dialog" aria-modal="true" aria-labelledby="veylo-assistant-title" aria-describedby="veylo-assistant-description">
        <header className="veylo-assistant-header">
          <div className="veylo-assistant-heading"><span className="veylo-assistant-mark"><MessageCircle size={21} aria-hidden="true" /></span><div><h2 id="veylo-assistant-title">Veylo Help</h2><p id="veylo-assistant-description">Your AI guide to Veylo</p></div></div>
          <div className="veylo-assistant-header-actions">
            <button type="button" className="veylo-assistant-icon-button" onClick={startNewChat} disabled={!hasConversation} aria-label="Start a new Veylo Help chat" title="New chat"><RotateCcw size={18} aria-hidden="true" /></button>
            <button ref={closeRef} type="button" className="veylo-assistant-icon-button" onClick={close} aria-label="Close Veylo Help"><X size={20} aria-hidden="true" /></button>
          </div>
        </header>
        <div className="veylo-assistant-conversation">
          <div ref={scrollRef} className="veylo-assistant-messages" onScroll={event => {
            const element = event.currentTarget;
            const away = element.scrollHeight - element.scrollTop - element.clientHeight > 64;
            stickToBottomRef.current = !away; setAwayFromBottom(away);
          }}>
            {!hasConversation && <section className="veylo-assistant-welcome">
              <span className="veylo-assistant-eyebrow">A little help, right here</span>
              <h3>{surface === 'studio' ? 'What are you working on?' : surface === 'delivery' ? 'Need a hand with your photos?' : 'What would you like to know?'}</h3>
              <p>{surface === 'studio' ? 'Ask about uploads, delivery formats, sharing or your plan.' : surface === 'delivery' ? 'Ask about downloads, captions or audio in your delivery.' : 'Get to know Veylo, from your first upload to the link your client receives.'}</p>
              <div className="veylo-assistant-starters" aria-label="Suggested questions">
                {starters.map(({ icon: Icon, label, question }) => <button type="button" key={question} onClick={() => send(question)}><span className="veylo-assistant-starter-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{label}</strong><span>{question}</span></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
              </div>
            </section>}
            <div role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions text" onClick={event => {
              if (event.target.closest('a')?.getAttribute('href')?.startsWith('/')) close();
            }}>
              {messages.map(message => <article className={`veylo-assistant-message is-${message.role}`} key={message.id}>
                <div className="veylo-assistant-message-label">{message.role === 'assistant' ? <><span className="veylo-assistant-answer-mark"><MessageCircle size={13} aria-hidden="true" /></span>Veylo Help</> : 'You'}</div>
                {message.role === 'assistant' ? <VeyloMarkdown>{message.content}</VeyloMarkdown> : <p className="veylo-assistant-user-content">{message.content}</p>}
                {message.role === 'assistant' && <div className="veylo-assistant-message-actions"><button type="button" onClick={() => copyAnswer(message)} aria-label={copiedId === message.id ? 'Answer copied' : 'Copy answer'}>{copiedId === message.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}<span>{copiedId === message.id ? 'Copied' : 'Copy answer'}</span></button></div>}
              </article>)}
            </div>
            {status === 'sending' && <div className="veylo-assistant-thinking" role="status"><LoaderCircle size={17} className="veylo-assistant-spin" aria-hidden="true" /><span>Finding an answer…</span></div>}
            {error && <div className="veylo-assistant-error" role="alert"><p>{error}</p><div>{canRetry && <button type="button" onClick={() => send(lastMessage.content, { retryId: lastMessage.id })}><RefreshCw size={15} aria-hidden="true" />Try again</button>}<a href="/contact?subject=Something%20else"><ExternalLink size={15} aria-hidden="true" />Contact support</a></div></div>}
            {canRetry && !error && <div className="veylo-assistant-stopped"><p>This question has no answer yet.</p><button type="button" onClick={() => send(lastMessage.content, { retryId: lastMessage.id })}><RefreshCw size={15} aria-hidden="true" />Try again</button></div>}
          </div>
          {awayFromBottom && <button type="button" className="veylo-assistant-latest" onClick={() => scrollToLatest(true)}><ArrowDown size={15} aria-hidden="true" />Latest message</button>}
        </div>
        {suggestions.length > 0 && status === 'idle' && <details className="veylo-assistant-followups"><summary>Related questions<ChevronDown size={15} aria-hidden="true" /></summary><div className="veylo-assistant-suggestions" aria-label="Related questions">{suggestions.map(question => <button type="button" key={question} onClick={() => send(question)}>{question}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div></details>}
        <footer className="veylo-assistant-footer">
          <form className="veylo-assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
            <label className="sr-only" htmlFor="veylo-assistant-input">Ask Veylo Help</label>
            <textarea ref={inputRef} id="veylo-assistant-input" rows={1} maxLength={MAX_QUESTION} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(min-width: 768px)').matches) { event.preventDefault(); send(); }
            }} placeholder={status === 'sending' ? 'Write your next question…' : 'Ask a question about Veylo…'} aria-describedby="veylo-assistant-footnote" />
            {status === 'sending' ? <button type="button" className="veylo-assistant-send is-stop" onClick={stop} aria-label="Stop response"><Square size={16} fill="currentColor" aria-hidden="true" /></button> : <button type="submit" className="veylo-assistant-send" disabled={!input.trim()} aria-label="Send question"><Send size={18} aria-hidden="true" /></button>}
          </form>
          <div className="veylo-assistant-composer-meta"><span>AI answers can be mistaken.</span><span>{input.length > 2700 ? `${input.length} / ${MAX_QUESTION}` : 'For Veylo questions'}</span></div>
          <p className="veylo-assistant-footnote" id="veylo-assistant-footnote"><ShieldCheck size={13} aria-hidden="true" /><span>Do not send passwords, access codes or private client details.</span></p>
        </footer>
      </aside>
    </>}
  </>;
}
