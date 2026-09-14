import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Camera, Copy, Download, ExternalLink, Eye, Film, Folder, Image, MessageCircle, MoreHorizontal, Plus, RefreshCw, Trash2 } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { toast } from 'react-toastify';
import './Dashboard.css';

export default function Dashboard({ user }) {
  const reduced = useReducedMotion();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openMenu, setOpenMenu] = useState('');

  async function fetchStories() {
    try {
      setLoading(true);
      setLoadError('');
      const [legacy, current] = await Promise.allSettled([api.get('/v1/stories/my-stories'), api.get('/v1/deliveries')]);
      if (legacy.status === 'rejected' && current.status === 'rejected') throw current.reason;
      const legacyItems = legacy.status === 'fulfilled' && legacy.value.data?.success ? legacy.value.data.data || [] : [];
      const currentItems = current.status === 'fulfilled' && current.value.data?.success ? current.value.data.data || [] : [];
      const normalized = currentItems.map(item => ({ ...item, storyId: item.publicId, photos: item.assets, _deliveryType: 'current' }));
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

  const totalViews = stories.reduce((total, story) => total + (story.viewsCount || 0), 0);
  const totalDownloads = stories.reduce((total, story) => total + (story.downloadsCount || 0), 0);
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
        <article><div><span>DELIVERIES</span><strong>{stories.length}</strong></div><Film size={20} /></article>
        <article><div><span>CLIENT VIEWS</span><strong>{totalViews}</strong></div><Eye size={20} /></article>
        <article><div><span>DOWNLOADS</span><strong>{totalDownloads}</strong></div><Download size={20} /></article>
      </motion.section>

      <section className="v-dashboard-deliveries">
        <header><div><h2>Client deliveries</h2><span>{stories.length > 0 ? 'Open, share, or check a delivery.' : 'Your finished shoots will appear here.'}</span></div>{stories.length > 0 && <Link to="/create" className="v-dashboard-new"><Plus size={16} />New delivery</Link>}</header>

        {loading ? <div className="v-dashboard-state"><RefreshCw className="v-spin" size={27} /><strong>Opening your studio…</strong><span>Loading your latest deliveries.</span></div> : loadError ? <div className="v-dashboard-state v-dashboard-error"><Folder size={27} /><strong>Your deliveries did not load.</strong><span>{loadError}</span><button type="button" onClick={fetchStories}>Try again</button></div> : stories.length === 0 ? <motion.div className="v-dashboard-empty" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="v-dashboard-empty-copy"><p>YOUR FIRST DELIVERY</p><h3>No deliveries<br />here yet.</h3><span>When your next finished shoot is ready, start here. Veylo will guide you through the rest.</span><Link to="/create" className="v-button"><Plus size={17} />Create your first delivery<ArrowRight size={17} /></Link></div>
          <div className="v-dashboard-empty-preview" aria-hidden="true"><i /><i /><div><Image size={25} /><span>FIRST CLIENT DELIVERY</span><strong>Ready when the photographs are.</strong></div></div>
        </motion.div> : <div className="v-delivery-grid"><AnimatePresence>{stories.map((story, index) => <motion.article key={story._id} className="v-delivery-card" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .42, delay: Math.min(index * .05, .25) }}>
          <Link to={story.status === 'published' ? (story._deliveryType === 'current' ? `/d/${story.publicId}` : `/story/${story.storyId}`) : `/create?draft=${story._id}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer" className="v-delivery-cover" aria-label={`Open ${story.title || story.clientName || 'delivery'}`}>{story.photos?.[0]?.url || story.photos?.[0]?.thumbnailUrl ? <img src={story.photos[0].thumbnailUrl || story.photos[0].url} alt="" loading="lazy" decoding="async" /> : <span><Film size={28} /></span>}<i /><small>{story.status === 'published' ? (story.format || 'Photo Story').replaceAll('-', ' ') : `${story.status} draft`}</small></Link>
          <div className="v-delivery-body"><div className="v-delivery-title"><div><span>{story.clientName || 'Client delivery'}</span><h3>{story.title || story.occasion || 'Finished shoot'}</h3></div><button type="button" onClick={() => setOpenMenu(value => value === story._id ? '' : story._id)} aria-label="Delivery options" aria-expanded={openMenu === story._id}><MoreHorizontal size={19} /></button>{openMenu === story._id && <div className="v-delivery-menu"><button type="button" onClick={() => copyLink(story)}><Copy size={15} />Copy client link</button><a href={story._deliveryType === 'current' ? (story.status === 'published' ? `/d/${story.publicId}` : `/create?draft=${story._id}`) : `/story/${story.storyId}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer"><ExternalLink size={15} />{story.status === 'published' ? 'Open delivery' : 'Continue draft'}</a><button type="button" onClick={() => handleDelete(story._id)}><Trash2 size={15} />Delete delivery</button></div>}</div>
          <div className="v-delivery-numbers"><span><Eye size={14} />{story.viewsCount || 0} views</span><span><Download size={14} />{story.downloadsCount || 0} downloads</span></div>
          <button type="button" className="v-delivery-whatsapp" onClick={() => shareWhatsApp(story)}><MessageCircle size={16} />Send on WhatsApp</button></div>
        </motion.article>)}</AnimatePresence></div>}
      </section>
    </div>
  </div>;
}
