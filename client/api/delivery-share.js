const API_ORIGIN = process.env.VEYLO_API_ORIGIN || 'https://veylo-api-ptk3.onrender.com';
const WEB_ORIGIN = process.env.VEYLO_WEB_ORIGIN || 'https://veylo.com.ng';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function replaceMeta(html, property, value, attribute = 'property') {
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${property}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${property}" content="${escapeHtml(value)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n</head>`);
}

export default async function handler(request, response) {
  const publicId = String(request.query.publicId || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(publicId)) return response.status(404).send('Delivery not found.');
  let html = '';
  try {
    const pageResponse = await fetch(`${WEB_ORIGIN}/index.html`);
    html = await pageResponse.text();
    if (!pageResponse.ok) throw new Error('Page unavailable');
    const metaResponse = await fetch(`${API_ORIGIN}/api/v1/deliveries/public/${encodeURIComponent(publicId)}/share-meta`);
    const payload = await metaResponse.json();
    if (!metaResponse.ok || !payload?.data) throw new Error('Preview unavailable');
    const canonical = `${WEB_ORIGIN}/d/${publicId}`;
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(payload.data.title)}</title>`);
    html = replaceMeta(html, 'og:title', payload.data.title);
    html = replaceMeta(html, 'og:description', payload.data.description);
    html = replaceMeta(html, 'og:image', payload.data.image);
    html = replaceMeta(html, 'og:url', canonical);
    html = replaceMeta(html, 'twitter:title', payload.data.title, 'name');
    html = replaceMeta(html, 'twitter:description', payload.data.description, 'name');
    html = replaceMeta(html, 'twitter:image', payload.data.image, 'name');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).send(html);
  } catch {
    if (html) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      return response.status(200).send(html);
    }
    return response.status(503).send('Veylo is temporarily unavailable.');
  }
}
