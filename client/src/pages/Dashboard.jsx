import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Camera, Copy, Download, ExternalLink, Eye, Film, Folder, Image, LayoutGrid, MessageCircle, MoreHorizontal, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { toast } from 'react-toastify';

const formats = [
  ['Photo Story', Film], ['Editorial', Image], ['Photo Reveal', Eye], ['Canvas', LayoutGrid], ['Chapters', Folder], ['Album', Image]
];

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
      const { data } = await api.get('/v1/stories/my-stories');
      setStories(data?.success ? data.data || [] : []);
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
      await api.delete(`/v1/stories/${id}`);
      setStories(current => current.filter(story => story._id !== id));
      setOpenMenu('');
      toast.success('Delivery deleted');
    } catch (error) {
      toast.error(apiMessage(error, 'We could not delete that delivery.'));
    }
  }

  async function copyLink(storyId) {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/story/${storyId}`);
      toast.success('Client link copied');
    } catch {
      toast.error('Copy failed. Open the delivery and copy its address instead.');
    }
  }

  function shareWhatsApp(story) {
    const url = `${APP_URL}/story/${story.storyId}`;
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
        <div className="v-dashboard-studio">
          <span className="v-dashboard-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : <Camera size={24} />}</span>
          <div><p>{studioName}</p><span>{user?.studio?.city ? `${user.studio.city}, ${user.studio.state}` : 'Your Veylo studio'}</span></div>
        </div>
        <div className="v-dashboard-welcome"><p>Welcome back, {firstName}.</p><h1>Your finished shoots,<br /><em>ready to send properly.</em></h1><span>Prepare a delivery, check a client link, or send finished photographs on WhatsApp.</span></div>
        <div className="v-dashboard-hero-actions"><Link to="/create" className="v-button"><Plus size={17} />Create a delivery<ArrowRight size={17} /></Link><Link to="/settings" className="v-dashboard-secondary"><Settings size={16} />Account settings</Link></div>
      </motion.header>

      <motion.section className="v-dashboard-overview" aria-label="Studio overview" initial={reduced ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .08 }}>
        <article><div><span>DELIVERIES</span><strong>{stories.length}</strong></div><Film size={20} /><p>{stories.length === 1 ? 'One finished shoot shared' : 'Finished shoots in your studio'}</p></article>
        <article><div><span>CLIENT VIEWS</span><strong>{totalViews}</strong></div><Eye size={20} /><p>Times your delivery links were opened</p></article>
        <article><div><span>DOWNLOADS</span><strong>{totalDownloads}</strong></div><Download size={20} /><p>Photograph downloads recorded</p></article>
        <article className="v-dashboard-plan"><div><span>YOUR PLAN</span><strong>{isPro ? 'Pro' : 'Free'}</strong></div><BadgeCheck size={20} /><p>{isPro ? 'Unlimited deliveries under fair use' : 'Up to three final deliveries each month'}</p>{!isPro && <Link to="/pricing">See Veylo Pro<ArrowRight size={13} /></Link>}</article>
      </motion.section>

      <section className="v-dashboard-deliveries">
        <header><div><p className="v-eyebrow">Your work</p><h2>Client deliveries</h2><span>Everything you have prepared and shared from this account.</span></div>{stories.length > 0 && <Link to="/create" className="v-dashboard-new"><Plus size={16} />New delivery</Link>}</header>

        {loading ? <div className="v-dashboard-state"><RefreshCw className="v-spin" size={27} /><strong>Opening your studio…</strong><span>Loading your latest deliveries.</span></div> : loadError ? <div className="v-dashboard-state v-dashboard-error"><Folder size={27} /><strong>Your deliveries did not load.</strong><span>{loadError}</span><button type="button" onClick={fetchStories}>Try again</button></div> : stories.length === 0 ? <motion.div className="v-dashboard-empty" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="v-dashboard-empty-copy"><p>YOUR FIRST DELIVERY</p><h3>The retouching is done.<br />How should the photographs arrive?</h3><span>Upload the final photographs, explain the shoot, and choose how your client will experience them before opening the full gallery.</span><Link to="/create" className="v-button"><Plus size={17} />Create your first delivery<ArrowRight size={17} /></Link></div>
          <div className="v-dashboard-format-list">{formats.map(([label, Icon], index) => <div key={label}><span>0{index + 1}</span><Icon size={17} /><strong>{label}</strong></div>)}</div>
        </motion.div> : <div className="v-delivery-grid"><AnimatePresence>{stories.map((story, index) => <motion.article key={story._id} className="v-delivery-card" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .42, delay: Math.min(index * .05, .25) }}>
          <Link to={`/story/${story.storyId}`} target="_blank" rel="noreferrer" className="v-delivery-cover" aria-label={`Open ${story.title || story.clientName || 'delivery'}`}>{story.photos?.[0]?.url ? <img src={story.photos[0].thumbnailUrl || story.photos[0].url} alt="" loading="lazy" decoding="async" /> : <span><Film size={28} /></span>}<i /><small>{story.format || 'Photo Story'}</small></Link>
          <div className="v-delivery-body"><div className="v-delivery-title"><div><span>{story.clientName || 'Client delivery'}</span><h3>{story.title || story.occasion || 'Finished shoot'}</h3></div><button type="button" onClick={() => setOpenMenu(value => value === story._id ? '' : story._id)} aria-label="Delivery options" aria-expanded={openMenu === story._id}><MoreHorizontal size={19} /></button>{openMenu === story._id && <div className="v-delivery-menu"><button type="button" onClick={() => copyLink(story.storyId)}><Copy size={15} />Copy client link</button><a href={`/story/${story.storyId}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open delivery</a><button type="button" onClick={() => handleDelete(story._id)}><Trash2 size={15} />Delete delivery</button></div>}</div>
          <div className="v-delivery-numbers"><span><Eye size={14} />{story.viewsCount || 0} views</span><span><Download size={14} />{story.downloadsCount || 0} downloads</span></div>
          <button type="button" className="v-delivery-whatsapp" onClick={() => shareWhatsApp(story)}><MessageCircle size={16} />Send on WhatsApp</button></div>
        </motion.article>)}</AnimatePresence></div>}
      </section>
    </div>
  </div>;
}
