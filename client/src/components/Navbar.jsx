import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Film, Plus, LogOut, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';

export default function Navbar({ user, onOpenAuth, onLogout }) {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';

  return (
    <nav className='fixed top-0 inset-x-0 z-50 border-b border-white/[0.08] bg-[#070709]/80 backdrop-blur-2xl'>
      <div className='max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-18 flex items-center justify-between'>
        <Link to='/' className='flex items-center gap-2.5 group'>
          <img src='/veylo/veylo-mark.svg' alt='Veylo' className='h-9 w-9 rounded-xl object-contain transition-transform group-hover:scale-105' />
          <span className='font-display text-2xl font-extrabold tracking-[-.03em] text-white'>Veylo</span>
        </Link>

        {/* Center Desktop Navigation (Only shown on Landing Page where functional) */}
        {isLandingPage && (
          <div className='hidden md:flex items-center gap-8 text-xs font-semibold text-zinc-400'>
            <a href='#how-it-works' className='hover:text-white transition-colors'>How It Works</a>
            <a href='#ai-director' className='hover:text-white transition-colors'>AI Director</a>
            <a href='#themes' className='hover:text-white transition-colors'>Themes</a>
            <a href='#pricing' className='hover:text-white transition-colors'>Pricing</a>
          </div>
        )}

        <div className='flex items-center gap-2.5 sm:gap-3'>
          {user ? (
            <>
              <div className='hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ff5a47]/10 border border-[#ff5a47]/25 text-[#ff9b8e] text-xs font-bold'>
                <Sparkles size={13} className='text-[#ff5a47]' />
                <span>{user.isPro ? 'Veylo Pro' : 'Free Tier'}</span>
              </div>
              {user.role === 'admin' && (
                <Link
                  to='/admin'
                  className='text-xs font-bold text-[#ff9b8e] bg-[#ff5a47]/10 border border-[#ff5a47]/25 hover:bg-[#ff5a47]/15 px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5'>
                  <ShieldCheck size={14} /> Admin
                </Link>
              )}
              <Link
                to='/dashboard'
                className='text-xs font-bold text-gray-300 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-1.5'>
                <Film size={15} /> My Stories
              </Link>
              <Link
                to='/create'
                className='bg-[#ff5a47] hover:bg-[#ff7564] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg shadow-[#ff5a47]/20 flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all'>
                <Plus size={15} /> Create Story
              </Link>
              <button
                onClick={onLogout}
                className='p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors'
                title='Sign Out'>
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              {isLandingPage ? (
                <>
                  <button
                    onClick={onOpenAuth}
                    className='inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 sm:px-4 py-2 text-xs font-bold text-zinc-300 backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-95 cursor-pointer shadow-sm'>
                    Sign In
                  </button>
                  <Link
                    to='/create'
                    className='inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff5a47] hover:bg-[#ff7564] text-white px-4 sm:px-5 py-2 text-xs font-bold shadow-md shadow-[#ff5a47]/25 transition-all hover:shadow-[#ff5a47]/40 active:scale-95'>
                    <span>Start Free</span>
                    <ArrowRight size={13} className='hidden sm:inline text-white/80' />
                  </Link>
                </>
              ) : (
                <div className='flex items-center gap-3'>
                  <Link
                    to='/'
                    className='text-xs font-bold text-zinc-400 hover:text-white transition-colors'>
                    Home
                  </Link>
                  <button
                    onClick={onOpenAuth}
                    className='inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-zinc-300 backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-95 cursor-pointer shadow-sm'>
                    Sign In
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
