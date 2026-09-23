import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import { timeline } from './timing.js';

const palettes = {
  ember: { background: '#100d0d', paper: '#eee6dc', ink: '#fff8ee', muted: '#cebab1', accent: '#ff9b8e' },
  ivory: { background: '#eee8df', paper: '#171815', ink: '#191b17', muted: '#60594f', accent: '#963e30' },
  ink: { background: '#080b0d', paper: '#e2e6df', ink: '#f4f5ed', muted: '#b6c0ba', accent: '#b3c7b5' }
};
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
function Photo({ image, scene, frame, frames, still, style }) {
  if (!image) return null;
  const progress = still ? 0.4 : Math.max(0, Math.min(1, frame / frames));
  const zoom = scene.motion === 'push' ? 1 + progress * 0.075 : scene.motion === 'pull' ? 1.075 - progress * 0.075 : scene.motion === 'pan' ? 1.07 : 1;
  const transform = `scale(${zoom}) translateX(${scene.motion === 'pan' ? (progress - 0.5) * 4 : 0}%)`;
  const filter = image.kind === 'screenshot' ? 'none' : scene.grade === 'warm' ? 'sepia(.12) saturate(.94) contrast(1.03)' : scene.grade === 'mono' ? 'grayscale(1) contrast(1.05)' : 'none';
  return <div style={{ overflow: 'hidden', background: '#171719', ...style }}><Img src={image.src} style={{ width: '100%', height: '100%', objectFit: image.kind === 'screenshot' ? 'contain' : 'cover', objectPosition: `${scene.focalPoint.x}% ${scene.focalPoint.y}%`, transform: image.kind === 'screenshot' ? undefined : transform, filter }} /></div>;
}
function Scene({ scene, images, palette, frames, index, count, still, reducedMotion, hasVoice, cta, standalone = false }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const vertical = height / width > 1.6;
  const p = palettes[palette] || palettes.ember;
  const full = scene.layout === 'fullbleed';
  const colour = full ? '#fff8ee' : p.ink;
  const muted = full ? '#ece2d8' : p.muted;
  const accent = full ? '#ffb3a7' : p.accent;
  const x = vertical ? 90 : 76;
  const right = vertical ? 150 : 76;
  const top = vertical ? 185 : 125;
  const bottom = vertical ? (hasVoice ? 480 : 390) : 110;
  const innerHeight = height - top - bottom;
  const innerWidth = width - x - right;
  const photos = scene.assetIds.map(id => images[id]).filter(Boolean);
  const animated = !still && !reducedMotion;
  const arrive = animated ? spring({ frame, fps, config: { damping: 24, stiffness: 90 } }) : 1;
  const opacity = !animated || scene.transition === 'cut' || index === 0 ? 1 : interpolate(frame, [0, 12], [0, 1], clamp);
  const entrance = !animated ? undefined : scene.transition === 'slide' ? `translateX(${(1 - arrive) * 65}px)` : undefined;
  const clipPath = animated && scene.transition === 'reveal' ? `inset(0 ${(1 - arrive) * 100}% 0 0)` : undefined;
  const textMotion = { opacity: arrive, transform: `translateY(${(1 - arrive) * 26}px)` };
  const headlineSize = scene.headline.length > 55 ? (vertical ? 83 : 65) : scene.headline.length > 32 ? (vertical ? 98 : 78) : (vertical ? 117 : 91);
  const isLast = standalone || index === count - 1;
  const text = (fontSize = headlineSize) => <div style={{ ...textMotion, position: 'relative', zIndex: 2 }}>
    {scene.eyebrow && <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: accent, marginBottom: 24 }}>{scene.eyebrow}</div>}
    <div style={{ fontFamily: palette === 'ivory' ? 'Cormorant Garamond, Georgia, serif' : 'DM Sans, sans-serif', fontWeight: palette === 'ivory' ? 500 : 700, fontSize, lineHeight: 1.03, letterSpacing: -fontSize * 0.045, overflowWrap: 'break-word' }}>{scene.headline}</div>
    {scene.body && <div style={{ fontSize: vertical ? 31 : 27, lineHeight: 1.42, color: muted, marginTop: 25, maxWidth: 690 }}>{scene.body}</div>}
    {isLast && <div style={{ marginTop: 30, fontSize: 23, fontWeight: 500, color: accent, display: 'flex', gap: 15, alignItems: 'center' }}><span>{cta}</span><span aria-hidden="true">→</span></div>}
  </div>;
  const photoProps = { scene, frame, frames, still: !animated };
  const editorialSize = vertical ? Math.min(headlineSize, 88) : Math.min(headlineSize, 66);
  const estimatedTextHeight = Math.ceil(scene.headline.length * editorialSize * 0.59 / innerWidth) * editorialSize * 1.03
    + (scene.eyebrow ? 52 : 0) + (scene.body ? Math.ceil(scene.body.length * (vertical ? 31 : 27) * 0.56 / innerWidth) * (vertical ? 44 : 39) + 25 : 0) + (isLast ? 88 : 0);
  const imageHeight = Math.max(160, Math.min(innerHeight * (height / width > 1.1 ? 0.62 : 0.47), innerHeight - estimatedTextHeight - (vertical ? 42 : 27)));
  return <AbsoluteFill style={{ background: p.background, color: colour, fontFamily: 'DM Sans, sans-serif', opacity, transform: entrance, clipPath, overflow: 'hidden' }}>
    {full && <><Photo {...photoProps} image={photos[0]} style={{ position: 'absolute', inset: 0 }} /><AbsoluteFill style={{ background: scene.textPosition === 'top' ? 'linear-gradient(180deg,rgba(0,0,0,.88),rgba(0,0,0,.05) 85%)' : 'linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.1) 30%,rgba(0,0,0,.92))' }} /></>}
    {!full && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 95% 0%, ${palette === 'ivory' ? '#c4a58825' : '#ff9b8e0c'}, transparent 60%)` }} />}
    <div style={{ position: 'absolute', top: vertical ? 104 : 65, left: x, right, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 33, fontWeight: 700, letterSpacing: -1.5 }}>veylo<span style={{ color: accent }}>.</span></div><div style={{ fontSize: 15, letterSpacing: 2.3, textTransform: 'uppercase', opacity: 0.7 }}>For the finished work</div></div>
    <div style={{ position: 'absolute', top, left: x, right, bottom, display: 'flex', flexDirection: 'column' }}>
      {full ? <div style={{ marginTop: scene.textPosition === 'top' ? 65 : scene.textPosition === 'center' ? innerHeight * 0.3 : 'auto' }}>{text()}</div>
        : scene.layout === 'type' ? <div style={{ marginTop: 'auto', marginBottom: 'auto' }}><div style={{ width: 66, height: 4, background: accent, marginBottom: 46 }} />{text(headlineSize * 1.12)}</div>
        : scene.layout === 'split' && vertical ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 34, height: '100%' }}><div>{text(72)}</div><Photo {...photoProps} image={photos[0]} style={{ height: '88%', borderRadius: 3 }} /></div>
        : <><div style={{ height: imageHeight, flexShrink: 0, marginBottom: vertical ? 42 : 27, position: 'relative' }}>
          {scene.layout === 'collage' && photos.length > 1 ? <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', height: '100%', gap: 16 }}><Photo {...photoProps} image={photos[0]} style={{ height: '100%', transform: 'rotate(-2deg)' }} /><div style={{ display: 'grid', gridTemplateRows: photos.length > 2 ? '1fr 1fr' : '1fr', gap: 16, paddingTop: 32 }}><Photo {...photoProps} image={photos[1]} /><Photo {...photoProps} image={photos[2]} /></div></div>
            : scene.layout === 'device' ? <div style={{ width: innerWidth * 0.79, height: '100%', margin: '0 auto', padding: 15, background: '#202124', border: '2px solid #707070', borderRadius: 30, boxShadow: '0 18px 50px #00000025' }}><Photo {...photoProps} image={photos[0]} style={{ height: '100%', borderRadius: 18 }} /></div>
            : <Photo {...photoProps} image={photos[0]} style={{ height: '100%', borderRadius: 2 }} />}
        </div>{text(editorialSize)}</>}
    </div>
    <div style={{ position: 'absolute', bottom: vertical ? 285 : 55, left: x, right, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${full ? '#ffffff40' : palette === 'ivory' ? '#191b1730' : '#ffffff25'}`, paddingTop: 23, color: muted, fontSize: 18 }}><span>veylo.com.ng</span>{!standalone && <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>}</div>
  </AbsoluteFill>;
}
function Subtitles({ words }) {
  const frame = useCurrentFrame();
  const time = frame / 30;
  const wordIndex = words.findIndex(word => time >= word.start && time < word.end + 0.12);
  if (wordIndex < 0) return null;
  const from = Math.floor(wordIndex / 5) * 5;
  return <div style={{ position: 'absolute', bottom: 374, left: 90, right: 150, textAlign: 'center', fontFamily: 'DM Sans, sans-serif', fontSize: 32, fontWeight: 500, lineHeight: 1.4 }}><span style={{ display: 'inline-block', padding: '12px 22px', borderRadius: 8, background: '#070709e8', color: '#fff' }}>{words.slice(from, from + 5).map((word, i) => <React.Fragment key={`${from + i}`}><span style={{ color: from + i === wordIndex ? '#ffb3a7' : '#fff' }}>{word.text}</span>{' '}</React.Fragment>)}</span></div>;
}
export default function ContentComposition(props) {
  const { plan, images = {}, voice = {}, music, effect, still = false, sceneIndex = 0, reducedMotion = false } = props;
  const { durationInFrames } = useVideoConfig();
  const [fontHandle] = useState(() => delayRender('Loading Veylo typefaces'));
  useEffect(() => { let active = true; document.fonts.ready.then(() => { if (active) continueRender(fontHandle); }); return () => { active = false; continueRender(fontHandle); }; }, [fontHandle]);
  if (!plan?.scenes?.length) return <AbsoluteFill style={{ background: '#070709' }} />;
  const entries = timeline(plan, voice, music);
  if (still) {
    const index = Math.min(sceneIndex, plan.scenes.length - 1);
    return <Scene scene={plan.scenes[index]} images={images} palette={plan.palette} frames={1} index={index} count={plan.scenes.length} still cta={plan.cta} standalone={props.format !== 'carousel'} />;
  }
  return <AbsoluteFill style={{ background: '#070709' }}>
    {entries.map(({ scene, from, frames }, index) => <Sequence key={scene.id} from={from} durationInFrames={Math.min(frames + 12, durationInFrames - from)}>
      <Scene scene={scene} images={images} palette={plan.palette} frames={frames} index={index} count={entries.length} reducedMotion={reducedMotion} hasVoice={Boolean(voice[scene.id])} cta={plan.cta} />
    </Sequence>)}
    {entries.map(({ scene, from, frames }) => voice[scene.id] && <Sequence key={`voice-${scene.id}`} from={from} durationInFrames={frames}>
      <Audio src={voice[scene.id].src} volume={0.95} />
      <Subtitles words={voice[scene.id].words || []} />
    </Sequence>)}
    {music?.src && <Audio src={music.src} volume={frame => {
      const fade = Math.min(1, frame / 30, (durationInFrames - frame) / 45);
      const speaking = entries.some(({ scene, from }) => voice[scene.id] && frame >= from - 8 && frame <= from + voice[scene.id].duration * 30 + 8);
      return Math.max(0, fade) * (speaking ? 0.12 : 0.28);
    }} />}
    {effect && entries.slice(1).map(({ scene, from }) => scene.transition !== 'cut' && <Sequence key={`fx-${scene.id}`} from={Math.max(0, from - 3)} durationInFrames={24}><Audio src={effect} volume={0.14} /></Sequence>)}
  </AbsoluteFill>;
}
