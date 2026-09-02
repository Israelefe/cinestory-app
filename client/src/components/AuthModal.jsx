import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Lock, Mail, User } from 'lucide-react';
import api from '../services/api.js';
import { toast } from 'react-toastify';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const endpoint = isLogin ? '/v1/auth/login' : '/v1/auth/register';
      const payload = isLogin ? { email, password } : { name, email, password };
      const res = await api.post(endpoint, payload);

      if (res.data?.success && res.data.token) {
        localStorage.setItem('cinestory_token', res.data.token);
        localStorage.setItem('cinestory_user', JSON.stringify(res.data.user));
        toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
        onAuthSuccess(res.data.user);
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className='fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4'>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className='bg-[#111116] border border-white/15 w-full max-w-md rounded-3xl p-8 shadow-2xl relative'>
          
          <button
            onClick={onClose}
            className='absolute top-5 right-5 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/5'>
            <X size={18} />
          </button>

          <div className='text-center space-y-2 mb-6'>
            <div className='w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto border border-purple-500/30'>
              <Sparkles size={24} />
            </div>
            <h2 className='text-2xl font-black text-white'>
              {isLogin ? 'Sign In to CineStory' : 'Create Creator Account'}
            </h2>
            <p className='text-xs text-gray-400'>
              {isLogin ? 'Access and share your cinematic photo stories' : 'Start turning photoshoots into viral cinematic stories'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-4'>
            {!isLogin && (
              <div>
                <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Full Name</label>
                <div className='relative'>
                  <User size={16} className='absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500' />
                  <input
                    type='text'
                    required
                    placeholder='Stephanie Okon'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className='w-full bg-[#181820] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-purple-500'
                  />
                </div>
              </div>
            )}

            <div>
              <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Email Address</label>
              <div className='relative'>
                <Mail size={16} className='absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500' />
                <input
                  type='email'
                  required
                  placeholder='you@example.com'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='w-full bg-[#181820] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-purple-500'
                />
              </div>
            </div>

            <div>
              <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Password</label>
              <div className='relative'>
                <Lock size={16} className='absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500' />
                <input
                  type='password'
                  required
                  placeholder='••••••••'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className='w-full bg-[#181820] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-purple-500'
                />
              </div>
            </div>

            <button
              type='submit'
              disabled={loading}
              className='w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 mt-2'>
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className='text-center mt-6 text-xs text-gray-400'>
            {isLogin ? (
              <span>Don't have an account? <button onClick={() => setIsLogin(false)} className='text-purple-400 font-bold hover:underline'>Sign Up</button></span>
            ) : (
              <span>Already have an account? <button onClick={() => setIsLogin(true)} className='text-purple-400 font-bold hover:underline'>Sign In</button></span>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
