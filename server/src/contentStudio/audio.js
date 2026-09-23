// Original instrumental cues, synthesized locally. No third-party recording is sampled.
const RATE = 24000;
export const MUSIC = { warm: { bpm: 84, chords: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]] }, editorial: { bpm: 108, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]] }, bright: { bpm: 116, chords: [[48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57]] } };
function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buffer;
}
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function noise(i) { const value = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return (value - Math.floor(value)) * 2 - 1; }
export function makeScore(mood, duration) {
  const { bpm, chords } = MUSIC[mood] || MUSIC.warm;
  const beat = 60 / bpm;
  const samples = new Float32Array(Math.ceil(Math.min(150, duration) * RATE));
  const frequencies = chords.map(chord => chord.map(hz));
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    const bar = Math.floor(t / (beat * 4));
    const notes = frequencies[bar % frequencies.length];
    const inBar = t % (beat * 4);
    const beatTime = t % beat;
    const padEnvelope = Math.min(1, inBar / 0.2, (beat * 4 - inBar) / 0.35);
    let sample = 0;
    for (const f of notes) sample += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.0015 * t) * 0.25) * 0.055 * padEnvelope;
    const step = Math.floor(t / (beat / 2));
    const pluckTime = t % (beat / 2);
    const f = notes[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]] * 2;
    sample += (Math.sin(2 * Math.PI * f * pluckTime) + 0.18 * Math.sin(4 * Math.PI * f * pluckTime)) * Math.exp(-pluckTime * 9) * 0.15 * Math.min(1, pluckTime * 150);
    if (mood !== 'warm') {
      sample += Math.sin(2 * Math.PI * (48 * beatTime + 45 * (1 - Math.exp(-beatTime * 30)) / 30)) * Math.exp(-beatTime * 16) * 0.22;
      const halfBeatTime = t % (beat / 2);
      sample += noise(i) * Math.exp(-halfBeatTime * 100) * 0.035;
      if (Math.floor(t / beat) % 2) sample += noise(i) * Math.exp(-beatTime * 45) * 0.045;
    }
    sample *= Math.min(1, t / 1.3, (duration - t) / 2);
    samples[i] = Math.tanh(sample * 1.1) * 0.8;
  }
  return { buffer: wav(samples), bpm };
}
export function makeTransitionSound() {
  const samples = new Float32Array(Math.floor(RATE * 0.7));
  let filtered = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = i / samples.length;
    filtered = filtered * 0.91 + noise(i) * 0.09;
    samples[i] = filtered * Math.sin(Math.PI * p) ** 2 * 0.65;
  }
  return wav(samples);
}
