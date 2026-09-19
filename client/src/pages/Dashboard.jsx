import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Archive, ArrowRight, BadgeCheck, Camera, Clock3, Copy, Download, ExternalLink, Eye, Film, Folder, Image, MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { toast } from 'react-toastify';
import './Dashboard.css';
import './DashboardV2.css';

export default function Dashboard({ user }) {
  const reduced = useReducedMotion();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenu, setOpenMenu] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  async function fetchStories() {
    try {
      setLoading(true);
      setLoadError('');
      const [legacy, current, archived] = await Promise.allSettled([api.get('/v1/stories/my-stories'), api.get('/v1/deliveries'), api.get('/v1/deliveries', { params: { scope: 'archived' } })]);
      if (legacy.status === 'rejected' && current.status === 'rejected' && archived.status === 'rejected') throw current.reason;
      const legacyItems = legacy.status === 'fulfilled' && legacy.value.data?.success ? legacy.value.data.data || [] : [];
      const currentItems = current.status === 'fulfilled' && current.value.data?.success ? current.value.data.data || [] : [];
      const archivedItems = archived.status === 'fulfilled' && archived.value.data?.success ? archived.value.data.data || [] : [];
      const normalized = [...currentItems, ...archivedItems].map(item => ({ ...item, storyId: item.publicId, photos: item.assets, _deliveryType: 'current' }));
      setStories([...normalized, ...legacyItems].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)));
    } catch (error) {
      setLoadError(apiMessage(error, 'We could not open your deliveries.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStories(); }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this delivery and disable its client link? This cannot be undone.')) return;
    try {
      const item = stories.find(story => story._id === id);
      await api.delete(item?._deliveryType === 'current' ? `/v1/deliveries/${id}` : `/v1/stories/${id}`);
      setStories(current => current.filter(story => story._id !== id));
      setOpenMenu('');
      toast.success('Delivery deleted');
    } catch (error) {
      toast.error(apiMessage(error, 'We could not delete that delivery.'));
    }
  }

  async function handleArchive(id) {
    try {
      await api.post(`/v1/deliveries/${id}/archive`);
      setStories(current => current.map(story => story._id === id ? { ...story, status: 'archived' } : story));
      setOpenMenu('');
      toast.success('Delivery archived. The client link is closed.');
    } catch (error) {
      toast.error(apiMessage(error, 'We could not archive that delivery.'));
    }
  }

  async function handleRestore(id) {
    try {
      const response = await api.post(`/v1/deliveries/${id}/restore`);
      setStories(current => current.map(story => story._id === id ? { ...story, status: response.data.data.status } : story));
      setOpenMenu('');
      toast.success(response.data.message || 'Delivery restored.');
    } catch (error) { toast.error(apiMessage(error, 'We could not restore that delivery.')); }
  }

  async function copyLink(story) {
    try {
      if (story.status !== 'published') return toast.info('Publish this draft before copying a client link.');
      await navigator.clipboard.writeText(`${APP_URL}${story._deliveryType === 'current' ? `/d/${story.publicId}` : `/story/${story.storyId}`}`);
      toast.success('Client link copied');
    } catch {
      toast.error('Copy failed. Open the delivery and copy its address instead.');
    }
  }

  function shareWhatsApp(story) {
    if (story.status !== 'published') return toast.info('Publish this draft before sharing it.');
    const url = `${APP_URL}${story._deliveryType === 'current' ? `/d/${story.publicId}` : `/story/${story.storyId}`}`;
    const name = story.clientName ? ` ${story.clientName}` : '';
    const message = encodeURIComponent(`Hello${name}, your photographs are ready. Open your private Veylo delivery here:\n${url}`);
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  const activeStories = stories.filter(story => story.status !== 'archived');
  const totalViews = activeStories.reduce((total, story) => total + (story.viewsCount || 0), 0);
  const totalDownloads = activeStories.reduce((total, story) => total + (story.downloadsCount || 0), 0);
  const needsAction = stories.filter(story => ['draft', 'review'].includes(story.status)).length;
  const filteredStories = stories.filter(story => {
    const searchText = `${story.clientName || ''} ${story.title || ''} ${story.shootType || story.occasion || ''}`.toLowerCase();
    const matchesQuery = searchText.includes(query.trim().toLowerCase());
    const matchesFilter = (filter === 'all' && story.status !== 'archived') || (filter === 'published' && story.status === 'published') || (filter === 'action' && ['draft', 'review'].includes(story.status)) || (filter === 'archived' && story.status === 'archived');
    return matchesQuery && matchesFilter;
  });
  const isPro = user?.plan === 'pro' || user?.plan === 'studio';
  const studioName = user?.studio?.name || user?.name || 'Your studio';
  const firstName = String(user?.name || 'Photographer').trim().split(/\s+/)[0];

  return <div className="v-dashboard-page">
    <div className="v-dashboard-glow" aria-hidden="true" />
    <div className="v-dashboard-wrap">
      <motion.header className="v-dashboard-hero" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
        <div className="v-dashboard-welcome">
          <div className="v-dashboard-studio"><span className="v-dashboard-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={24} />}</span><div><p>{studioName}</p><span>{user?.studio?.city ? `${user.studio.city}, ${user.studio.state}` : 'Your Veylo studio'}</span></div></div>
          <h1>Good to see you,<br /><em>{firstName}.</em></h1>
          <span>Open a client delivery or start with your next finished shoot.</span>
        </div>
        <div className="v-dashboard-plan-summary"><BadgeCheck size={19} /><div><span>{isPro ? 'Veylo Pro' : 'Veylo Free'}</span><small>{isPro ? 'Unlimited deliveries under fair use' : 'Three deliveries each month'}</small></div><Link to="/billing">{isPro ? 'Manage plan' : 'View Pro'}</Link></div>
      </motion.header>

      <motion.section className="v-dashboard-overview" aria-label="Studio overview" initial={reduced ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .08 }}>
        <article><div><span>DELIVERIES</span><strong>{activeStories.length}</strong></div><Film size={20} /></article>
        <article><div><span>CLIENT VIEWS</span><strong>{totalViews}</strong></div><Eye size={20} /></article>
        <article><div><span>NEEDS ACTION</span><strong>{needsAction}</strong></div><Clock3 size={20} /></article>
      </motion.section>

      <section className="v-dashboard-deliveries">
        <header><div><h2>Client deliveries</h2><span>{stories.length > 0 ? `${totalDownloads} downloads across your active deliveries.` : 'Your finished shoots will appear here.'}</span></div><div className="v-dashboard-head-actions">{isPro && <Link to="/volume-deliveries" className="v-dashboard-volume"><Users size={16} />Volume delivery</Link>}{stories.length > 0 && <Link to="/create" className="v-dashboard-new"><Plus size={16} />New delivery</Link>}</div></header>

        {stories.length > 0 && <div className="v-dashboard-tools"><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search client, title, or shoot" aria-label="Search deliveries" /></label><div role="group" aria-label="Filter deliveries">{[['all', 'All'], ['published', 'Published'], ['action', `Needs action${needsAction ? ` (${needsAction})` : ''}`], ['archived', 'Archived']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div>}

        {loading ? <div className="v-dashboard-state"><RefreshCw className="v-spin" size={27} /><strong>Opening your studio…</strong><span>Loading your latest deliveries.</span></div> : loadError ? <div className="v-dashboard-state v-dashboard-error"><Folder size={27} /><strong>Your deliveries did not load.</strong><span>{loadError}</span><button type="button" onClick={fetchStories}>Try again</button></div> : stories.length === 0 ? <motion.div className="v-dashboard-empty" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="v-dashboard-empty-copy"><p>YOUR FIRST DELIVERY</p><h3>No deliveries<br />here yet.</h3><span>When your next finished shoot is ready, start here. Veylo will guide you through the rest.</span><Link to="/create" className="v-button"><Plus size={17} />Create your first delivery<ArrowRight size={17} /></Link></div>
          <div className="v-dashboard-empty-preview" aria-hidden="true"><i /><i /><div><Image size={25} /><span>FIRST CLIENT DELIVERY</span><strong>Ready when the photographs are.</strong></div></div>
        </motion.div> : filteredStories.length === 0 ? <div className="v-dashboard-state"><Search size={27} /><strong>No matching deliveries.</strong><span>Try another search or choose a different status.</span></div> : <div className="v-delivery-grid"><AnimatePresence>{filteredStories.map((story, index) => <motion.article key={story._id} className="v-delivery-card" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .42, delay: Math.min(index * .05, .25) }}>
          <Link to={story.status === 'archived' ? '/dashboard' : story.status === 'published' ? (story._deliveryType === 'current' ? `/d/${story.publicId}` : `/story/${story.storyId}`) : `/create?draft=${story._id}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer" className="v-delivery-cover" aria-label={`Open ${story.title || story.clientName || 'delivery'}`}>{story.photos?.[0]?.url || story.photos?.[0]?.thumbnailUrl ? <img src={story.photos[0].thumbnailUrl || story.photos[0].url} alt="" loading="lazy" decoding="async" /> : <span><Film size={28} /></span>}<i /><small>{story.status === 'published' ? (story.format || 'Photo Story').replaceAll('-', ' ') : story.status === 'archived' ? 'archived delivery' : `${story.status} draft`}</small></Link>
          <div className="v-delivery-body"><div className="v-delivery-title"><div><span>{story.clientName || 'Client delivery'}</span><h3>{story.title || story.occasion || 'Finished shoot'}</h3></div><button type="button" onClick={() => setOpenMenu(value => value === story._id ? '' : story._id)} aria-label="Delivery options" aria-expanded={openMenu === story._id}><MoreHorizontal size={19} /></button>{openMenu === story._id && <div className="v-delivery-menu">{story.status !== 'archived' && <><button type="button" onClick={() => copyLink(story)}><Copy size={15} />Copy client link</button><a href={story._deliveryType === 'current' ? (story.status === 'published' ? `/d/${story.publicId}` : `/create?draft=${story._id}`) : `/story/${story.storyId}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer"><ExternalLink size={15} />{story.status === 'published' ? 'Open delivery' : 'Continue draft'}</a></>}{story._deliveryType === 'current' && story.status === 'published' && ['event-coverage', 'campaign'].includes(story.format) && <Link to={`/sharing?delivery=${story._id}`}><Users size={15} />Organizer, vendor, and guest links</Link>}{story._deliveryType === 'current' ? story.status === 'archived' ? <button type="button" onClick={() => handleRestore(story._id)}><RefreshCw size={15} />Restore delivery</button> : <button type="button" onClick={() => handleArchive(story._id)}><Archive size={15} />Archive delivery</button> : <button type="button" onClick={() => handleDelete(story._id)}><Trash2 size={15} />Delete old delivery</button>}</div>}</div>
          <div className="v-delivery-numbers"><span><Eye size={14} />{story.viewsCount || 0} views</span><span><Download size={14} />{story.downloadsCount || 0} downloads</span></div>
          {story.status !== 'archived' && <button type="button" className="v-delivery-whatsapp" onClick={() => shareWhatsApp(story)}><MessageCircle size={16} />Send on WhatsApp</button>}</div>
        </motion.article>)}</AnimatePresence></div>}
      </section>
    </div>
  </div>;
}
