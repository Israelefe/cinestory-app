import React from 'react';
import { Link } from 'react-router-dom';
import { Film, Plus, LogOut, ShieldCheck, Sparkles } from 'lucide-react';

export default function Navbar({ user, onOpenAuth, onLogout }) {
  return (
    <nav className='fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-[#09090b]/80 backdrop-blur-2xl'>
      <div className='max-w-7xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between'>
        <Link to='/' className='flex items-center gap-3 group'>
          <img src='/veylo/veylo-mark.svg' alt='' className='h-10 w-10 rounded-xl object-contain transition-transform group-hover:scale-105' />
          <div className='flex flex-col'>
            <span className='font-display text-2xl font-extrabold leading-none tracking-[-.04em] text-white'>Veylo</span>
            <span className='mt-1 hidden text-[9px] font-bold uppercase tracking-[.16em] text-[#ff9b8e] sm:block'>Don't just deliver it. Premiere it.</span>
          </div>
        </Link>

        <div className='flex items-center gap-3'>
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
                className='bg-[#ff5a47] hover:bg-[#ff7564] text-white px-4 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-[#ff5a47]/20 flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all'>
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
              <button
                onClick={onOpenAuth}
                className='hidden text-xs font-bold text-gray-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer sm:block'>
                Sign In
              </button>
              <Link
                to='/create'
                className='bg-[#ff5a47] hover:bg-[#ff7564] text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-[#ff5a47]/20 flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all'>
                <span className='text-base leading-none'>✦</span>
                <span className='sm:hidden'>Try Veylo</span>
                <span className='hidden sm:inline'>Start Free (2/mo)</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
