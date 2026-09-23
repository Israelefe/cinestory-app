import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api, { clearAdminToken, getAdminToken, setAdminToken } from './services/api.js';
import LoginPage from './pages/LoginPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
const ContentStudioPage = lazy(() => import('./pages/ContentStudioPage.jsx'));

export default function App() {
  const localStudio = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '5055';
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    api
      .get('/v1/admin/auth/me', { timeout: 8000 })
      .then(({ data }) => {
        if (active && data.admin) {
          setAdmin(data.admin);
        }
      })
      .catch(() => {
        if (active) {
          clearAdminToken();
          setAdmin(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLoginSuccess = (adminUser) => {
    setAdmin(adminUser);
  };

  const handleLogout = async () => {
    try {
      await api.post('/v1/admin/auth/logout');
    } catch {}
    clearAdminToken();
    setAdmin(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070709] text-white">
        <div className="flex items-center gap-3 text-sm text-white/50">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#ff9b8e] border-t-transparent" />
          <span>Verifying administrator access…</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />
      <Routes>
        <Route path="/content-studio/:projectId?" element={admin ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#070709] text-sm text-white/60">Opening Content Studio…</div>}><ContentStudioPage admin={admin} onLogout={handleLogout} /></Suspense> : <Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={
            admin ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route
          path="/"
          element={
            admin ? (
              localStudio ? <Navigate to="/content-studio" replace /> : <AdminDashboardPage admin={admin} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={admin ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
