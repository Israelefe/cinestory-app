import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Film, Plus, Eye, Download, Share2, Trash2, ExternalLink, Copy, RefreshCw } from 'lucide-react';
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
    if (!window.confirm('Delete this story?')) return;
    try {
      await api.delete(`/v1/stories/${id}`);
      toast.success('Story deleted');
      fetchStories();
    } catch (e) {
      toast.error('Failed to delete story');
    }
  };

  const handleCopyLink = (storyId) => {
    navigator.clipboard.writeText(`${APP_URL}/story/${storyId}`);
    toast.success('Link copied to clipboard!');
  };

  return (
    <div className='min-h-screen bg-[#070709] text-white pt-28 pb-20 px-5 sm:px-8 max-w-7xl mx-auto space-y-8'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#111116] p-6 sm:p-8 rounded-3xl border border-white/10'>
        <div>
          <h1 className='text-3xl font-black text-white'>Creator Dashboard</h1>
          <p className='text-xs text-gray-400 mt-1'>Welcome, <span className='text-purple-400 font-bold'>{user?.name || 'Creator'}</span>. Manage your cinematic stories and view analytics.</p>
        </div>
        <Link
          to='/create'
          className='bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl font-bold text-xs shadow-lg shadow-purple-600/30 flex items-center gap-2 hover:scale-105 transition-all'>
          <Plus size={16} /> Create New Story
        </Link>
      </div>

      {/* Stories Grid */}
      {loading ? (
        <div className='flex justify-center py-24'>
          <RefreshCw className='animate-spin text-purple-500' size={32} />
        </div>
      ) : stories.length === 0 ? (
        <div className='text-center py-28 bg-[#111116] rounded-3xl border border-white/10 space-y-4'>
          <Film size={48} className='mx-auto text-gray-600' />
          <h3 className='text-xl font-bold text-white'>No Stories Created Yet</h3>
          <p className='text-xs text-gray-400 max-w-sm mx-auto'>Upload your photoshoot photos and let the AI Director craft your first premiere reel.</p>
          <Link to='/create' className='inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-purple-500 transition-colors'>
            <Plus size={15} /> Create First Story
          </Link>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          {stories.map((story) => (
            <div key={story._id} className='bg-[#111116] border border-white/10 rounded-3xl overflow-hidden group shadow-xl flex flex-col justify-between hover:border-purple-500/40 transition-colors'>
              <div className='aspect-[4/3] relative bg-black overflow-hidden'>
                {story.photos?.[0]?.url ? (
                  <img src={story.photos[0].url} alt='' className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-700' />
                ) : (
                  <div className='w-full h-full flex items-center justify-center text-gray-700'><Film size={32}/></div>
                )}
                <div className='absolute inset-0 bg-gradient-to-t from-[#111116] via-transparent to-transparent' />
                <span className='absolute top-3 right-3 bg-black/80 backdrop-blur text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider text-purple-300 border border-white/10'>
                  {story.occasion}
                </span>
              </div>

              <div className='p-5 space-y-3 flex-1 flex flex-col justify-between'>
                <div>
                  <h3 className='font-bold text-base text-white truncate'>{story.title || story.clientName}</h3>
                  <p className='text-xs text-gray-400 line-clamp-2 mt-1'>{story.storySummary}</p>
                </div>

                <div className='pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400'>
                  <div className='flex items-center gap-3'>
                    <span className='flex items-center gap-1'><Eye size={13}/> {story.viewsCount || 0}</span>
                    <span className='flex items-center gap-1'><Download size={13}/> {story.downloadsCount || 0}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button onClick={() => handleCopyLink(story.storyId)} className='p-1.5 hover:text-white rounded-lg hover:bg-white/5' title='Copy Link'><Copy size={15} /></button>
                    <a href={`/story/${story.storyId}`} target='_blank' rel='noreferrer' className='p-1.5 hover:text-purple-400 rounded-lg hover:bg-white/5' title='Open Viewer'><ExternalLink size={15} /></a>
                    <button onClick={(e) => handleDelete(story._id, e)} className='p-1.5 hover:text-red-400 rounded-lg hover:bg-red-500/10' title='Delete'><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
