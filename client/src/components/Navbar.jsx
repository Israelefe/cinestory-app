import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Film, Plus, LogOut, ShieldCheck } from 'lucide-react';

export default function Navbar({ user, onOpenAuth, onLogout }) {
  return (
    <nav className='fixed top-0 inset-x-0 z-50 bg-black/60 backdrop-blur-2xl border-b border-white/10'>
      <div className='max-w-7xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between'>
        <Link to='/' className='flex items-center gap-2.5 group'>
          <div className='w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 p-[2px] shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform'>
            <div className='w-full h-full bg-black rounded-2xl flex items-center justify-center'>
              <Sparkles size={18} className='text-purple-400' />
            </div>
          </div>
          <div className='flex flex-col'>
            <span className='font-black text-lg tracking-tight text-white leading-none'>CineStory<span className='text-purple-400'>.ai</span></span>
            <span className='text-[10px] text-gray-400 tracking-widest uppercase font-semibold mt-0.5'>Cinematic Premiere Reels</span>
          </div>
        </Link>

        <div className='flex items-center gap-3'>
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link
                  to='/admin'
                  className='text-xs font-bold text-purple-300 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5'>
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
                className='bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all'>
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
                className='text-xs font-bold text-gray-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer'>
                Sign In
              </button>
              <Link
                to='/create'
                className='bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all'>
                <Sparkles size={14} /> Try AI Director
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
