import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowUpRight, AudioLines, Bot, ChevronRight, CircleHelp, FileText, Film, Globe2, HardDrive, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageCircle, ReceiptText, Settings2, ShieldCheck, Users, X } from 'lucide-react';
import './AdminWorkspace.css';

export const ADMIN_NAVIGATION = [
  { label: 'Today', items: [['overview', LayoutDashboard, 'Overview'], ['operations', Activity, 'Operations'], ['issues', CircleHelp, 'Errors & incidents']] },
  { label: 'People & work', items: [['users', Users, 'Accounts'], ['support', MessageCircle, 'Support inbox'], ['deliveries', Film, 'Deliveries'], ['portfolio', Globe2, 'Portfolios'], ['volume', Users, 'Volume delivery'], ['access', LockKeyhole, 'Client access']] },
  { label: 'Business', items: [['payments', ReceiptText, 'Payments & billing'], ['productAnalytics', Activity, 'Product analytics'], ['visitorTraffic', Globe2, 'Visitors & traffic']] },
  { label: 'Platform', items: [['aiJobs', Bot, 'Processing jobs'], ['storage', HardDrive, 'Storage'], ['musicNarration', AudioLines, 'Music & narration'], ['configuration', Settings2, 'Configuration'], ['security', ShieldCheck, 'Security & audit']] }
];
export const sectionLabel = key => ADMIN_NAVIGATION.flatMap(group => group.items).find(item => item[0] === key)?.[2] || 'Overview';
export default function AdminShell({ admin, sections, tab, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const drawer = useRef(null), trigger = useRef(null);
  useEffect(() => { setOpen(false); }, [tab]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => drawer.current?.querySelector('button')?.focus(), 0);
    const keydown = event => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const items = [...(drawer.current?.querySelectorAll('button, a[href]') || [])];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { clearTimeout(focusTimer); document.body.style.overflow = previous; window.removeEventListener('keydown', keydown); trigger.current?.focus(); };
  }, [open]);
  const navigation = <>
    <Link to="/" onClick={() => onNavigate('overview')} className="aw-brand"><img src="/veylo/veylo-mark.svg" alt="" /><span>veylo<span className="aw-brand-sub">ADMINISTRATION</span></span></Link>
    <nav aria-label="Administration">
      {ADMIN_NAVIGATION.map(group => {
        const items = group.items.filter(([key]) => sections.includes(key));
        return items.length ? <div className="aw-nav-group" key={group.label}><p>{group.label}</p>{items.map(([key, Icon, label]) => <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => { onNavigate(key); setOpen(false); }}><Icon size={17} strokeWidth={1.6} /><span>{label}</span>{tab === key && <ChevronRight size={13} />}</button>)}</div> : null;
      })}
    </nav>
    <div className="aw-nav-footer">
      {['admin', 'superadmin', 'operations'].includes(admin?.role) && <Link to="/content-studio"><Film size={16} />Content Studio<ArrowUpRight size={14} /></Link>}
      <div className="aw-identity"><span className="aw-avatar">{(admin?.name || admin?.username || 'A').slice(0, 1)}</span><span><strong>{admin?.name || admin?.username}</strong><small>{admin?.role}</small></span><button type="button" aria-label="Sign out" onClick={onLogout}><LogOut size={17} /></button></div>
    </div>
  </>;
  return <div className="aw-workspace">
    <a className="aw-skip" href="#admin-main">Skip to workspace</a>
    <aside className="aw-sidebar">{navigation}</aside>
    <div className="aw-body">
      <header className="aw-topbar"><div><button type="button" ref={trigger} className="aw-menu" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button><span className="aw-breadcrumb">Admin<ChevronRight size={13} /><strong>{sectionLabel(tab)}</strong></span></div><span className="aw-private"><ShieldCheck size={14} />Private workspace</span></header>
      <main id="admin-main" className="aw-main" tabIndex={-1}>{children}</main>
    </div>
    <AnimatePresence>{open && <div className="aw-drawer-layer"><motion.button type="button" aria-label="Close navigation" className="aw-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} /><motion.aside ref={drawer} role="dialog" aria-modal="true" aria-label="Admin navigation" className="aw-drawer" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 280 }}><button type="button" className="aw-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20} /></button>{navigation}</motion.aside></div>}</AnimatePresence>
  </div>;
}
