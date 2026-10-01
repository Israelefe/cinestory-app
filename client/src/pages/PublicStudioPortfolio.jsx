import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import { normalizePortfolio } from '../services/portfolio.js';
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
  const projectId = location.pathname.match(/\/projects\/([^/]+)\/?$/)?.[1] || '';
  const [retry, setRetry] = useState(0);
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
    api.get(`/v1/portfolios/public/${encodeURIComponent(handle)}${projectId ? `/projects/${encodeURIComponent(projectId)}` : ''}`).then(({ data }) => {
      if (!active) return;
      if (data.data.handle && data.data.handle !== handle && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', `/@${encodeURIComponent(data.data.handle)}${projectId ? `/projects/${projectId}` : ''}`);
      setPortfolio(normalizePortfolio(data.data));
      document.title = `${data.data.studioName} — Portfolio`;
    }).catch(err => { if (active) setError(apiMessage(err, 'That portfolio is not available.')); });
    return () => { active = false; };
  }, [handle, projectId, retry]);

  if (error) return <main className="v-public-portfolio-state"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><Camera size={25} /><h1>Portfolio unavailable</h1><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button><a href="/"><ArrowLeft size={15} />Back to Veylo</a></main>;
  if (!portfolio) return <main className="v-public-portfolio-state" role="status"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><p>Opening portfolio…</p></main>;

  return <PortfolioCanvas
    portfolio={portfolio}
    projectId={projectId}
    onPhotoOpen={(itemIndex, category, projectId) => trackPortfolio('photo.opened', { itemIndex, category, ...(projectId ? { projectId } : {}) })}
    onContact={(route, projectId) => { trackPortfolio(`${route}.clicked`, projectId ? { projectId } : {}); trackPortfolio('enquiry.clicked', projectId ? { projectId } : {}); }}
    onFilter={category => trackPortfolio('filter.used', { category })}
  />;
}
