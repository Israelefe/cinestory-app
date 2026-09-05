import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import AuthModal from './components/AuthModal.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreateStory from './pages/CreateStory.jsx';
import StoryViewer from './pages/StoryViewer.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('cinestory_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('cinestory_token');
    localStorage.removeItem('cinestory_user');
    setUser(null);
    window.location.href = '/';
  };

  return (
    <BrowserRouter>
      <ToastContainer position="top-right" theme="dark" autoClose={3000} />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(u) => setUser(u)}
      />
      <Routes>
        <Route path="/story/:storyId" element={<StoryViewer />} />
        <Route path="*" element={
          <div className="flex flex-col min-h-screen bg-[#070709] text-white">
            <Navbar user={user} onOpenAuth={() => setAuthModalOpen(true)} onLogout={handleLogout} />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<LandingPage onOpenAuth={() => setAuthModalOpen(true)} />} />
                <Route path="/dashboard" element={<Dashboard user={user} />} />
                <Route path="/create" element={<CreateStory user={user} />} />
                <Route path="/admin" element={<AdminDashboard user={user} />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
