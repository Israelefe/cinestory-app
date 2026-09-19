import React, { useMemo, useState } from 'react';
import { Check, Monitor, Palette, Smartphone, Type } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatName } from '../../constants/formatRegistry.jsx';
import './DeliveryDirectionStudio.css';

const DISPLAY_FONTS = [
  ['editorial-serif', 'Editorial serif'],
  ['soft-serif', 'Soft serif'],
  ['condensed-sans', 'Condensed sans'],
  ['clean-sans', 'Clean sans']
];

const FORMAT_NOTES = {
  'photo-story': 'A paced, full-screen sequence with narration-ready scenes.',
  editorial: 'A magazine-style presentation built around scale, type, and white space.',
  'photo-reveal': 'A focused reveal that gives each selected photograph its own moment.',
  canvas: 'A free-flowing visual wall for varied compositions and strong colour.',
  chapters: 'A sectioned story for shoots with clear parts, outfits, or locations.',
  album: 'A familiar page-by-page presentation with a quieter, lasting feel.',
  'event-coverage': 'A crowd-first timeline for events with many people and moments.',
  campaign: 'A clear commercial presentation for looks, products, and campaign sets.'
};

const fontFamily = value => value === 'clean-sans' ? "'Plus Jakarta Sans',sans-serif" : value === 'condensed-sans' ? "'Outfit',sans-serif" : value === 'soft-serif' ? "'Cormorant Garamond','Playfair Display',serif" : "'Playfair Display',serif";

export default function DeliveryDirectionStudio({ delivery, assets, frameMap, onDirectionChange, onSectionChange }) {
  const reduced = useReducedMotion();
  const [device, setDevice] = useState('phone');
  const [activeIndex, setActiveIndex] = useState(0);
  const direction = delivery?.creativeDirection || {};
  const palette = direction.palette || {};
  const typography = direction.typography || {};
  const active = assets[activeIndex] || assets[0];
  const activeFrame = active ? frameMap.get(active.assetId) || {} : {};
  const sections = useMemo(() => direction.sections || [], [direction.sections]);

  return <section className="direction-studio" style={{ '--ds-bg': palette.background || '#070709', '--ds-surface': palette.surface || '#121217', '--ds-text': palette.text || '#ffffff', '--ds-accent': palette.accent || '#ff5a47', '--ds-display': fontFamily(typography.display) }}>
    <header className="direction-studio-head"><div><p>LIVE CLIENT PREVIEW</p><h2>Shape the delivery before it leaves your studio.</h2><span>Changes appear here as you make them. The client viewer uses the same colour, type, order, and story direction.</span></div><div className="direction-device" role="group" aria-label="Preview size"><button type="button" className={device === 'phone' ? 'is-active' : ''} onClick={() => setDevice('phone')}><Smartphone size={16} />Phone</button><button type="button" className={device === 'desktop' ? 'is-active' : ''} onClick={() => setDevice('desktop')}><Monitor size={16} />Wide</button></div></header>

    <div className="direction-studio-grid">
      <div className={`direction-preview-shell is-${device}`}>
        <motion.div className="direction-preview" layout transition={reduced ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 250 }}>
          <div className="direction-preview-top"><span>{delivery?.branding?.name || 'Your studio'}</span><small>{formatName(delivery?.format)}</small></div>
          {active && <motion.img key={active.assetId} src={active.url || active.thumbnailUrl} alt="Current delivery preview" initial={reduced ? false : { opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} />}
          <div className="direction-preview-shade" />
          <div className="direction-preview-copy"><small>{activeFrame.role || 'Photograph'} · {activeIndex + 1} of {assets.length}</small><h3>{activeFrame.headline || direction.title || delivery?.title}</h3><p>{activeFrame.caption || direction.openingLine}</p></div>
          <div className="direction-preview-progress"><i style={{ transform: `scaleX(${(activeIndex + 1) / Math.max(1, assets.length)})` }} /></div>
        </motion.div>
        <div className="direction-filmstrip">{assets.slice(0, 12).map((asset, index) => <button type="button" key={asset.assetId} className={activeIndex === index ? 'is-active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Preview photograph ${index + 1}`}><img src={asset.thumbnailUrl || asset.url} alt="" />{activeIndex === index && <span><Check size={12} /></span>}</button>)}</div>
      </div>

      <aside className="direction-controls">
        <section><header><Palette size={18} /><div><strong>Colour direction</strong><span>Use colours that support this set without fighting the photographs.</span></div></header><div className="direction-colours">{[['background','Background'],['surface','Surface'],['text','Text'],['accent','Accent']].map(([key,label]) => <label key={key}><input type="color" value={palette[key] || (key === 'accent' ? '#ff5a47' : key === 'text' ? '#ffffff' : key === 'surface' ? '#121217' : '#070709')} onChange={event => onDirectionChange('palette', key, event.target.value)} /><span>{label}<small>{palette[key]}</small></span></label>)}</div></section>
        <section><header><Type size={18} /><div><strong>Typography and pace</strong><span>Keep the words readable while giving this delivery its own voice.</span></div></header><label className="direction-select">Display type<select value={typography.display || 'editorial-serif'} onChange={event => onDirectionChange('typography', 'display', event.target.value)}>{DISPLAY_FONTS.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="direction-select">Body type<select value={typography.body || 'clean-sans'} onChange={event => onDirectionChange('typography', 'body', event.target.value)}><option value="clean-sans">Clean sans</option><option value="editorial-serif">Editorial serif</option></select></label><label className="direction-select">Story pace<select value={direction.pace || 'warm'} onChange={event => onDirectionChange('pace', null, event.target.value)}><option value="measured">Measured</option><option value="warm">Warm</option><option value="energetic">Energetic</option></select></label></section>
        <section><header><Smartphone size={18} /><div><strong>{formatName(delivery?.format)} structure</strong><span>{FORMAT_NOTES[delivery?.format]}</span></div></header>{sections.length ? <div className="direction-sections">{sections.map((section, index) => <label key={section.id}><span>{String(index + 1).padStart(2, '0')}</span><input value={section.title || ''} maxLength={60} onChange={event => onSectionChange(section.id, 'title', event.target.value)} /><select value={section.layout || 'single'} onChange={event => onSectionChange(section.id, 'layout', event.target.value)}><option value="hero">Hero</option><option value="single">Single</option><option value="pair">Pair</option><option value="triptych">Triptych</option><option value="grid">Grid</option><option value="strip">Strip</option><option value="spread">Spread</option><option value="cluster">Cluster</option><option value="chapter-cover">Chapter cover</option></select></label>)}</div> : <p className="direction-empty">The delivery has one continuous section. Photo order and captions are below.</p>}</section>
      </aside>
    </div>
  </section>;
}
