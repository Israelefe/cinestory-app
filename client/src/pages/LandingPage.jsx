import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Play,
  Music,
  Download,
  Share2,
  Heart,
  Palette,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
  Camera,
  Layers
} from 'lucide-react';

export default function LandingPage({ onOpenAuth }) {
  return (
    <div className='min-h-screen bg-[#070709] text-white pt-24 pb-16 overflow-hidden'>
      {/* ─── HERO SECTION ─── */}
      <section className='relative max-w-6xl mx-auto px-5 sm:px-8 pt-12 pb-20 text-center space-y-8'>
        {/* Ambient Top Glow */}
        <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-purple-600/30 via-indigo-600/20 to-pink-500/10 blur-[120px] pointer-events-none rounded-full' />

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          className='inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-purple-300 shadow-xl'>
          <Sparkles size={14} className='text-amber-400' />
          <span>The Next Evolution of Photo Deliveries</span>
        </motion.div>

        {/* Headline */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className='space-y-4 max-w-4xl mx-auto'>
          <h1 className='text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08] text-white'>
            Turn Any Photoshoot Into A <span className='bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent'>Cinematic Premiere</span>
          </h1>
          <p className='text-base sm:text-xl text-gray-400 max-w-2xl mx-auto font-medium leading-relaxed'>
            Say goodbye to dead Google Drive links. AI creates an emotional, music-synced, Spotify Wrapped-style reel for your birthday, wedding, or studio milestones in 60 seconds.
          </p>
        </motion.div>

        {/* CTAs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className='flex flex-col sm:flex-row items-center justify-center gap-4 pt-2'>
          <Link
            to='/create'
            className='w-full sm:w-auto bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-4 rounded-2xl font-black text-base shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2.5 hover:scale-105 active:scale-95 transition-all'>
            <Sparkles size={18} />
            <span>Create Free Story Now</span>
            <ArrowRight size={18} />
          </Link>
          <button
            onClick={onOpenAuth}
            className='w-full sm:w-auto bg-white/10 hover:bg-white/15 text-white px-7 py-4 rounded-2xl font-bold text-base border border-white/10 transition-all'>
            Creator Sign In
          </button>
        </motion.div>

        {/* Social Proof Stats */}
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto pt-10 border-t border-white/10 text-center'>
          <div>
            <p className='text-2xl font-black text-white'>100%</p>
            <p className='text-xs text-gray-400 font-medium'>AI Directed Vibe</p>
          </div>
          <div>
            <p className='text-2xl font-black text-white'>100+</p>
            <p className='text-xs text-gray-400 font-medium'>Curated Soundtracks</p>
          </div>
          <div>
            <p className='text-2xl font-black text-white'>16</p>
            <p className='text-xs text-gray-400 font-medium'>Luxury Themes</p>
          </div>
          <div>
            <p className='text-2xl font-black text-white'>1-Click</p>
            <p className='text-xs text-gray-400 font-medium'>Direct 4K Downloads</p>
          </div>
        </div>
      </section>

      {/* ─── 3-STEP HOW IT WORKS ─── */}
      <section className='max-w-6xl mx-auto px-5 sm:px-8 py-20'>
        <div className='text-center space-y-3 mb-14'>
          <h2 className='text-3xl sm:text-4xl font-black text-white'>How CineStory Works</h2>
          <p className='text-gray-400 text-sm max-w-md mx-auto'>No complex editing software needed. Your photoshoot becomes a premiere in 3 steps.</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          <div className='bg-[#111116] border border-white/10 rounded-3xl p-8 space-y-4 hover:border-purple-500/40 transition-colors'>
            <div className='w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center font-black text-lg border border-purple-500/30'>1</div>
            <h3 className='text-xl font-bold text-white'>Upload Photos & Occasion</h3>
            <p className='text-xs text-gray-400 leading-relaxed'>Drop your best captures and tell the AI what the occasion is (e.g. 25th Birthday, Traditional Wedding, or Brand Lookbook).</p>
          </div>

          <div className='bg-[#111116] border border-white/10 rounded-3xl p-8 space-y-4 hover:border-purple-500/40 transition-colors'>
            <div className='w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-black text-lg border border-indigo-500/30'>2</div>
            <h3 className='text-xl font-bold text-white'>AI Directs the Story</h3>
            <p className='text-xs text-gray-400 leading-relaxed'>Our AI matches a cinematic soundtrack, selects dynamic kinetic typography, and writes emotional, human captions tailored to your milestone.</p>
          </div>

          <div className='bg-[#111116] border border-white/10 rounded-3xl p-8 space-y-4 hover:border-purple-500/40 transition-colors'>
            <div className='w-12 h-12 rounded-2xl bg-pink-600/20 text-pink-400 flex items-center justify-center font-black text-lg border border-pink-500/30'>3</div>
            <h3 className='text-xl font-bold text-white'>Share & Download</h3>
            <p className='text-xs text-gray-400 leading-relaxed'>Share your private interactive link on WhatsApp, Instagram, or iMessage. Viewers can watch the story and download full 4K photos in one tap.</p>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section className='max-w-4xl mx-auto px-5 sm:px-8 py-16 text-center space-y-12'>
        <div className='space-y-3'>
          <h2 className='text-3xl sm:text-4xl font-black text-white'>Simple, Transparent Pricing</h2>
          <p className='text-gray-400 text-sm'>Start free or unlock unlimited 4K master downloads and custom music.</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 text-left'>
          {/* Free Tier */}
          <div className='bg-[#111116] border border-white/10 rounded-3xl p-8 space-y-6'>
            <div>
              <span className='text-xs font-bold uppercase tracking-wider text-gray-400'>Starter</span>
              <h3 className='text-3xl font-black text-white mt-1'>Free</h3>
              <p className='text-xs text-gray-400 mt-2'>Perfect for creating and sharing your first personal story.</p>
            </div>
            <ul className='space-y-3 text-xs text-gray-300'>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> Up to 6 Master Photos</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> AI Occasion Storytelling</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> 100 Curated Soundtracks</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> Mobile & WhatsApp Shareable</li>
            </ul>
            <Link to='/create' className='block w-full py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center transition-colors'>
              Create Free Story
            </Link>
          </div>

          {/* Pro Tier */}
          <div className='bg-gradient-to-b from-purple-900/30 to-[#111116] border-2 border-purple-500 rounded-3xl p-8 space-y-6 relative shadow-2xl shadow-purple-500/20'>
            <span className='absolute -top-3 right-6 bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full'>
              Most Popular
            </span>
            <div>
              <span className='text-xs font-bold uppercase tracking-wider text-purple-300'>Creator Pro</span>
              <h3 className='text-3xl font-black text-white mt-1'>$4 <span className='text-xs font-normal text-gray-400'>/ story</span></h3>
              <p className='text-xs text-gray-400 mt-2'>For photographers, studios, and high-end celebrations.</p>
            </div>
            <ul className='space-y-3 text-xs text-gray-300'>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> Unlimited Master Photos</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> Upload Custom MP3 Soundtracks</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> 16 Luxury Theme Palettes & Ambient Glow</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> 1-Click Direct Phone Gallery Downloads (No ZIP)</li>
              <li className='flex items-center gap-2'><CheckCircle2 size={16} className='text-purple-400'/> Custom Studio Branding & No Watermark</li>
            </ul>
            <Link to='/create' className='block w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold text-xs text-center shadow-lg shadow-purple-600/30 transition-all'>
              Start Pro Story
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
