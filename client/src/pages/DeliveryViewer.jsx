import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Image, LoaderCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { apiMessage } from '../services/api.js';
import {
  EditorialDemo,
  RevealDemo,
  CanvasDemo,
  ChaptersDemo,
  AlbumDemo
} from './FormatDemo.jsx';
import StoryViewer from './StoryViewer.jsx';
import '../styles/format-demos.css';
import './DeliveryViewer.css';

function accessHeaders(publicId) {
  const token = sessionStorage.getItem(`veylo_delivery_${publicId}`);
  return token ? { 'X-Delivery-Access': token } : {};
}

export default function DeliveryViewer() {
  const { publicId } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [locked, setLocked] = useState(false);
  const [lockedBrand, setLockedBrand] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(new Set());
  const [busy, setBusy] = useState('');

  const [audioState, setAudioState] = useState({ playing: '' });
  const soundtrackRef = useRef(null);
  const narrationRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/v1/deliveries/public/${publicId}`, {
        headers: accessHeaders(publicId)
      });
      if (response.data.data.locked) {
        setLocked(true);
        setLockedBrand(response.data.data.branding);
        setDelivery(null);
      } else {
        setDelivery(response.data.data);
        setLocked(false);
        document.title = `${response.data.data.title} · Veylo`;
      }
    } catch (requestError) {
      setError(apiMessage(requestError, 'This delivery is not available.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [publicId]);

  async function unlock(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/v1/deliveries/public/${publicId}/unlock`, { pin });
      sessionStorage.setItem(`veylo_delivery_${publicId}`, response.data.data.accessToken);
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError, 'That PIN is not correct.'));
      setLoading(false);
    }
  }

  const toggleAudio = async kind => {
    const selected = kind === 'narration' ? narrationRef.current : soundtrackRef.current;
    const other = kind === 'narration' ? soundtrackRef.current : narrationRef.current;
    if (!selected) return;
    if (audioState.playing === kind) {
      selected.pause();
      if (kind === 'narration' && soundtrackRef.current && !soundtrackRef.current.paused) {
        soundtrackRef.current.volume = 1.0;
        setAudioState({ playing: 'soundtrack' });
      } else {
        setAudioState({ playing: '' });
      }
      return;
    }
    try {
      if (kind === 'narration' && soundtrackRef.current && !soundtrackRef.current.paused) {
        soundtrackRef.current.volume = 0.20;
      } else {
        other?.pause();
      }
      await selected.play();
      setAudioState({ playing: kind });
    } catch {
      toast.info('Tap again to play the audio.');
    }
  };

  async function handleLike(assetId) {
    try {
      const response = await api.post(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/like`,
        {},
        { headers: accessHeaders(delivery.publicId) }
      );
      setLiked(current => {
        const next = new Set(current);
        response.data.data.liked ? next.add(assetId) : next.delete(assetId);
        return next;
      });
    } catch (err) {
      toast.error(apiMessage(err, 'We could not update that photograph.'));
    }
  }

  async function handleDownload(assetId) {
    setBusy(assetId);
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/photos/${assetId}/download`,
        { headers: accessHeaders(delivery.publicId) }
      );
      const url = response.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `photo-${assetId}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare that download.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadAll() {
    setBusy('all');
    try {
      const response = await api.get(
        `/v1/deliveries/public/${delivery.publicId}/download-all`,
        { headers: accessHeaders(delivery.publicId) }
      );
      const url = response.data.data.url;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `${(delivery.clientName || 'gallery').replace(/[^a-z0-9_-]/gi, '_')}-photographs.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.info('Gallery download started. Check your browser downloads.');
    } catch (err) {
      toast.error(apiMessage(err, 'We could not prepare the full gallery.'));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="vd-state">
        <LoaderCircle className="v-spin" size={28} />
        <span>Opening your photographs…</span>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="vd-gate">
        <img src={lockedBrand?.logoUrl || '/veylo/veylo-mark.svg'} alt="" />
        <p>{lockedBrand?.name ? `${lockedBrand.name.toUpperCase()} · PRIVATE DELIVERY` : 'PRIVATE CLIENT DELIVERY'}</p>
        <h1>Enter the six-digit PIN.</h1>
        <span>The photographer protected this delivery. Use the PIN sent with your link.</span>
        <form onSubmit={unlock}>
          <input
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
          />
          <button disabled={pin.length !== 6}>
            Open delivery<ArrowRight size={17} />
          </button>
        </form>
        {error && <small role="alert">{error}</small>}
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="vd-state">
        <Image size={28} />
        <strong>This delivery is not available.</strong>
        <span>{error}</span>
      </div>
    );
  }

  const format = delivery.format || 'photo-story';
  const galleryProps = {
    liked,
    onLike: handleLike,
    onDownload: handleDownload,
    onDownloadAll: handleDownloadAll,
    busy
  };

  const sharedProps = {
    delivery,
    galleryProps,
    audioState,
    toggleAudio
  };

  const content =
    format === 'editorial' ? <EditorialDemo {...sharedProps} /> :
    format === 'photo-reveal' ? <RevealDemo {...sharedProps} /> :
    format === 'canvas' ? <CanvasDemo {...sharedProps} /> :
    format === 'chapters' ? <ChaptersDemo {...sharedProps} /> :
    format === 'album' ? <AlbumDemo {...sharedProps} /> :
    <StoryViewer {...sharedProps} />;

  return (
    <>
      {delivery.soundtrack?.url && !['photo-reveal', 'album', 'photo-story'].includes(format) && (
        <audio
          ref={soundtrackRef}
          src={delivery.soundtrack.url}
          preload="metadata"
          loop
          onEnded={() => setAudioState({ playing: '' })}
        />
      )}
      {delivery.narration?.url && (
        <audio
          ref={narrationRef}
          src={delivery.narration.url}
          preload="metadata"
          onEnded={() => {
            if (soundtrackRef.current && !soundtrackRef.current.paused) {
              soundtrackRef.current.volume = 1.0;
              setAudioState({ playing: 'soundtrack' });
            } else {
              setAudioState({ playing: '' });
            }
          }}
        />
      )}

      {content}
    </>
  );
}
