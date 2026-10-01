import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Monitor, Smartphone, Tablet, X } from 'lucide-react';
import { DesktopPhoneFrame } from './PhonePresentation.jsx';
import { useDialogFocus } from '../useDialogFocus.js';
import './EditorialPreview.css';

const devices = [{ id: 'phone', label: 'Phone', width: 390, height: 800, Icon: Smartphone }, { id: 'tablet', label: 'Tablet', width: 834, height: 1000, Icon: Tablet }, { id: 'desktop', label: 'Desktop', width: 1280, height: 900, Icon: Monitor }];

function PreviewCanvas({ message, device }) {
  const ref = useRef(null);
  const [available, setAvailable] = useState(390);
  useEffect(() => {
    const update = () => setAvailable(ref.current?.clientWidth || 390);
    update();
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / device.width);
  return <div ref={ref} className="ed-preview-stage"><div className="ed-preview-footprint" style={{ width: device.width * scale, height: device.height * scale }}><div className="ed-preview-native" style={{ width: device.width, height: device.height, transform: `scale(${scale})` }}><DesktopPhoneFrame src="/__phone-preview" title={`${device.label} Editorial preview`} message={message} device={false} /></div></div></div>;
}

function ExpandedPreview({ message, device, onClose }) {
  const ref = useRef(null);
  useDialogFocus(true, ref, onClose);
  return createPortal(<div className="ed-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="ed-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="ed-preview-heading" tabIndex={-1}><header><h2 id="ed-preview-heading">{device.label} Editorial preview</h2><button type="button" onClick={onClose} aria-label="Close expanded preview"><X size={22} /></button></header><PreviewCanvas message={message} device={device} /></section></div>, document.body);
}

export default function EditorialPreview({ delivery, access }) {
  const [mode, setMode] = useState('phone');
  const [expanded, setExpanded] = useState(false);
  const device = devices.find(item => item.id === mode);
  const message = useMemo(() => ({ delivery, access, narrationEnabled: false, accessPin: '' }), [delivery, access]);
  return <div className="ed-preview"><div className="ed-preview-toolbar"><div role="group" aria-label="Editorial preview device">{devices.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={17} />{label}</button>)}</div><button type="button" onClick={() => setExpanded(true)} aria-label="Expand Editorial preview"><Maximize2 size={18} /></button></div><PreviewCanvas message={message} device={device} /><p>{device.width} × {device.height} px · The same Editorial your client opens.</p>{expanded && <ExpandedPreview message={message} device={device} onClose={() => setExpanded(false)} />}</div>;
}
