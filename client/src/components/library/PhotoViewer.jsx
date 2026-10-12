import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus.js';
import { formatBytes } from './libraryHelpers.js';

export default function PhotoViewer({ photos, initialIndex = 0, onClose, onDownload, details, title = 'Photograph' }) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(false);
  const dialog = useRef(null);
  const photo = photos[index] || photos[0];
  useDialogFocus(true, dialog, onClose);
  useEffect(() => {
    const key = event => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(photos.length - 1, value + 1)); setZoom(false); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); setZoom(false); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [photos.length]);
  if (!photo) return null;
  return <div className="lib-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><motion.section ref={dialog} className={`lib-viewer ${details ? 'has-details' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }}><header><div><strong>{photo.originalFilename || photo.filename || title}</strong><span>{index + 1} of {photos.length}{photo.width ? ` · ${photo.width} × ${photo.height}` : ''}{photo.bytes ? ` · ${formatBytes(photo.bytes)}` : ''}</span></div><button type="button" onClick={() => setZoom(!zoom)} aria-label={zoom ? 'Fit photograph' : 'Zoom photograph'}>{zoom ? <ZoomOut size={20} /> : <ZoomIn size={20} />}</button>{onDownload && <button type="button" onClick={() => onDownload(photo)} aria-label="Download original"><Download size={20} /></button>}<button type="button" aria-label="Close photograph" onClick={onClose}><X size={22} /></button></header><div className="lib-viewer-content"><div className={`lib-viewer-stage ${zoom ? 'is-zoomed' : ''}`}><img key={photo.url} src={photo.url || photo.thumbnailUrl} alt={photo.originalFilename || 'Photograph'} draggable="false" />{!zoom && photos.length > 1 && <div className="lib-viewer-arrows"><button type="button" aria-label="Previous photograph" disabled={index === 0} onClick={() => { setIndex(index - 1); setZoom(false); }}><ChevronLeft size={24} /></button><button type="button" aria-label="Next photograph" disabled={index === photos.length - 1} onClick={() => { setIndex(index + 1); setZoom(false); }}><ChevronRight size={24} /></button></div>}</div>{details && <aside className="lib-viewer-details" key={photo._id || photo.id}>{details(photo)}</aside>}</div></motion.section></div>;
}
