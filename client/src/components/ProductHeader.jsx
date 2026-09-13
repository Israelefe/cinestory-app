import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, LogOut, Settings } from 'lucide-react';

export default function ProductHeader({ user, onLogout, mode = 'app' }) {
  const { pathname } = useLocation();
  const setup = mode === 'setup';
  const auth = mode === 'auth';

  return <header className={`v-product-header v-product-header-${mode}`}>
    <div className="v-product-header-inner">
      <Link to={user ? '/dashboard' : '/'} className="v-logo" aria-label={user ? 'Open dashboard' : 'Veylo home'}>
        <img src="/veylo/veylo-mark.svg" alt="" width="27" height="27" />veylo<span>.</span>
      </Link>
      {auth && <Link className="v-product-home" to="/">Back to Veylo</Link>}
      {setup && <div className="v-product-setup-label"><Camera size={15} /><span>Setting up {user?.studio?.name || user?.name || 'your studio'}</span></div>}
      {!auth && !setup && <nav aria-label="Account navigation">
        <Link to="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined}>Deliveries</Link>
        <Link to="/settings" aria-current={pathname === '/settings' ? 'page' : undefined}><Settings size={15} />Settings</Link>
      </nav>}
      {user && <button type="button" className="v-product-signout" onClick={onLogout}><LogOut size={16} /><span>Sign out</span></button>}
    </div>
  </header>;
}
