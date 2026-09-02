import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Film,
  Eye,
  Download,
  DollarSign,
  Search,
  Trash2,
  ExternalLink,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import api from '../services/api.js';
import { toast } from 'react-toastify';

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState('stories');
  const [analytics, setAnalytics] = useState(null);
  const [stories, setStories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, storiesRes, usersRes] = await Promise.all([
        api.get('/v1/admin/analytics'),
        api.get('/v1/admin/stories', { params: { search } }),
        api.get('/v1/admin/users', { params: { search } })
      ]);

      if (analyticsRes.data?.success) setAnalytics(analyticsRes.data.data);
      if (storiesRes.data?.success) setStories(storiesRes.data.data);
      if (usersRes.data?.success) setUsers(usersRes.data.data);
    } catch (err) {
      toast.error('Failed to load SuperAdmin data. Ensure role: "admin".');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [search]);

  const handleDeleteStory = async (id) => {
    if (!window.confirm('SuperAdmin: Permanently delete this story?')) return;
    try {
      await api.delete(`/v1/admin/stories/${id}`);
      toast.success('Story deleted');
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to delete story');
    }
  };

  const handleUpdateUserPlan = async (userId, newPlan) => {
    try {
      await api.patch(`/v1/admin/users/${userId}/plan`, { plan: newPlan });
      toast.success(`User updated to ${newPlan} plan!`);
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to update plan');
    }
  };

  return (
    <div className='min-h-screen bg-[#070709] text-white pt-28 pb-20 px-5 sm:px-8 max-w-7xl mx-auto space-y-8'>
      {/* Admin Header */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-950/40 via-[#111116] to-[#111116] p-6 sm:p-8 rounded-3xl border border-purple-500/30 shadow-2xl'>
        <div>
          <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-wider mb-2 border border-purple-500/40'>
            <ShieldCheck size={14} /> SuperAdmin Control Center
          </div>
          <h1 className='text-3xl font-black text-white'>Platform Master Control</h1>
          <p className='text-xs text-gray-400 mt-1'>View all platform users, monitor story views, manage subscriptions, and oversee content.</p>
        </div>
        <button
          onClick={fetchAdminData}
          className='bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer'>
          <RefreshCw size={14} /> Refresh Data
        </button>
      </div>

      {/* Analytics KPI Cards */}
      {analytics && (
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
          <div className='bg-[#111116] border border-white/10 rounded-2xl p-5 space-y-1'>
            <div className='flex items-center justify-between text-gray-400'>
              <span className='text-xs font-bold uppercase'>Total Users</span>
              <Users size={16} className='text-purple-400' />
            </div>
            <p className='text-2xl sm:text-3xl font-black text-white'>{analytics.totalUsers}</p>
            <p className='text-[11px] text-emerald-400 font-medium'>{analytics.proUsers} on Pro/Studio</p>
          </div>

          <div className='bg-[#111116] border border-white/10 rounded-2xl p-5 space-y-1'>
            <div className='flex items-center justify-between text-gray-400'>
              <span className='text-xs font-bold uppercase'>Total Stories</span>
              <Film size={16} className='text-indigo-400' />
            </div>
            <p className='text-2xl sm:text-3xl font-black text-white'>{analytics.totalStories}</p>
            <p className='text-[11px] text-gray-400 font-medium'>Live reels</p>
          </div>

          <div className='bg-[#111116] border border-white/10 rounded-2xl p-5 space-y-1'>
            <div className='flex items-center justify-between text-gray-400'>
              <span className='text-xs font-bold uppercase'>Platform Views</span>
              <Eye size={16} className='text-pink-400' />
            </div>
            <p className='text-2xl sm:text-3xl font-black text-white'>{analytics.totalViews.toLocaleString()}</p>
            <p className='text-[11px] text-gray-400 font-medium'>{analytics.totalDownloads} total downloads</p>
          </div>

          <div className='bg-[#111116] border border-white/10 rounded-2xl p-5 space-y-1'>
            <div className='flex items-center justify-between text-gray-400'>
              <span className='text-xs font-bold uppercase'>Est. MRR</span>
              <DollarSign size={16} className='text-emerald-400' />
            </div>
            <p className='text-2xl sm:text-3xl font-black text-emerald-400'>${analytics.estimatedRevenue.toLocaleString()}</p>
            <p className='text-[11px] text-gray-400 font-medium'>Recurring Monthly</p>
          </div>
        </div>
      )}

      {/* Tabs & Search */}
      <div className='flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/10 pb-4'>
        <div className='flex gap-2 w-full sm:w-auto'>
          <button
            onClick={() => setTab('stories')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              tab === 'stories' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}>
            All Stories ({stories.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              tab === 'users' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}>
            All Users ({users.length})
          </button>
        </div>

        <div className='relative w-full sm:w-80'>
          <Search size={15} className='absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500' />
          <input
            type='text'
            placeholder='Search stories or users...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full bg-[#111116] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white outline-none focus:border-purple-500'
          />
        </div>
      </div>

      {/* TAB 1: ALL STORIES */}
      {tab === 'stories' && (
        <div className='bg-[#111116] border border-white/10 rounded-3xl overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs text-gray-300'>
              <thead className='bg-black/40 text-gray-400 uppercase font-bold border-b border-white/10'>
                <tr>
                  <th className='p-4'>Cover / Title</th>
                  <th className='p-4'>Creator</th>
                  <th className='p-4'>Occasion</th>
                  <th className='p-4'>Theme</th>
                  <th className='p-4'>Views / Downloads</th>
                  <th className='p-4 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-white/5'>
                {stories.map((s) => (
                  <tr key={s._id} className='hover:bg-white/5 transition-colors'>
                    <td className='p-4 flex items-center gap-3'>
                      <img src={s.photos?.[0]?.thumbnailUrl || s.photos?.[0]?.url} alt='' className='w-12 h-12 rounded-xl object-cover bg-black border border-white/10 shrink-0' />
                      <div className='min-w-0'>
                        <p className='font-bold text-white truncate max-w-xs'>{s.title || s.clientName}</p>
                        <p className='text-[10px] text-gray-500 font-mono'>{s.storyId}</p>
                      </div>
                    </td>
                    <td className='p-4'>
                      <p className='font-bold text-white'>{s.userId?.name || 'Guest'}</p>
                      <p className='text-[10px] text-gray-500'>{s.userId?.email || 'N/A'}</p>
                    </td>
                    <td className='p-4 font-medium text-purple-300'>{s.occasion}</td>
                    <td className='p-4 capitalize'>{s.theme?.palette?.replace('_', ' ') || 'Default'}</td>
                    <td className='p-4'>
                      <span className='font-bold text-white'>{s.viewsCount || 0}</span> views • <span className='text-emerald-400'>{s.downloadsCount || 0}</span> dl
                    </td>
                    <td className='p-4 text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        <a href={`/story/${s.storyId}`} target='_blank' rel='noreferrer' className='p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white' title='View Story'><ExternalLink size={14}/></a>
                        <button onClick={() => handleDeleteStory(s._id)} className='p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white transition-colors' title='Delete Story'><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ALL USERS */}
      {tab === 'users' && (
        <div className='bg-[#111116] border border-white/10 rounded-3xl overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs text-gray-300'>
              <thead className='bg-black/40 text-gray-400 uppercase font-bold border-b border-white/10'>
                <tr>
                  <th className='p-4'>User</th>
                  <th className='p-4'>Email</th>
                  <th className='p-4'>Role</th>
                  <th className='p-4'>Plan</th>
                  <th className='p-4'>Joined</th>
                  <th className='p-4 text-right'>Change Plan</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-white/5'>
                {users.map((u) => (
                  <tr key={u._id} className='hover:bg-white/5 transition-colors'>
                    <td className='p-4 font-bold text-white'>{u.name}</td>
                    <td className='p-4 text-gray-400'>{u.email}</td>
                    <td className='p-4'>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        u.role === 'admin' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40' : 'bg-white/10 text-gray-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className='p-4 font-bold capitalize text-emerald-400'>{u.plan}</td>
                    <td className='p-4 text-gray-500'>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className='p-4 text-right'>
                      <select
                        value={u.plan}
                        onChange={(e) => handleUpdateUserPlan(u._id, e.target.value)}
                        className='bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white outline-none'>
                        <option value='free'>Free</option>
                        <option value='pro'>Pro ($4/story)</option>
                        <option value='studio'>Studio ($19/mo)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
