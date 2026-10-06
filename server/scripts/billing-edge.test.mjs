import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApiProxy } from '../../client/worker/apiProxy.js';

for (const country of ['NG', 'US', 'XX', 'T1', undefined]) {
  test(`edge forwards the trusted visitor IP without forwarding country ${country ?? 'missing'}`, async () => {
    const previous = globalThis.fetch;
    const request = new Request('https://veylo.example/api/v1/billing/plans', { headers: { 'cf-connecting-ip': '203.0.113.10', 'x-veylo-country': 'NG', 'x-veylo-edge-key': 'forged', 'x-veylo-client-ip': '127.0.0.1' } });
    request.cf = { country };
    const response = new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
    globalThis.fetch = async forwarded => {
      assert.equal(new URL(forwarded.url).pathname, '/api/v1/billing/plans');
      assert.equal(forwarded.headers.get('x-veylo-edge-key'), 'isolated-edge-key');
      assert.equal(forwarded.headers.get('x-veylo-client-ip'), '203.0.113.10');
      assert.equal(forwarded.headers.get('x-veylo-country'), null);
      return response;
    };
    try { assert.equal(await handleApiProxy(request, { VEYLO_EDGE_KEY: 'isolated-edge-key' }), response); }
    finally { globalThis.fetch = previous; }
  });
}
test('unconfigured edge cannot forward a forged billing country', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async forwarded => {
    assert.equal(forwarded.headers.get('x-veylo-country'), null);
    assert.equal(forwarded.headers.get('x-veylo-edge-key'), null);
    return new Response('ok');
  };
  try { await handleApiProxy(new Request('https://veylo.example/api/v1/billing/plans', { headers: { 'x-veylo-country': 'NG', 'x-veylo-edge-key': 'forged' } }), {}); }
  finally { globalThis.fetch = previous; }
});
