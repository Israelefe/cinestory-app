import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { atomicWrite, contained, hash, safeFile } from './storage.mjs';
const require = createRequire(import.meta.url);

export function tool(name) {
  const override = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  if (override) return override;
  const packages = { win32: '@remotion/compositor-win32-x64-msvc', linux: '@remotion/compositor-linux-x64-gnu', darwin: '@remotion/compositor-darwin-' + (process.arch === 'arm64' ? 'arm64' : 'x64') };
  try { return path.join(path.dirname(require.resolve(packages[process.platform] + '/package.json')), name + (process.platform === 'win32' ? '.exe' : '')); }
  catch { return name; }
}
export async function run(binary, args, { signal, timeout = 180000, maxBytes = 5000000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const timer = setTimeout(() => stop(new Error('The media operation timed out.')), timeout);
    function stop(error) { child.kill(); finish(error); }
    function finish(error) { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve({ stdout, stderr }); }
    function abort() { stop(new Error('Cancelled.')); }
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => { stdout += data; if (stdout.length > maxBytes) stop(new Error('Media output exceeded its limit.')); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-maxBytes); });
    child.on('error', error => finish(new Error('Cannot start the media tool: ' + error.message)));
    child.on('close', code => finish(code ? new Error('Media processing failed: ' + stderr.slice(-1500)) : null));
  });
}
export async function probe(filename, signal) {
  const { stdout } = await run(tool('ffprobe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filename], { signal });
  const data = JSON.parse(stdout), video = data.streams.find(stream => stream.codec_type === 'video'), audio = data.streams.find(stream => stream.codec_type === 'audio');
  const fraction = video?.avg_frame_rate?.split('/').map(Number);
  return { duration: Number(data.format.duration), width: video?.width, height: video?.height, fps: fraction?.[1] ? fraction[0] / fraction[1] : 0, videoCodec: video?.codec_name, pixelFormat: video?.pix_fmt, audioCodec: audio?.codec_name, sampleRate: Number(audio?.sample_rate || 0), streams: data.streams };
}
export async function frameAt(filename, output, seconds, signal) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-ss', String(Math.max(0, seconds)), '-i', filename, '-frames:v', '1', '-vf', 'scale=540:-2', output], { signal });
  return output;
}
export async function storeMedia(config, db, buffer, { name = 'upload', kind, generated = false, slotId = '', prompt = '', provenance = {} }, signal) {
  if (!['video', 'music', 'sfx'].includes(kind) || buffer.length > 250 * 1024 * 1024) throw new Error('Choose a video or audio file under 250 MB.');
  const sha = hash(buffer), temporary = contained(config.data, 'temp/' + sha + '.upload');
  await atomicWrite(temporary, buffer);
  try {
    const info = await probe(temporary, signal);
    if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > (kind === 'video' ? 60 : 1200)) throw new Error('Unsupported media duration. Videos must be at most 60 seconds.');
    if (kind === 'video' && (!info.width || !info.height || info.width * info.height > 36000000)) throw new Error('Unsupported video dimensions.');
    if (kind !== 'video' && !info.audioCodec) throw new Error('The upload does not contain audio.');
    const id = (kind === 'video' ? 'vid_' : kind + '_') + sha.slice(0, 24), relative = `assets/${id}.${kind === 'video' ? 'mp4' : 'wav'}`, target = contained(config.data, relative);
    const args = kind === 'video' ? ['-i', temporary, '-an', '-r', '30', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] : ['-i', temporary, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le'];
    await run(tool('ffmpeg'), ['-y', '-v', 'error', ...args, target], { signal });
    const clean = await probe(target, signal);
    const metadata = { ...clean, streams: undefined, generated, consent: false, slotId, prompt, provenance };
    db.prepare('INSERT OR IGNORE INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, relative, kind, name.slice(0, 160), hash(await fs.readFile(target)), JSON.stringify(metadata), 'pending', '', 'upload', Date.now());
    const existing = JSON.parse(db.prepare('SELECT metadata FROM assets WHERE id=?').get(id).metadata);
    if (generated && !existing.generated) db.prepare("UPDATE assets SET metadata=?,rights='pending' WHERE id=?").run(JSON.stringify({ ...existing, generated: true, prompt, slotId, provenance, consent: false }), id);
    return id;
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
export async function beatMap(config, asset, signal) {
  const target = contained(config.data, 'temp/' + asset.id + '-beats.wav');
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-i', await safeFile(config.data, asset.path), '-vn', '-ac', '1', '-ar', '8000', '-t', '300', '-c:a', 'pcm_s16le', target], { signal });
  const raw = waveData(await fs.readFile(target)); await fs.unlink(target);
  const energies = []; const hop = 160;
  for (let offset = 0; offset + hop * 2 <= raw.length; offset += hop * 2) { let e = 0; for (let i = 0; i < hop; i++) e += (raw.readInt16LE(offset + i * 2) / 32768) ** 2; energies.push(Math.sqrt(e / hop)); }
  const onset = energies.map((e, i) => Math.max(0, e - (energies[i - 1] || e)));
  let lag = 0, best = 0;
  for (let k = 17; k <= 60; k++) { let score = 0; for (let i = k; i < onset.length; i++) score += onset[i] * onset[i - k]; if (score > best) { best = score; lag = k; } }
  const bpm = lag ? 60 / (lag * .02) : null;
  const beats = []; if (lag) { let phase = 0, peak = 0; for (let k = 0; k < lag; k++) { let score = 0; for (let i = k; i < onset.length; i += lag) score += onset[i]; if (score > peak) { phase = k; peak = score; } } for (let i = phase; i < onset.length; i += lag) beats.push(Number((i * .02).toFixed(3))); }
  return { bpm, beats, method: 'Energy-onset autocorrelation; advisory, not a guaranteed musical downbeat.' };
}
export function waveData(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WAVE') throw new Error('Expected uncompressed WAV audio.');
  for (let offset = 12; offset + 8 <= buffer.length;) { const length = buffer.readUInt32LE(offset + 4); if (buffer.subarray(offset, offset + 4).toString() === 'data') return buffer.subarray(offset + 8, Math.min(buffer.length, offset + 8 + length)); offset += 8 + length + length % 2; }
  throw new Error('The WAV has no audio samples.');
}
export async function assembleVoice(config, job, clips, budgets, signal) {
  const outputs = []; let offset = 0; const timings = {};
  for (const section of Object.keys(budgets)) {
    const clip = clips[section], info = await probe(await safeFile(config.data, clip.path), signal);
    if (info.duration > budgets[section] + .04) throw new Error(`${section} voice is ${info.duration.toFixed(2)}s, over its ${budgets[section]}s budget. Shorten this line and regenerate it; audio is never sped up.`);
    const relative = `jobs/${job.id}/audio/${job.revision}-${section}-padded.wav`;
    await run(tool('ffmpeg'), ['-y', '-v', 'error', '-i', await safeFile(config.data, clip.path), '-af', 'apad', '-t', String(budgets[section]), '-ar', '48000', '-ac', '2', contained(config.data, relative)], { signal });
    outputs.push(contained(config.data, relative)); timings[section] = { start: offset, duration: budgets[section], measured: info.duration }; offset += budgets[section];
  }
  const output = `jobs/${job.id}/audio/voice-${job.revision}.wav`;
  const args = outputs.flatMap(file => ['-i', file]);
  await run(tool('ffmpeg'), ['-y', '-v', 'error', ...args, '-filter_complex', outputs.map((_, i) => `[${i}:a]`).join('') + `concat=n=${outputs.length}:v=0:a=1[a]`, '-map', '[a]', contained(config.data, output)], { signal });
  return { path: output, timings, duration: offset };
}
export async function mixAudio(config, job, voice, music, cuts, signal, effects = []) {
  const output = `jobs/${job.id}/audio/mix-${job.revision}.wav`, raw = contained(config.data, `jobs/${job.id}/audio/mix-raw-${job.revision}.wav`);
  // PCM envelopes avoid depending on filters omitted from Remotion's FFmpeg build.
  const spokenFile = raw + '.voice.wav', musicFile = raw + '.music.wav', mixFile = raw + '.mix.pcm';
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-i', await safeFile(config.data, voice.path), '-t', String(voice.duration), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', spokenFile], { signal });
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-stream_loop', '-1', '-i', await safeFile(config.data, music.path), '-t', String(voice.duration), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', musicFile], { signal });
  const spoken = waveData(await fs.readFile(spokenFile)), bed = waveData(await fs.readFile(musicFile)), frameCount = Math.round(voice.duration * 48000), pcm = Buffer.alloc(frameCount * 8);
  const effectSamples = [];
  for (const effect of effects.slice(0, 3)) { const filename = raw + '.' + effect.id + '.wav'; await run(tool('ffmpeg'), ['-y', '-v', 'error', '-i', await safeFile(config.data, effect.path), '-t', '2', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', filename], { signal }); effectSamples.push(waveData(await fs.readFile(filename))); await fs.unlink(filename); }
  const hits = cuts.filter(time => time > 0).slice(0, 30); let envelope = 0, peak = 0;
  const attack = Math.exp(-1 / (48000 * .015)), release = Math.exp(-1 / (48000 * .25));
  for (let frame = 0; frame < frameCount; frame++) {
    const t = frame / 48000, offset = frame * 4;
    const left = offset + 4 <= spoken.length ? spoken.readInt16LE(offset) / 32768 : 0, right = offset + 4 <= spoken.length ? spoken.readInt16LE(offset + 2) / 32768 : 0, level = Math.max(Math.abs(left), Math.abs(right));
    const coefficient = level > envelope ? attack : release; envelope = coefficient * envelope + (1 - coefficient) * level;
    const duck = .11 / (1 + Math.max(0, envelope - .02) * 28), fade = Math.max(0, Math.min(1, t / .6, (voice.duration - t) / 1.2));
    let hit = 0; for (const [index, cut] of hits.entries()) { const elapsed = t - cut, effect = effectSamples[index % effectSamples.length]; if (effect && elapsed >= 0) { const position = Math.floor(elapsed * 48000) * 2; if (position + 2 <= effect.length) hit += effect.readInt16LE(position) / 32768 * .2 * Math.min(1, (effect.length - position) / 960); } else if (!effectSamples.length && elapsed >= 0 && elapsed < .09) hit += Math.sin(2 * Math.PI * 270 * elapsed) * .045 * (1 - elapsed / .09) ** 2; }
    for (let channel = 0; channel < 2; channel++) { const background = offset + 4 <= bed.length ? bed.readInt16LE(offset + channel * 2) / 32768 : 0; const sample = (channel ? right : left) + background * duck * fade + hit; peak = Math.max(peak, Math.abs(sample)); pcm.writeFloatLE(sample, frame * 8 + channel * 4); }
  }
  const preGain = peak > .95 ? .95 / peak : 1;
  if (preGain < 1) for (let offset = 0; offset < pcm.length; offset += 4) pcm.writeFloatLE(pcm.readFloatLE(offset) * preGain, offset);
  await atomicWrite(mixFile, pcm);
  await run(tool('ffmpeg'), ['-y', '-v', 'error', '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', mixFile, '-c:a', 'pcm_s16le', raw], { signal });
  for (const filename of [spokenFile, musicFile, mixFile]) await fs.unlink(filename);
  const scan = await run(tool('ffmpeg'), ['-hide_banner', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { signal });
  const match = scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/); if (!match) throw new Error('Loudness measurement failed.');
  const m = JSON.parse(match[0]);
  for (const key of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) if (!Number.isFinite(Number(m[key]))) throw new Error('The audio mix is silent or cannot be normalized.');
  const filter = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
  await run(tool('ffmpeg'), ['-y', '-v', 'info', '-i', raw, '-af', filter, '-ar', '48000', contained(config.data, output)], { signal });
  await fs.unlink(raw);
  return { path: output, targetLUFS: -14, targetTruePeak: -1, preEncodePeakTarget: -1.5, measuredInput: m, preGain, effects: effects.map(effect => effect.id), effectSource: effects.length ? 'Owner-selected cleared library effects' : 'Original procedural cut hits', measuredOutput: await measureLoudness(contained(config.data, output), signal) };
}
export async function measureLoudness(filename, signal) {
  const scan = await run(tool('ffmpeg'), ['-hide_banner', '-i', filename, '-map', '0:a:0', '-vn', '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { signal });
  const match = scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/); if (!match) throw new Error('The final audio loudness could not be measured.');
  const data = JSON.parse(match[0]), integratedLUFS = Number(data.input_i), truePeakDBTP = Number(data.input_tp);
  return { integratedLUFS, truePeakDBTP, passed: Number.isFinite(integratedLUFS) && Math.abs(integratedLUFS + 14) <= 1 && Number.isFinite(truePeakDBTP) && truePeakDBTP <= -1 };
}
