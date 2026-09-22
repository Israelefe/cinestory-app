import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { ToastContainer } from 'react-toastify';
import Navbar from './components/Navbar.jsx';
import ProductHeader from './components/ProductHeader.jsx';
import CookiePreferences from './components/CookiePreferences.jsx';
import VeyloAssistant from './components/VeyloAssistant.jsx';
import LandingPage from './pages/LandingPage.jsx';
import api from './services/api.js';
import { installAnalyticsListeners, trackEvent } from './services/analytics.js';
import lazyWithRecovery from './utils/lazyWithRecovery.jsx';
import 'react-toastify/dist/ReactToastify.css';

const Dashboard = lazyWithRecovery(() => import('./pages/Dashboard.jsx'), 'dashboard');
const CreateDelivery = lazyWithRecovery(() => import('./pages/CreateDelivery.jsx'), 'create-delivery');
const StoryViewer = lazyWithRecovery(() => import('./pages/StoryViewer.jsx'), 'photo-story');
const DeliveryViewer = lazyWithRecovery(() => import('./pages/DeliveryViewer.jsx'), 'client-delivery');
const DeliverySharing = lazyWithRecovery(() => import('./pages/DeliverySharing.jsx'), 'delivery-sharing');
const FormatDemo = lazyWithRecovery(() => import('./pages/FormatDemo.jsx'), 'format-demo');
const PrivacyPolicy = lazyWithRecovery(() => import('./pages/PrivacyPolicy.jsx'), 'privacy');
const TermsOfService = lazyWithRecovery(() => import('./pages/TermsOfService.jsx'), 'terms');
const FairUsePolicy = lazyWithRecovery(() => import('./pages/FairUsePolicy.jsx'), 'fair-use');
const AboutUs = lazyWithRecovery(() => import('./pages/AboutUs.jsx'), 'about');
const NichePage = lazyWithRecovery(() => import('./pages/NichePage.jsx'), 'photographer-page');
const ClientExperience = lazyWithRecovery(() => import('./pages/ClientExperience.jsx'), 'client-experience');
const PricingPage = lazyWithRecovery(() => import('./pages/PricingPage.jsx'), 'pricing');
const SignupPage = lazyWithRecovery(() => import('./pages/SignupPage.jsx'), 'signup');
const SigninPage = lazyWithRecovery(() => import('./pages/SigninPage.jsx'), 'signin');
const VerifyEmailPage = lazyWithRecovery(() => import('./pages/VerifyEmailPage.jsx'), 'verify-email');
const ForgotPasswordPage = lazyWithRecovery(() => import('./pages/ForgotPasswordPage.jsx'), 'forgot-password');
const ResetPasswordPage = lazyWithRecovery(() => import('./pages/ResetPasswordPage.jsx'), 'reset-password');
const OnboardingPage = lazyWithRecovery(() => import('./pages/OnboardingPage.jsx'), 'onboarding');
const AccountSettings = lazyWithRecovery(() => import('./pages/AccountSettings.jsx'), 'settings');
const BillingPage = lazyWithRecovery(() => import('./pages/BillingPage.jsx'), 'billing');
const ImageLibrary = lazyWithRecovery(() => import('./pages/ImageLibrary.jsx'), 'image-library');
const ManagePortfolio = lazyWithRecovery(() => import('./pages/ManagePortfolio.jsx'), 'manage-portfolio');
const PublicStudioPortfolio = lazyWithRecovery(() => import('./pages/PublicStudioPortfolio.jsx'), 'studio-portfolio');
const DeliveryFormats = lazyWithRecovery(() => import('./pages/DeliveryFormats.jsx'), 'formats');
const PortfolioPage = lazyWithRecovery(() => import('./pages/PortfolioPage.jsx'), 'portfolio');
const ContactSupport = lazyWithRecovery(() => import('./pages/ContactSupport.jsx'), 'contact');
const Changelog = lazyWithRecovery(() => import('./pages/Changelog.jsx'), 'changelog');
const NotFound = lazyWithRecovery(() => import('./pages/NotFound.jsx'), 'not-found');
const routeScrollPositions = new Map();

function RoutePosition() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { pathname, hash, key } = location;
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    const rememberPosition = () => routeScrollPositions.set(key, { top: window.scrollY, left: window.scrollX });
    window.addEventListener('scroll', rememberPosition, { passive: true });
    return () => { rememberPosition(); window.removeEventListener('scroll', rememberPosition); };
  }, [key]);
  useLayoutEffect(() => {
    let frame;
    let stopped = false;
    const deadline = performance.now() + 2500;
    const saved = navigationType === 'POP' ? routeScrollPositions.get(key) : undefined;
    const restore = () => {
      if (stopped) return;
      if (hash) {
        const target = document.getElementById(hash.slice(1));
        if (target) { target.scrollIntoView({ block: 'start', behavior: 'auto' }); stopped = true; return; }
        if (performance.now() >= deadline) { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); stopped = true; return; }
        frame = window.requestAnimationFrame(restore);
        return;
      }
      if (!saved) { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); stopped = true; return; }
      const maxTop = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      if (maxTop + 2 >= saved.top) { window.scrollTo({ top: saved.top, left: saved.left, behavior: 'auto' }); stopped = true; return; }
      if (performance.now() >= deadline) { window.scrollTo({ top: Math.max(0, maxTop), left: saved.left, behavior: 'auto' }); stopped = true; return; }
      frame = window.requestAnimationFrame(restore);
    };
    restore();
    return () => { stopped = true; window.cancelAnimationFrame(frame); };
  }, [pathname, hash, key, navigationType]);
  useEffect(() => {
    const names = { '/': 'Photo delivery for finished shoots', '/formats': 'Eight delivery formats', '/portfolio': 'Veylo Portfolio', '/pricing': 'Plans and pricing', '/signup': 'Create your account', '/signin': 'Sign in', '/verify-email': 'Verify your email', '/forgot-password': 'Reset your password', '/reset-password': 'Choose a new password', '/onboarding': 'Set up your studio', '/settings': 'Account settings', '/about': 'About us', '/client-experience': 'The client experience', '/contact': 'Get in touch', '/privacy': 'Privacy policy', '/terms': 'Terms of use', '/fair-use': 'Fair use', '/changelog': 'Product updates', '/create': 'Create a delivery', '/demo': 'Watch a Photo Story', '/demo/editorial': 'Explore an Editorial Page', '/demo/reveal': 'Begin a Photo Reveal', '/demo/canvas': 'Explore a Canvas', '/demo/chapters': 'Choose a chapter', '/demo/album': 'Turn through an Album', '/demo/event-coverage': 'Browse Event Coverage', '/demo/campaign': 'Open a Campaign Delivery' };
    names['/formats'] = 'Eight delivery formats';
    names['/demo/event-coverage'] = 'Browse Event Coverage';
    names['/demo/campaign'] = 'Open a Campaign Delivery';
    if (pathname === '/billing') names[pathname] = 'Plan and billing';
    if (pathname === '/library') names[pathname] = 'Personal image library';
    if (pathname === '/portfolio/manage') names[pathname] = 'Manage portfolio';
    const label = names[pathname] || (pathname.startsWith('/for/') ? `For ${pathname.split('/').pop().replaceAll('-', ' ')}` : 'Photo delivery');
    document.title = `Veylo — ${label}`;
  }, [pathname]);
  useEffect(() => {
    const specificEvent = pathname === '/' ? 'landing.viewed' : pathname === '/pricing' ? 'pricing.viewed' : pathname === '/signup' ? 'signup.started' : pathname === '/signin' ? 'signin.viewed' : pathname === '/create' ? 'delivery.creation.started' : pathname === '/dashboard' ? 'dashboard.opened' : pathname === '/settings' ? 'dashboard.settings.opened' : pathname === '/library' ? 'dashboard.library.opened' : pathname === '/portfolio/manage' ? 'dashboard.portfolio.opened' : pathname.startsWith('/demo/') ? 'client.format.opened' : '';
    trackEvent('page.viewed', { path: pathname });
    if (specificEvent) trackEvent(specificEvent, { path: pathname });
  }, [pathname]);
  return null;
}

function ProtectedRoute({ user, loading, requireAdmin = false, children }) {
  const location = useLocation();
  if (loading) return <div className="v-page-loading" role="status">Checking your account…</div>;
  if (!user) return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  if (!user.onboardingComplete && !['/onboarding', '/settings'].includes(location.pathname)) return <Navigate to="/onboarding" replace />;
  if (user.onboardingComplete && location.pathname === '/onboarding') return <Navigate to="/dashboard" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function GuestOnlyRoute({ user, loading, children }) {
  if (loading) return <div className="v-page-loading" role="status">Checking your account…</div>;
  if (!user) return children;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  return <Navigate to={user.onboardingComplete ? '/dashboard' : '/onboarding'} replace />;
}

function DeliveryChrome({ user }) {
  const { pathname } = useLocation();
  // Client delivery pages are deliberately quiet: the photographs own the
  // screen. Necessary session and analytics cookies still work in the
  // background, but neither the privacy notice nor Veylo Help is rendered on
  // a delivery or delivery demo.
  const isDeliverySurface = /^\/(?:d|story|volume)(?:\/|$)/.test(pathname)
    || pathname === '/demo'
    || pathname.startsWith('/demo/');
  if (isDeliverySurface) return null;
  return <><CookiePreferences /><VeyloAssistant user={user} /></>;
}

function VerificationRoute({ user, loading, children }) {
  if (loading) return <div className="v-page-loading" role="status">Checking your account…</div>;
  if (user?.emailVerified) return <Navigate to={user.onboardingComplete ? '/dashboard' : '/onboarding'} replace />;
  return children;
}

const focusedRoutes = new Set(['/signup', '/signin', '/verify-email', '/forgot-password', '/reset-password', '/onboarding', '/dashboard', '/create', '/sharing', '/settings', '/billing', '/library', '/portfolio/manage']);
const authRoutes = new Set(['/signup', '/signin', '/verify-email', '/forgot-password', '/reset-password']);
const productRoutes = new Set(['/dashboard', '/create', '/sharing', '/settings', '/billing', '/library', '/portfolio/manage']);

function WebsiteShell({ user, authLoading, onAuthenticated, onLogout, onAccountDeleted, onPlanChanged }) {
  const { pathname } = useLocation();
  if (/^\/@[^/]+\/?$/.test(pathname)) return <PublicStudioPortfolio />;
  const showPublicHeader = !focusedRoutes.has(pathname);
  return <div className="min-h-screen bg-[#070709] text-white">
    {showPublicHeader && <Navbar user={user} onLogout={onLogout} />}
    {authRoutes.has(pathname) && <ProductHeader mode="auth" />}
    {pathname === '/onboarding' && <ProductHeader mode="setup" user={user} onLogout={onLogout} />}
    {productRoutes.has(pathname) && <ProductHeader user={user} onLogout={onLogout} />}
    <main id="main-content"><Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute user={user} loading={authLoading}><Dashboard user={user} onLogout={onLogout} /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute user={user} loading={authLoading}><CreateDelivery user={user} /></ProtectedRoute>} />
      <Route path="/sharing" element={<ProtectedRoute user={user} loading={authLoading}><DeliverySharing /></ProtectedRoute>} />
      <Route path="/formats" element={<DeliveryFormats />} /><Route path="/portfolio" element={<PortfolioPage />} /><Route path="/pricing" element={<PricingPage />} />
      <Route path="/signup" element={<GuestOnlyRoute user={user} loading={authLoading}><SignupPage onAuthenticated={onAuthenticated} /></GuestOnlyRoute>} />
      <Route path="/signin" element={<GuestOnlyRoute user={user} loading={authLoading}><SigninPage onAuthenticated={onAuthenticated} /></GuestOnlyRoute>} />
      <Route path="/verify-email" element={<VerificationRoute user={user} loading={authLoading}><VerifyEmailPage onAuthenticated={onAuthenticated} /></VerificationRoute>} />
      <Route path="/forgot-password" element={<GuestOnlyRoute user={user} loading={authLoading}><ForgotPasswordPage /></GuestOnlyRoute>} />
      <Route path="/reset-password" element={<GuestOnlyRoute user={user} loading={authLoading}><ResetPasswordPage /></GuestOnlyRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute user={user} loading={authLoading}><OnboardingPage user={user} onAuthenticated={onAuthenticated} onLogout={onLogout} /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute user={user} loading={authLoading}><AccountSettings user={user} onUserUpdated={onAuthenticated} onAccountDeleted={onAccountDeleted} /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute user={user} loading={authLoading}><BillingPage onPlanChanged={onPlanChanged} /></ProtectedRoute>} />
      <Route path="/library" element={<ProtectedRoute user={user} loading={authLoading}><ImageLibrary /></ProtectedRoute>} />
      <Route path="/portfolio/manage" element={<ProtectedRoute user={user} loading={authLoading}><ManagePortfolio /></ProtectedRoute>} />
      <Route path="/contact" element={<ContactSupport />} /><Route path="/changelog" element={<Changelog />} /><Route path="/about" element={<AboutUs />} /><Route path="/for/:slug" element={<NichePage />} /><Route path="/client-experience" element={<ClientExperience />} />
      <Route path="/privacy" element={<PrivacyPolicy />} /><Route path="/terms" element={<TermsOfService />} /><Route path="/fair-use" element={<FairUsePolicy />} /><Route path="*" element={<NotFound />} />
    </Routes></main>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const authVersion = useRef(0);
  useEffect(() => { installAnalyticsListeners(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution = [['utm_source', 'veylo_utm_source'], ['utm_medium', 'veylo_utm_medium'], ['utm_campaign', 'veylo_utm_campaign'], ['utm_term', 'veylo_utm_term'], ['utm_content', 'veylo_utm_content']];
    attribution.forEach(([queryKey, storageKey]) => {
      const value = params.get(queryKey);
      if (value) sessionStorage.setItem(storageKey, value.slice(0, 120));
    });
    if (document.referrer && !document.referrer.startsWith(window.location.origin)) {
      try { sessionStorage.setItem('veylo_referrer', document.referrer); sessionStorage.setItem('veylo_referrer_host', new URL(document.referrer).hostname.slice(0, 100)); } catch {}
    }
  }, []);
  useEffect(() => {
    let active = true;
    const version = authVersion.current;
    api.get('/v1/auth/me', { timeout: 8000 }).then(({ data }) => { if (active && version === authVersion.current) setUser(data.user); }).catch(() => { if (active && version === authVersion.current) setUser(null); }).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  const handleAuthenticated = nextUser => { authVersion.current += 1; setUser(nextUser); setAuthLoading(false); };
  const handleLogout = async () => {
    try { await api.post('/v1/auth/logout'); } catch {}
    authVersion.current += 1;
    setUser(null);
    window.location.assign('/');
  };
  const handleAccountDeleted = () => {
    authVersion.current += 1;
    setUser(null);
    window.location.assign('/');
  };
  const handlePlanChanged = plan => setUser(current => current ? { ...current, plan } : current);
  return <MotionConfig reducedMotion="user"><BrowserRouter><RoutePosition /><DeliveryChrome user={user} /><ToastContainer position="top-right" theme="dark" autoClose={3000} /><Suspense fallback={<div className="v-page-loading" role="status">Opening Veylo…</div>}><Routes>
    <Route path="/story/:storyId" element={<StoryViewer />} />
    <Route path="/d/:publicId" element={<DeliveryViewer />} />
    <Route path="/volume-deliveries" element={<Navigate to="/dashboard" replace />} />
    <Route path="/volume/:publicId" element={<Navigate to="/" replace />} />
    <Route path="/demo" element={<StoryViewer demoMode />} />
    <Route path="/demo/:formatId" element={<FormatDemo />} />
    <Route path="*" element={<WebsiteShell user={user} authLoading={authLoading} onAuthenticated={handleAuthenticated} onLogout={handleLogout} onAccountDeleted={handleAccountDeleted} onPlanChanged={handlePlanChanged} />} />
  </Routes></Suspense></BrowserRouter></MotionConfig>;
}
