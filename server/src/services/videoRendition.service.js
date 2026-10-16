import { mkdir, readFile, readdir, stat, statfs, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { finished as streamFinished } from 'node:stream/promises';
import path from 'node:path';
import { runMediaTool } from './videoMedia.service.js';
import { putR2Object, putR2ObjectStream } from './r2.service.js';
import { parseHlsPlaylist } from './videoPlaylist.service.js';
import { PLAYBACK_SEGMENT_SECONDS } from './videoQuality.service.js';

// One input decoder feeds at most two encoders. Closed segments upload while
// FFmpeg continues, instead of waiting for an entire quality to finish first.
export async function encodeRenditionBatch({ file, directory, metadata, prefix, variants, remainingBytes, guard, onProgress }) {
  const controller = new AbortController();
  const outputs = variants.map(variant => ({ variant, directory: path.join(directory, variant.name), uploaded: new Map() }));
  for (const output of outputs) await mkdir(output.directory);
  let finished = false; let outputBytes = 0;
  const check = async () => {
    await guard();
    const free = await statfs(directory);
    if (free.bavail * free.bsize < 512 * 1024 ** 2) throw Object.assign(new Error('Video preparation ran out of temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
  };
  const upload = async () => {
    while (!controller.signal.aborted) {
      const pending = [];
      for (const output of outputs) {
        const names = await readdir(output.directory);
        for (const name of names) {
          if (/^s\d{6}\.ts$/.test(name) && !output.uploaded.has(name)) {
            // A following segment proves the previous one has closed, even on
            // older muxers that initially create a final-name placeholder.
            const next = `s${String(Number(name.slice(1, 7)) + 1).padStart(6, '0')}.ts`;
            if (!finished && !names.includes(next) && !names.includes(next + '.tmp')) continue;
            const info = await stat(path.join(output.directory, name));
            if (info.size || finished) pending.push({ output, name });
          }
        }
      }
      if (!pending.length) {
        if (finished) return;
        await new Promise(resolve => setTimeout(resolve, 150));
        continue;
      }
      await check();
      const results = await Promise.allSettled(pending.slice(0, 12).map(async ({ output, name }) => {
        const local = path.join(output.directory, name);
        const info = await stat(local);
        if (!info.isFile() || info.size < 1 || info.size > 32_000_000 || output.uploaded.size >= 6000) throw new Error('Playback segment exceeds its bounds.');
        outputBytes += info.size;
        if (outputBytes > remainingBytes) throw new Error('Playback copies exceed the preparation storage limit.');
        const stream = createReadStream(local);
        try {
          await putR2ObjectStream(prefix + output.variant.name + '/' + name, stream, { bytes: info.size, contentType: 'video/mp2t', signal: controller.signal });
          await streamFinished(stream, { cleanup: true });
        } finally { stream.destroy(); }
        output.uploaded.set(name, info.size);
        await rm(local);
      }));
      const failed = results.find(row => row.status === 'rejected'); if (failed) throw failed.reason;
    }
    throw controller.signal.reason;
  };
  const args = ['-v', 'error', '-nostdin', '-threads', '2', '-filter_threads', '2', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-i', file,
    '-progress', 'pipe:1', '-nostats'];
  for (const { variant, directory: output } of outputs) args.push(
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', `scale=${variant.width}:${variant.height},setsar=1`, '-vsync', '0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2',
    '-maxrate', String(variant.bitrate), '-bufsize', String(variant.bitrate * (variant.name === 'q720' ? 1 : 2)), '-sc_threshold', '0', '-force_key_frames', `expr:gte(t,n_forced*${PLAYBACK_SEGMENT_SECONDS})`,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-max_muxing_queue_size', '1024',
    '-f', 'hls', '-hls_time', String(PLAYBACK_SEGMENT_SECONDS), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', path.join(output, 's%06d.ts'), '-y', path.join(output, 'index.m3u8')
  );
  const uploading = upload().catch(error => { controller.abort(error); throw error; });
  const encoding = runMediaTool('ffmpeg', args, { timeoutMs: 12 * 3600_000, signal: controller.signal, guard: check,
    onProgress: seconds => onProgress({ quality: variants[0].name, preparing: variants.map(row => row.name), percent: Math.min(99, Math.floor(seconds / metadata.duration * 100)) })
  }).catch(error => { controller.abort(error); throw error; }).finally(() => { finished = true; });
  const settled = await Promise.allSettled([encoding, uploading]);
  const failed = settled.find(row => row.status === 'rejected'); if (failed) throw failed.reason;
  const result = [];
  for (const output of outputs) {
    await guard();
    const text = await readFile(path.join(output.directory, 'index.m3u8'), 'utf8');
    const segments = parseHlsPlaylist(text, metadata.duration);
    const files = await readdir(output.directory);
    if (files.length !== 1 || files[0] !== 'index.m3u8' || output.uploaded.size !== segments.length) throw new Error('Unexpected playback output.');
    for (let index = 0; index < segments.length; index++) {
      const bytes = output.uploaded.get(`s${String(index).padStart(6, '0')}.ts`);
      if (!bytes) throw new Error('A playback segment was not uploaded.');
      segments[index].bytes = bytes;
    }
    const playlist = Buffer.from(text);
    outputBytes += playlist.length;
    if (outputBytes > remainingBytes) throw new Error('Playback copies exceed the preparation storage limit.');
    await putR2Object(prefix + output.variant.name + '/index.m3u8', playlist, { contentType: 'application/vnd.apple.mpegurl' });
    const bandwidth = Math.ceil(Math.max(...segments.map(row => row.bytes * 8 / row.seconds)) * 1.1);
    result.push({ ...output.variant, source: false, bandwidth, playlistBytes: playlist.length, segments });
    if (path.dirname(path.resolve(output.directory)) !== path.resolve(directory)) throw new Error('Unsafe rendition cleanup directory.');
    await rm(output.directory, { recursive: true, force: true });
  }
  return result;
}
