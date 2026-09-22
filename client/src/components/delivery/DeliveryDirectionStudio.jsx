import React, { useMemo, useState } from 'react';
import { Check, Clapperboard, Monitor, Palette, Smartphone, Type } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatName } from '../../constants/formatRegistry.jsx';
import './DeliveryDirectionStudio.css';

export const FRAME_DIRECTION_OPTIONS = Object.freeze({
  layout: [['cinema', 'Cinema'], ['poster', 'Poster'], ['split', 'Split'], ['collage', 'Collage']],
  typographyStyle: [['typewriter', 'Typewriter'], ['editorial_quote', 'Editorial quote'], ['neon_pop', 'Neon pop'], ['cinematic_drift', 'Cinematic drift'], ['minimal_clean', 'Minimal clean'], ['bold_banner', 'Bold banner']],
  textBackground: [['frosted_glass', 'Frosted glass'], ['solid_dark', 'Solid dark'], ['neon_pill', 'Accent pill'], ['transparent_shadow', 'Shadow'], ['vogue_bordered', 'Vogue border']],
  captionPosition: [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']],
  textAnimation: [['word_fade_up', 'Fade up'], ['scale_pop', 'Scale pop'], ['smooth_slide', 'Smooth slide'], ['blur_reveal', 'Blur reveal'], ['letter_drift', 'Letter drift'], ['typewriter', 'Typewriter']],
  motion: [['slow-push', 'Slow push'], ['slow-pull', 'Slow pull'], ['pan-left', 'Pan left'], ['pan-right', 'Pan right'], ['float', 'Float'], ['still', 'Still']],
  transition: [['fade', 'Fade'], ['crossfade', 'Crossfade'], ['wipe', 'Wipe'], ['slide', 'Slide'], ['reveal', 'Reveal'], ['cut', 'Cut']]
});

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

const FORMAT_DIRECTION_OPTIONS = {
  'photo-story': { compositions: ['quiet', 'split', 'portrait-led'], typography: ['editorial-serif', 'soft-serif', 'clean-sans'], densities: ['spacious', 'balanced'], accents: ['corners', 'rules', 'type'], sectionLayouts: ['hero', 'single', 'pair', 'strip'] },
  editorial: { compositions: ['split', 'layered', 'grid', 'wide-led'], typography: ['editorial-serif', 'condensed-sans', 'soft-serif'], densities: ['spacious', 'balanced'], accents: ['rules', 'labels', 'type'], sectionLayouts: ['hero', 'single', 'pair', 'triptych', 'grid', 'spread', 'strip'] },
  'photo-reveal': { compositions: ['quiet', 'split', 'layered', 'portrait-led'], typography: ['editorial-serif', 'soft-serif', 'clean-sans'], densities: ['spacious', 'balanced'], accents: ['corners', 'type', 'rules'], sectionLayouts: ['hero', 'single', 'pair', 'spread'] },
  canvas: { compositions: ['grid', 'layered', 'split', 'portrait-led', 'wide-led'], typography: ['clean-sans', 'condensed-sans', 'editorial-serif'], densities: ['balanced', 'layered'], accents: ['labels', 'rules', 'corners'], sectionLayouts: ['cluster', 'grid', 'pair', 'triptych', 'strip'] },
  chapters: { compositions: ['grid', 'split', 'layered', 'portrait-led'], typography: ['editorial-serif', 'soft-serif', 'clean-sans'], densities: ['balanced', 'spacious'], accents: ['labels', 'rules', 'type'], sectionLayouts: ['chapter-cover', 'pair', 'single', 'triptych', 'grid'] },
  album: { compositions: ['quiet', 'split', 'wide-led', 'layered'], typography: ['soft-serif', 'editorial-serif', 'clean-sans'], densities: ['spacious', 'balanced'], accents: ['rules', 'type', 'corners'], sectionLayouts: ['spread', 'pair', 'single', 'hero'] },
  'event-coverage': { compositions: ['grid', 'wide-led', 'split', 'layered'], typography: ['clean-sans', 'condensed-sans', 'editorial-serif'], densities: ['balanced', 'layered'], accents: ['labels', 'rules', 'corners'], sectionLayouts: ['hero', 'grid', 'strip', 'cluster'] },
  campaign: { compositions: ['wide-led', 'split', 'grid', 'layered'], typography: ['clean-sans', 'condensed-sans', 'editorial-serif'], densities: ['balanced', 'layered'], accents: ['labels', 'rules', 'type'], sectionLayouts: ['hero', 'grid', 'strip', 'cluster', 'spread'] }
};

const fontFamily = value => value === 'clean-sans' ? "'Plus Jakarta Sans',sans-serif" : value === 'condensed-sans' ? "'Outfit',sans-serif" : value === 'soft-serif' ? "'Cormorant Garamond','Playfair Display',serif" : "'Playfair Display',serif";

export default function DeliveryDirectionStudio({ delivery, assets, frameMap, onDirectionChange, onSectionChange, onFrameChange }) {
  const reduced = useReducedMotion();
  const [device, setDevice] = useState('phone');
  const [activeIndex, setActiveIndex] = useState(0);
  const direction = delivery?.creativeDirection || {};
  const palette = direction.palette || {};
  const typography = direction.typography || {};
  const variation = direction.variation || {};
  const directionOptions = FORMAT_DIRECTION_OPTIONS[delivery?.format] || FORMAT_DIRECTION_OPTIONS['photo-story'];
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
        <section><header><Type size={18} /><div><strong>Typography and pace</strong><span>Keep the words readable while giving this delivery its own voice.</span></div></header><label className="direction-select">Display type<select value={directionOptions.typography.includes(typography.display) ? typography.display : directionOptions.typography[0]} onChange={event => onDirectionChange('typography', 'display', event.target.value)}>{DISPLAY_FONTS.filter(([value]) => directionOptions.typography.includes(value)).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="direction-select">Body type<select value={typography.body || 'clean-sans'} onChange={event => onDirectionChange('typography', 'body', event.target.value)}><option value="clean-sans">Clean sans</option><option value="editorial-serif">Editorial serif</option></select></label><label className="direction-select">Story pace<select value={direction.pace || 'warm'} onChange={event => onDirectionChange('pace', null, event.target.value)}><option value="measured">Measured</option><option value="warm">Warm</option><option value="energetic">Energetic</option></select></label></section>
        <section><header><Palette size={18} /><div><strong>Distinct visual treatment</strong><span>Give this delivery its own composition, spacing, accent, and caption voice.</span></div></header><label className="direction-select">Composition<select value={directionOptions.compositions.includes(variation.composition) ? variation.composition : directionOptions.compositions[0]} onChange={event => onDirectionChange('variation', 'composition', event.target.value)}>{directionOptions.compositions.map(value => <option value={value} key={value}>{value === 'quiet' ? 'Quiet and open' : value === 'split' ? 'Split focus' : value === 'layered' ? 'Layered depth' : value === 'grid' ? 'Structured grid' : value === 'portrait-led' ? 'Portrait-led' : 'Wide-led'}</option>)}</select></label><label className="direction-select">Spacing<select value={directionOptions.densities.includes(variation.density) ? variation.density : directionOptions.densities[0]} onChange={event => onDirectionChange('variation', 'density', event.target.value)}>{directionOptions.densities.map(value => <option value={value} key={value}>{value === 'spacious' ? 'Spacious' : value === 'layered' ? 'Layered' : 'Balanced'}</option>)}</select></label><label className="direction-select">Accent placement<select value={directionOptions.accents.includes(variation.accentPlacement) ? variation.accentPlacement : directionOptions.accents[0]} onChange={event => onDirectionChange('variation', 'accentPlacement', event.target.value)}>{directionOptions.accents.map(value => <option value={value} key={value}>{value === 'corners' ? 'Corner marks' : value === 'rules' ? 'Fine rules' : value === 'labels' ? 'Labels' : 'Type-led'}</option>)}</select></label><div className="direction-original-colour"><span>Photograph colour</span><strong>Original file colour</strong><small>Finished photographs are never re-graded in the client viewer. Colour direction changes the surrounding surfaces, type, and accents.</small></div><label className="direction-select">Caption style<select value={variation.captionTreatment || 'editorial'} onChange={event => onDirectionChange('variation', 'captionTreatment', event.target.value)}><option value="quiet">Quiet</option><option value="editorial">Editorial</option><option value="bold">Bold</option></select></label></section>
        <section><header><Smartphone size={18} /><div><strong>{formatName(delivery?.format)} structure</strong><span>{FORMAT_NOTES[delivery?.format]}</span></div></header>{sections.length ? <div className="direction-sections">{sections.map((section, index) => <label key={section.id}><span>{String(index + 1).padStart(2, '0')}</span><input value={section.title || ''} maxLength={60} onChange={event => onSectionChange(section.id, 'title', event.target.value)} /><select value={directionOptions.sectionLayouts.includes(section.layout) ? section.layout : directionOptions.sectionLayouts[0]} onChange={event => onSectionChange(section.id, 'layout', event.target.value)}>{directionOptions.sectionLayouts.map(value => <option value={value} key={value}>{value === 'chapter-cover' ? 'Chapter cover' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>)}</div> : <p className="direction-empty">The delivery has one continuous section. Photo order and captions are below.</p>}</section>
        {active && onFrameChange && <section><header><Clapperboard size={18} /><div><strong>Current photograph treatment</strong><span>These choices are saved with this frame and used by the client viewer.</span></div></header><div className="direction-frame-grid">{[['layout', 'Layout'], ['typographyStyle', 'Type style'], ['textBackground', 'Caption surface'], ['captionPosition', 'Caption position'], ['textAnimation', 'Text animation']].map(([field, label]) => <label className="direction-select" key={field}>{label}<select value={activeFrame[field] || FRAME_DIRECTION_OPTIONS[field][0][0]} onChange={event => onFrameChange(active.assetId, field, event.target.value)}>{FRAME_DIRECTION_OPTIONS[field].map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}</select></label>)}<label className="direction-select">Photo motion<select value={activeFrame.motion || 'slow-push'} onChange={event => onFrameChange(active.assetId, 'motion', event.target.value)}>{FRAME_DIRECTION_OPTIONS.motion.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}</select></label><label className="direction-select">Scene transition<select value={activeFrame.transition || 'crossfade'} onChange={event => onFrameChange(active.assetId, 'transition', event.target.value)}>{FRAME_DIRECTION_OPTIONS.transition.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}</select></label><label className="direction-select">Focal point<input value={activeFrame.focalPoint || '50% 50%'} pattern="^(100|[0-9]{1,2})%\\s+(100|[0-9]{1,2})%$" maxLength={24} placeholder="50% 50%" onChange={event => onFrameChange(active.assetId, 'focalPoint', event.target.value)} /></label><label className="direction-select">Frame accent<input type="color" value={activeFrame.colorAccent || palette.accent || '#ff5a47'} onChange={event => onFrameChange(active.assetId, 'colorAccent', event.target.value)} aria-label="Frame accent colour" /></label></div></section>}
      </aside>
    </div>
  </section>;
}
