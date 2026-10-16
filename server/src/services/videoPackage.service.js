import { mkdir, open, readFile, stat, statfs, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { runMediaTool } from './videoMedia.service.js';
import { parseHlsPlaylist } from './videoPlaylist.service.js';
import { putR2Object, putR2ObjectStream } from './r2.service.js';
import { HLS_SEGMENT_SECONDS } from './videoHls.service.js';

// Stream copy cannot close an open GOP. Only use a TS segment when its first
// H.264 picture is an IDR, so seeking never needs frames from the previous file.
async function startsWithIndependentPicture(file) {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let videoPid; const parts = [];
    for (let offset = 0; offset + 188 <= bytesRead; offset += 188) {
      const packet = buffer.subarray(offset, offset + 188); if (packet[0] !== 0x47) return false;
      const control = packet[3] >> 4 & 3; if (!(control & 1)) continue;
      const pid = (packet[1] & 31) << 8 | packet[2];
      const start = control === 3 ? 5 + packet[4] : 4; if (start >= 188) continue;
      let payload = packet.subarray(start);
      if (packet[1] & 0x40) {
        if (payload.length < 9 || payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1 || payload[3] < 0xe0 || payload[3] > 0xef) continue;
        if (videoPid === undefined) videoPid = pid;
        if (pid !== videoPid || 9 + payload[8] >= payload.length) continue;
        payload = payload.subarray(9 + payload[8]);
      }
      if (pid === videoPid) parts.push(payload);
    }
    const elementary = Buffer.concat(parts);
    for (let index = 0; index + 3 < elementary.length; index++) {
      if (elementary[index] || elementary[index + 1] || elementary[index + 2] !== 1) continue;
      const type = elementary[index + 3] & 31;
      if (type >= 1 && type <= 5) return type === 5;
    }
    return false;
  } finally { await handle.close(); }
}

// No encoder, scaling, frame-rate conversion or audio conversion is used here.
// Difficult GOP layouts, rotation and non-AAC audio retain native MP4 playback.
export async function packageOriginalVideo({ file, directory, metadata, bytes, prefix, guard = async () => {}, hlsOnly = false, segmentSeconds = HLS_SEGMENT_SECONDS, maxSegmentSeconds = 12, maxBandwidth = Infinity, onProgress }) {
  await guard();
  const outputDirectory = path.resolve(directory, 'original-stream');
  const cleanupCopy = async () => {
    if (path.dirname(outputDirectory) !== path.resolve(directory)) throw new Error('Unsafe original playback cleanup directory.');
    await rm(outputDirectory, { recursive: true, force: true });
  };
  const space = await statfs(directory);
  if (space.bavail * space.bsize < bytes * 1.3 + 512 * 1024 ** 2) throw Object.assign(new Error('Video preparation is waiting for temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
  const input = ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-i', file];
  const check = async () => {
    await guard(); const free = await statfs(directory);
    if (free.bavail * free.bsize < 512 * 1024 ** 2) throw Object.assign(new Error('Video preparation ran out of temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
  };
  if (metadata.videoCodec === 'h264' && (!metadata.pixelFormat || ['yuv420p', 'yuvj420p'].includes(metadata.pixelFormat)) && !metadata.rotation && (!metadata.audioCodec || metadata.audioCodec === 'aac')) {
    const name = `q${Math.min(metadata.width, metadata.height)}`;
    const output = path.join(directory, 'original-stream'); await mkdir(output);
    await runMediaTool('ffmpeg', [...input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '0', '-c', 'copy',
      ...(onProgress ? ['-progress', 'pipe:1', '-nostats'] : []),
      '-f', 'hls', '-hls_time', String(segmentSeconds), '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(output, 's%06d.ts'), '-y', path.join(output, 'index.m3u8')], { timeoutMs: 30 * 60_000, guard: check, onProgress });
    await guard();
    const text = await readFile(path.join(output, 'index.m3u8'), 'utf8');
    let segments;
    // Existing keyframes determine the boundaries. Never re-encode an original
    // just to force short segments; use fast-start MP4 when the source won't fit.
    try { segments = parseHlsPlaylist(text, metadata.duration); } catch { segments = null; }
    if (segments?.some(segment => segment.seconds > maxSegmentSeconds)) segments = null;
    if (segments) {
      let generatedBytes = 0;
      for (let index = 0; index < segments.length; index++) {
        if (index % 32 === 0) await guard();
        const local = path.join(output, `s${String(index).padStart(6, '0')}.ts`);
        const info = await stat(local); generatedBytes += info.size;
        if (!info.isFile() || info.size < 1 || info.size > 32_000_000 || generatedBytes > bytes * 1.3 + 64 * 1024 ** 2 || !await startsWithIndependentPicture(local)) { segments = null; break; }
        segments[index].bytes = info.size;
      }
    }
    if (segments?.some(segment => segment.bytes * 8 / segment.seconds > maxBandwidth)) segments = null;
    if (segments) {
      let totalBytes = 0;
      for (let offset = 0; offset < segments.length; offset += 12) {
        await guard();
        const results = await Promise.allSettled(segments.slice(offset, offset + 12).map((segment, index) => {
          const filename = `s${String(offset + index).padStart(6, '0')}.ts`;
          totalBytes += segment.bytes;
          return putR2ObjectStream(prefix + name + '/' + filename, createReadStream(path.join(output, filename)), { bytes: segment.bytes, contentType: 'video/mp2t' });
        }));
        const failed = results.find(row => row.status === 'rejected'); if (failed) throw failed.reason;
      }
      const playlist = Buffer.from(text);
      await putR2Object(prefix + name + '/index.m3u8', playlist, { contentType: 'application/vnd.apple.mpegurl' });
      const bandwidth = Math.ceil(Math.max(...segments.map(row => row.bytes * 8 / row.seconds)) * 1.1);
      const variant = { name, width: metadata.width, height: metadata.height, bandwidth, playlistBytes: playlist.length, segments };
      const master = Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${metadata.width}x${metadata.height}\n${name}/index.m3u8\n`);
      await guard(); await putR2Object(prefix + 'master.m3u8', master, { contentType: 'application/vnd.apple.mpegurl' });
      if (hlsOnly) await cleanupCopy();
      return { bytes: totalBytes + playlist.length + master.length, hls: { prefix, masterBytes: master.length, bytes: totalBytes + playlist.length + master.length, variants: [variant] } };
    }
  }
  if (hlsOnly) { await cleanupCopy(); return null; }
  const output = path.join(directory, 'playback.mp4');
  await guard();
  await runMediaTool('ffmpeg', [...input, '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0', '-c', 'copy', '-movflags', '+faststart', '-y', output], { timeoutMs: 30 * 60_000, guard: check });
  await guard();
  const info = await stat(output);
  if (!info.isFile() || info.size < 1 || info.size > bytes * 1.3 + 16 * 1024 ** 2) throw new Error('Original playback copy exceeds its bounds.');
  const key = prefix + 'playback.mp4';
  await putR2ObjectStream(key, createReadStream(output), { bytes: info.size, contentType: 'video/mp4' });
  return { key, bytes: info.size, contentType: 'video/mp4' };
}
