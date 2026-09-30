import React, { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Pause, Play } from 'lucide-react';
import { NARRATION_VOICES } from '../../constants/narrationVoices.js';
import './NarrationVoicePicker.css';

export default function NarrationVoicePicker({ value, onChange, disabled = false }) {
  const audio = useRef(null);
  const request = useRef(0);
  const [playing, setPlaying] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  function stop() {
    request.current += 1;
    audio.current?.pause();
    setPlaying(''); setLoading('');
  }
  useEffect(() => {
    if (disabled) stop();
    return () => { request.current += 1; audio.current?.pause(); };
  }, [disabled]);
  async function listen(voice) {
    if (playing === voice.id || loading === voice.id) { stop(); return; }
    stop(); setError('');
    const sequence = request.current;
    const player = audio.current;
    player.src = voice.previewUrl;
    setLoading(voice.id);
    try {
      await player.play();
      if (request.current === sequence) { setPlaying(voice.id); setLoading(''); }
    } catch {
      if (request.current === sequence) { stop(); setError(`${voice.name}'s sample could not play. Try listening again.`); }
    }
  }
  return <fieldset className="narration-voice-picker" disabled={disabled}>
    <legend>English voices</legend>
    <p>Listen to a sample, then choose one voice for this story.</p>
    <div className="narration-voice-grid">
      {NARRATION_VOICES.map(voice => <article key={voice.id} className={'narration-voice-card' + (value === voice.id ? ' is-selected' : '')}>
        <label>
          <input type="radio" name="story-narrator" aria-label={`Use ${voice.name}`} value={voice.id} checked={value === voice.id} onChange={() => { if (playing && playing !== voice.id) stop(); onChange(voice.id); }} />
          <span className="narration-voice-name">{voice.name}{value === voice.id && <Check size={15} aria-hidden="true" />}</span>
          <span className="narration-voice-meta">{voice.presentation} · {voice.accent}</span>
          <span className="narration-voice-tone">{voice.tone}</span>
        </label>
        <button type="button" aria-label={`${playing === voice.id || loading === voice.id ? 'Stop' : 'Listen to'} ${voice.name} sample`} onClick={() => listen(voice)}>
          {loading === voice.id ? <LoaderCircle size={15} className="narration-voice-loading" /> : playing === voice.id ? <Pause size={15} /> : <Play size={15} />}
          {loading === voice.id ? 'Loading sample' : playing === voice.id ? 'Stop sample' : 'Listen'}
        </button>
      </article>)}
    </div>
    <audio ref={audio} preload="none" onEnded={() => { setPlaying(''); setLoading(''); }} />
    {error && <p className="narration-voice-error" role="alert">{error}</p>}
  </fieldset>;
}
