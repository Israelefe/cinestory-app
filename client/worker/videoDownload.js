// Authorisation stays in the API; large original bytes bypass its host.
// The browser keeps the same authenticated URL for GET, HEAD and resume ranges.
export async function handleVideoDownload(request, target, headers) {
  headers.set('x-veylo-video-download-proxy', '1');
  headers.set('x-veylo-video-download-method', request.method);
  const authorised = await fetch(new Request(target, { method: 'GET', headers, redirect: 'manual', signal: request.signal }));
  if (!authorised.ok || !authorised.headers.get('content-type')?.includes('application/json')) {
    if (request.method === 'HEAD') { await authorised.body?.cancel(); return new Response(null, { status: authorised.status, headers: authorised.headers }); }
    return authorised;
  }
  const grant = (await authorised.json().catch(() => null))?.data;
  let url;
  try { url = new URL(grant?.url); } catch { return failed(); }
  if (url.protocol !== 'https:' || !/^[a-f\d]{32}\.r2\.cloudflarestorage\.com$/i.test(url.hostname) || url.username || url.password || !['GET', 'HEAD'].includes(grant.method) || grant.method !== request.method || !/^attachment;/.test(grant.disposition || '') || !Number.isSafeInteger(grant.bytes) || grant.bytes < 0) return failed();
  const objectHeaders = new Headers();
  if (grant.range) objectHeaders.set('Range', grant.range);
  // Never forward account/PIN cookies or the edge trust secret to storage.
  const original = await fetch(url, { method: request.method, headers: objectHeaders, redirect: 'error', signal: request.signal });
  if (![200, 206].includes(original.status)) { await original.body?.cancel(); return failed(); }
  const resultHeaders = new Headers({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': grant.disposition, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  for (const name of ['Content-Length', 'Content-Range']) if (original.headers.has(name)) resultHeaders.set(name, original.headers.get(name));
  return new Response(request.method === 'HEAD' ? null : original.body, { status: original.status, headers: resultHeaders });
}
const failed = () => new Response('The original could not be downloaded. Please try again.', { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
