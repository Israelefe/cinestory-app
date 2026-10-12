import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, makeCancelSignal } from '@remotion/renderer';
import { contained, safeFile, hash } from './storage.mjs';
import { probe, run, tool, frameAt, measureLoudness } from './media.mjs';
import { sections } from '../contracts/index.mjs';
import { sectionBudgets } from '../contracts/validators.mjs';

export function layoutScenes(board, timings, seconds, beats = []) {
  let cursor = 0; const output = [], budgets = sectionBudgets(seconds);
  for (const section of sections) {
    const group = board.scenes.filter(scene => scene.section === section), length = Math.round((timings?.[section]?.duration ?? budgets[section]) * 30), start = cursor;
    for (let i = 0; i < group.length; i++) {
      const nominal = start + Math.round((i + 1) * length / group.length);
      const nearby = beats.map(beat => Math.round(beat * 30)).filter(frame => Math.abs(frame - nominal) <= 4 && frame > cursor + 10);
      const end = i === group.length - 1 ? start + length : nearby[0] || nominal;
      output.push({ ...group[i], from: cursor, frames: end - cursor }); cursor = end;
    }
  }
  return output;
}
export async function localAssetServer(config, files) {
  const token = randomBytes(24).toString('hex'), map = new Map();
  for (const relative of files) map.set(hash(relative), await safeFile(config.data, relative));
  const server = http.createServer(async (req, res) => {
    const route = req.url?.split('?')[0], key = route?.slice(token.length + 2), filename = route?.startsWith('/' + token + '/') && map.get(key);
    if (!filename || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
    try {
      const stat = await fs.stat(filename); let start = 0, end = stat.size - 1;
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); if (start > end) { res.writeHead(416).end(); return; } }
      const types = { '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
      res.writeHead(range ? 206 : 200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, max-age=3600', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}) });
      if (req.method === 'HEAD') { res.end(); return; }
      const { createReadStream } = await import('node:fs'); createReadStream(filename, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/${token}/`;
  return { url: relative => origin + hash(relative), close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
let cachedBundle;
export async function renderVideo({ config, job, board, media, voice, music, mix, captures = [], preview = false, silent = false, debug = false, signal, progress = () => {} }) {
  await fs.copyFile(await safeFile(config.repo, 'client/public/veylo/fonts/event-coverage/outfit-normal-latin.woff2'), contained(config.data, 'assets/studio-outfit.woff2'));
  await fs.copyFile(await safeFile(config.repo, 'client/public/veylo/fonts/event-coverage/outfit-OFL.txt'), contained(config.data, 'assets/studio-outfit-OFL.txt'));
  const files = Object.values(media).map(item => item.path); if (!silent && (mix?.path || voice?.path)) files.push(mix?.path || voice.path);
  files.push('assets/studio-outfit.woff2');
  const server = await localAssetServer(config, files);
  try {
    const assets = Object.fromEntries(Object.entries(media).map(([id, asset]) => [id, { ...asset, url: server.url(asset.path) }]));
    const scenes = layoutScenes(board, voice?.timings, job.brief.seconds, music?.beatMap?.beats || []);
    const inputProps = { scenes, assets, words: silent ? [] : voice?.words || [], audio: silent ? undefined : mix?.path ? server.url(mix.path) : voice?.path ? server.url(voice.path) : undefined, debug, fontUrl: server.url('assets/studio-outfit.woff2') };
    progress(.03, 'Preparing deterministic Remotion templates.');
    if (!cachedBundle) cachedBundle = await bundle({ entryPoint: path.join(config.root, 'src/render/Composition.jsx'), publicDir: null, outDir: path.join(config.data, 'temp/remotion-bundle'), onProgress: p => progress(.03 + p / 100 * .07, 'Bundling render templates.') });
    const chrome = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.env.CHROME_PATH;
    const browserExecutable = chrome && await fs.access(chrome).then(() => chrome).catch(() => undefined);
    const composition = await selectComposition({ serveUrl: cachedBundle, id: 'VeyloStudio', inputProps, browserExecutable });
    const relative = `jobs/${job.id}/renders/${job.revision}-${preview ? 'preview' : 'final'}${debug ? '-safe' : ''}.mp4`;
    const target = contained(config.data, relative); await fs.mkdir(path.dirname(target), { recursive: true });
    const cancellation = makeCancelSignal(); const abort = () => cancellation.cancel(); signal?.addEventListener('abort', abort, { once: true });
    try { if (signal?.aborted) throw signal.reason; await renderMedia({ serveUrl: cachedBundle, composition, inputProps, codec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', audioSampleRate: 48000, crf: preview ? 26 : 18, scale: preview ? .5 : 1, concurrency: 1, browserExecutable, outputLocation: target, cancelSignal: cancellation.cancelSignal, timeoutInMilliseconds: 90000, onProgress: result => progress(.1 + result.progress * .8, `Rendering ${Math.round(result.progress * 100)}%.`) }); }
    finally { signal?.removeEventListener('abort', abort); }
    const fast = target + '.fast.mp4';
    const renderedInfo = await probe(target, signal);
    const encoding = renderedInfo.pixelFormat === 'yuv420p' ? ['-c', 'copy'] : ['-vf', 'scale=in_range=auto:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', preview ? '23' : '18', '-color_range', 'tv', '-c:a', 'copy'];
    await run(tool('ffmpeg'), ['-y', '-v', 'error', '-i', target, ...encoding, '-movflags', '+faststart', fast], { signal }); await fs.rename(fast, target);
    const cover = relative.replace('.mp4', '-cover.png');
    const coverScene = scenes.find(scene => scene.id === board.coverSceneId) || scenes.at(-1);
    await renderStill({ serveUrl: cachedBundle, composition, inputProps: { ...inputProps, debug: false }, output: contained(config.data, cover), frame: coverScene.from + Math.min(28, coverScene.frames - 1), imageFormat: 'png', browserExecutable });
    const info = await probe(target, signal);
    if (info.width !== (preview ? 540 : 1080) || info.height !== (preview ? 960 : 1920) || info.videoCodec !== 'h264' || info.pixelFormat !== 'yuv420p' || Math.abs(info.duration - job.brief.seconds) > .15) throw new Error('The rendered file failed its output specification.');
    if (!silent && (info.audioCodec !== 'aac' || info.sampleRate !== 48000)) throw new Error('The output audio must be AAC at 48 kHz.');
    const loudness = !silent && !preview ? await measureLoudness(target, signal) : null;
    progress(.95, 'Checking sampled frames and output metadata.');
    const samples = [];
    for (const second of [0, Math.min(3, info.duration - .1), info.duration / 2, info.duration - .2]) { const frame = relative.replace('.mp4', `-${Math.round(second * 100)}.png`); await frameAt(target, contained(config.data, frame), second, signal); samples.push(frame); }
    return { path: relative, cover, samples, info: { ...info, streams: undefined }, loudness, layoutChecked: true, scenes, inputDigest: hash({ board, media: Object.values(media).map(item => item.sha256 || item.digest), voice, music, debug, silent, templates: hash(await fs.readFile(path.join(config.root, 'src/render/Composition.jsx'))), font: hash(await fs.readFile(contained(config.data, 'assets/studio-outfit.woff2'))) }), silent, preview, debug, seed: 0, createdAt: new Date().toISOString() };
  } finally { await server.close(); }
}
