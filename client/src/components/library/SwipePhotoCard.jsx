import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { RotateCcw, ZoomIn } from 'lucide-react';

export default function SwipePhotoCard({ photo, media, ready, setReady, failed, setFailed, retry, setRetry, conflict, direction, onDecision, onInspect, number, total }) {
  const x = useMotionValue(0), rotate = useTransform(x, [-220, 220], [-9, 9]), chooseOpacity = useTransform(x, [15, 110], [0, 1]), skipOpacity = useTransform(x, [-110, -15], [1, 0]);
  const imageUrl = media(photo.id, 'small');
  function finishDrag(_, info) {
    const committed = (Math.abs(info.offset.x) >= 80 || Math.abs(info.velocity.x) > 550 && Math.abs(info.offset.x) > 24) && onDecision(photo.id, info.offset.x > 0, true) !== false;
    if (!committed) x.set(0);
  }
  return <motion.div className="sel-card" style={{ x, rotate }} drag={ready.has(photo.id) && !conflict ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={.85} onDragEnd={finishDrag} initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={direction => ({ opacity: 0, x: direction * 500, rotate: direction * 12 })} transition={{ type: 'spring', damping: 26, stiffness: 280 }}><img src={imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'retry=' + retry} alt={photo.originalFilename} draggable="false" onLoad={() => { setReady(previous => new Set(previous).add(photo.id)); setFailed(''); }} onError={() => setFailed(photo.id)} decoding="async" /><motion.span className="sel-decision is-choose" style={{ opacity: chooseOpacity }}>CHOOSE</motion.span><motion.span className="sel-decision is-skip" style={{ opacity: skipOpacity }}>SKIP</motion.span><button type="button" className="sel-zoom" aria-label="View photograph larger" onClick={() => onInspect(photo)}><ZoomIn size={20} /></button><span className="sel-photo-number">{number} / {total}</span>{!ready.has(photo.id) && failed !== photo.id && <div className="sel-image-state" role="status"><span className="lib-loader" />Loading photograph…</div>}{failed === photo.id && <div className="sel-image-state"><span>This photograph could not load.</span><button type="button" className="lib-button" onClick={() => { setFailed(''); setRetry(value => value + 1); }}><RotateCcw size={16} />Try again</button></div>}</motion.div>;
}
