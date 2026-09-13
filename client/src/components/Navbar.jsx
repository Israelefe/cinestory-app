import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X, ArrowUpRight, ArrowRight, LayoutDashboard, LogOut } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus.js';
import './Header.css';
const links = [['Home', '/'], ['Formats', '/formats'], ['Portfolio', '/portfolio'], ['Client experience', '/client-experience'], ['Pricing', '/pricing'], ['About', '/about']];
export default function Navbar({ user, onLogout }) {
 const [open, setOpen] = useState(false);
 const { pathname } = useLocation();
 const reduced = useReducedMotion();
 const menuRef = useRef(null);
 const triggerRef = useRef(null);
 useDialogFocus(open, menuRef, () => setOpen(false), triggerRef);
 useEffect(() => { setOpen(false); }, [pathname]);
 useEffect(() => {
  const media = window.matchMedia('(min-width: 1024px)');
  const close = () => { if (media.matches) setOpen(false); };
  media.addEventListener('change', close);
  return () => media.removeEventListener('change', close);
 }, []);
 return <>
 <a href="#main-content" className="v-skip-link">Skip to content</a>
 <header className="v-nav"><div className="v-wrap v-nav-inner">
 <Link to="/" className="v-logo" aria-label="Veylo home"><img src="/veylo/veylo-mark.svg" alt="" width="27" height="27" />veylo<span className="text-[#ff9b8e]">.</span></Link>
 <nav className="v-nav-links" aria-label="Main navigation">{links.map(([label, path]) => <Link key={path} to={path} aria-current={pathname === path ? 'page' : undefined}>{label}</Link>)}</nav>
 <div className="v-nav-actions">
 <Link className="v-nav-home" to="/" aria-current={pathname === '/' ? 'page' : undefined}>Home</Link>
 {user ? <><Link className="v-nav-dashboard" to="/dashboard"><LayoutDashboard size={17} /><span>Dashboard</span></Link><button className="v-nav-signin v-nav-logout" onClick={onLogout} aria-label="Sign out"><LogOut size={17} /></button></> : <Link className="v-nav-signin" to="/signin">Sign in</Link>}
 {!user && <Link to="/signup" className="v-button v-button-secondary"><span>Get started</span><ArrowUpRight size={16} /></Link>}
 <button ref={triggerRef} className="v-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="public-menu" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
 </div></div></header>
 <AnimatePresence>{open && <>
 <motion.div className="v-menu-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} aria-hidden="true" />
 <motion.div id="public-menu" ref={menuRef} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1} className="v-menu" initial={reduced ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 280 }}>
 <button className="v-menu-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
 <nav aria-label="Mobile navigation">{[...links, ...(user ? [['Dashboard', '/dashboard'], ['Account settings', '/settings']] : []), ['Contact', '/contact']].map(([label, path]) => <Link key={path} to={path} onClick={() => setOpen(false)} aria-current={pathname === path ? 'page' : undefined}>{label}<ArrowUpRight size={17} /></Link>)}</nav>
 <div className="v-actions"><Link to={user ? '/create' : '/signup'} onClick={() => setOpen(false)} className="v-button">{user ? 'Create a Photo Story' : 'Get started'}<ArrowRight size={17} /></Link>{user ? <button className="v-button v-button-secondary" onClick={() => { setOpen(false); onLogout(); }}>Sign out</button> : <Link className="v-button v-button-secondary" to="/signin" onClick={() => setOpen(false)}>Sign in</Link>}</div>
 </motion.div></>}</AnimatePresence>
 </>;
}
