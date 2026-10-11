import React from 'react';
import { Check, CircleAlert, LoaderCircle, Pause } from 'lucide-react';
import './VideoActivity.css';

export function VideoBusyIcon() { return <LoaderCircle size={17} className="vc-activity-spin" aria-hidden="true" />; }

export default function VideoActivity({ title, detail, state = 'working', progress, label }) {
  const running = ['working', 'waiting'].includes(state);
  const Icon = state === 'ready' ? Check : state === 'error' ? CircleAlert : state === 'paused' ? Pause : LoaderCircle;
  return <div className={`vc-activity is-${state}`} role="status">
    <Icon size={18} className={running ? 'vc-activity-spin' : undefined} aria-hidden="true" />
    <div className="vc-activity-copy"><span>{title}</span>{detail && <small>{detail}</small>}
      {label && <div className={'vc-activity-track' + (running && progress === undefined ? ' is-indeterminate' : '')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={progress === undefined ? title : `${Math.floor(progress)}%`}><i style={progress === undefined && running ? undefined : { transform: `scaleX(${Math.max(0, Math.min(100, progress || 0)) / 100})` }} /></div>}
    </div>
  </div>;
}
