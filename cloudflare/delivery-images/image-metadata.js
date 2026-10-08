import { boundedBytes, hashObject, MAX_IMAGE_PIXELS, MAX_MEDIA_BYTES, mediaError, requireMediaKey } from './media-protocol.js';

const HEADER_BYTES = 2 * 1024 * 1024;

export function imageHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, length) => new TextDecoder().decode(bytes.subarray(start, start + length));
  if (bytes.length >= 24 && bytes[0] === 137 && text(1, 3) === 'PNG' && text(12, 4) === 'IHDR') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = text(offset + 4, 4);
      if (type === 'acTL') throw mediaError('Use a still JPEG, PNG, or WebP photograph.', 415, 'UNSUPPORTED_IMAGE');
      if (type === 'IDAT') break;
      offset += length + 12;
    }
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const type = text(12, 4);
    if (type === 'VP8X') {
      if (bytes[20] & 2) throw mediaError('Use a still JPEG, PNG, or WebP photograph.', 415, 'UNSUPPORTED_IMAGE');
      return { format: 'webp', width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    }
    if (type === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { format: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (type === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) return { format: 'jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      offset += length;
    }
  }
  throw mediaError('This file is not a readable JPEG, PNG, or WebP photograph.', 415, 'INVALID_IMAGE');
}

export async function inspectImage(bucket, images, key, maximum = MAX_MEDIA_BYTES, { hash = true } = {}) {
  requireMediaKey(key);
  const head = await bucket.head(key);
  if (!head) throw mediaError('File not found.', 404, 'MEDIA_NOT_FOUND');
  if (head.size < 1 || head.size > maximum) throw mediaError('This photograph is larger than the upload limit.', 413, 'MEDIA_TOO_LARGE');
  const source = await bucket.get(key, { range: { offset: 0, length: Math.min(head.size, HEADER_BYTES) } });
  if (!source || source.etag !== head.etag) throw mediaError('This file changed while it was being checked. Please retry.', 409, 'MEDIA_CHANGED');
  const header = imageHeader(await boundedBytes(source.body, HEADER_BYTES));
  if (!header.width || !header.height || header.width * header.height > MAX_IMAGE_PIXELS) throw mediaError('This photograph has too many pixels to preview. Use a smaller preview copy.', 413, 'IMAGE_PIXELS_EXCEEDED');
  let info = header;
  if (head.size <= 20_000_000) {
    const original = await bucket.get(key);
    if (!original || original.etag !== head.etag) throw mediaError('This file changed while it was being checked. Please retry.', 409, 'MEDIA_CHANGED');
    const decoded = await images.info(original.body).catch(() => { throw mediaError('This file is not a readable photograph.', 415, 'INVALID_IMAGE'); });
    if (!['jpeg', 'jpg', 'png', 'webp', 'image/jpeg', 'image/png', 'image/webp'].includes(String(decoded.format).toLowerCase())) throw mediaError('Use a still JPEG, PNG, or WebP photograph.', 415, 'UNSUPPORTED_IMAGE');
    info = { ...header, width: Number(decoded.width), height: Number(decoded.height) };
  }
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1 || info.width * info.height > MAX_IMAGE_PIXELS) throw mediaError('This photograph has too many pixels to preview. Use a smaller preview copy.', 413, 'IMAGE_PIXELS_EXCEEDED');
  const digest = hash ? await hashObject(bucket, key, maximum, head.etag) : { bytes: head.size, etag: head.etag };
  return { ...info, ...digest, contentType: `image/${header.format}` };
}
