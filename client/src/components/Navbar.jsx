import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { Menu, X, ArrowUpRight, ArrowRight, ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus.js';
import './Header.css';
const links = [['Client experience', '/client-experience'], ['Pricing', '/pricing'], ['About', '/about']];
const productLinks = [['Product overview', '/product', 'From client choices to finished delivery'], ['Client preselection', '/product#client-preselection', 'A private link to choose photos for editing'], ['Editor handoff', '/product#editor-handoff', 'Send originals and receive finished edits'], ['Image Library', '/product#image-library', 'Keep originals, previews and returned edits'], ['Delivery formats', '/formats', 'Compare three types and eight Showcase formats'], ['GridBoard', '/gridboard', 'The complete photo board, first'], ['Photo Swap', '/photoswap', 'A swipe through the finished photographs'], ['Video delivery', '/video-delivery', 'Finished films with private playback · Pro'], ['Veylo Portfolio', '/portfolio', 'Your selected work at your studio’s address']];
export default function Navbar({ user, onLogout }) {
 const [open, setOpen] = useState(false);
 const [productOpen, setProductOpen] = useState(false);
 const { pathname } = useLocation();
 const reduced = useVeyloReducedMotion();
 const menuRef = useRef(null);
 const triggerRef = useRef(null);
 const productRef = useRef(null);
 const productTrigger = useRef(null);
 useDialogFocus(open, menuRef, () => setOpen(false), triggerRef);
 useEffect(() => { setOpen(false); setProductOpen(false); }, [pathname]);
 useEffect(() => {
  if (!productOpen) return;
  const outside = event => { if (!productRef.current?.contains(event.target)) setProductOpen(false); };
  const escape = event => { if (event.key === 'Escape') { setProductOpen(false); productTrigger.current?.focus(); } };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
 }, [productOpen]);
 useEffect(() => {
  const media = window.matchMedia('(min-width: 1024px)');
  const close = () => { if (media.matches) setOpen(false); else setProductOpen(false); };
  media.addEventListener('change', close);
  return () => media.removeEventListener('change', close);
 }, []);
 return <>
 <a href="#main-content" className="v-skip-link">Skip to content</a>
 <header className="v-nav"><div className="v-wrap v-nav-inner">
 <Link to="/" className="v-logo" aria-label="Veylo home"><img src="/veylo/veylo-mark.svg" alt="" width="27" height="27" />veylo<span className="text-[#ff9b8e]">.</span></Link>
 <nav className="v-nav-links" aria-label="Main navigation"><Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>Home</Link><div className="v-nav-product" ref={productRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProductOpen(false); }}><button ref={productTrigger} type="button" className="v-nav-product-trigger" aria-expanded={productOpen} aria-controls="public-product-links" onClick={() => setProductOpen(value => !value)} data-current={productLinks.some(([, path]) => path.split('#')[0] === pathname) || undefined}>Product<ChevronDown size={14} aria-hidden="true" /></button><AnimatePresence>{productOpen && <motion.div id="public-product-links" className="v-nav-product-panel" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>{productLinks.map(([label, path, description]) => <Link key={path} to={path} onClick={() => setProductOpen(false)} aria-current={!path.includes('#') && pathname === path ? 'page' : undefined}><span>{label}<ArrowUpRight size={14} aria-hidden="true" /></span><small>{description}</small></Link>)}</motion.div>}</AnimatePresence></div>{links.map(([label, path]) => <Link key={path} to={path} aria-current={pathname === path ? 'page' : undefined}>{label}</Link>)}</nav>
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
 <nav aria-label="Mobile navigation"><Link to="/" onClick={() => setOpen(false)} aria-current={pathname === '/' ? 'page' : undefined}>Home<ArrowUpRight size={17} /></Link><div className="v-mobile-product-group"><p>PRODUCT</p>{productLinks.map(([label, path]) => <Link key={path} to={path} onClick={() => setOpen(false)} aria-current={!path.includes('#') && pathname === path ? 'page' : undefined}>{label}<ArrowUpRight size={16} /></Link>)}</div>{[...links, ...(user ? [['Dashboard', '/dashboard'], ['Account settings', '/settings']] : []), ['Contact', '/contact']].map(([label, path]) => <Link key={path} to={path} onClick={() => setOpen(false)} aria-current={pathname === path ? 'page' : undefined}>{label}<ArrowUpRight size={17} /></Link>)}</nav>
 <div className="v-actions"><Link to={user ? '/create' : '/signup'} onClick={() => setOpen(false)} className="v-button">{user ? 'Create a delivery' : 'Get started'}<ArrowRight size={17} /></Link>{user ? <button className="v-button v-button-secondary" onClick={() => { setOpen(false); onLogout(); }}>Sign out</button> : <Link className="v-button v-button-secondary" to="/signin" onClick={() => setOpen(false)}>Sign in</Link>}</div>
 </motion.div></>}</AnimatePresence>
 </>;
}
