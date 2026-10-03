import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { handlePortfolioShell, handlePortfolioSitemap, PORTFOLIO_PATH } from '../worker/portfolioShell.js';
import { normalizePortfolioContent } from '../src/services/portfolioContent.mjs';
import { publishedPortfolioHtml } from '../worker/portfolioPublished.js';
const originalFetch = globalThis.fetch;
const html = '<html><head><title>Veylo</title><meta property="og:title" content="Veylo"><meta property="og:image" content=""><meta name="twitter:title" content=""><link rel="canonical" href="https://veylo.com.ng/"></head><body><div id="root"></div></body></html>';
const env = { VEYLO_WEB_ORIGIN: 'https://veylo.com.ng', VEYLO_API_ORIGIN: 'https://api.example.com', ASSETS: { fetch: async () => new Response(html) } };
const request = new Request('https://veylo.com.ng/@amara-studio');
after(() => { globalThis.fetch = originalFetch; });
test('legacy handles and project URLs reach the dynamic shell', () => { assert.ok(PORTFOLIO_PATH.test('/@amara--studio')); assert.ok(PORTFOLIO_PATH.test('/@amara--studio/projects/project-one')); assert.equal(PORTFOLIO_PATH.test('/@amara.studio'), false); });
test('portfolio shell escapes studio text and preserves dollar replacement characters', async () => { globalThis.fetch = async () => Response.json({ data: { title: 'Amara $& <script> Studio', description: 'Finished portraits', image: 'https://veylo.com.ng/api/cover', canonical: 'https://veylo.com.ng/@amara-studio' } }); const res = await handlePortfolioShell(request, env, 'amara-studio'); const body = await res.text(); assert.equal(res.status, 200); assert.match(body, /Amara \$&amp; &lt;script&gt; Studio/); assert.equal((body.match(/rel="canonical"/g) || []).length, 1); assert.equal(res.headers.get('Cache-Control'), 'no-store'); });
test('private portfolios return a real 404 without marketing metadata', async () => { globalThis.fetch = async () => new Response('', { status: 404 }); const res = await handlePortfolioShell(request, env, 'amara-studio'); assert.equal(res.status, 404); assert.match(await res.text(), /noindex/); });
test('previous addresses redirect to the canonical project URL', async () => { globalThis.fetch = async () => Response.json({ data: { canonical: 'https://veylo.com.ng/@amara-new/projects/project-one', redirectedFrom: 'amara-studio' } }); const res = await handlePortfolioShell(request, env, 'amara-studio', 'project-one'); assert.equal(res.status, 301); assert.equal(res.headers.get('Location'), 'https://veylo.com.ng/@amara-new/projects/project-one'); });
test('metadata outages return a retryable status without caching a fake public page', async () => { globalThis.fetch = async () => { throw new Error('offline'); }; const res = await handlePortfolioShell(request, env, 'amara-studio'); assert.equal(res.status, 503); assert.equal(res.headers.get('Retry-After'), '30'); });

test('published content is crawler-readable and JSON cannot break out of its script', async () => {
  const content = normalizePortfolioContent({ profile: { about: 'Portraits </script><script>alert(1)</script>' }, services: [{ id: 'service-one', title: 'Portrait sessions', description: 'Studio photographs in Lagos.' }], faqs: [{ id: 'faq-one', question: 'Do you travel?', answer: 'Please tell us where.' }] });
  const portfolio = { handle: 'amara-studio', studioName: 'Amara Studio', headline: 'Portrait photography', introLine: 'Photographs in Lagos', projects: [], items: [], content, direction: { showBio: true, showContact: true }, whatsapp: '' };
  globalThis.fetch = async url => { assert.match(String(url), /category=c-test/); return Response.json({ data: { title: 'Portrait photography', canonical: 'https://veylo.com.ng/@amara-studio?category=c-test', description: portfolio.introLine, portfolio } }); };
  const response = await handlePortfolioShell(new Request('https://veylo.com.ng/@amara-studio?category=c-test'), env, 'amara-studio');
  const body = await response.text(); assert.equal(response.status, 200); assert.match(body, /id="portfolio-server-preview"/); assert.match(body, /Portrait sessions/); assert.match(body, /application\/ld\+json/); assert.ok(!body.includes('<script>alert(1)</script>'));
  const preloaded = body.match(/id="portfolio-published-data" type="application\/json">([\s\S]*?)<\/script>/)[1]; assert.equal(JSON.parse(preloaded).portfolio.content.profile.about, content.profile.about);
});
test('sitemap pages escape category queries and use current public URLs', async () => {
  globalThis.fetch = async () => Response.json({ urls: [{ loc: 'https://veylo.com.ng/@amara-studio?category=c-one&service=s-one', lastmod: '2026-10-03T00:00:00.000Z' }, { loc: 'https://other.example.com/private' }] });
  const result = await handlePortfolioSitemap(request, env, 0); const body = await result.text(); assert.equal(result.headers.get('Cache-Control'), 'no-store'); assert.match(body, /&amp;service/); assert.ok(!body.includes('other.example.com'));
});
test('crawler project photographs use the approved cover and ordered set without empty details', () => {
  const project = { id: 'project-one', title: 'Portraits', coverId: 'photo-c', photoIds: ['photo-b', 'photo-a', 'photo-c'], narrative: [] };
  const portfolio = { handle: 'amara-studio', studioName: 'Amara', content: normalizePortfolioContent(), direction: {}, items: ['a', 'b', 'c'].map(letter => ({ id: `photo-${letter}`, url: `/api/${letter}.webp` })), projects: [project] };
  const html = publishedPortfolioHtml({ portfolio, projectId: project.id, canonical: 'https://veylo.com.ng/@amara-studio/projects/project-one' });
  assert.ok(html.indexOf('/c.webp') < html.indexOf('/b.webp')); assert.ok(html.indexOf('/b.webp') < html.indexOf('/a.webp')); assert.ok(!html.includes('About this shoot'));
});
