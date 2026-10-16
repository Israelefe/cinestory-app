import { stat, statfs } from 'node:fs/promises';
import { putR2Object } from './r2.service.js';
import { encodingVariants, VIDEO_QUALITY_VERSION, PLAYBACK_SEGMENT_SECONDS } from './videoQuality.service.js';
import { packageOriginalVideo } from './videoPackage.service.js';
import { encodeRenditionBatch } from './videoRendition.service.js';
export { encodingVariants } from './videoQuality.service.js';
export { parseHlsPlaylist } from './videoPlaylist.service.js';

export async function encodeAdaptiveVideo({ file, directory, metadata, prefix, guard = async () => {}, onProgress = async () => {}, onRendition = async () => {} }) {
  const variants = []; let totalBytes = 0;
  const maxBytes = 64_000_000_000;
  const required = encodingVariants(metadata);
  const inputBytes = (await stat(file)).size;
  const sourceLimit = variant => Math.min(metadata.width, metadata.height) < 720 ? Infinity : (variant.bitrate + 128000) * 1.2;
  const canCopy = variant => variant.source && metadata.videoCodec === 'h264' && !metadata.rotation && (!metadata.pixelFormat || ['yuv420p', 'yuvj420p'].includes(metadata.pixelFormat)) && (!metadata.audioCodec || metadata.audioCodec === 'aac') && inputBytes * 8 / metadata.duration <= sourceLimit(variant);
  const publish = async () => {
    const master = Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n' + variants.map(row => `#EXT-X-STREAM-INF:BANDWIDTH=${row.bandwidth},RESOLUTION=${row.width}x${row.height},FRAME-RATE=${Number(metadata.frameRate || 30).toFixed(3)}\n${row.name}/index.m3u8\n`).join(''));
    await guard(); await putR2Object(prefix + 'master.m3u8', master, { contentType: 'application/vnd.apple.mpegurl' });
    return { ladderVersion: VIDEO_QUALITY_VERSION, prefix, masterBytes: master.length, bytes: totalBytes + master.length, variants: [...variants] };
  };
  for (let index = 0; index < required.length;) {
    const variant = required[index];
    await guard();
    await onProgress({ quality: variant.name, preparing: [variant.name], percent: 0, completed: variants.map(row => row.name) });
    if (canCopy(variant)) {
      // A source already above the bitrate ceiling cannot pass the segment
      // checks. Do not remux an entire film merely to discard that copy.
      const copied = await packageOriginalVideo({ file, directory, metadata, bytes: inputBytes, prefix, guard, hlsOnly: true,
        segmentSeconds: PLAYBACK_SEGMENT_SECONDS, maxSegmentSeconds: PLAYBACK_SEGMENT_SECONDS + .5, maxBandwidth: sourceLimit(variant),
        onProgress: seconds => onProgress({ quality: variant.name, preparing: [variant.name], percent: Math.min(99, Math.floor(seconds / metadata.duration * 100)), completed: variants.map(row => row.name) }) });
      if (copied?.hls) {
        const original = { ...copied.hls.variants[0], source: true, frameRate: metadata.frameRate };
        original.bandwidth = Math.max(original.bandwidth, (variants.at(-1)?.bandwidth || 0) + 1);
        variants.push(original); totalBytes += original.segments.reduce((sum, row) => sum + row.bytes, 0) + original.playlistBytes;
        if (totalBytes > maxBytes) throw new Error('Playback copies exceed the preparation storage limit.');
        await onRendition(await publish());
        await onProgress({ quality: variant.name, preparing: [], percent: 100, completed: variants.map(row => row.name) });
        index++; continue;
      }
    }
    if (Math.min(metadata.width, metadata.height) < 720) throw Object.assign(new Error('Upload a video at 720p or higher for automatic playback.'), { code: 'VIDEO_RESOLUTION_TOO_SMALL' });
    const space = await statfs(directory);
    if (space.bavail * space.bsize < 1024 ** 3) throw Object.assign(new Error('Video preparation is waiting for temporary disk space.'), { code: 'VIDEO_DISK_BUSY' });
    const batch = [variant];
    const next = required[index + 1];
    if (next && !canCopy(next) && metadata.width * metadata.height <= 4096 * 2160) batch.push(next);
    const encoded = await encodeRenditionBatch({ file, directory, metadata, prefix, variants: batch, remainingBytes: maxBytes - totalBytes, guard,
      onProgress: progress => onProgress({ ...progress, completed: variants.map(row => row.name) }) });
    for (const row of encoded) {
      row.bandwidth = Math.max(row.bandwidth, (variants.at(-1)?.bandwidth || 0) + 1);
      variants.push(row); totalBytes += row.segments.reduce((sum, segment) => sum + segment.bytes, 0) + row.playlistBytes;
      if (totalBytes > maxBytes) throw new Error('Playback copies exceed the preparation storage limit.');
      await onRendition(await publish());
      await onProgress({ quality: row.name, preparing: [], percent: 100, completed: variants.map(variant => variant.name) });
    }
    index += batch.length;
  }
  return publish();
}
