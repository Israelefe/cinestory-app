import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Clock3, Inbox, Mail, MessageCircle, PenLine } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '../components/PublicDesign.jsx';
import SupportComposer, { SUPPORT_SUBJECTS } from '../components/SupportComposer.jsx';
import CustomerSupportInbox from '../components/CustomerSupportInbox.jsx';
import { consumeAssistantSupport, clearAssistantSupportDraft } from '../services/assistantSupport.js';

export default function ContactSupport({ user }) {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const [composeVersion, setComposeVersion] = useState(0);
  const [draft, setDraft] = useState(() => ({ ...(SUPPORT_SUBJECTS.includes(params.get('subject')) ? { subject: params.get('subject') } : {}), ...(params.get('payment') ? { subject: 'Veylo Pro', paymentId: params.get('payment') } : {}), ...consumeAssistantSupport(user?.id || user?._id || 'guest') }));
  useEffect(() => { const prepared = consumeAssistantSupport(user?.id || user?._id || 'guest'); if (prepared.message) { setDraft(prepared); setComposeVersion(value => value + 1); } clearAssistantSupportDraft(); }, [location.key]);
  const inbox = params.get('tab') === 'inbox' || Boolean(params.get('ticket'));
  const select = ticket => setParams(ticket ? { ticket } : { tab: 'inbox' });
  const newMessage = () => { setDraft({}); setComposeVersion(value => value + 1); setParams({}); };
  return <Page className="vs-page"><div className="vs-wrap">
    <motion.header className="vs-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
      <p className="vs-kicker"><span />Veylo support</p><h1>Talk to the people <br />behind <em>Veylo.</em></h1><p>Something isn’t working, or you need a hand with your account? Tell us what happened. A person will read your message.</p>
      <nav className="vs-tabs" aria-label="Support views"><button type="button" aria-current={!inbox ? 'page' : undefined} onClick={newMessage}><PenLine size={17} />Write to us</button><button type="button" aria-current={inbox ? 'page' : undefined} onClick={() => select('')}><Inbox size={17} />Your support inbox</button></nav>
    </motion.header>
    <div className="vs-layout"><motion.aside className="vs-sidebar" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .45 }}>
      <span className="vs-sidebar-mark"><MessageCircle size={25} /></span><h2>A little context <br />goes a long way.</h2><p>Tell us where you got stuck, what you tried and what you need to do next. We’ll keep the conversation together.</p>
      <div className="vs-sidebar-detail"><Clock3 size={18} /><p>This is a message inbox. You can leave the page after sending and return for a reply.</p></div>
      <div className="vs-direct"><p className="vs-kicker">Prefer email?</p><a href="mailto:info@veylo.com.ng"><Mail size={16} /><span>info@veylo.com.ng<small>Account, uploads and deliveries</small></span><ArrowUpRight size={16} /></a><a href="mailto:payment@veylo.com.ng"><Mail size={16} /><span>payment@veylo.com.ng<small>Payments, subscriptions and refunds</small></span><ArrowUpRight size={16} /></a></div>
      <Link className="vs-policy-link" to="/refund-policy">Read the refund policy<ArrowUpRight size={15} /></Link>
    </motion.aside><motion.section className="vs-main" aria-label={inbox ? 'Your support inbox' : 'Message the Veylo team'} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .45, delay: .08 }}>
      {inbox ? user ? <CustomerSupportInbox ticketId={params.get('ticket') || ''} onSelect={select} onNew={newMessage} /> : <div className="vs-empty"><Inbox size={35} /><h2>Your conversations, in one place.</h2><p>Sign in to read and reply to messages linked to your account. If you cannot sign in, you can still write to us.</p><Link className="vs-primary" to="/signin">Sign in<ArrowUpRight size={17} /></Link><button className="vs-secondary" onClick={newMessage} type="button">Write without signing in</button></div> : <><div className="vs-form-intro"><p className="vs-kicker">A message to a person</p><h2>How can we help?</h2><p>You describe the problem. We’ll attach the useful account details when you’re signed in.</p></div><SupportComposer key={`${user?.id || user?._id || 'guest'}-${composeVersion}-${draft.channel || 'web'}-${draft.paymentId || ''}`} user={user} draft={draft} /></>}
    </motion.section></div>
  </div></Page>;
}
