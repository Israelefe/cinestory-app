import { applyShareMeta, escapeHtml } from './deliveryShell.js';

export async function handleLibraryShell(request, env, publicId, kind) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(publicId)) return new Response('Link not found.', { status: 404 });
  const selection = kind === 'select';
  const canonical = `${String(env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng').replace(/\/$/, '')}/${kind}/${publicId}`;
  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  if (!shell.ok) return new Response('Veylo is temporarily unavailable.', { status: 503 });
  let meta = { title: selection ? 'Photo Pre-selection | Veylo' : 'Editor Link | Veylo', description: 'Open your private photograph link.', image: '' };
  let status = 200;
  try {
    const origin = String(env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com').replace(/\/$/, '');
    const response = await fetch(`${origin}/api/v1/storage/public/${publicId}/share-meta`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    if (response.ok && payload.data?.kind === (selection ? 'preselection' : 'editor-handoff')) meta = payload.data;
    else if ([404, 410].includes(response.status) || response.ok) { status = response.ok ? 404 : response.status; meta = { title: 'This private link is unavailable | Veylo', description: 'Ask the photographer for a current link.', image: '' }; }
  } catch { /* The browser can still open the app and retry the API. */ }
  const html = applyShareMeta(await shell.text(), meta, canonical)
    .replace(/<meta\s+property=["']og:image:(width|height)["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, () => `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } });
}
