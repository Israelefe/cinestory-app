import { mkdir, readFile, readdir, stat, statfs, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { runMediaTool } from './videoMedia.service.js';
import { putR2Object, putR2ObjectStream } from './r2.service.js';
import { encodingVariants, VIDEO_QUALITY_VERSION, PLAYBACK_SEGMENT_SECONDS } from './videoQuality.service.js';
import { parseHlsPlaylist } from './videoPlaylist.service.js';
import { packageOriginalVideo } from './videoPackage.service.js';
export { encodingVariants } from './videoQuality.service.js';
export { parseHlsPlaylist } from './videoPlaylist.service.js';

export async function encodeAdaptiveVideo({ file, directory, metadata, prefix, guard = async () => {}, onProgress = async () => {}, onRendition = async () => {} }) {
  const variants = []; let totalBytes = 0;
  const maxBytes = 64_000_000_000;
  const publish = async () => {
    const master = Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n' + variants.map(row => `#EXT-X-STREAM-INF:BANDWIDTH=${row.bandwidth},RESOLUTION=${row.width}x${row.height},FRAME-RATE=${Number(metadata.frameRate || 30).toFixed(3)}\n${row.name}/index.m3u8\n`).join(''));
    await guard(); await putR2Object(prefix + 'master.m3u8', master, { contentType: 'application/vnd.apple.mpegurl' });
    return { ladderVersion: VIDEO_QUALITY_VERSION, prefix, masterBytes: master.length, bytes: totalBytes + master.length, variants: [...variants] };
  };
  for (const variant of encodingVariants(metadata)) {
    await guard();
    await onProgress({ quality: variant.name, percent: 0, completed: variants.map(row => row.name) });
    const report = seconds => onProgress({ quality: variant.name, percent: Math.min(99, Math.floor(seconds / metadata.duration * 100)), completed: variants.map(row => row.name) });
    if (variant.source) {
      const copied = await packageOriginalVideo({ file, directory, metadata, bytes: (await stat(file)).size, prefix, guard, hlsOnly: true,
        segmentSeconds: PLAYBACK_SEGMENT_SECONDS, maxSegmentSeconds: PLAYBACK_SEGMENT_SECONDS + .5,
        maxBandwidth: Math.min(metadata.width, metadata.height) < 720 ? Infinity : (variant.bitrate + 128000) * 1.2, onProgress: report });
      if (copied?.hls) {
        const original = { ...copied.hls.variants[0], source: true, frameRate: metadata.frameRate };
        original.bandwidth = Math.max(original.bandwidth, (variants.at(-1)?.bandwidth || 0) + 1);
        variants.push(original); totalBytes += original.segments.reduce((sum, row) => sum + row.bytes, 0) + original.playlistBytes;
        if (totalBytes > maxBytes) throw new Error('Playback copies exceed the preparation storage limit.');
        await onRendition(await publish());
        await onProgress({ quality: variant.name, percent: 100, completed: variants.map(row => row.name) });
        continue;
      }
      if (Math.min(metadata.width, metadata.height) < 720) throw Object.assign(new Error('Upload a video at 720p or higher for automatic playback.'), { code: 'VIDEO_RESOLUTION_TOO_SMALL' });
    }
    const output = path.join(directory, variant.name); await mkdir(output);
    // One rendition at a time bounds RAM and scratch space. Uploaded rendition
    // files are removed locally before starting the next quality level.
    const expected = Math.ceil(metadata.duration * (variant.bitrate + 128000) / 8 * 1.3) + 64 * 1024 ** 2;
    const space = await statfs(directory);
    if (space.bavail * space.bsize < expected + 1024 ** 3) throw Object.assign(new Error('Video preparation is waiting for temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
    const check = async () => { await guard(); const free = await statfs(directory); if (free.bavail * free.bsize < 512 * 1024 ** 2) throw Object.assign(new Error('Video preparation ran out of temporary disk space.'), { code: 'VIDEO_DISK_BUSY' }); };
    await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '2', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-i', file,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', `scale=${variant.width}:${variant.height},setsar=1`, '-vsync', '0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-maxrate', String(variant.bitrate), '-bufsize', String(variant.bitrate * (variant.name === 'q720' ? 1 : 2)), '-sc_threshold', '0', '-force_key_frames', `expr:gte(t,n_forced*${PLAYBACK_SEGMENT_SECONDS})`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-max_muxing_queue_size', '1024',
      '-progress', 'pipe:1', '-nostats', '-f', 'hls', '-hls_time', String(PLAYBACK_SEGMENT_SECONDS), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(output, 's%06d.ts'), '-y', path.join(output, 'index.m3u8')], { timeoutMs: 12 * 3600_000, guard: check, onProgress: report });
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
    const peak = Math.max(Math.ceil(Math.max(...segments.map(row => row.bytes * 8 / row.seconds)) * 1.1), (variants.at(-1)?.bandwidth || 0) + 1);
    variants.push({ ...variant, source: false, bandwidth: peak, playlistBytes: playlist.length, segments });
    await onRendition(await publish());
    await onProgress({ quality: variant.name, percent: 100, completed: variants.map(row => row.name) });
    if (path.dirname(path.resolve(output)) !== path.resolve(directory)) throw new Error('Unsafe rendition cleanup directory.');
    await rm(output, { recursive: true, force: true });
  }
  return publish();
}
