import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptivePhotoUpload, createPhotoTransferSlots, runPhotoUploadQueue, PHOTO_UPLOAD_TIMEOUT_MS } from '../src/utils/adaptivePhotoUpload.js';
import { createUploadConnection, uploadPermissionIsFresh, waitForUploadRetry } from '../src/utils/uploadConnection.js';

function clock(maxConcurrent = 10) {
  let time = 0;
  const controller = createAdaptivePhotoUpload({ maxConcurrent, now: () => time });
  const loaded = new Map();
  return {
    controller,
    start(count) { for (let i = 0; i < count; i++) { if (loaded.has(i)) continue; loaded.set(i, 0); controller.start(i, 20_000_000); } },
    sample(seconds, bytesPerSecond, queued = 69) {
      for (let second = 0; second < seconds; second++) {
        time += 1000;
        for (const [index, value] of loaded) {
          loaded.set(index, value + bytesPerSecond);
          controller.progress(index, value + bytesPerSecond);
        }
        controller.tick({ queued });
      }
    },
    advance(ms) { time += ms; },
    get time() { return time; }
  };
}

test('start at six, respect the server fallback, and never exceed ten', () => {
  assert.equal(clock().controller.state().limit, 6);
  assert.equal(clock(2).controller.state().limit, 2);
  assert.equal(clock(100).controller.state().maximum, 10);
  assert.equal(clock(1).controller.state().limit, 1);
  assert.equal(PHOTO_UPLOAD_TIMEOUT_MS, 900_000);
});

test('a faster whole batch earns eight then ten simultaneous transfers', () => {
  const c = clock(); c.start(6);
  c.sample(25, 100_000);
  assert.equal(c.controller.state().limit, 8);
  c.start(8);
  // Total throughput increases even though each existing transfer keeps its speed.
  c.sample(25, 100_000);
  assert.equal(c.controller.state().limit, 10);
  c.start(10);
  c.sample(25, 100_000);
  assert.equal(c.controller.state().limit, 10);
});

test('extra transfers are rolled back when overall speed does not improve', () => {
  const c = clock(); c.start(6); c.sample(25, 100_000);
  c.start(8);
  c.sample(25, 75_000);
  assert.equal(c.controller.state().limit, 6);
  c.sample(30, 100_000);
  assert.equal(c.controller.state().limit, 6, 'wait before trying another increase');
});

test('a small remaining queue and unsaturated transfers do not trigger increases', () => {
  const c = clock(); c.start(6); c.sample(25, 100_000, 1);
  assert.equal(c.controller.state().limit, 6);
  const quiet = clock(); quiet.start(1); quiet.sample(25, 100_000);
  assert.equal(quiet.controller.state().limit, 6);
});

test('stalled transfers reduce six to three then two without cancelling originals', () => {
  const c = clock(); c.start(6); c.advance(45_000); c.controller.tick({ queued: 69 });
  assert.equal(c.controller.state().limit, 3);
  assert.equal(c.controller.state().activeTransfers, 6);
  c.controller.failure('connection');
  assert.equal(c.controller.state().limit, 3, 'simultaneous failures share a cooldown');
  c.advance(5000); c.controller.tick({ queued: 69 });
  assert.equal(c.controller.state().limit, 2);
  c.advance(5000); c.controller.failure('connection');
  assert.equal(c.controller.state().limit, 2);
});

test('continued progress that risks the fifteen-minute deadline also reduces concurrency', () => {
  const c = clock(); c.start(6); c.sample(60, 1000);
  assert.equal(c.controller.state().limit, 3);
  assert.equal(c.controller.state().reason, 'slow');
});

test('finished transfers waiting for a response and server work are not counted as network stalls', () => {
  const c = clock(); c.start(6);
  for (let i = 0; i < 6; i++) c.controller.progress(i, 20_000_000);
  c.advance(120_000); c.controller.tick({ queued: 0 });
  assert.equal(c.controller.state().limit, 6);
  for (let i = 0; i < 6; i++) c.controller.finish(i);
  c.advance(120_000); c.controller.tick({ queued: 69 });
  assert.equal(c.controller.state().reason, '');
});

test('offline time is excluded and uploads recover cautiously after reconnection', () => {
  const c = clock(); c.start(6); c.sample(10, 100_000);
  c.controller.setOffline(true); c.advance(600_000); c.controller.tick({ queued: 69 });
  assert.equal(c.controller.state().limit, 6);
  c.controller.setOffline(false);
  assert.equal(c.controller.state().limit, 3);
  c.sample(50, 100_000);
  assert.equal(c.controller.state().limit, 3);
  c.sample(25, 100_000);
  assert.equal(c.controller.state().limit, 6);
});

test('a busy service reduces admission without exceeding the fallback', () => {
  const c = clock(2); c.controller.failure('busy');
  assert.equal(c.controller.state().limit, 2);
  assert.equal(c.controller.state().reason, 'busy');
});

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test('the queue drains active transfers before admitting work at a lower limit', async () => {
  const controller = createAdaptivePhotoUpload();
  const pending = new Map(); const started = [];
  const queue = runPhotoUploadQueue(12, { controller, task: index => new Promise(resolve => { started.push(index); pending.set(index, resolve); }) });
  queue.pump(); await flush(); assert.equal(pending.size, 6);
  controller.failure('connection'); queue.pump();
  assert.equal(started.length, 6);
  for (let i = 0; i < 3; i++) { pending.get(i)(); pending.delete(i); await flush(); }
  assert.equal(started.length, 6);
  pending.get(3)(); pending.delete(3); await flush();
  assert.equal(started.length, 7); assert.equal(queue.active(), 3);
  while (pending.size) {
    for (const [index, resolve] of [...pending]) { pending.delete(index); resolve(); }
    await flush();
  }
  await queue.done; assert.equal(started.length, 12);
});

test('an offline queue admits no new files and resumes without losing queued files', async () => {
  const controller = createAdaptivePhotoUpload(); controller.setOffline(true);
  const started = [];
  const queue = runPhotoUploadQueue(69, { controller, task: async index => { started.push(index); } });
  queue.pump(); await flush(); assert.equal(started.length, 0);
  controller.setOffline(false); queue.pump(); await queue.done;
  assert.equal(started.length, 69); assert.equal(new Set(started).size, 69);
});

test('stopping a queue lets its active tasks finish and skips queued tasks', async () => {
  const controller = createAdaptivePhotoUpload();
  const releases = [];
  const queue = runPhotoUploadQueue(69, { controller, task: () => new Promise(resolve => releases.push(resolve)) });
  queue.pump(); await flush(); queue.stop();
  for (const release of releases) release();
  await queue.done; assert.equal(queue.queued(), 63);
});

test('waiting retries respect the reduced transfer limit and can be stopped', async () => {
  const controller = createAdaptivePhotoUpload();
  const slots = createPhotoTransferSlots(() => controller.state());
  const releases = await Promise.all(Array.from({ length: 6 }, () => slots.acquire()));
  controller.failure('connection');
  let resumed = 0;
  const retry = slots.acquire().then(release => { resumed++; return release; });
  for (let i = 0; i < 3; i++) releases[i]();
  await flush(); assert.equal(resumed, 0);
  releases[3](); await flush(); assert.equal(resumed, 1);
  const signal = new AbortController(); const stopped = slots.acquire(signal.signal);
  signal.abort(new Error('Stopped')); await assert.rejects(stopped, /Stopped/);
  (await retry)(); releases[4](); releases[5]();
});

test('connection waits resume on online events, support aborts, and clean up listeners', async t => {
  const events = new EventTarget();
  const previousWindow = globalThis.window;
  globalThis.window = events;
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const changes = []; const connection = createUploadConnection(value => changes.push(value));
  events.dispatchEvent(new Event('offline'));
  let resumed = false;
  const wait = connection.wait().then(() => { resumed = true; });
  await flush(); assert.equal(resumed, false);
  events.dispatchEvent(new Event('online')); await wait;
  assert.equal(resumed, true); assert.deepEqual(changes, [true, false]);
  events.dispatchEvent(new Event('offline'));
  const signal = new AbortController(); const aborted = connection.wait(signal.signal);
  signal.abort(new Error('Stopped')); await assert.rejects(aborted, /Stopped/);
  const disposed = connection.wait(); connection.dispose(); await disposed;
  events.dispatchEvent(new Event('online')); assert.equal(changes.length, 3);
});

test('old upload permission is renewed before use', () => {
  assert.equal(uploadPermissionIsFresh({ expiresAt: new Date(Date.now() + 1_200_000).toISOString() }), true);
  assert.equal(uploadPermissionIsFresh({ expiresAt: new Date(Date.now() + 30_000).toISOString() }), false);
  assert.equal(uploadPermissionIsFresh({ expiresAt: new Date(Date.now() - 1).toISOString() }), false);
  assert.equal(uploadPermissionIsFresh({ expiresAt: 'invalid' }), false);
  assert.equal(uploadPermissionIsFresh({}), true, 'compatibility with older servers');
});

test('a batch stop interrupts the retry wait', async () => {
  const signal = new AbortController();
  const waiting = waitForUploadRetry(60_000, signal.signal);
  signal.abort(new Error('Stopped')); await assert.rejects(waiting, /Stopped/);
  await waitForUploadRetry(1);
});
