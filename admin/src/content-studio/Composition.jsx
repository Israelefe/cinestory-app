import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import { timeline } from './timing.js';

const palettes = {
  ember: { background: '#0a0a0c', paper: '#141418', ink: '#ffffff', muted: '#a1a1aa', accent: '#ff5a47', highlight: '#ff9b8e' },
  ivory: { background: '#f5f3ef', paper: '#ffffff', ink: '#18181b', muted: '#71717a', accent: '#963e30', highlight: '#c46859' },
  ink: { background: '#050708', paper: '#0e1113', ink: '#f4f4f5', muted: '#9ca3af', accent: '#38bdf8', highlight: '#7dd3fc' }
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// 3D Perspective Smartphone Frame with auto-scroll and mixed media (video or photo)
function Device3D({ media, frame, frames, still, style }) {
  if (!media?.src) return null;
  const progress = still ? 0.3 : Math.min(1, Math.max(0, frame / frames));
  const tiltX = still ? 0 : interpolate(frame, [0, 18], [10, 0], clamp);
  const tiltY = still ? 0 : interpolate(frame, [0, 18], [-5, 0], clamp);
  const scale = still ? 1 : interpolate(frame, [0, 18], [0.92, 1], clamp);
  const translateY = still ? 0 : interpolate(frame, [0, 18], [50, 0], clamp);
  const scrollY = still ? -120 : interpolate(frame, [15, frames], [0, -280], clamp);

  const isVideo = media.kind === 'video';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1200,
        ...style
      }}
    >
      <div
        style={{
          width: 380,
          height: 640,
          background: '#16171b',
          borderRadius: 44,
          padding: 12,
          border: '3px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 35px 90px -15px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
          transform: `translateY(${translateY}px) scale(${scale}) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Dynamic Island / Speaker */}
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', width: 90, height: 22, background: '#000', borderRadius: 20, zIndex: 10 }} />
        
        {/* Screen Content Window */}
        <div style={{ width: '100%', height: '100%', borderRadius: 32, overflow: 'hidden', background: '#070709', position: 'relative' }}>
          {isVideo ? (
            <OffthreadVideo
              src={media.src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `translateY(${scrollY}px)`
              }}
            />
          ) : (
            <Img
              src={media.src}
              style={{
                width: '100%',
                height: 'auto',
                minHeight: '100%',
                objectFit: 'cover',
                transform: `translateY(${scrollY}px)`
              }}
            />
          )}

          {/* Glass Specular Glare */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 40%, transparent 60%)',
              pointerEvents: 'none'
            }}
          />
        </div>
      </div>
    </div>
  );
}

// WhatsApp Hook Notification Card with Spring Arrival
function WhatsAppHook({ frame, fps }) {
  const arrive = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const translateY = (1 - arrive) * 60;
  const scale = 0.9 + arrive * 0.1;

  return (
    <div
      style={{
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity: arrive,
        background: 'rgba(28, 30, 36, 0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 20,
        padding: '18px 24px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        maxWidth: 580,
        margin: '0 auto 28px'
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#fff', fontWeight: 700 }}>
        W
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ fontSize: 18, color: '#fff' }}>Bride (Kemi) · WhatsApp</strong>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>now</span>
        </div>
        <p style={{ margin: 0, fontSize: 16, color: '#e4e4e7', lineHeight: 1.3 }}>
          "Hi! Are our wedding photos ready yet? Everyone is asking 🥺"
        </p>
      </div>
    </div>
  );
}

// Editorial High-Res Photo Reveal with Camera Shutter Flash
function EditorialPhoto({ image, scene, frame, frames, still }) {
  if (!image?.src) return null;
  const progress = still ? 0.3 : Math.min(1, Math.max(0, frame / frames));
  const zoom = 1 + progress * 0.06;
  const flash = still ? 0 : interpolate(frame, [4, 7, 12], [0, 0.45, 0], clamp);

  const isVideo = image.kind === 'video';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
      {isVideo ? (
        <OffthreadVideo
          src={image.src}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }}
        />
      ) : (
        <Img
          src={image.src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${scene.focalPoint.x}% ${scene.focalPoint.y}%`,
            transform: `scale(${zoom})`
          }}
        />
      )}
      {/* Camera Shutter Flash effect */}
      {flash > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(255,255,255,${flash})`, pointerEvents: 'none' }} />}
      {/* Subtle vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} />
    </div>
  );
}

// Mask-Reveal Kinetic Headline & Text
function MaskText({ headline, body, eyebrow, accent, frame, fps }) {
  const arrive = spring({ frame, fps, config: { damping: 22, stiffness: 200 } });
  const translateY = (1 - arrive) * 100;

  return (
    <div style={{ position: 'relative', zIndex: 10 }}>
      {eyebrow && (
        <div style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ transform: `translateY(${translateY}%)`, fontSize: 16, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: accent }}>
            {eyebrow}
          </div>
        </div>
      )}
      <div style={{ overflow: 'hidden' }}>
        <h2 style={{ transform: `translateY(${translateY}%)`, fontSize: 58, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, margin: 0, color: '#fff' }}>
          {headline}
        </h2>
      </div>
      {body && (
        <div style={{ overflow: 'hidden', marginTop: 16 }}>
          <p style={{ transform: `translateY(${translateY}%)`, fontSize: 24, lineHeight: 1.4, color: '#d4d4d8', maxWidth: 640, margin: 0 }}>
            {body}
          </p>
        </div>
      )}
    </div>
  );
}

// Scene Container Component
function Scene({ scene, images, palette, frames, index, count, still, reducedMotion, cta }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = palettes[palette] || palettes.ember;
  const photos = (scene.assetIds || []).map(id => images[id]).filter(Boolean);
  const primaryMedia = photos[0] || Object.values(images)[0] || null;

  const isHook = scene.sceneType === 'whatsapp_hook' || scene.beat === 'hook' || index === 0;
  const isDevice = scene.sceneType === 'device_scroll' || scene.layout === 'device';
  const isOutro = scene.sceneType === 'outro_cta' || scene.beat === 'cta' || index === count - 1;

  return (
    <AbsoluteFill
      style={{
        background: p.background,
        color: p.ink,
        fontFamily: 'DM Sans, sans-serif',
        padding: '160px 80px 320px 80px', // Strict Social Safe Zone Compliance
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden'
      }}
    >
      {/* Background Ambient Warm Glow */}
      <div style={{ position: 'absolute', top: '-15%', right: '-15%', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${p.accent}20 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', left: '-15%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${p.highlight}15 0%, transparent 70%)`, pointerEvents: 'none' }} />

      {/* Top Brand Tag */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>
          veylo<span style={{ color: p.accent }}>.</span>
        </div>
        <div style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: p.muted, fontWeight: 600 }}>
          For the finished work
        </div>
      </div>

      {/* Main Center Stage */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 5, margin: '30px 0' }}>
        {isHook && <WhatsAppHook frame={frame} fps={fps} />}

        {isDevice && primaryMedia ? (
          <Device3D media={primaryMedia} frame={frame} frames={frames} still={still} style={{ height: 620 }} />
        ) : !isDevice && primaryMedia ? (
          <div style={{ height: 520, marginBottom: 24 }}>
            <EditorialPhoto image={primaryMedia} scene={scene} frame={frame} frames={frames} still={still} />
          </div>
        ) : null}

        <MaskText
          headline={scene.headline}
          body={scene.body}
          eyebrow={scene.eyebrow}
          accent={p.accent}
          frame={frame}
          fps={fps}
        />
      </div>

      {/* Bottom CTA & Safe Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, zIndex: 10 }}>
        <span style={{ color: p.muted, fontSize: 18, fontWeight: 500 }}>veylo.com.ng</span>
        <span style={{ color: p.accent, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{isOutro ? cta : 'Start free'}</span>
          <span>→</span>
        </span>
      </div>
    </AbsoluteFill>
  );
}

// CapCut-Style Animated Subtitles
function Subtitles({ words }) {
  const frame = useCurrentFrame();
  const time = frame / 30;
  if (!words || !words.length) return null;

  const wordIndex = words.findIndex(w => time >= w.start && time < w.end + 0.12);
  if (wordIndex < 0) return null;

  const startIdx = Math.max(0, wordIndex - 2);
  const slice = words.slice(startIdx, startIdx + 5);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 340, // Inside safe area
        left: 60,
        right: 60,
        textAlign: 'center',
        zIndex: 50,
        pointerEvents: 'none'
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          borderRadius: 14,
          background: 'rgba(10, 10, 12, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#fff',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 32,
          fontWeight: 700,
          boxShadow: '0 10px 35px rgba(0,0,0,0.5)'
        }}
      >
        {slice.map((w, i) => {
          const isCurrent = startIdx + i === wordIndex;
          return (
            <React.Fragment key={`${startIdx + i}-${w.text}`}>
              <span
                style={{
                  color: isCurrent ? '#ff9b8e' : '#fff',
                  transform: isCurrent ? 'scale(1.12)' : 'scale(1)',
                  display: 'inline-block',
                  transition: 'transform 0.08s ease'
                }}
              >
                {w.text}
              </span>{' '}
            </React.Fragment>
          );
        })}
      </span>
    </div>
  );
}

// Master Content Composition
export default function ContentComposition(props) {
  const { plan, images = {}, voice = {}, music, effect, still = false, sceneIndex = 0, reducedMotion = false } = props;
  const { durationInFrames } = useVideoConfig();
  const [fontHandle] = useState(() => delayRender('Loading Veylo typefaces'));

  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) continueRender(fontHandle);
    });
    return () => {
      active = false;
      continueRender(fontHandle);
    };
  }, [fontHandle]);

  if (!plan?.scenes?.length) return <AbsoluteFill style={{ background: '#0a0a0c' }} />;

  const entries = timeline(plan, voice, music);

  if (still) {
    const idx = Math.min(sceneIndex, plan.scenes.length - 1);
    return (
      <Scene
        scene={plan.scenes[idx]}
        images={images}
        palette={plan.palette}
        frames={1}
        index={idx}
        count={plan.scenes.length}
        still
        cta={plan.cta}
      />
    );
  }

  return (
    <AbsoluteFill style={{ background: '#0a0a0c' }}>
      {/* Video Visual Sequences */}
      {entries.map(({ scene, from, frames }, index) => (
        <Sequence key={scene.id} from={from} durationInFrames={Math.min(frames + 12, durationInFrames - from)}>
          <Scene
            scene={scene}
            images={images}
            palette={plan.palette}
            frames={frames}
            index={index}
            count={entries.length}
            reducedMotion={reducedMotion}
            cta={plan.cta}
          />
        </Sequence>
      ))}

      {/* Voiceover Audio Layers */}
      {entries.map(({ scene, from, frames }) => voice[scene.id]?.src && (
        <Sequence key={`voice-${scene.id}`} from={from} durationInFrames={frames}>
          <Audio src={voice[scene.id].src} volume={1.0} />
          <Subtitles words={voice[scene.id].words || []} />
        </Sequence>
      ))}

      {/* Background Music with Automatic Sidechain Ducking */}
      {music?.src && (
        <Audio
          src={music.src}
          volume={frame => {
            const fade = Math.min(1, frame / 20, (durationInFrames - frame) / 30);
            const isSpeaking = entries.some(
              ({ scene, from }) => voice[scene.id] && frame >= from - 6 && frame <= from + (voice[scene.id].duration || 4) * 30 + 6
            );
            return Math.max(0, fade) * (isSpeaking ? 0.12 : 0.38);
          }}
        />
      )}

      {/* Scene Transition Audio Effects */}
      {effect && entries.slice(1).map(({ scene, from }) => (
        <Sequence key={`fx-${scene.id}`} from={Math.max(0, from - 2)} durationInFrames={25}>
          <Audio src={effect} volume={0.22} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
