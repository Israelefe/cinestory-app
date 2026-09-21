import React, { useEffect, useMemo, useState } from 'react';
import { Instagram, MapPin, MessageCircle } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import api, { apiMessage } from '../services/api.js';
import './PublicStudioPortfolio.css';

function pathHandle(pathname) {
  const value = pathname.replace(/^\/@/, '').split('/')[0] || '';
  try { return decodeURIComponent(value); } catch { return value; }
}

export default function PublicStudioPortfolio() {
  const { handle: routeHandle } = useParams();
  const location = useLocation();
  const handle = String(routeHandle || pathHandle(location.pathname)).replace(/^@/, '');
  const [portfolio, setPortfolio] = useState(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');
  useEffect(() => {
    if (!handle) { setError('That portfolio address is incomplete.'); return undefined; }
    setError('');
    setPortfolio(null);
    api.get(`/v1/portfolios/public/${encodeURIComponent(handle)}`).then(({ data }) => {
      if (data.data.handle && data.data.handle !== handle && typeof window !== 'undefined') window.history.replaceState({}, '', `/@${encodeURIComponent(data.data.handle)}`);
      setPortfolio(data.data);
      document.title = `${data.data.studioName} — Portfolio`;
    }).catch(err => setError(apiMessage(err, 'That portfolio is not available.')));
    return undefined;
  }, [handle]);
  const categories = useMemo(() => ['All', ...new Set((portfolio?.items || []).map(item => item.category))], [portfolio]);
  const items = category === 'All' ? portfolio?.items || [] : portfolio.items.filter(item => item.category === category);
  if (error) return <div className="v-public-portfolio-state"><img src="/veylo/veylo-mark.svg" alt="" /><h1>Portfolio unavailable.</h1><p>{error}</p><a href="/">Go to Veylo</a></div>;
  if (!portfolio) return <div className="v-public-portfolio-state">Opening portfolio…</div>;
  const digits = String(portfolio.whatsapp || '').replace(/\D/g, '');
  const instagram = String(portfolio.instagram || '').replace(/^@/, '');
  return <div className={`v-public-portfolio is-${portfolio.direction.background} type-${portfolio.direction.typeStyle} rhythm-${portfolio.direction.rhythm}`} style={{ '--portfolio-accent': portfolio.direction.accent }}>
    <header className="v-public-portfolio-nav"><a href={`/@${portfolio.handle}`}>{portfolio.studioName}</a><span>{portfolio.location}</span></header>
    <main><section className="v-public-portfolio-hero"><p>SELECTED WORK</p><h1>{portfolio.headline || portfolio.studioName}</h1><div><span>{portfolio.introLine || portfolio.bio}</span>{portfolio.location && <small><MapPin size={13} />{portfolio.location}</small>}</div></section>
    <section className="v-public-portfolio-work"><nav aria-label="Portfolio categories">{categories.map(name => <button type="button" key={name} onClick={() => setCategory(name)} className={category === name ? 'is-active' : ''}>{name}</button>)}</nav><div>{items.map((item, index) => <figure key={item.publicId} className={`is-${(index % 7) + 1}`}><img src={item.url} alt={item.title || `${portfolio.studioName} portfolio photograph`} loading={index > 1 ? 'lazy' : 'eager'} decoding="async" /><figcaption><span>{String(index + 1).padStart(2, '0')}</span><p>{item.title || item.category}</p></figcaption></figure>)}</div></section>
    <section className="v-public-portfolio-contact"><p>LIKE WHAT YOU SEE?</p><h2>Let’s talk about<br /><em>your own shoot.</em></h2><div>{digits && <a href={`https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${portfolio.studioName}, I found your portfolio on Veylo and would like to ask about a shoot.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={17} />{portfolio.contactLabel}</a>}{instagram && <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer"><Instagram size={17} />@{instagram}</a>}</div></section></main>
    <footer><span>{portfolio.studioName}</span><a href="/">Portfolio delivered with <strong>veylo.</strong></a></footer>
  </div>;
}
