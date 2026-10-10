import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir, lstat, statfs } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { getR2ObjectStream } from './r2.service.js';

export function frameTimestamps(duration) {
  const count = duration <= 60 ? 12 : duration <= 600 ? 24 : duration <= 3600 ? 60 : 120;
  return Array.from({ length: count }, (_, index) => Math.round((duration * (index + .5) / count) * 100) / 100);
}

export function runMediaTool(tool, args, { timeoutMs = 120_000, maxOutput = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env[tool === 'ffprobe' ? 'FFPROBE_PATH' : 'FFMPEG_PATH'] || tool, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } });
    const chunks = []; let bytes = 0; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(Object.assign(new Error('This video took too long to inspect. Try a standard MP4 export.'), { code: 'VIDEO_MEDIA_TIMEOUT' })); }, timeoutMs);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > maxOutput) { child.kill('SIGKILL'); finish(new Error('Video inspection output exceeded its limit.')); } else chunks.push(chunk); });
    child.stderr.on('data', () => {}); // Provider paths and media metadata never enter logs.
    child.once('error', () => finish(Object.assign(new Error('The video media worker is unavailable.'), { code: 'VIDEO_MEDIA_UNAVAILABLE' })));
    child.once('close', code => finish(code ? Object.assign(new Error('This export could not be decoded. Try MP4 with H.264 video and AAC audio.'), { code: 'VIDEO_INVALID_MEDIA' }) : null, Buffer.concat(chunks).toString('utf8')));
  });
}

export async function withLocalVideo(asset, work) {
  const extension = asset.filename.split('.').pop().toLowerCase();
  if (!['mp4', 'mov', 'webm'].includes(extension)) throw new Error('Unsupported video container.');
  const directory = await mkdtemp(path.join(tmpdir(), 'veylo-video-'));
  const file = path.join(directory, 'original.' + extension);
  try {
    const disk = await statfs(directory);
    if (disk.bavail * disk.bsize < asset.bytes + 1024 ** 3) throw Object.assign(new Error('Video preparation is waiting for temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
    const resource = await getR2ObjectStream(asset.objectKey, { timeoutMs: 15 * 60_000 });
    if (resource.bytes !== asset.bytes) { await resource.body?.cancel(); throw new Error('The original file size changed.'); }
    const hash = crypto.createHash('sha256'); let bytes = 0;
    const guard = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; if (bytes > asset.bytes) return done(new Error('Video exceeds its reserved size.')); hash.update(chunk); done(null, chunk); } });
    await pipeline(Readable.fromWeb(resource.body), guard, createWriteStream(file, { flags: 'wx' }));
    if (bytes !== asset.bytes) throw new Error('The original transfer was incomplete.');
    return await work({ file, directory, checksum: hash.digest('hex') });
  } finally {
    const target = path.resolve(directory);
    if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('veylo-video-')) throw new Error('Unsafe media cleanup path.');
    await rm(target, { recursive: true, force: true });
  }
}

export async function cleanupVideoTemps(now = Date.now()) {
  const root = path.resolve(tmpdir());
  for (const name of await readdir(root)) {
    if (!/^veylo-video-[a-z\d]+$/i.test(name)) continue;
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root) continue;
    const info = await lstat(target).catch(() => null);
    // Ignore links and recent work; remove only our abandoned directories.
    if (info?.isDirectory() && !info.isSymbolicLink() && now - info.mtimeMs > 86400_000) await rm(target, { recursive: true, force: true });
  }
}

export async function inspectLocalVideo(file, maxDuration) {
  const output = await runMediaTool('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-show_streams', '-show_format', '-of', 'json', file]);
  const metadata = JSON.parse(output);
  const video = metadata.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = metadata.streams?.find(stream => stream.codec_type === 'audio');
  const duration = Number(metadata.format?.duration || video?.duration);
  if (!video || !Number.isFinite(duration) || duration < .1 || duration > maxDuration || !Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width > 8192 || video.height > 8192 || video.width < 1 || video.height < 1) throw Object.assign(new Error('Choose a playable video within the duration and export limits.'), { code: 'VIDEO_INVALID_MEDIA' });
  const rotation = Number(video.side_data_list?.find(item => Number.isFinite(item.rotation))?.rotation || video.tags?.rotate || 0);
  return { duration, width: Math.abs(rotation) % 180 === 90 ? video.height : video.width, height: Math.abs(rotation) % 180 === 90 ? video.width : video.height, rotation, videoCodec: video.codec_name, audioCodec: audio?.codec_name || '' };
}

export async function extractVideoFrame(file, directory, seconds, index = 0) {
  const output = path.join(directory, 'frame-' + index + '.jpg');
  await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-ss', String(seconds), '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-q:v', '4', '-y', output], { timeoutMs: 60_000 });
  const buffer = await readFile(output);
  if (buffer.length > 2_000_000) throw new Error('Frame exceeded its size limit.');
  return buffer;
}

export async function extractSpeechChunk(file, directory, start, duration, index) {
  const output = path.join(directory, 'speech-' + index + '.mp3');
  await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-ss', String(start), '-i', file, '-t', String(duration), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-y', output], { timeoutMs: 180_000 });
  const buffer = await readFile(output);
  if (buffer.length > 5_000_000) throw new Error('Audio chunk exceeded its size limit.');
  return buffer;
}
