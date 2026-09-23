// Professional sound design and synthesized audio cues (44.1kHz commercial standard)
const RATE = 44100;

export const MUSIC = {
  warm: { bpm: 88, root: 60, scale: [0, 4, 7, 11] },
  editorial: { bpm: 104, root: 57, scale: [0, 3, 7, 10] },
  bright: { bpm: 116, root: 62, scale: [0, 4, 7, 9] }
};

function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

const hz = midi => 440 * 2 ** ((midi - 69) / 12);

function pinkNoise(seed) {
  return ((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1) * 2 - 1;
}

// Realistic mechanical camera shutter sound (dual mirror-click transient)
export function makeCameraShutterSound() {
  const length = Math.floor(RATE * 0.35);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    // Click 1 (Curtain open at 0ms)
    const click1 = Math.exp(-t * 120) * Math.sin(2 * Math.PI * 850 * t) * 0.7;
    const body1 = Math.exp(-t * 40) * Math.sin(2 * Math.PI * 180 * t) * 0.4;
    // Click 2 (Mirror slap at 70ms)
    const t2 = Math.max(0, t - 0.07);
    const click2 = (t > 0.07 ? Math.exp(-t2 * 140) * Math.sin(2 * Math.PI * 1200 * t2) * 0.8 : 0);
    const noise = Math.exp(-t * 60) * pinkNoise(i) * 0.15;
    samples[i] = (click1 + body1 + click2 + noise) * 0.85;
  }
  return wav(samples);
}

// Subtle iOS/WhatsApp message pop chime
export function makeMessagePingSound() {
  const length = Math.floor(RATE * 0.45);
  const samples = new Float32Array(length);
  const f1 = hz(76); // High E
  const f2 = hz(81); // High A
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const env = Math.exp(-t * 14);
    const tone = (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * env;
    samples[i] = tone * 0.45;
  }
  return wav(samples);
}

// Cinematic low-end transition whoosh
export function makeTransitionSound() {
  const length = Math.floor(RATE * 0.65);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const p = i / length;
    const env = Math.sin(Math.PI * p) ** 2;
    const sweepHz = 80 + Math.sin(p * Math.PI) * 220;
    const sub = Math.sin(2 * Math.PI * sweepHz * (i / RATE)) * 0.4;
    const air = pinkNoise(i) * 0.25;
    samples[i] = (sub + air) * env * 0.55;
  }
  return wav(samples);
}

// Warm, cinematic ambient score with harmonic chords and soft filtered textures
export function makeScore(mood, duration) {
  const cfg = MUSIC[mood] || MUSIC.warm;
  const beat = 60 / cfg.bpm;
  const total = Math.ceil(Math.min(180, duration) * RATE);
  const samples = new Float32Array(total);
  const chords = [
    [cfg.root, cfg.root + 7, cfg.root + 11, cfg.root + 14],
    [cfg.root - 2, cfg.root + 5, cfg.root + 9, cfg.root + 12],
    [cfg.root - 5, cfg.root + 2, cfg.root + 7, cfg.root + 11],
    [cfg.root - 4, cfg.root + 3, cfg.root + 7, cfg.root + 10]
  ];

  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const bar = Math.floor(t / (beat * 4));
    const chord = chords[bar % chords.length];
    const inBar = t % (beat * 4);
    const padEnv = Math.min(1, inBar / 0.4, (beat * 4 - inBar) / 0.5);

    let sample = 0;
    for (const note of chord) {
      const f = hz(note);
      sample += Math.sin(2 * Math.PI * f * t) * 0.05 * padEnv;
      // Gentle warm overtone
      sample += Math.sin(2 * Math.PI * f * 2.001 * t) * 0.015 * padEnv;
    }

    // Subtle rhythmic pulse on 1st & 3rd beat
    const beatTime = t % beat;
    const pulse = Math.exp(-beatTime * 12) * Math.sin(2 * Math.PI * 55 * beatTime) * 0.08;
    sample += pulse;

    // Smooth intro & outro fades
    sample *= Math.min(1, t / 1.5, (duration - t) / 2);
    samples[i] = Math.tanh(sample * 1.5) * 0.7;
  }

  return { buffer: wav(samples), bpm: cfg.bpm };
}
