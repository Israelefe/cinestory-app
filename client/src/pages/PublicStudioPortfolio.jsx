import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import PortfolioCanvas from './PortfolioCanvas.jsx';
import './PublicStudioPortfolio.css';

function pathHandle(pathname) {
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch {}
  return decoded.replace(/^\/@/, '').split('/')[0] || '';
}

export default function PublicStudioPortfolio({ requestedHandle = '' }) {
  const { handle: routeHandle } = useParams();
  const location = useLocation();
  const handle = String(routeHandle || requestedHandle || pathHandle(location.pathname)).replace(/^@/, '');
  const [portfolio, setPortfolio] = useState(null);
  const [error, setError] = useState('');

  function trackPortfolio(action, details = {}) {
    if (!handle) return;
    void api.post(`/v1/portfolios/public/${encodeURIComponent(handle)}/engagement`, { action, ...details }).catch(() => {});
  }

  useEffect(() => {
    let active = true;
    if (!handle) { setError('That portfolio address is incomplete.'); return () => { active = false; }; }
    setError('');
    setPortfolio(null);
    api.get(`/v1/portfolios/public/${encodeURIComponent(handle)}`).then(({ data }) => {
      if (!active) return;
      if (data.data.handle && data.data.handle !== handle && typeof window !== 'undefined') window.history.replaceState({}, '', `/@${encodeURIComponent(data.data.handle)}`);
      setPortfolio(data.data);
      document.title = `${data.data.studioName} — Portfolio`;
    }).catch(err => { if (active) setError(apiMessage(err, 'That portfolio is not available.')); });
    return () => { active = false; };
  }, [handle]);

  useEffect(() => {
    const onPortfolioLinkClick = event => {
      const anchor = event.target.closest?.('a');
      const href = String(anchor?.getAttribute('href') || '');
      if (href.startsWith('https://wa.me/')) {
        trackPortfolio('whatsapp.clicked');
        trackPortfolio('enquiry.clicked');
      } else if (href.startsWith('https://instagram.com/')) trackPortfolio('instagram.clicked');
    };
    document.addEventListener('click', onPortfolioLinkClick);
    return () => document.removeEventListener('click', onPortfolioLinkClick);
  }, [handle]);

  if (error) return <main className="v-public-portfolio-state"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><Camera size={25} /><h1>Portfolio unavailable</h1><p>{error}</p><a href="/"><ArrowLeft size={15} />Back to Veylo</a></main>;
  if (!portfolio) return <main className="v-public-portfolio-state" role="status"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><p>Opening portfolio…</p></main>;

  return <PortfolioCanvas
    portfolio={portfolio}
    onPhotoOpen={(itemIndex, category) => trackPortfolio('project.opened', { itemIndex, category })}
    onFilter={category => trackPortfolio('filter.used', { category })}
  />;
}
