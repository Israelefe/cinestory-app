import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { handleLibraryShell } from '../worker/libraryShell.js';
const originalFetch = globalThis.fetch;
const id = 'private-link-0123456789abcdef';
const html = '<html><head><title>Veylo</title><meta property="og:title" content="Veylo"><meta property="og:image" content="/default-og.jpg"><meta property="og:image:width" content="1200"><meta name="twitter:image" content="/default-og.jpg"><link rel="canonical" href="https://veylo.com.ng/"></head><body><div id="root"></div></body></html>';
const env = { VEYLO_WEB_ORIGIN: 'https://veylo.com.ng', VEYLO_API_ORIGIN: 'https://api.example.test', ASSETS: { fetch: async () => new Response(html) } };
after(() => { globalThis.fetch = originalFetch; });
for (const [path, kind] of [['select', 'preselection'], ['edit', 'editor-handoff']]) test(`${path} shell uses escaped per-link metadata without opening private content`, async () => {
  const calls = []; globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ data: { kind, title: 'Ada <script> $&', description: 'Choose 2 photographs', image: `https://veylo.com.ng/api/v1/storage/public/${id}/share-cover` } }); };
  const response = await handleLibraryShell(new Request(`https://veylo.com.ng/${path}/${id}`), env, id, path), body = await response.text();
  assert.equal(response.status, 200); assert.match(body, /Ada &lt;script&gt; \$&amp;/); assert.doesNotMatch(body, /default-og|og:image:width/);
  assert.match(body, new RegExp(`rel="canonical" href="https://veylo.com.ng/${path}/${id}"`)); assert.match(body, /share-cover/);
  assert.equal(calls.length, 1); assert.match(calls[0], /\/share-meta$/); assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
});
test('closed and wrong-kind links discard the default preview', async () => {
  for (const [status, data] of [[410, {}], [200, { kind: 'editor-handoff', image: 'must-not-appear' }]]) {
    globalThis.fetch = async () => Response.json({ data }, { status });
    const response = await handleLibraryShell(new Request(`https://veylo.com.ng/select/${id}`), env, id, 'select');
    assert.equal(response.status, status === 200 ? 404 : status); assert.doesNotMatch(await response.text(), /default-og|must-not-appear/);
  }
});
test('metadata outages preserve the app with a workflow title and no false cover', async () => {
  globalThis.fetch = async () => { throw new Error('Fixture offline'); };
  const response = await handleLibraryShell(new Request(`https://veylo.com.ng/edit/${id}`), env, id, 'edit');
  assert.equal(response.status, 200); const body = await response.text(); assert.match(body, /Editor Link/); assert.doesNotMatch(body, /default-og/); assert.match(body, /id="root"/);
});
