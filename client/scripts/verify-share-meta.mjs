/**
 * Verifies the `/d/:publicId` link-preview rewriting against the real
 * `index.html` shell, without needing a Cloudflare account.
 *
 *   node scripts/verify-share-meta.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { applyShareMeta } from '../worker/deliveryShell.js';

const shellPath = fileURLToPath(new URL('../index.html', import.meta.url));

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

function contentOf(html, property, attribute = 'property') {
  const match = html.match(new RegExp(`<meta\\s+${attribute}=["']${property}["']\\s+content="([^"]*)"`, 'i'));
  return match?.[1];
}

const html = await readFile(shellPath, 'utf8');

// Plain text on purpose — the escaping pass gets its own explicit case below.
const meta = {
  title: 'Ada and Chidi Wedding — Ada Photography',
  description: 'Ada, your finished photographs are ready to experience and download.',
  image: 'https://res.cloudinary.com/dwepjoehy/image/upload/w_1200,h_630,c_fill/v1730000000/cover.jpg',
  brandName: 'Ada Photography',
  locked: false
};
const canonical = 'https://veylo.com.ng/d/AbCdEfGhIjKlMnOpQrStUvWx';
const output = applyShareMeta(html, meta, canonical);

check('title tag replaced', output.includes(`<title>${meta.title}</title>`));
check('og:title replaced', contentOf(output, 'og:title') === meta.title);
check('og:description replaced', contentOf(output, 'og:description') === meta.description);
check('og:image replaced', contentOf(output, 'og:image') === meta.image);
check('twitter:title replaced', contentOf(output, 'twitter:title', 'name') === meta.title);
check('twitter:description replaced', contentOf(output, 'twitter:description', 'name') === meta.description);
check('twitter:image replaced', contentOf(output, 'twitter:image', 'name') === meta.image);

// `og:url` is absent from the base shell, so it must be inserted into <head>.
check('og:url inserted', contentOf(output, 'og:url') === canonical);
check('og:url sits inside <head>', output.indexOf('property="og:url"') < output.indexOf('</head>'));

// Tags the delivery preview must not disturb.
check('og:site_name untouched', contentOf(output, 'og:site_name') === 'Veylo');
check('og:type untouched', contentOf(output, 'og:type') === 'website');
check('twitter:card untouched', contentOf(output, 'twitter:card', 'name') === 'summary_large_image');
check('og:image dimensions untouched', contentOf(output, 'og:image:width') === '1200' && contentOf(output, 'og:image:height') === '630');

// Only the one added tag should change the tag count.
const metaCount = value => (value.match(/<meta\s/gi) || []).length;
check('exactly one meta tag added', metaCount(output) === metaCount(html) + 1, `${metaCount(html)} -> ${metaCount(output)}`);
check('single </head> preserved', (output.match(/<\/head>/gi) || []).length === 1);

// Escaping: a studio name with quotes and angle brackets must not break out of
// the content attribute.
// Real delivery titles are photographer-supplied, e.g. "Ada & Chidi's Wedding",
// so entity escaping has to hold for the characters that actually show up.
const hostile = applyShareMeta(html, { title: `Ben "The Lens" O'Brien <script>alert(1)</script>`, description: 'a & b', image: 'https://x.test/i.jpg' }, canonical);
check('quotes escaped', contentOf(hostile, 'og:title') === 'Ben &quot;The Lens&quot; O&#39;Brien &lt;script&gt;alert(1)&lt;/script&gt;');
check('apostrophe escaped', !contentOf(hostile, 'og:title')?.includes("'"));
check('no raw script tag injected', !hostile.includes('<script>alert(1)</script>'));
check('ampersand escaped in description', contentOf(hostile, 'og:description') === 'a &amp; b');

// A missing payload must degrade to an empty-but-valid tag, not "undefined".
const empty = applyShareMeta(html, {}, canonical);
check('missing fields do not render "undefined"', !empty.includes('undefined'));

const failed = checks.filter(item => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);