import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiProxy } from '../../client/worker/apiProxy.js';

const payload = { mode: 'improve', purpose: 'Ada at Thirty', shootType: 'Birthday' };
const request = (path = '/api/v1/deliveries/v3/assist', signal) => new Request('https://veylo.example' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal
});

for (const status of [502, 503, 504]) test(`assist proxy preserves a checked application error without repeating HTTP ${status}`, async t => {
  const response = Response.json({ success: false, code: 'V3_INVALID_AI_RESPONSE', message: 'Your original text has been kept.' }, { status });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await handleApiProxy(request(), {}), response);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal((await response.json()).code, 'V3_INVALID_AI_RESPONSE');
});

test('assist proxy retries a gateway failure once with the same request body', async t => {
  const bodies = [];
  const response = Response.json({ success: true, data: { improved: "Celebrating Ada's 30th birthday." } });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async forwarded => {
    bodies.push(await forwarded.json());
    return bodies.length === 1 ? new Response('Bad gateway', { status: 502 }) : response;
  });
  assert.equal(await handleApiProxy(request(), {}), response);
  assert.deepEqual(bodies, [payload, payload]);
});

test('assist proxy reports exhausted gateway errors with a code that stops browser retries', async t => {
  t.mock.method(console, 'warn', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
  const response = await handleApiProxy(request(), {});
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { success: false, code: 'V3_ASSIST_UNAVAILABLE', message: 'Veylo could not finish this request. Your text is unchanged. Please try again.' });
});

test('assist proxy reports network failures after one retry', async t => {
  t.mock.method(console, 'warn', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline origin'); });
  const response = await handleApiProxy(request(), {});
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'V3_ASSIST_UNAVAILABLE');
});

test('assist proxy preserves an application error received after a gateway retry', async t => {
  t.mock.method(console, 'warn', () => {});
  const response = Response.json({ code: 'V3_PURPOSE_TIMEOUT', message: 'Your original text is unchanged.' }, { status: 504 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('Unavailable', { status: 503 }) : response);
  assert.equal(await handleApiProxy(request(), {}), response);
  assert.equal(calls, 2);
});

test('assist proxy does not retry an aborted request', async t => {
  const controller = new AbortController();
  controller.abort();
  const fetch = t.mock.method(globalThis, 'fetch', async forwarded => { forwarded.signal.throwIfAborted(); });
  await assert.rejects(handleApiProxy(request(undefined, controller.signal), {}), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('assist retry handling never repeats a delivery write', async t => {
  const response = new Response('Bad gateway', { status: 502 });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await handleApiProxy(request('/api/v1/deliveries/v3'), {}), response);
  assert.equal(fetch.mock.callCount(), 1);
});
