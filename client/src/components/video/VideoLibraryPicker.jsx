import React, { useId, useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import { videoBytes, videoDuration } from '../../services/videoDelivery.js';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import VideoPosterImage from './VideoPosterImage.jsx';
import './VideoLibraryPicker.css';

function VideoCover({ asset }) {
  return <span className="vc-library-cover">
    <VideoPosterImage src={asset.posterUrl} loading="lazy" />
    <span className="vc-library-duration">{videoDuration(asset.duration)}</span>
  </span>;
}

export default function VideoLibraryPicker({ library, selected, busy, onAdd, onClose, onLoadMore }) {
  const reduced = useVeyloReducedMotion();
  const titleId = useId();
  const heading = useRef(null);
  const grid = useRef(null); const close = useRef(null); const previousCount = useRef(selected.length);
  const selectedIds = new Set(selected.map(item => item.assetId));
  const videos = library.assets.filter(asset => asset.state === 'ready');
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);
  useLayoutEffect(() => {
    if (previousCount.current === selected.length) return;
    previousCount.current = selected.length;
    (grid.current?.querySelector('button:not([disabled])') || close.current)?.focus();
  }, [selected.length]);
  return <motion.section className="vc-library-picker" aria-labelledby={titleId}
    initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <header><div><h3 ref={heading} id={titleId} tabIndex={-1}>Your video library</h3><p>{selected.length} / 10 added</p></div>
      <button ref={close} type="button" className="vc-library-close" onClick={onClose} aria-label="Close video library"><X size={19} /></button>
    </header>
    <div ref={grid} className="vc-library-grid">{videos.map(asset => {
      const added = selectedIds.has(asset.id);
      return <button type="button" key={asset.id} className={'vc-library-card' + (added ? ' is-added' : '')}
        disabled={busy || added || selected.length >= 10} aria-pressed={added}
        aria-label={added ? asset.filename + ' added' : 'Add ' + asset.filename} onClick={() => onAdd(asset)}>
        <VideoCover asset={asset} />
        <span className="vc-library-card-copy"><strong title={asset.filename}>{asset.filename}</strong>
          <span><small>{videoBytes(asset.bytes)}</small><span className="vc-library-add">{added ? <Check size={16} /> : <Plus size={16} />}{added ? 'Added' : 'Add video'}</span></span>
        </span>
      </button>;
    })}</div>
    {!videos.length && <p className="vc-library-empty">{library.nextCursor ? 'No ready videos on this page.' : 'No ready videos in your library yet.'}</p>}
    {library.nextCursor && <button type="button" className="vc-subtle vc-library-more" disabled={busy} onClick={onLoadMore}>Load more videos</button>}
  </motion.section>;
}
