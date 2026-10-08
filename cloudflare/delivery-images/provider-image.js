import { boundedBytes, mediaError, requireMediaKey } from './media-protocol.js';
import { imageHeader } from './image-metadata.js';

// Provider URLs come from a signed server request. Still restrict their origins
// and reject redirects so the Worker cannot be used to fetch arbitrary servers.
export async function importGeneratedImage(env, data) {
  requireMediaKey(data.key);
  if (!/^veylo\/content-studio\/[a-f0-9]{24}\/[A-Za-z0-9_-]+\/images\/[A-Za-z0-9_-]+$/i.test(data.key)) throw mediaError('This image does not belong to a campaign.', 403, 'IMAGE_SCOPE_INVALID');
  let url;
  try { url = new URL(data.url); } catch { throw mediaError('The image provider returned an invalid address.', 502, 'PROVIDER_IMAGE_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !(/\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname) || /\.oss\.aliyuncs\.com$/.test(url.hostname) || url.hostname.endsWith('.alicdn.com'))) throw mediaError('The image provider returned an unsupported address.', 502, 'PROVIDER_IMAGE_URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 20_000_000) {
    await response.body?.cancel();
    throw mediaError('The generated image could not be downloaded.', 502, 'PROVIDER_IMAGE_FAILED');
  }
  const bytes = await boundedBytes(response.body, 20_000_000);
  const header = imageHeader(bytes);
  if (header.width < 320 || header.height < 320 || header.width * header.height > 40_000_000) throw mediaError('The generated image has unsupported dimensions.', 502, 'PROVIDER_IMAGE_INVALID');
  const source = new Blob([bytes]).stream();
  const output = await env.IMAGES.input(source).transform({ width: 2560, height: 2560, fit: 'scale-down' }).output({ format: 'image/png' });
  const transformed = await output.response();
  if (!transformed.ok) throw mediaError('The generated image could not be prepared.', 502, 'PROVIDER_IMAGE_INVALID');
  const png = await boundedBytes(transformed.body, 32 * 1024 * 1024);
  const metadata = imageHeader(png);
  const object = await env.DELIVERY_MEDIA.put(data.key, png, { httpMetadata: { contentType: 'image/png' } });
  return { public_id: data.key, bytes: object.size, etag: object.etag, format: 'png', width: metadata.width, height: metadata.height };
}
