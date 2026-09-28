import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, CreditCard, Folder, Image, LayoutDashboard, LogOut, Menu, Settings, Share2, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus.js';
import './Header.css';

export default function ProductHeader({ user, onLogout, mode = 'app' }) {
  const { pathname } = useLocation();
  const setup = mode === 'setup';
  const auth = mode === 'auth';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  useDialogFocus(menuOpen, menuRef, () => setMenuOpen(false), triggerRef);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  const accountLinks = [
    ['Dashboard', '/dashboard', LayoutDashboard],
    ['Portfolio', '/portfolio/manage', Image],
    ['Library', '/library', Folder],
    ['Sharing', '/sharing', Share2],
    ['Billing', '/billing', CreditCard],
    ['Settings', '/settings', Settings]
  ];

  return <header className={`v-product-header v-product-header-${mode}`}>
    <div className="v-product-header-inner">
      <Link to={user ? '/dashboard' : '/'} className="v-logo" aria-label={user ? 'Open dashboard' : 'Veylo home'}>
        <img src="/veylo/veylo-mark.svg" alt="" width="27" height="27" />veylo<span>.</span>
      </Link>
      {auth && <Link className="v-product-home" to="/">Back to Veylo</Link>}
      {setup && <div className="v-product-setup-label"><Camera size={15} /><span>Setting up {user?.studio?.name || user?.name || 'your studio'}</span></div>}
      {!auth && !setup && <nav aria-label="Account navigation">
        {pathname !== '/dashboard' && <Link to="/dashboard"><LayoutDashboard size={15} /><span>Dashboard</span></Link>}
        {pathname !== '/settings' && <Link to="/settings"><Settings size={15} /><span>Settings</span></Link>}
      </nav>}
      {user && <button type="button" className="v-product-signout" onClick={onLogout} aria-label="Sign out"><LogOut size={16} /><span>Sign out</span></button>}
      {user && !setup && !auth && <button ref={triggerRef} type="button" className="v-product-menu-trigger" aria-label={menuOpen ? 'Close account menu' : 'Open account menu'} aria-expanded={menuOpen} aria-controls="product-mobile-menu" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>}
    </div>
    {menuOpen && <><button type="button" className="v-product-menu-backdrop" aria-label="Close account menu" onClick={() => setMenuOpen(false)} /><div id="product-mobile-menu" ref={menuRef} className="v-product-mobile-menu" role="dialog" aria-modal="true" aria-label="Account menu" tabIndex={-1}><nav aria-label="Account pages">{accountLinks.map(([label, path, Icon]) => <Link key={path} to={path} aria-current={pathname === path ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon size={18} />{label}</Link>)}</nav><button type="button" onClick={() => { setMenuOpen(false); onLogout(); }}><LogOut size={18} />Sign out</button></div></>}
  </header>;
}
