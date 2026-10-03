import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../useDialogFocus.js';
import { useClosingGallery } from '../../utils/useClosingGallery.js';
import { presentationSections, presentationSettings, numberLabel } from '../../utils/deliveryPresentation.js';
import { Photo } from '../PublicDesign.jsx';
import { CollectionGallery, Arrival, PhotoCard, PresentationEnding, PresentationShell, usePresentation } from './PresentationShell.jsx';
import './CollectionViewers.css';

import './ChaptersViewer.css';
function ChapterRoom({ section, index, sections, context, settings, onSelect, onClose, onPhoto, onViewed, positions }) {
  const panel = useRef(null), heading = useRef(null), reduced = useReducedMotion();
  useDialogFocus(true, panel, onClose);
  const { galleryUnlocked: ended, closingRef } = useClosingGallery(`${context.identity}:${section.id}`);
  useEffect(() => { if (ended) onViewed(section.id); }, [ended, section.id, onViewed]);
  useEffect(() => { const node = panel.current; const frame = requestAnimationFrame(() => { node?.scrollTo({ top: positions.current[section.id] || 0 }); heading.current?.focus({ preventScroll: true }); }); return () => cancelAnimationFrame(frame); }, [section.id, positions]);
  return createPortal(<div className="pv-room-backdrop" style={context.theme}><motion.section className={`pv-chapter-room fd-chapter-room layout-${section.layout}`} role="dialog" aria-modal="true" aria-label={section.title} ref={panel} onScroll={event => { positions.current[section.id] = event.currentTarget.scrollTop; }} initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 12 }} transition={{ duration: reduced ? 0 : .2 }}><header className="pv-room-tools"><button onClick={onClose}><ArrowLeft />Chapters</button><span>{numberLabel(index + 1)} / {numberLabel(sections.length)}</span><button onClick={onClose} aria-label="Close chapter"><X /></button></header><div className="pv-room-content"><div className="pv-section-heading"><span data-number={numberLabel(index + 1)}>{numberLabel(index + 1)}</span><div><h2 ref={heading} tabIndex={-1}>{section.title}</h2>{section.body && <p>{section.body}</p>}</div></div><div className="pv-room-photos">{section.assetIds.map((id, at) => <Arrival key={id} index={at}><PhotoCard photo={context.photos.find(photo => photo.assetId === id)} index={context.photos.findIndex(photo => photo.assetId === id)} onOpen={onPhoto} caption={settings.showPhotoCaptions} eager={at < 2} /></Arrival>)}</div><footer ref={closingRef} className="pv-room-footer"><span><Check size={17} />Chapter complete</span><nav>{index > 0 && <button onClick={() => onSelect(index - 1)}><ChevronLeft />Previous chapter</button>}{index < sections.length - 1 ? <button onClick={() => onSelect(index + 1)}>Next chapter<ChevronRight /></button> : <button onClick={onClose}>Back to chapters<ArrowRight /></button>}</nav></footer></div></motion.section></div>, document.body);
}
export function ChaptersViewer({ delivery = {}, galleryProps, demo = false }) {
  const context = usePresentation(delivery, galleryProps, demo), [chapter, setChapter] = useState(null), [gallery, setGallery] = useState(null), [visited, setVisited] = useState([]);
  const positions = useRef({});
  const ids = context.photos.map(photo => photo.assetId), sections = presentationSections(delivery, ids), settings = presentationSettings(delivery, ids);
  const unlocked = sections.length > 0 && sections.every(section => visited.includes(section.id));
  useEffect(() => { setVisited([]); setChapter(null); positions.current = {}; }, [context.identity]);
  const viewed = React.useCallback(id => setVisited(current => current.includes(id) ? current : [...current, id]), []);
  const nextUnread = sections.findIndex(section => !visited.includes(section.id));
  const openPhoto = photo => setGallery(photo.assetId);
  return <PresentationShell delivery={delivery} format="Chapters" theme={context.theme} onGallery={unlocked ? () => setGallery('all') : undefined} className="pv-chapters"><main className="pv-main"><Arrival className="pv-intro"><span className="pv-eyebrow">CHAPTERS / {numberLabel(sections.length)} ROOMS</span><h1>{delivery.title}</h1><p>{delivery.creativeDirection?.openingLine}</p><small>{visited.length} of {sections.length} chapters viewed</small></Arrival><div className={`pv-chapter-directory fd-chapter-directory-board directory-${settings.directoryLayout}`}>{sections.map((section, at) => { const cover = context.photos.find(photo => photo.assetId === section.coverAssetId); return <Arrival key={section.id} index={at}><button className="pv-chapter-cover" onClick={() => setChapter(at)}><Photo url={cover?.thumbnailUrl || cover?.url} alt={cover?.alt || ''} eager={at < 3} /><span className="pv-chapter-cover-copy"><span className="pv-eyebrow">{numberLabel(at + 1)} / {section.assetIds.length} PHOTOS {visited.includes(section.id) && <Check size={16} />}</span><h2>{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}<span>Open chapter<ArrowRight size={18} /></span></span></button></Arrival>; })}</div>{nextUnread >= 0 && <button className="pv-unread" onClick={() => setChapter(nextUnread)}>Open an unviewed chapter<ArrowRight size={18} /></button>}<PresentationEnding delivery={delivery} photo={context.closing} unlocked={unlocked} onGallery={() => setGallery('all')} /></main><AnimatePresence>{chapter !== null && sections[chapter] && <ChapterRoom section={sections[chapter]} index={chapter} sections={sections} settings={settings} context={context} positions={positions} onViewed={viewed} onClose={() => setChapter(null)} onSelect={setChapter} onPhoto={openPhoto} />}</AnimatePresence>{gallery && <CollectionGallery context={context} delivery={delivery} selection={gallery} singlePhoto={!unlocked} onClose={() => setGallery(null)} />}</PresentationShell>;
}

export default ChaptersViewer;
