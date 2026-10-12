import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AbsoluteFill, Audio, Composition, Easing, Img, OffthreadVideo, Sequence, interpolate, registerRoot, useCurrentFrame, useVideoConfig, delayRender, continueRender, cancelRender } from 'remotion';
import { fitTextOnNLines } from '@remotion/layout-utils';
import design from '../../knowledge/design-language.json';

export const motionTokens = Object.freeze({ ease: [.22, 1, .36, 1], enter: 14, stagger: 3, cutInterval: 60, safe: { top: 250, bottom: 420, left: 80, right: 120 } });
const ease = Easing.bezier(...motionTokens.ease);
const palette = design.studio;
const font = design.studio.fontFamily;
function Type({ text, size = 92, color = 'white', center = false, maxLines = 4, width = 850 }) {
  const { fontSize } = fitTextOnNLines({ text: String(text), maxLines, maxBoxWidth: width, fontFamily: 'Outfit', maxFontSize: size, fontWeight: '700', letterSpacing: '-0.045em' });
  const frame = useCurrentFrame();
  if (fontSize < 36) throw new Error('Scene copy cannot fit at a readable size. Shorten the text.');
  const tokens = String(text).split(/\s+/);
  return <div data-render-text style={{ fontFamily: font, fontWeight: 700, fontSize: Math.min(size, fontSize), lineHeight: 1.12, letterSpacing: '-0.045em', color, textAlign: center ? 'center' : 'left', maxWidth: 850, overflowWrap: 'anywhere', maxHeight: 800 }}>{tokens.map((word, i) => <span key={i} style={{ display: 'inline-block', marginRight: '.23em', opacity: interpolate(frame - i * 2, [0, 9], [.72, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), transform: `translateY(${interpolate(frame - i * 2, [0, 14], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })}px)` }}>{word}</span>)}</div>;
}
function Media({ asset, preset = 'pushIn', contain = false }) {
  const frame = useCurrentFrame(), { durationInFrames } = useVideoConfig();
  if (!asset) throw new Error('A scene asset was not resolved.');
  const progress = Math.min(1, frame / Math.max(1, durationInFrames));
  const movement = preset === 'drift' ? `translate3d(${Math.sin(frame / 70) * 12}px,${Math.cos(frame / 90) * 10}px,0) scale(1.06)` : preset === 'collage' ? `translate3d(${interpolate(frame, [0, 24], [60, 0], { extrapolateRight: 'clamp', easing: ease })}px,0,0) scale(${1.035 + progress * .04}) rotate(${Math.sin(frame / 80) * .7}deg)` : `scale(${1.025 + progress * .075})`;
  const style = { width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover', transform: preset === 'none' ? undefined : movement };
  return <AbsoluteFill style={{ overflow: 'hidden', clipPath: preset === 'maskedReveal' ? `inset(0 ${interpolate(frame, [0, 20], [100, 0], { extrapolateRight: 'clamp', easing: ease })}% 0 0)` : undefined }}>{asset.kind === 'video' || asset.kind === 'capture' ? <OffthreadVideo src={asset.url} muted loop style={style} /> : <Img src={asset.url} style={style} />}{preset === 'lightSweep' && <AbsoluteFill style={{ background: 'linear-gradient(120deg,transparent 30%,#fff1 50%,transparent 65%)', transform: `translateX(${frame * 8 - 900}px)` }} />}</AbsoluteFill>;
}
function Safe({ children, center = false, bottom = 490 }) { return <AbsoluteFill style={{ top: 260, bottom, left: 100, right: 140, width: 'auto', height: 'auto', justifyContent: center ? 'center' : 'flex-end', gap: 40 }}>{children}</AbsoluteFill>; }
function Caption({ text }) { return text ? <Safe bottom={720}><div style={{ background: '#070709df', padding: '22px 28px', borderLeft: '5px solid ' + palette.strong, alignSelf: 'flex-start', maxWidth: '100%' }}><Type text={text} size={54} width={780} maxLines={3} /></div></Safe> : null; }
export function Scene({ scene, assets, duration }) {
  const f = useCurrentFrame(), p = scene.props;
  const reveal = interpolate(f, [0, 16], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const exit = scene.transitionOut === 'cut' ? 1 : interpolate(f, [duration - 8, duration - 1], [1, .45], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let content;
  if (scene.template === 'HookKinetic' || scene.template === 'BigCaptions' || scene.template === 'StatReveal') {
    const text = scene.template === 'StatReveal' ? p.text.replace(/\b\d+(?:\.\d+)?\b/g, number => { const value = Number(number) * interpolate(f, [0, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }); return number.includes('.') ? value.toFixed(number.split('.')[1].length) : String(Math.round(value)); }) : p.text;
    content = <Safe center><div style={{ width: 72, height: 7, background: palette.strong, marginBottom: 28 }} /><Type text={text} size={scene.template === 'HookKinetic' ? 108 : 92} /><div style={{ marginTop: 30, color: palette.accent, fontSize: 22, letterSpacing: '.24em' }}>VEYLO / FOR PHOTOGRAPHERS</div></Safe>;
  }
  else if (scene.template === 'CTACard') content = <Safe center><div style={{ fontSize: 26, letterSpacing: '.26em', color: palette.accent, marginBottom: 40 }}>VEYLO</div><Type text={p.text} size={96} /><div style={{ marginTop: 50, height: 3, width: 160, background: palette.strong, transform: `scaleX(${reveal})`, transformOrigin: 'left' }} /></Safe>;
  else if (scene.template === 'PhoneDemo' || scene.template === 'UIZoom') {
    const asset = assets[p.clipId], points = (asset?.targets || []).filter(item => p.zoomTargets.includes(item.id)).sort((a, b) => a.at - b.at);
    const time = (f / 30) % Math.max(.01, asset?.duration || duration / 30);
    const before = points.filter(point => point.at <= time).at(-1) || points[0], after = points.find(point => point.at > time && point.id === before?.id);
    const phase = before && after ? Math.min(1, Math.max(0, (time - before.at) / Math.max(.01, after.at - before.at))) : 0;
    const target = before ? { ...before, box: Object.fromEntries(Object.entries(before.box).map(([key, value]) => [key, value + ((after?.box[key] ?? value) - value) * phase])) } : null;
    const zoom = scene.template === 'UIZoom' ? 1.12 : 1;
    const phone = scene.template === 'PhoneDemo', boxWidth = phone ? 762 : 1080, boxHeight = phone ? 1362 : 1380, fit = Math.min(boxWidth / asset.width, boxHeight / asset.height);
    const tx = phone && target ? Math.max(-65, Math.min(65, (asset.width / 2 - target.box.x - target.box.width / 2) * .12)) : 0;
    const ty = phone && scene.motion?.camera === 'followTargets' && target ? Math.max(-50, Math.min(50, (asset.height / 2 - target.box.y - target.box.height / 2) * .06)) : 0;
    const detailScale = !phone && target ? 1 + reveal * 1.25 : 1;
    const pan = (center, extent, sourceExtent) => { const allowance = Math.max(0, (sourceExtent * fit * detailScale - extent) / 2); return Math.max(-allowance, Math.min(allowance, (sourceExtent / 2 - center) * fit * detailScale)); };
    const detailTransform = !phone && target ? `translate(${pan(target.box.x + target.box.width / 2, boxWidth, asset.width)}px,${pan(target.box.y + target.box.height / 2, boxHeight, asset.height)}px) scale(${detailScale})` : undefined;
    content = <><AbsoluteFill style={{ top: 180, bottom: 360, left: phone ? 150 : 0, right: phone ? 150 : 0, width: 'auto', height: 'auto', borderRadius: phone ? 58 : 0, border: phone ? '9px solid #25252a' : 0, overflow: 'hidden', boxShadow: '0 50px 100px #0009', transform: `translate(${tx * reveal}px,${ty * reveal}px) scale(${zoom + Math.sin(f / 100) * .012})` }}><AbsoluteFill style={{ transform: detailTransform }}><Media asset={asset} contain preset="none" />{target && <div style={{ position: 'absolute', left: (boxWidth - asset.width * fit) / 2 + target.box.x * fit, top: (boxHeight - asset.height * fit) / 2 + target.box.y * fit, width: target.box.width * fit, height: target.box.height * fit, border: '3px solid ' + palette.accent, borderRadius: 12, boxShadow: '0 0 0 5px #ff9b8e16', opacity: reveal, pointerEvents: 'none' }} />}</AbsoluteFill></AbsoluteFill><Caption text={p.caption} /></>;
  } else if (scene.template === 'BeforeAfterSplit') content = <><div style={{ position: 'absolute', inset: '0 50% 0 0', overflow: 'hidden', filter: 'saturate(.6)' }}><Media asset={assets[p.slotId]} /></div><div style={{ position: 'absolute', inset: '0 0 0 50%', overflow: 'hidden', borderLeft: '4px solid ' + palette.accent }}><Media asset={assets[p.clipId]} contain /></div><Safe bottom={720}><Type text={p.before + ' / ' + p.after} size={62} /></Safe></>;
  else if (scene.template === 'PainMontage') { const id = p.slotIds[Math.floor(f / 48) % p.slotIds.length]; content = <><Media asset={assets[id]} preset="drift" /><Caption text={p.caption} /></>; }
  else content = <><Media asset={assets[p.slotId]} preset={p.preset} contain={p.framing === 'contain'} /><AbsoluteFill style={{ background: 'linear-gradient(transparent 45%,#070709d0)' }} /><Caption text={p.caption} /></>;
  const entering = scene.section === 'hook' ? 1 : reveal;
  const entryStyle = scene.motion?.enter === 'mask' ? { clipPath: `inset(0 ${(1 - entering) * 100}% 0 0)` } : scene.motion?.enter === 'slide' ? { transform: `translateY(${(1 - entering) * 30}px)` } : scene.motion?.enter === 'fade' ? { opacity: .75 + entering * .25 } : {};
  const camera = scene.motion?.camera === 'drift' ? `translate3d(${Math.sin(f / 90) * 6}px,${Math.sin(f / 110) * 4}px,0)` : scene.motion?.camera === 'pushIn' ? `scale(${1 + Math.min(f / duration, 1) * .015})` : undefined;
  return <AbsoluteFill style={{ background: palette.background, color: 'white', fontFamily: font, overflow: 'hidden', opacity: exit, transform: scene.transitionOut === 'slideWipe' ? `translateX(${(1 - exit) * -30}px)` : undefined }}><AbsoluteFill style={{ background: `radial-gradient(ellipse at ${30 + Math.sin(f / 80) * 10}% 10%,#ff5a4725,transparent 65%)` }} /><AbsoluteFill style={{ ...entryStyle, transform: entryStyle.transform || camera }}>{content}</AbsoluteFill></AbsoluteFill>;
}
export function StudioVideo({ scenes = [], assets = {}, audio, words = [], debug = false, fontUrl }) {
  const [ready, setReady] = useState(!fontUrl), [handle] = useState(() => fontUrl ? delayRender('Loading the local Veylo typeface') : null);
  useEffect(() => { if (!fontUrl) return; const face = new FontFace('Outfit', `url(${fontUrl})`, { weight: '100 900' }); face.load().then(loaded => { document.fonts.add(loaded); setReady(true); continueRender(handle); }).catch(cancelRender); }, [fontUrl, handle]);
  const frame = useCurrentFrame(), { fps } = useVideoConfig(); const current = words.find(word => frame / fps >= word.start && frame / fps < word.end);
  useLayoutEffect(() => {
    if (!ready) return;
    for (const element of [...document.querySelectorAll('[data-render-text]')].flatMap(node => [node, ...node.querySelectorAll('span')])) {
      const rect = element.getBoundingClientRect(), root = element.closest('[data-video-root]')?.getBoundingClientRect(); if (!root?.width) continue;
      const scale = root.width / 1080, x = (rect.left - root.left) / scale, y = (rect.top - root.top) / scale, right = (rect.right - root.left) / scale, bottom = (rect.bottom - root.top) / scale;
      if (x < 76 || y < 246 || right > 964 || bottom > 1504) cancelRender(new Error('Promotional text overflows at frame ' + frame + ': ' + JSON.stringify({ x, y, right, bottom, scroll: element.scrollHeight, height: element.clientHeight, text: element.textContent.slice(0, 100) })));
    }
  }, [frame, ready]);
  if (!ready) return <AbsoluteFill style={{ background: palette.background }} />;
  const group = current ? words.filter(word => Math.floor(word.start / 1.6) === Math.floor(current.start / 1.6)) : [];
  return <AbsoluteFill data-video-root style={{ background: palette.background }}>{scenes.map(scene => <Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames}><Scene scene={scene} assets={assets} duration={scene.frames} /></Sequence>)}{audio && <Audio src={audio} />}{current && <div data-render-text style={{ position: 'absolute', bottom: 450, left: 85, right: 125, textAlign: 'center', fontFamily: font, fontSize: 47, lineHeight: 1.25, fontWeight: 700, textShadow: '0 2px 8px #000', background: '#070709d9', padding: 16, borderRadius: 16 }}>{group.map((word, i) => <span key={i} style={{ display: 'inline-block', color: word === current ? palette.accent : 'white', marginRight: 10 }}>{word.word}</span>)}</div>}{debug && <><div style={{ position: 'absolute', inset: '250px 120px 420px 80px', border: '3px dashed #00ffbf', pointerEvents: 'none' }} /><div style={{ position: 'absolute', top: 60, left: 40, color: '#00ffbf', font: '26px monospace' }}>SAFE ZONE / {frame}</div></>}</AbsoluteFill>;
}
export const metadata = ({ props }) => ({ durationInFrames: Math.max(1, ...props.scenes.map(scene => scene.from + scene.frames)), fps: 30, width: 1080, height: 1920 });
function Root() { return <Composition id="VeyloStudio" component={StudioVideo} durationInFrames={960} width={1080} height={1920} fps={30} defaultProps={{ scenes: [], assets: {} }} calculateMetadata={metadata} />; }
registerRoot(Root);
