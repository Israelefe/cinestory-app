/**
 * Link-preview shell for `/d/:publicId` delivery links.
 *
 * Crawlers do not run the SPA, so this serves `index.html` with the delivery's
 * title, description and cover image swapped into the Open Graph and Twitter
 * tags; the app then boots normally and renders the real delivery client-side.
 */
const DEFAULT_API_ORIGIN = 'https://veylo-api-ptk3.onrender.com';
const DEFAULT_WEB_ORIGIN = 'https://veylo.com.ng';

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

export async function handleDeliveryShell(request, env, ctx, publicId) {
  if (!PUBLIC_ID_PATTERN.test(publicId)) return plain('Delivery not found.', 404);

  let html = '';
  try {
    html = await shellHtml(request, env);
    const meta = await shareMeta(env, publicId);
    const canonical = `${webOrigin(env)}/d/${publicId}`;
    const response = new Response(applyShareMeta(html, meta, canonical), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        // `_headers` covers the static assets, but this route is served by the
        // Worker, so the COOP value the Google sign-in popup needs is set here
        // too. Keeping it consistent across the origin matters.
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
      }
    });
    // Do not populate the edge cache with an HTML shell that can outlive the
    // bundle it references. The static asset layer still caches content-hashed
    // JavaScript and CSS files safely.
    return response;
  } catch {
    // Fall back to the un-personalised shell so the link still opens; only give
    // up entirely if the app shell itself could not be read.
    if (html) return plain(html, 200);
    return plain('Veylo is temporarily unavailable.', 503);
  }
}

/** Reads the built `index.html` from the static assets binding. */
async function shellHtml(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  if (!response.ok) throw new Error('App shell unavailable.');
  return response.text();
}

async function shareMeta(env, publicId) {
  const response = await fetch(
    `${apiOrigin(env)}/api/v1/deliveries/public/${encodeURIComponent(publicId)}/share-meta`,
    { headers: { Accept: 'application/json' } }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) throw new Error('Preview unavailable.');
  return payload.data;
}

function apiOrigin(env) {
  return (env?.VEYLO_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
}

function webOrigin(env) {
  return (env?.VEYLO_WEB_ORIGIN || DEFAULT_WEB_ORIGIN).replace(/\/+$/, '');
}

/**
 * Swaps the delivery's preview data into an `index.html` shell.
 *
 * String replacement rather than HTMLRewriter: the tags being edited are all
 * flat and unambiguous, and keeping the transform pure makes it testable in
 * plain Node via `scripts/verify-share-meta.mjs`.
 */
export function applyShareMeta(html, meta, canonical) {
  const title = meta?.title ?? '';
  const description = meta?.description ?? '';
  const image = meta?.image ?? '';

  let output = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  output = replaceMeta(output, 'og:title', title);
  output = replaceMeta(output, 'og:description', description);
  output = replaceMeta(output, 'og:image', image);
  output = replaceMeta(output, 'og:url', canonical);
  output = replaceMeta(output, 'twitter:title', title, 'name');
  output = replaceMeta(output, 'twitter:description', description, 'name');
  output = replaceMeta(output, 'twitter:image', image, 'name');
  return output;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function replaceMeta(html, property, value, attribute = 'property') {
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${property}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${property}" content="${escapeHtml(value)}" />`;
  // `og:url` has no tag in the base shell, so it gets appended to <head>.
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n</head>`);
}

function plain(body, status, cacheControl = 'no-store') {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  });
}
