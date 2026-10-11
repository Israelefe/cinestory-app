import { mkdir, readFile, readdir, stat, statfs, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { runMediaTool } from './videoMedia.service.js';
import { putR2Object, putR2ObjectStream } from './r2.service.js';
import { HLS_SEGMENT_SECONDS } from './videoHls.service.js';

const ladder = [[360, 650000], [480, 1000000], [720, 2000000], [1080, 4000000]];
export function encodingVariants({ width, height }) {
  const short = Math.min(width, height);
  const levels = ladder.filter(([size]) => size <= short);
  if (!levels.length) levels.push([Math.floor(short / 2) * 2, 500000]);
  const variants = levels.map(([size, bitrate]) => {
    const scale = Math.min(size / short, 1920 / Math.max(width, height), 1);
    const w = Math.max(2, Math.floor(width * scale / 2) * 2), h = Math.max(2, Math.floor(height * scale / 2) * 2);
    return { name: `q${Math.min(w, h)}`, width: w, height: h, bitrate };
  });
  return variants.filter((row, index) => variants.findIndex(other => other.name === row.name) === index);
}
export function parseHlsPlaylist(text, duration) {
  const segments = []; let seconds;
  if (!text.startsWith('#EXTM3U') || !text.includes('#EXT-X-ENDLIST')) throw new Error('Incomplete playback playlist.');
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) seconds = Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#')) {
      if (line !== `s${String(segments.length).padStart(6, '0')}.ts` || !Number.isFinite(seconds) || seconds <= 0 || seconds > 12) throw new Error('Invalid playback segment.');
      segments.push({ seconds }); seconds = undefined;
    }
  }
  const total = segments.reduce((sum, row) => sum + row.seconds, 0);
  if (!segments.length || segments.length > 2000 || Math.abs(total - duration) > Math.max(2, duration * .001)) throw new Error('Playback duration did not match the original.');
  return segments;
}
export async function encodeAdaptiveVideo({ file, directory, metadata, prefix, guard = async () => {} }) {
  const variants = []; let totalBytes = 0;
  const maxBytes = 16_000_000_000;
  for (const variant of encodingVariants(metadata)) {
    await guard();
    const output = path.join(directory, variant.name); await mkdir(output);
    // One rendition at a time bounds RAM and scratch space. Uploaded rendition
    // files are removed locally before starting the next quality level.
    const expected = Math.ceil(metadata.duration * (variant.bitrate + 128000) / 8 * 1.3) + 64 * 1024 ** 2;
    const space = await statfs(directory);
    if (space.bavail * space.bsize < expected + 1024 ** 3) throw Object.assign(new Error('Video preparation is waiting for temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
    const check = async () => { await guard(); const free = await statfs(directory); if (free.bavail * free.bsize < 512 * 1024 ** 2) throw Object.assign(new Error('Video preparation ran out of temporary disk space.'), { code: 'VIDEO_DISK_BUSY' }); };
    await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '2', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-i', file,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', `scale=${variant.width}:${variant.height},setsar=1`, '-r', String(metadata.frameRate || 30),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-maxrate', String(variant.bitrate), '-bufsize', String(variant.bitrate * 2), '-sc_threshold', '0', '-force_key_frames', `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-max_muxing_queue_size', '1024',
      '-f', 'hls', '-hls_time', String(HLS_SEGMENT_SECONDS), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(output, 's%06d.ts'), '-y', path.join(output, 'index.m3u8')], { timeoutMs: 12 * 3600_000, guard: check });
    await guard();
    const text = await readFile(path.join(output, 'index.m3u8'), 'utf8');
    const segments = parseHlsPlaylist(text, metadata.duration);
    const files = await readdir(output);
    if (files.length !== segments.length + 1) throw new Error('Unexpected playback output.');
    for (let offset = 0; offset < segments.length; offset += 4) {
      await guard();
      const batch = await Promise.all(segments.slice(offset, offset + 4).map(async (_, index) => {
        const name = `s${String(offset + index).padStart(6, '0')}.ts`; const local = path.join(output, name);
        const info = await stat(local); if (!info.isFile() || info.size < 1 || info.size > 32_000_000) throw new Error('Playback segment exceeds its bounds.');
        segments[offset + index].bytes = info.size; return { name, local, bytes: info.size };
      }));
      totalBytes += batch.reduce((sum, row) => sum + row.bytes, 0);
      if (totalBytes > maxBytes) throw new Error('Playback copies exceed the preparation storage limit.');
      const results = await Promise.allSettled(batch.map(row => putR2ObjectStream(prefix + variant.name + '/' + row.name, createReadStream(row.local), { bytes: row.bytes, contentType: 'video/mp2t' })));
      const failed = results.find(row => row.status === 'rejected'); if (failed) throw failed.reason;
    }
    const playlist = Buffer.from(text); totalBytes += playlist.length;
    await putR2Object(prefix + variant.name + '/index.m3u8', playlist, { contentType: 'application/vnd.apple.mpegurl' });
    const peak = Math.ceil(Math.max(...segments.map(row => row.bytes * 8 / row.seconds)) * 1.1);
    variants.push({ ...variant, bandwidth: peak, playlistBytes: playlist.length, segments });
    if (path.dirname(path.resolve(output)) !== path.resolve(directory)) throw new Error('Unsafe rendition cleanup directory.');
    await rm(output, { recursive: true, force: true });
  }
  const master = Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n' + variants.map(row => `#EXT-X-STREAM-INF:BANDWIDTH=${row.bandwidth},RESOLUTION=${row.width}x${row.height}\n${row.name}/index.m3u8\n`).join(''));
  await guard(); await putR2Object(prefix + 'master.m3u8', master, { contentType: 'application/vnd.apple.mpegurl' });
  return { prefix, masterBytes: master.length, bytes: totalBytes + master.length, variants };
}
