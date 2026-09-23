export const FPS = 30;
export function timeline(plan, voice = {}, music = null) {
  let cursor = 0;
  return (plan?.scenes || []).map(scene => {
    const minimum = Math.max(2.5, scene.duration || 4, (voice[scene.id]?.duration || 0) + 0.65);
    const beat = music?.bpm ? 60 / music.bpm : 1 / FPS;
    const seconds = Math.ceil(minimum / beat) * beat;
    const frames = Math.ceil(seconds * FPS);
    const entry = { scene, from: cursor, frames };
    cursor += frames;
    return entry;
  });
}
export function totalFrames(props) {
  if (props.still) return 1;
  const entries = timeline(props.plan, props.voice, props.music);
  return Math.max(1, entries.reduce((sum, entry) => sum + entry.frames, 0));
}
