import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Archive, ArrowRight, BadgeCheck, Camera, Clock3, Copy, Download, ExternalLink, Eye, Film, Folder, Grid2X2, Image, Images, List, MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Send, Trash2, Users } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { APP_URL } from '../config/env.js';
import { toast } from 'react-toastify';
import './Dashboard.css';
import './DashboardV2.css';

export default function Dashboard({ user }) {
  const reduced = useReducedMotion();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [partialError, setPartialError] = useState('');
  const [openMenu, setOpenMenu] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');

  async function fetchStories() {
    try {
      setLoading(true);
      setLoadError('');
      setPartialError('');
      const requests = [
        { key: 'legacy', label: 'older Photo Stories', promise: api.get('/v1/stories/my-stories') },
        { key: 'current', label: 'current deliveries', promise: api.get('/v1/deliveries') },
        { key: 'archived', label: 'archived deliveries', promise: api.get('/v1/deliveries', { params: { scope: 'archived' } }) }
      ];
      const results = await Promise.allSettled(requests.map(request => request.promise));
      const failed = [];
      const successful = new Map();
      results.forEach((result, index) => {
        const request = requests[index];
        if (result.status === 'fulfilled' && result.value.data?.success && Array.isArray(result.value.data.data)) {
          successful.set(request.key, result.value.data.data);
          return;
        }
        const reason = result.status === 'rejected' ? apiMessage(result.reason, '') : result.value?.data?.message;
        failed.push({ label: request.label, reason });
      });
      if (!successful.size) {
        const detail = failed.map(item => item.reason).filter(Boolean)[0];
        throw new Error(detail || 'We could not load any of your delivery lists.');
      }
      if (failed.length) {
        setPartialError(`Some delivery lists could not be loaded: ${failed.map(item => item.label).join(', ')}. The list below may be incomplete.`);
      }
      const legacyItems = successful.get('legacy') || [];
      const currentItems = successful.get('current') || [];
      const archivedItems = successful.get('archived') || [];
      const normalized = [...currentItems, ...archivedItems].map(item => ({ ...item, storyId: item.publicId, photos: item.assets, _deliveryType: 'current' }));
      const combined = [...normalized, ...legacyItems];
      const unique = [...new Map(combined.map(item => [`${item._deliveryType || 'legacy'}:${item._id}`, item])).values()];
      setStories(unique.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)));
    } catch (error) {
      setLoadError(apiMessage(error, error?.message || 'We could not open your deliveries.'));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  useEffect(() => { fetchStories(); }, []);
  useEffect(() => {
    const closeMenus = event => {
      if (event.key === 'Escape' || !event.target.closest?.('.v-delivery-title')) setOpenMenu('');
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => { document.removeEventListener('pointerdown', closeMenus); document.removeEventListener('keydown', closeMenus); };
  }, []);

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
  const actionStories = stories.filter(story => ['draft', 'review'].includes(story.status)).slice(0, 3);
  const latestPublished = activeStories.find(story => story.status === 'published');
  const publishedCount = activeStories.filter(story => story.status === 'published').length;
  const averageViews = publishedCount ? Math.round(totalViews / publishedCount) : 0;
  const dataUnavailable = Boolean(loadError || partialError);
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
        <article><div><span>DELIVERIES</span><strong>{dataUnavailable ? '—' : activeStories.length}</strong></div><Film size={20} /></article>
        <article><div><span>CLIENT VIEWS</span><strong>{dataUnavailable ? '—' : totalViews}</strong></div><Eye size={20} /></article>
        <article><div><span>NEEDS ACTION</span><strong>{dataUnavailable ? '—' : needsAction}</strong></div><Clock3 size={20} /></article>
        <article><div><span>AVG. VIEWS</span><strong>{dataUnavailable ? '—' : averageViews}</strong></div><Users size={20} /></article>
      </motion.section>

      <motion.section className="v-studio-command" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .14 }}>
        <div className="v-studio-command-main">
          <p>WHAT NEEDS YOUR ATTENTION</p>
          {dataUnavailable ? <><h2>Some studio information is unavailable.</h2><span className="v-studio-command-copy">We will not call your studio clear until every delivery list responds.</span><button type="button" className="v-dashboard-command-primary" onClick={fetchStories}><RefreshCw size={17} />Try loading the lists again</button></> : actionStories.length ? <><h2>{needsAction} delivery {needsAction === 1 ? 'is' : 'are'} waiting for you.</h2><div className="v-studio-action-list">{actionStories.map(story => <Link key={story._id} to={`/create?draft=${story._id}`}><span>{story.status === 'review' ? 'Ready to review' : 'Draft'}</span><strong>{story.clientName || story.title || 'Untitled delivery'}</strong><small>{story.status === 'review' ? 'Check the direction and prepare the client link.' : 'Continue from where you stopped.'}</small><ArrowRight size={17} /></Link>)}</div></> : <><h2>Your studio is clear.</h2><span className="v-studio-command-copy">Start a delivery when the next finished shoot is ready.</span><Link to="/create" className="v-dashboard-command-primary"><Plus size={17} />Create a client delivery</Link></>}
        </div>
        <aside className="v-studio-quick">
          <p>STUDIO SHORTCUTS</p>
          <Link to="/create"><Plus size={17} /><span><strong>New delivery</strong><small>Start with a finished shoot</small></span><ArrowRight size={16} /></Link>
          <Link to="/library"><Images size={17} /><span><strong>Image library</strong><small>Reuse stored photographs</small></span><ArrowRight size={16} /></Link>
          <Link to="/portfolio/manage"><Camera size={17} /><span><strong>Studio portfolio</strong><small>Choose what prospective clients see</small></span><ArrowRight size={16} /></Link>
          {latestPublished && !dataUnavailable && <button type="button" onClick={() => shareWhatsApp(latestPublished)}><Send size={17} /><span><strong>Send latest delivery</strong><small>{latestPublished.clientName || latestPublished.title}</small></span><ArrowRight size={16} /></button>}
        </aside>
      </motion.section>

      <section className="v-dashboard-deliveries">
        <header><div><h2>Client deliveries</h2><span>{dataUnavailable ? 'Some delivery data is unavailable. Check the status below before making decisions.' : stories.length > 0 ? `${totalDownloads} downloads across your active deliveries.` : 'Your finished shoots will appear here.'}</span></div><div className="v-dashboard-head-actions">{stories.length > 0 && <Link to="/create" className="v-dashboard-new"><Plus size={16} />New delivery</Link>}</div></header>

        {loading && hasLoaded && <div className="v-dashboard-data-banner is-loading" role="status"><RefreshCw className="v-spin" size={17} /><span>Refreshing your delivery lists…</span></div>}
        {!loading && partialError && <div className="v-dashboard-data-banner" role="alert"><Folder size={17} /><span>{partialError}</span><button type="button" onClick={fetchStories}>Try again</button></div>}
        {!loading && loadError && stories.length > 0 && <div className="v-dashboard-data-banner is-error" role="alert"><Folder size={17} /><span>{loadError} Existing deliveries are still shown, but this list may be out of date.</span><button type="button" onClick={fetchStories}>Try again</button></div>}

        {stories.length > 0 && <div className="v-dashboard-tools"><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search client, title, or shoot" aria-label="Search deliveries" /></label><div role="group" aria-label="Filter deliveries">{[['all', 'All'], ['published', 'Published'], ['action', `Needs action${needsAction ? ` (${needsAction})` : ''}`], ['archived', 'Archived']].map(([value, label]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="v-dashboard-view" role="group" aria-label="Delivery layout"><button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view"><Grid2X2 size={16} /></button><button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-label="List view"><List size={17} /></button></div></div>}

        {loading && !hasLoaded ? <div className="v-dashboard-state"><RefreshCw className="v-spin" size={27} /><strong>Opening your studio…</strong><span>Loading your latest deliveries.</span></div> : !loading && loadError && stories.length === 0 ? <div className="v-dashboard-state v-dashboard-error"><Folder size={27} /><strong>Your deliveries are unavailable.</strong><span>{loadError}</span><button type="button" onClick={fetchStories}>Try again</button></div> : !loading && partialError && stories.length === 0 ? <div className="v-dashboard-state v-dashboard-error"><Folder size={27} /><strong>Some deliveries are unavailable.</strong><span>{partialError}</span><button type="button" onClick={fetchStories}>Try again</button></div> : !loading && !dataUnavailable && stories.length === 0 ? <motion.div className="v-dashboard-empty" initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="v-dashboard-empty-copy"><p>YOUR FIRST DELIVERY</p><h3>No deliveries<br />here yet.</h3><span>When your next finished shoot is ready, start here. Veylo will guide you through the rest.</span><Link to="/create" className="v-button"><Plus size={17} />Create your first delivery<ArrowRight size={17} /></Link></div>
          <div className="v-dashboard-empty-preview" aria-hidden="true"><i /><i /><div><Image size={25} /><span>FIRST CLIENT DELIVERY</span><strong>Ready when the photographs are.</strong></div></div>
        </motion.div> : filteredStories.length === 0 ? <div className="v-dashboard-state"><Search size={27} /><strong>No matching deliveries.</strong><span>Try another search or choose a different status.</span></div> : <div className={`v-delivery-grid is-${viewMode}`}><AnimatePresence>{filteredStories.map((story, index) => <motion.article key={story._id} className="v-delivery-card" initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .42, delay: Math.min(index * .05, .25) }}>
          <Link to={story.status === 'archived' ? '/dashboard' : story.status === 'published' ? (story._deliveryType === 'current' ? `/d/${story.publicId}` : `/story/${story.storyId}`) : `/create?draft=${story._id}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer" className="v-delivery-cover" aria-label={`Open ${story.title || story.clientName || 'delivery'}`}>{story.photos?.[0]?.url || story.photos?.[0]?.thumbnailUrl ? <img src={story.photos[0].thumbnailUrl || story.photos[0].url} alt="" loading="lazy" decoding="async" /> : <span><Film size={28} /></span>}<i /><small>{story.status === 'published' ? (story.format || 'Photo Story').replaceAll('-', ' ') : story.status === 'archived' ? 'archived delivery' : `${story.status} draft`}</small></Link>
          <div className="v-delivery-body"><div className="v-delivery-title"><div><span>{story.clientName || 'Client delivery'}</span><h3>{story.title || story.occasion || 'Finished shoot'}</h3></div><button type="button" onClick={() => setOpenMenu(value => value === story._id ? '' : story._id)} aria-label="Delivery options" aria-expanded={openMenu === story._id}><MoreHorizontal size={19} /></button>{openMenu === story._id && <div className="v-delivery-menu">{story.status !== 'archived' && <><button type="button" onClick={() => copyLink(story)}><Copy size={15} />Copy client link</button><a href={story._deliveryType === 'current' ? (story.status === 'published' ? `/d/${story.publicId}` : `/create?draft=${story._id}`) : `/story/${story.storyId}`} target={story.status === 'published' ? '_blank' : undefined} rel="noreferrer"><ExternalLink size={15} />{story.status === 'published' ? 'Open delivery' : 'Continue draft'}</a></>}{story._deliveryType === 'current' && story.status === 'published' && ['event-coverage', 'campaign'].includes(story.format) && <Link to={`/sharing?delivery=${story._id}`}><Users size={15} />Organizer, vendor, and guest links</Link>}{story._deliveryType === 'current' ? story.status === 'archived' ? <button type="button" onClick={() => handleRestore(story._id)}><RefreshCw size={15} />Restore delivery</button> : <button type="button" onClick={() => handleArchive(story._id)}><Archive size={15} />Archive delivery</button> : null}<button type="button" onClick={() => handleDelete(story._id)}><Trash2 size={15} />Delete delivery</button></div>}</div>
          <div className="v-delivery-numbers"><span><Eye size={14} />{story.viewsCount || 0} views</span><span><Download size={14} />{story.downloadsCount || 0} downloads</span></div>
          {story.status !== 'archived' && <button type="button" className="v-delivery-whatsapp" onClick={() => shareWhatsApp(story)}><MessageCircle size={16} />Send on WhatsApp</button>}</div>
        </motion.article>)}</AnimatePresence></div>}
      </section>
    </div>
  </div>;
}
