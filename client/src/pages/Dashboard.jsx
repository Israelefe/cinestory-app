import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Plus,
  Eye,
  Download,
  Share2,
  Trash2,
  ExternalLink,
  Copy,
  RefreshCw,
  Crown,
  Camera,
  CheckCircle2,
  ArrowRight,
  MessageCircle
} from 'lucide-react';
import api from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { toast } from 'react-toastify';

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/v1/stories/my-stories');
      if (res.data?.success) {
        setStories(res.data.data || []);
      }
    } catch (err) {
      toast.error('Failed to load your stories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this Photo Story? This cannot be undone.')) return;
    try {
      await api.delete(`/v1/stories/${id}`);
      toast.success('Story deleted');
      setStories((prev) => prev.filter((s) => s._id !== id));
    } catch (e) {
      toast.error('Failed to delete story');
    }
  };

  const handleCopyLink = (storyId) => {
    navigator.clipboard.writeText(`${APP_URL}/story/${storyId}`);
    toast.success('Client story link copied to clipboard!');
  };

  const handleShareWhatsApp = (story) => {
    const storyUrl = `${APP_URL}/story/${story.storyId}`;
    const clientName = story.clientName || 'there';
    const message = encodeURIComponent(
      `Hello ${clientName}! Your Photo Story for "${story.title || story.occasion}" is ready.\n\nWatch the highlights with music and download full-resolution photos here:\n${storyUrl}`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const totalStories = stories.length;
  const totalViews = stories.reduce((acc, s) => acc + (s.viewsCount || 0), 0);
  const totalDownloads = stories.reduce((acc, s) => acc + (s.downloadsCount || 0), 0);
  const isPro = user?.role === 'pro' || user?.tier === 'pro' || user?.plan === 'pro';

  return (
    <div className='min-h-screen bg-[#070709] text-white pt-28 pb-20 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto space-y-10 relative overflow-hidden'>
      {/* Ambient background glow */}
      <div className='pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#ff5a47]/10 blur-[140px] rounded-full' />

      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className='relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-[#111116] p-6 sm:p-8 md:p-10 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl'>
        <div className='space-y-2'>
          <div className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300'>
            <Camera size={13} className='text-[#ff5a47]' />
            <span>Studio Production Hub</span>
          </div>
          <h1 className='text-2xl sm:text-4xl font-extrabold tracking-tight text-white'>
            Welcome back, <span className='text-[#ff9b8e]'>{user?.name || 'Photographer'}</span>
          </h1>
          <p className='text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed'>
            Review client reactions, manage deliverables, and send cinema-grade Photo Story links directly to your clients.
          </p>
        </div>

        <div className='flex items-center gap-3 w-full md:w-auto'>
          <Link
            to='/create'
            className='w-full md:w-auto justify-center bg-[#ff5a47] hover:bg-[#ff7564] active:scale-95 text-white px-6 py-3.5 rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-[#ff5a47]/30 flex items-center gap-2 transition-all duration-150'>
            <Plus size={16} />
            <span>Create New Story</span>
          </Link>
        </div>
      </motion.div>

      {/* Studio Metrics Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className='grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
        {/* Metric 1: Stories */}
        <div className='bg-[#111116] border border-white/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl relative overflow-hidden group hover:border-white/20 transition-colors'>
          <div className='flex items-center justify-between text-zinc-400 mb-3'>
            <span className='text-xs font-semibold uppercase tracking-wider'>Stories Delivered</span>
            <Film size={18} className='text-[#ff5a47]' />
          </div>
          <p className='text-2xl sm:text-4xl font-extrabold text-white'>{totalStories}</p>
          <p className='text-[11px] sm:text-xs text-zinc-400 mt-1'>Completed client deliveries</p>
        </div>

        {/* Metric 2: Client Views */}
        <div className='bg-[#111116] border border-white/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl relative overflow-hidden group hover:border-white/20 transition-colors'>
          <div className='flex items-center justify-between text-zinc-400 mb-3'>
            <span className='text-xs font-semibold uppercase tracking-wider'>Client Views</span>
            <Eye size={18} className='text-[#00c3f8]' />
          </div>
          <p className='text-2xl sm:text-4xl font-extrabold text-white'>{totalViews}</p>
          <p className='text-[11px] sm:text-xs text-zinc-400 mt-1'>Link openings by clients & family</p>
        </div>

        {/* Metric 3: Downloads */}
        <div className='bg-[#111116] border border-white/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl relative overflow-hidden group hover:border-white/20 transition-colors'>
          <div className='flex items-center justify-between text-zinc-400 mb-3'>
            <span className='text-xs font-semibold uppercase tracking-wider'>Downloads</span>
            <Download size={18} className='text-emerald-400' />
          </div>
          <p className='text-2xl sm:text-4xl font-extrabold text-white'>{totalDownloads}</p>
          <p className='text-[11px] sm:text-xs text-zinc-400 mt-1'>High-resolution image saves</p>
        </div>

        {/* Metric 4: Plan Status */}
        <div className='bg-[#111116] border border-white/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl relative overflow-hidden group hover:border-[#ff5a47]/40 transition-colors'>
          <div className='flex items-center justify-between text-zinc-400 mb-3'>
            <span className='text-xs font-semibold uppercase tracking-wider'>Studio Plan</span>
            <Crown size={18} className='text-[#ff9b8e]' />
          </div>
          <div className='flex items-baseline gap-2'>
            <p className='text-xl sm:text-2xl font-extrabold text-white'>{isPro ? 'Veylo Pro' : 'Free Plan'}</p>
          </div>
          <div className='mt-2'>
            {isPro ? (
              <span className='inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400'>
                <CheckCircle2 size={12} /> Unlimited shoots active
              </span>
            ) : (
              <Link to='/pricing' className='inline-flex items-center gap-1 text-[11px] font-bold text-[#ff9b8e] hover:underline'>
                <span>Upgrade for unlimited</span>
                <ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stories Section Header */}
      <div className='flex items-center justify-between pt-4'>
        <div>
          <h2 className='text-xl sm:text-2xl font-extrabold text-white'>Your Client Photo Stories</h2>
          <p className='text-xs sm:text-sm text-zinc-400 mt-0.5'>Select a story to copy the delivery link or share on WhatsApp.</p>
        </div>
      </div>

      {/* Stories Grid / States */}
      {loading ? (
        <div className='flex flex-col items-center justify-center py-24 space-y-4'>
          <RefreshCw className='animate-spin text-[#ff5a47]' size={36} />
          <p className='text-xs sm:text-sm text-zinc-400'>Loading your studio deliveries...</p>
        </div>
      ) : stories.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className='text-center py-24 bg-[#111116] rounded-3xl border border-white/10 space-y-5 px-6'>
          <div className='w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#ff9b8e]'>
            <Film size={32} />
          </div>
          <div className='space-y-1.5'>
            <h3 className='text-xl font-bold text-white'>No Photo Stories Created Yet</h3>
            <p className='text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed'>
              Upload your client’s retouched photos, select an occasion and mood soundtrack, and deliver an unforgettable showcase link.
            </p>
          </div>
          <Link
            to='/create'
            className='inline-flex items-center gap-2 bg-[#ff5a47] text-white px-7 py-3.5 rounded-xl font-bold text-xs sm:text-sm hover:bg-[#ff7564] active:scale-95 transition-all shadow-lg shadow-[#ff5a47]/30'>
            <Plus size={16} />
            <span>Create First Photo Story</span>
          </Link>
        </motion.div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          <AnimatePresence>
            {stories.map((story, index) => (
              <motion.div
                key={story._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                whileHover={{ y: -4 }}
                className='bg-[#111116] border border-white/10 rounded-3xl overflow-hidden group shadow-xl flex flex-col justify-between hover:border-[#ff5a47]/40 hover:shadow-[0_12px_32px_rgba(255,90,71,0.12)] transition-all duration-300'>
                {/* Thumbnail Header */}
                <div className='aspect-[4/3] relative bg-[#09090d] overflow-hidden'>
                  {story.photos?.[0]?.url ? (
                    <img
                      src={story.photos[0].url}
                      alt={story.title || 'Story preview'}
                      className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-zinc-600'>
                      <Film size={32} />
                    </div>
                  )}
                  <div className='absolute inset-0 bg-gradient-to-t from-[#111116] via-transparent to-transparent' />

                  {/* Occasion Badge */}
                  <span className='absolute top-3 right-3 bg-black/80 backdrop-blur-md text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider text-[#ff9b8e] border border-white/10 shadow-sm'>
                    {story.occasion || 'Shoot'}
                  </span>
                </div>

                {/* Body Content */}
                <div className='p-5 space-y-4 flex-1 flex flex-col justify-between'>
                  <div className='space-y-1.5'>
                    <h3 className='font-bold text-base text-white truncate group-hover:text-[#ff9b8e] transition-colors'>
                      {story.title || story.clientName}
                    </h3>
                    <p className='text-xs text-zinc-400 line-clamp-2 leading-relaxed'>
                      {story.storySummary || `Created for ${story.clientName || 'client'}.`}
                    </p>
                  </div>

                  {/* WhatsApp Direct Delivery Button */}
                  <button
                    type='button'
                    onClick={() => handleShareWhatsApp(story)}
                    className='w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all'>
                    <MessageCircle size={14} />
                    <span>Send on WhatsApp</span>
                  </button>

                  {/* Card Footer */}
                  <div className='pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400'>
                    <div className='flex items-center gap-3'>
                      <span className='flex items-center gap-1.5' title='Client views'>
                        <Eye size={13} className='text-zinc-500' /> {story.viewsCount || 0}
                      </span>
                      <span className='flex items-center gap-1.5' title='High-res downloads'>
                        <Download size={13} className='text-zinc-500' /> {story.downloadsCount || 0}
                      </span>
                    </div>

                    <div className='flex items-center gap-1.5'>
                      <button
                        onClick={() => handleCopyLink(story.storyId)}
                        className='p-2 hover:text-white rounded-lg hover:bg-white/10 active:scale-90 transition-all'
                        title='Copy delivery link'>
                        <Copy size={15} />
                      </button>
                      <a
                        href={`/story/${story.storyId}`}
                        target='_blank'
                        rel='noreferrer'
                        className='p-2 hover:text-[#ff9b8e] rounded-lg hover:bg-white/10 active:scale-90 transition-all'
                        title='Open client player'>
                        <ExternalLink size={15} />
                      </a>
                      <button
                        onClick={(e) => handleDelete(story._id, e)}
                        className='p-2 hover:text-red-400 rounded-lg hover:bg-red-500/10 active:scale-90 transition-all'
                        title='Delete story'>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
