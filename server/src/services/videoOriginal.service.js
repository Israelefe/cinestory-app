// Original playback never changes the uploaded bytes. Compatibility refers to
// common browser decoders, rather than a promise about every device's hardware.
export function originalVideoCompatible(asset) {
  const extension = String(asset.filename || asset.objectKey || '').split('.').pop().toLowerCase();
  if (extension === 'mp4') return asset.videoCodec === 'h264' && (!asset.audioCodec || ['aac', 'mp3'].includes(asset.audioCodec)) && (!asset.pixelFormat || ['yuv420p', 'yuvj420p'].includes(asset.pixelFormat));
  return extension === 'webm' && ['vp8', 'vp9', 'av1'].includes(asset.videoCodec) && (!asset.audioCodec || ['opus', 'vorbis'].includes(asset.audioCodec));
}
export const originalVideoType = asset => ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' })[String(asset.objectKey).split('.').pop()] || 'application/octet-stream';

// Bound open-ended browser range reads. Repeated ranges are counted again, just
// as repeated HLS segments are. A full GET reserves the whole original duration.
export function originalVideoRange(value, bytes) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw Object.assign(new Error('Invalid video range.'), { status: 416 });
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
  const end = Math.min(bytes - 1, match[1] && match[2] ? Number(match[2]) : bytes - 1, start + 8 * 1024 ** 2 - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes || end < start || (!match[1] && Number(match[2]) < 1)) throw Object.assign(new Error('Video range is outside this file.'), { status: 416 });
  return { offset: start, length: end - start + 1 };
}
