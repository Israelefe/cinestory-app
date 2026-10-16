import React from 'react';
import { Check, Clock3, RefreshCw } from 'lucide-react';
import VideoActivity from './VideoActivity.jsx';
import { playbackReady, qualityLabel } from '../../utils/videoQuality.js';

export default function VideoPreparation({ asset, compact = false, statusUnavailable = false, onRetry, disabled = false }) {
  if (!asset || asset.state !== 'ready') return null;
  const ready = playbackReady(asset); const progress = asset.adaptive || {};
  const failed = progress.state === 'failed'; const running = progress.state === 'running';
  const qualities = asset.expectedQualities?.length ? asset.expectedQualities : asset.qualities?.map(row => row.name) || [];
  const completed = new Set(ready ? qualities : progress.completed || []);
  const title = ready ? 'Ready for playback' : failed ? 'Playback preparation needs attention' : running && progress.quality ? `Preparing ${qualityLabel(progress.quality)}` : 'Upload complete · playback preparation queued';
  return <div className="vc-playback-preparation" aria-label={`Playback preparation for ${asset.filename || 'video'}`}>
    {!compact && <VideoActivity title={title} state={statusUnavailable ? 'paused' : ready ? 'ready' : failed ? 'error' : running ? 'working' : 'waiting'}
      detail={statusUnavailable ? 'Refresh to update the status.' : failed ? progress.errorMessage : undefined}
      progress={ready ? 100 : running && Number.isFinite(progress.percent) ? progress.percent : undefined} label={`${progress.quality ? qualityLabel(progress.quality) : 'Playback'} preparation progress`} />}
    {!ready && qualities.length > 0 && <ol className="vc-quality-progress" aria-label="Playback qualities">{qualities.map(name => {
      const done = completed.has(name); const active = !done && running && name === progress.quality;
      const Icon = done ? Check : active ? RefreshCw : Clock3;
      return <li key={name} className={done ? 'is-ready' : active ? 'is-preparing' : ''}><Icon size={14} className={active && !statusUnavailable ? 'v-spin' : undefined} /><span>{qualityLabel(name)}<small>{done ? 'Ready' : active ? `${progress.percent || 0}% prepared` : 'Waiting'}</small></span></li>;
    })}</ol>}
    {failed && onRetry && <button type="button" className="vc-subtle" disabled={disabled} onClick={onRetry}><RefreshCw size={15} />Retry playback preparation</button>}
  </div>;
}
