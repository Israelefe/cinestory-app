import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import { normalizePortfolio } from '../services/portfolio.js';
import PortfolioCanvas from './PortfolioCanvas.jsx';
import './PublicStudioPortfolio.css';

function pathHandle(pathname) {
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch {}
  return decoded.replace(/^\/@/, '').split('/')[0] || '';
}
function initialPortfolio(handle, projectId) {
  try {
    const data = JSON.parse(document.getElementById('portfolio-published-data')?.textContent || 'null');
    if (data?.portfolio?.handle === handle && (data.projectId || '') === projectId) return normalizePortfolio(data.portfolio);
  } catch {}
  return null;
}

export default function PublicStudioPortfolio({ requestedHandle = '' }) {
  const { handle: routeHandle } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const handle = String(routeHandle || requestedHandle || pathHandle(location.pathname)).replace(/^@/, '');
  const projectId = location.pathname.match(/\/projects\/([^/]+)\/?$/)?.[1] || '';
  const [retry, setRetry] = useState(0);
  const categoryId = new URLSearchParams(location.search).get('category') || '';
  const serviceId = new URLSearchParams(location.search).get('service') || '';
  const [portfolio, setPortfolio] = useState(() => initialPortfolio(handle, projectId));
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(false);

  function trackPortfolio(action, details = {}) {
    if (!handle) return;
    void api.post(`/v1/portfolios/public/${encodeURIComponent(handle)}/engagement`, { action, ...details }).catch(() => {});
  }

  useEffect(() => {
    let active = true;
    if (!handle) { setError('That portfolio address is incomplete.'); return () => { active = false; }; }
    setError('');
    setPortfolio(current => current?.handle === handle ? current : null);
    api.get(`/v1/portfolios/public/${encodeURIComponent(handle)}${projectId ? `/projects/${encodeURIComponent(projectId)}` : ''}`, { params: { ...(categoryId ? { category: categoryId } : {}), ...(serviceId ? { service: serviceId } : {}) } }).then(({ data }) => {
      if (!active) return;
      if (data.data.handle && data.data.handle !== handle) navigate(`/@${encodeURIComponent(data.data.handle)}${projectId ? `/projects/${projectId}` : ''}${location.search}`, { replace: true });
      setPortfolio(normalizePortfolio(data.data));
    }).catch(err => { if (active) { setConnectionError(!err.response || err.response.status >= 500); setError(apiMessage(err, 'That portfolio is not available.')); } });
    return () => { active = false; };
  }, [handle, projectId, retry]);
  useEffect(() => {
    if (error) { document.getElementById('portfolio-server-preview')?.remove(); return; }
    if (!portfolio) return;
    const project = portfolio.projects.find(item => item.id === projectId);
    const category = portfolio.content.categoryDetails.find(item => item.id === categoryId);
    const service = portfolio.content.services.find(item => item.id === serviceId);
    const contextTitle = project?.title || category?.name || service?.title;
    document.title = contextTitle ? `${contextTitle} — ${portfolio.studioName}` : portfolio.content.share.title || `${portfolio.studioName} — Portfolio`;
    document.getElementById('portfolio-server-preview')?.remove();
  }, [portfolio, projectId, categoryId, serviceId, error]);
  const invalidContext = portfolio && (categoryId && !portfolio.content.categoryDetails.some(item => item.id === categoryId) || serviceId && !portfolio.content.services.some(item => item.id === serviceId));
  function changeQuery(key, value) {
    const params = new URLSearchParams(location.search);
    if (value) params.set(key, value); else params.delete(key);
    navigate({ pathname: location.pathname, search: params.size ? `?${params}` : '' }, { preventScrollReset: true });
  }

  if (error || invalidContext) return <main className="v-public-portfolio-state"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><Camera size={25} /><h1>{connectionError ? 'We could not load this portfolio.' : 'Portfolio unavailable'}</h1><p>{error || 'This selection is no longer available.'}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button><a href="/"><ArrowLeft size={15} />Back to Veylo</a></main>;
  if (!portfolio) return <main className="v-public-portfolio-state" role="status"><img src="/veylo/veylo-mark.svg" alt="Veylo" /><p>Opening portfolio…</p></main>;

  return <PortfolioCanvas
    portfolio={portfolio}
    projectId={projectId}
    categoryId={categoryId}
    serviceId={serviceId}
    onPhotoOpen={(itemIndex, category, projectId) => trackPortfolio('photo.opened', { itemIndex, category, ...(projectId ? { projectId } : {}) })}
    onContact={(route, projectId, category, serviceId) => { const context = { ...(projectId ? { projectId } : {}), ...(category ? { category } : {}), ...(serviceId ? { serviceId } : {}) }; trackPortfolio(`${route}.clicked`, context); trackPortfolio('enquiry.clicked', context); }}
    onFilter={(category, id) => { trackPortfolio('filter.used', { category }); changeQuery('category', id); }}
    onServiceOpen={id => { if (id) trackPortfolio('service.opened', { serviceId: id }); changeQuery('service', id); }}
    onShare={() => trackPortfolio('share.clicked', projectId ? { projectId } : {})}
  />;
}
