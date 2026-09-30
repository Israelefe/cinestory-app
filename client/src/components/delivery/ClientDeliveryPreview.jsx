import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Mic2, Music2, Pause, Play } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../../config/env.js';
import { DeliveryFormatViewer } from './viewerRegistry.jsx';
import { DeliveryReadiness } from '../../pages/DeliveryViewer.jsx';
import { getDeliveryCapabilities } from '../../constants/deliveryCapabilities.js';
import PinboardViewer from './PinboardViewer.jsx';
import '../../pages/DeliveryViewer.css';
import './ClientDeliveryPreview.css';
import api, { apiMessage } from '../../services/api.js';

function revokeMedia(media) {
  Object.values(media?.assets || {}).forEach(url => {
    if (String(url).startsWith('blob:')) URL.revokeObjectURL(url);
  });
  [media?.soundtrack, media?.narration].forEach(url => {
    if (String(url).startsWith('blob:')) URL.revokeObjectURL(url);
  });
}

function mediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/api/')
    ? `${API_BASE_URL.replace(/\/$/, '')}${value.slice(4)}`
    : value;
}

export default function ClientDeliveryPreview({ delivery, narrationEnabled = true, accessPin = '', access = {} }) {
  const [experienceReady, setExperienceReady] = useState(false);
  const [previewUnlocked, setPreviewUnlocked] = useState(!accessPin);
  const [previewPin, setPreviewPin] = useState('');
  const [preloadedMedia, setPreloadedMedia] = useState({ assets: {}, soundtrack: '', narration: '' });
  const [audioState, setAudioState] = useState({ playing: '', loading: '' });
  const [narrationCue, setNarrationCue] = useState(null);
  const [previewLiked, setPreviewLiked] = useState(() => new Set());
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);
  const narrationInteractionRef = useRef(false);
  const effectiveAccess = useMemo(() => ({ ...delivery?.access, ...access }), [delivery?.access, access]);
  const needsWatermark = Boolean(effectiveAccess.downloadsLocked && effectiveAccess.watermarkEnabled);
  const previewMediaKey = `${delivery?._id || ''}:${needsWatermark}:${effectiveAccess.watermarkText || ''}:${(delivery?.assets || []).map(asset => asset.assetId).join('|')}`;
  const [previewMedia, setPreviewMedia] = useState({ key: '', assets: [], error: '' });
  const [previewMediaAttempt, setPreviewMediaAttempt] = useState(0);
  useEffect(() => {
    if (!needsWatermark || !delivery?._id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewMedia({ key: previewMediaKey, assets: [], error: '' });
      api.post(`/v1/deliveries/${delivery._id}/preview-media`, { downloadsLocked: true, watermarkEnabled: true, watermarkText: effectiveAccess.watermarkText || '' }, { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted) setPreviewMedia({ key: previewMediaKey, assets: data.data.assets, error: '' }); })
        .catch(error => { if (!controller.signal.aborted) setPreviewMedia({ key: previewMediaKey, assets: [], error: apiMessage(error, 'We could not load the watermarked preview. Try again.') }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [needsWatermark, delivery?._id, previewMediaKey, previewMediaAttempt]);
  const previewSourceDelivery = useMemo(() => {
    if (!needsWatermark || previewMedia.key !== previewMediaKey) return delivery;
    const media = new Map(previewMedia.assets.map(asset => [String(asset.assetId), asset]));
    return { ...delivery, assets: (delivery?.assets || []).map(asset => ({ ...asset, ...media.get(String(asset.assetId)) })) };
  }, [delivery, needsWatermark, previewMedia, previewMediaKey]);

  useEffect(() => {
    setExperienceReady(false);
    setPreviewUnlocked(!accessPin);
    setPreviewPin('');
    setPreloadedMedia({ assets: {}, soundtrack: '', narration: '' });
    setAudioState({ playing: '', loading: '' });
    setNarrationCue(null);
    setPreviewLiked(new Set());
    narrationInteractionRef.current = false;
  }, [accessPin, effectiveAccess.allowIndividualDownloads, effectiveAccess.allowDownloadAll, effectiveAccess.allowLikes, previewMediaKey, delivery?.publicId, delivery?._id, delivery?.format, delivery?.soundtrack?.url, delivery?.narration?.url, delivery?.narration?.captions?.url, (delivery?.assets || []).map(asset => `${asset.assetId}:${asset.url || ''}`).join('|')]);

  useEffect(() => () => revokeMedia(preloadedMedia), [preloadedMedia]);

  const format = delivery?.format || 'photo-story';
  const capabilities = getDeliveryCapabilities(format);
  const playbackDelivery = useMemo(() => ({
    ...delivery,
    access: {
      ...effectiveAccess,
      allowIndividualDownloads: effectiveAccess.allowIndividualDownloads !== false,
      allowDownloadAll: effectiveAccess.allowDownloadAll !== false,
      allowLikes: effectiveAccess.allowLikes !== false
    },
    assets: (previewSourceDelivery?.assets || []).map(asset => {
      const url = preloadedMedia.assets?.[asset.assetId] || mediaUrl(asset.url);
      return { ...asset, url, thumbnailUrl: url, srcSet: undefined };
    }),
    soundtrack: (capabilities.music || delivery?.kind === 'pinboard') && delivery?.soundtrack?.url
      ? { ...delivery.soundtrack, url: preloadedMedia.soundtrack || mediaUrl(delivery.soundtrack.url) }
      : undefined,
    narration: capabilities.narration && delivery?.schemaVersion === 3 && delivery?.narration && (delivery.narration.opening?.url || delivery.narration.closing?.url)
      ? {
          ...delivery.narration,
          captions: undefined,
          ...(delivery.narration.opening?.url ? { opening: { ...delivery.narration.opening, url: mediaUrl(delivery.narration.opening.url) } } : {}),
          ...(delivery.narration.closing?.url ? { closing: { ...delivery.narration.closing, url: mediaUrl(delivery.narration.closing.url) } } : {}),
        }
      : capabilities.narration && delivery?.narration?.url
        ? { ...delivery.narration, url: preloadedMedia.narration || mediaUrl(delivery.narration.url) }
        : undefined
  }), [effectiveAccess, previewSourceDelivery, delivery, preloadedMedia]);

  const toggleAudio = async kind => {
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (audioState.playing === kind || audioState.loading === kind) {
      selected.pause();
      setAudioState({ playing: '', loading: '' });
      return;
    }
    try {
      other?.pause();
      setAudioState(current => ({ ...current, loading: kind }));
      await selected.play();
      setAudioState({ playing: kind, loading: '' });
    } catch {
      setAudioState({ playing: '', loading: '' });
      toast.info(`The ${kind === 'narration' ? 'narration' : 'music'} could not start in this preview.`);
    }
  };

  const syncNarrationCue = event => {
    const time = Number(event.currentTarget.currentTime || 0);
    const cue = (delivery?.narration?.segments || []).find(segment => time >= Number(segment.startSec || 0) && time < Number(segment.endSec || 0));
    setNarrationCue(cue || null);
  };

  const seekNarrationToAssets = assetIds => {
    const narration = narrationRef.current;
    const wanted = new Set((Array.isArray(assetIds) ? assetIds : [assetIds]).map(String));
    const segment = (delivery?.narration?.segments || []).find(item => (item.assetIds || []).some(id => wanted.has(String(id))));
    if (!narration || !segment) return;
    narration.currentTime = Number(segment.startSec || 0);
    if (audioState.playing === 'narration') narration.play().catch(() => {});
  };

  useEffect(() => {
    if (!experienceReady || !playbackDelivery?.narration?.url || capabilities.narrationOwner !== 'viewer') return undefined;
    const startNarration = event => {
      if (narrationInteractionRef.current || event.target?.closest?.('input, textarea, select')) return;
      narrationInteractionRef.current = true;
      toggleAudio('narration');
      window.removeEventListener('pointerdown', startNarration, { capture: true });
      window.removeEventListener('keydown', startNarration, { capture: true });
    };
    window.addEventListener('pointerdown', startNarration, { capture: true });
    window.addEventListener('keydown', startNarration, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', startNarration, { capture: true });
      window.removeEventListener('keydown', startNarration, { capture: true });
    };
  }, [experienceReady, playbackDelivery?.narration?.url, capabilities.narrationOwner, audioState.playing]);

  if (!previewUnlocked) {
    return <section className="v-client-preview-access-gate" aria-label="Client access preview">
      <Mic2 size={22} aria-hidden="true" />
      <span>CLIENT ACCESS PREVIEW</span>
      <h2>This delivery asks the client for a PIN.</h2>
      <p>Enter the six digits you plan to send with the link. The preview will then load the same client experience.</p>
      <form onSubmit={event => { event.preventDefault(); if (previewPin === accessPin) setPreviewUnlocked(true); }}>
        <input value={previewPin} onChange={event => setPreviewPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Preview PIN" />
        <button type="submit" disabled={previewPin.length !== 6}>Open client preview</button>
      </form>
      {previewPin.length === 6 && previewPin !== accessPin && <small role="alert">That is not the PIN saved in these access settings.</small>}
    </section>;
  }

  if (!delivery?.assets?.length) {
    return <section className="v-client-preview-empty"><strong>No photographs have been added yet.</strong><span>Add the finished files before reviewing the client experience.</span></section>;
  }

  if (needsWatermark && (previewMedia.key !== previewMediaKey || !previewMedia.assets.length)) {
    return <section className="v-client-preview-empty" role={previewMedia.error ? 'alert' : 'status'}><strong>{previewMedia.error || 'Preparing the watermarked preview…'}</strong>{previewMedia.error && <button type="button" onClick={() => setPreviewMediaAttempt(current => current + 1)}>Try again</button>}</section>;
  }

  if (!experienceReady) {
    return <DeliveryReadiness key={previewMediaKey} delivery={previewSourceDelivery} onReady={media => { setPreloadedMedia(media); setExperienceReady(true); }} />;
  }

  if (delivery?.kind === 'pinboard') return <div className="v-client-preview-runtime"><PinboardViewer delivery={playbackDelivery} preview galleryProps={{ onDownload: () => toast.info('Photo downloads will be available on the published client link.'), onDownloadAll: () => toast.info('The published link will download each photograph separately.') }} /></div>;

  const galleryProps = {
    liked: previewLiked,
    busy: '',
    onLike: assetId => setPreviewLiked(current => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    }),
    onDownload: () => toast.info('Individual photo downloads will be active on the published client link.'),
    onDownloadAll: () => toast.info('The published link will download each photograph separately.')
  };
  const sharedProps = {
    delivery: playbackDelivery,
    galleryProps,
    audioState,
    toggleAudio,
    narrationRef,
    onNarrationNavigate: seekNarrationToAssets
  };

  return <div className="v-client-preview-runtime">
    <div className="v-client-preview-runtime-bar" role="status" aria-live="polite">
      <span><strong>Client experience</strong><small>Everything below uses the loaded files this preview checked.</small></span>
      <div>
        {playbackDelivery.soundtrack?.url && capabilities.soundtrackOwner === 'viewer' && <button type="button" onClick={() => toggleAudio('soundtrack')} aria-label={audioState.playing === 'soundtrack' ? 'Pause soundtrack' : 'Play soundtrack'}>{audioState.loading === 'soundtrack' ? <LoaderCircle className="v-spin" size={15} /> : audioState.playing === 'soundtrack' ? <Pause size={15} /> : <Play size={15} />}<Music2 size={14} /></button>}
        {playbackDelivery.narration?.url && capabilities.narrationOwner === 'viewer' && <button type="button" onClick={() => toggleAudio('narration')} aria-label={audioState.playing === 'narration' ? 'Pause narration' : 'Play narration'}>{audioState.loading === 'narration' ? <LoaderCircle className="v-spin" size={15} /> : audioState.playing === 'narration' ? <Pause size={15} /> : <Play size={15} />}<Mic2 size={14} /></button>}
      </div>
    </div>
    {narrationEnabled && capabilities.narration && !playbackDelivery.narration?.url && <p className="v-client-preview-note"><Mic2 size={15} />Narration is enabled. Publishing will create it from the approved captions in this exact order.</p>}
    {playbackDelivery.narration?.url && capabilities.narrationOwner === 'viewer' && narrationCue?.text && <aside className="v-client-preview-cue" aria-live="polite"><span>READING THE APPROVED CAPTION</span><p>{narrationCue.text}</p></aside>}
    {playbackDelivery.soundtrack?.url && capabilities.soundtrackOwner === 'viewer' && <audio ref={soundtrackRef} src={playbackDelivery.soundtrack.url} preload="auto" loop onWaiting={() => setAudioState(current => ({ ...current, loading: 'soundtrack' }))} onPlaying={() => setAudioState({ playing: 'soundtrack', loading: '' })} onError={() => setAudioState({ playing: '', loading: '' })} />}
    {playbackDelivery.narration?.url && capabilities.narrationOwner === 'viewer' && <audio ref={narrationRef} src={playbackDelivery.narration.url} preload="auto" onWaiting={() => setAudioState(current => ({ ...current, loading: 'narration' }))} onPlaying={() => setAudioState({ playing: 'narration', loading: '' })} onTimeUpdate={syncNarrationCue} onEnded={() => { setNarrationCue(null); setAudioState({ playing: '', loading: '' }); }} onError={() => setAudioState({ playing: '', loading: '' })} />}
    <DeliveryFormatViewer format={format} {...sharedProps} />
  </div>;
}
