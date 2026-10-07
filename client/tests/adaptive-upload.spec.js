import { expect, test } from '@playwright/test';

async function prepare(page, options = {}) {
  await page.route('**/adaptive-upload-check', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:16px;background:#09090c;color:#fff"><div id="root"></div></body></html>' }));
  await page.route('**/src/config/env.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const API_BASE_URL = '/api';" }));
  await page.goto('/adaptive-upload-check');
  await page.clock.install();
  await page.evaluate(async options => {
    const { default: api } = await import('/src/services/api.js');
    const state = window.uploadTest = {
      pending: new Map(), originals: new Set(), confirmed: new Map(), puts: [], apiCalls: [], history: [],
      peaks: 0, offline: false, speed: options.speed ?? 100_000, maximum: options.maximum ?? 10,
      rejectedConfirmations: options.rejectedConfirmations || 0, expiredFirst: options.expiredFirst || false,
      firstSignature: true, stopAfterTransfer: options.stopAfterTransfer || false, finished: false
    };
    document.cookie = 'veylo_csrf=check; Path=/';
    function reject(status, code, message) { throw Object.assign(new Error(message), { response: { status, data: { code, message } } }); }
    api.defaults.adapter = async config => {
      const body = JSON.parse(config.data);
      const action = config.url.split('/').at(-1);
      state.apiCalls.push({ action, ...body });
      const signature = {
        uploadUrl: `https://test.r2.cloudflarestorage.com/${body.uploadId}`,
        objectKey: body.uploadId, uploadToken: 'private-test-token', contentType: 'image/jpeg',
        expiresAt: new Date(Date.now() + (state.expiredFirst && state.firstSignature ? 30_000 : 1_200_000)).toISOString(),
        maxConcurrentUploads: state.maximum
      };
      state.firstSignature = false;
      let data;
      if (action === 'confirm') {
        if (state.rejectedConfirmations-- > 0) reject(502, 'SAVE_INTERRUPTED', 'Photo check interrupted');
        data = { assetId: body.uploadId, originalFilename: body.originalFilename };
        state.confirmed.set(body.uploadId, data);
      } else if (action === 'recover') data = state.confirmed.has(body.uploadId) ? { asset: state.confirmed.get(body.uploadId) }
        : { uploaded: state.originals.has(body.uploadId) ? { objectKey: body.uploadId } : null, signature };
      else data = signature;
      return { status: 200, statusText: 'OK', headers: {}, config, data: { data } };
    };
    window.XMLHttpRequest = class {
      constructor() { this.upload = {}; }
      open(method, url) { this.id = new URL(url).pathname.slice(1); this.method = method; }
      setRequestHeader() {}
      send(file) {
        this.file = file; this.loaded = 0;
        state.puts.push({ id: this.id, name: file.name, timeout: this.timeout, method: this.method });
        state.pending.set(this.id, this); state.peaks = Math.max(state.peaks, state.pending.size);
        this.timer = setInterval(() => {
          if (state.offline) return;
          this.loaded = Math.min(file.size, this.loaded + state.speed);
          this.upload.onprogress?.({ lengthComputable: true, loaded: this.loaded, total: file.size });
        }, 1000);
      }
      complete() {
        clearInterval(this.timer); state.pending.delete(this.id); state.originals.add(this.id);
        this.upload.onprogress?.({ lengthComputable: true, loaded: this.file.size, total: this.file.size });
        if (state.stopAfterTransfer) { state.stopAfterTransfer = false; window.changeConnection(true); }
        this.status = 200; this.onload();
      }
      fail() { clearInterval(this.timer); state.pending.delete(this.id); this.onerror(); }
      refuse(status) { clearInterval(this.timer); state.pending.delete(this.id); this.status = status; this.onload(); }
      abort() { throw new Error('The uploader must let active photos finish'); }
    };
    window.changeConnection = offline => {
      state.offline = offline;
      window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
    };
    window.finishTransfers = () => { for (const transfer of [...state.pending.values()]) transfer.complete(); };
    window.startUploads = async (count = 69, legacy = false) => {
      const { uploadDeliveryPhotosV3 } = await import('/src/utils/deliveryUploadV3.js');
      const { uploadDeliveryPhotos } = await import('/src/utils/deliveryUpload.js');
      const files = Array.from({ length: count }, (_, i) => ({ name: `${i}.jpg`, size: 20_000_000, type: 'image/jpeg', lastModified: 123 }));
      window.batchPromise = (legacy ? uploadDeliveryPhotos : uploadDeliveryPhotosV3)('draft', files, (percent, meta) => {
        state.history.push({ percent, ...meta });
      }).then(result => { state.result = { completed: result.completed, errors: result.errors.length, ids: result.successfulAssets.map(asset => asset.assetId) }; state.finished = true; });
    };
  }, options);
}

async function start(page, count = 69, legacy = false) {
  await page.evaluate(({ count, legacy }) => window.startUploads(count, legacy), { count, legacy });
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(Math.min(6, count, await page.evaluate(() => window.uploadTest.maximum)));
}

async function finish(page) {
  // Drain controlled transfers while allowing permission and confirmation promises to settle.
  for (let wave = 0; wave < 69; wave++) {
    const state = await page.evaluate(async () => {
      window.finishTransfers();
      for (let i = 0; i < 40; i++) await Promise.resolve();
      return { finished: window.uploadTest.finished, pending: window.uploadTest.pending.size };
    });
    if (state.finished) return page.evaluate(() => window.uploadTest.result);
    if (!state.pending) await page.clock.runFor(1000);
  }
  throw new Error('The controlled upload queue did not finish');
}

test('a stable 69-photo batch grows from six to eight to ten and confirms each photo once', async ({ page }) => {
  await prepare(page); await start(page);
  await page.clock.runFor(25_000);
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(8);
  await page.clock.runFor(25_000);
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(10);
  const result = await finish(page);
  expect(result.completed).toBe(69); expect(result.errors).toBe(0); expect(new Set(result.ids).size).toBe(69);
  const state = await page.evaluate(() => ({
    peak: window.uploadTest.peaks, puts: window.uploadTest.puts, history: window.uploadTest.history,
    pending: sessionStorage.getItem('delivery-upload-v3:draft'), confirms: window.uploadTest.apiCalls.filter(call => call.action === 'confirm').length
  }));
  expect(state.peak).toBe(10); expect(state.puts).toHaveLength(69); expect(state.confirms).toBe(69); expect(state.pending).toBeNull();
  expect(state.puts.every(put => put.timeout === 900_000 && put.method === 'PUT')).toBe(true);
  expect(state.history.at(-1).percent).toBe(100);
  for (let i = 1; i < state.history.length; i++) expect(state.history[i].percent).toBeGreaterThanOrEqual(state.history[i - 1].percent);
  expect(state.history.filter(item => item.percent === 100).every(item => item.completed === 69)).toBe(true);
});

test('stalled transfers finish safely while new uploads are limited to two', async ({ page }) => {
  await prepare(page, { speed: 0 }); await start(page, 12);
  await page.clock.runFor(46_000);
  expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.limit)).toBe(3);
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.limit)).toBe(2);
  expect(await page.evaluate(() => window.uploadTest.puts.length)).toBe(6);
  await page.evaluate(async () => {
    for (const transfer of [...window.uploadTest.pending.values()].slice(0, 4)) transfer.complete();
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
  expect(await page.evaluate(() => window.uploadTest.puts.length)).toBe(6);
  await page.evaluate(async () => { window.uploadTest.pending.values().next().value.complete(); for (let i = 0; i < 40; i++) await Promise.resolve(); });
  expect(await page.evaluate(() => window.uploadTest.pending.size)).toBe(2);
  expect(await finish(page)).toMatchObject({ completed: 12, errors: 0 });
});

test('eight is rolled back to six when the whole batch does not get faster', async ({ page }) => {
  await prepare(page); await start(page);
  await page.clock.runFor(25_000);
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(8);
  await page.evaluate(() => { window.uploadTest.speed = 75_000; });
  await page.clock.runFor(25_000);
  expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.limit)).toBe(6);
  expect(await finish(page)).toMatchObject({ completed: 69, errors: 0 });
});

test('four disconnections pause retries and do not exhaust the three-attempt allowance', async ({ page }) => {
  await prepare(page); await start(page, 12);
  for (let interruption = 0; interruption < 4; interruption++) {
    await page.evaluate(() => { window.changeConnection(true); for (const transfer of [...window.uploadTest.pending.values()]) transfer.fail(); });
    const requests = await page.evaluate(() => window.uploadTest.apiCalls.length);
    await page.clock.runFor(60_000);
    expect(await page.evaluate(() => window.uploadTest.apiCalls.length)).toBe(requests);
    expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.offline)).toBe(true);
    await page.evaluate(() => window.changeConnection(false));
    await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(3);
    expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.limit)).toBe(3);
  }
  expect(await finish(page)).toMatchObject({ completed: 12, errors: 0 });
});

test('a completed original waits offline then refreshes its permission without another transfer', async ({ page }) => {
  await prepare(page, { stopAfterTransfer: true }); await start(page, 1);
  await page.evaluate(() => window.finishTransfers());
  await page.clock.runFor(21 * 60_000);
  expect(await page.evaluate(() => window.uploadTest.confirmed.size)).toBe(0);
  await page.evaluate(() => window.changeConnection(false));
  await expect.poll(() => page.evaluate(() => window.uploadTest.finished)).toBe(true);
  const state = await page.evaluate(() => ({ result: window.uploadTest.result, puts: window.uploadTest.puts.length, actions: window.uploadTest.apiCalls.map(call => call.action) }));
  expect(state.result).toMatchObject({ completed: 1, errors: 0 }); expect(state.puts).toBe(1);
  expect(state.actions).toEqual(['sign', 'recover', 'confirm']);
});

test('old permission is replaced before the first transfer', async ({ page }) => {
  await prepare(page, { expiredFirst: true }); await start(page, 1);
  expect(await page.evaluate(() => window.uploadTest.apiCalls.map(call => call.action))).toEqual(['sign', 'sign']);
  expect(await finish(page)).toMatchObject({ completed: 1, errors: 0 });
});

test('failed confirmations recover stored originals without reducing network concurrency', async ({ page }) => {
  await prepare(page, { rejectedConfirmations: 2 }); await start(page, 12);
  await page.evaluate(() => window.finishTransfers());
  await page.clock.runFor(6000);
  expect(await finish(page)).toMatchObject({ completed: 12, errors: 0 });
  const state = await page.evaluate(() => ({ puts: window.uploadTest.puts.length, history: window.uploadTest.history, recoveries: window.uploadTest.apiCalls.filter(call => call.action === 'recover').length }));
  expect(state.puts).toBe(12); expect(state.recoveries).toBe(2);
  expect(state.history.some(item => item.batch.reason === 'connection' || item.batch.reason === 'slow')).toBe(false);
});

test('the server fallback stays at two and the older delivery uploader uses the shared queue', async ({ page }) => {
  await prepare(page, { maximum: 2 }); await start(page, 12, true);
  await page.clock.runFor(30_000);
  expect(await page.evaluate(() => window.uploadTest.pending.size)).toBe(2);
  expect(await finish(page)).toMatchObject({ completed: 12, errors: 0 });
  expect(await page.evaluate(() => window.uploadTest.peaks)).toBe(2);
});

test('connected transfer failures stop after three attempts with delays between them', async ({ page }) => {
  await prepare(page); await start(page, 1);
  await page.evaluate(() => window.uploadTest.pending.values().next().value.fail());
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.uploadTest.puts.length)).toBe(1);
  await page.clock.runFor(1100);
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(1);
  await page.evaluate(() => window.uploadTest.pending.values().next().value.fail());
  await page.clock.runFor(4100);
  await expect.poll(() => page.evaluate(() => window.uploadTest.pending.size)).toBe(1);
  await page.evaluate(() => window.uploadTest.pending.values().next().value.fail());
  await expect.poll(() => page.evaluate(() => window.uploadTest.finished)).toBe(true);
  expect(await page.evaluate(() => window.uploadTest.result)).toMatchObject({ completed: 0, errors: 1 });
  expect(await page.evaluate(() => window.uploadTest.puts.length)).toBe(3);
});

test('an oversized file is rejected once rather than retried as a connection failure', async ({ page }) => {
  await prepare(page); await start(page, 1);
  await page.evaluate(() => window.uploadTest.pending.values().next().value.refuse(413));
  await expect.poll(() => page.evaluate(() => window.uploadTest.finished)).toBe(true);
  expect(await page.evaluate(() => window.uploadTest.result)).toMatchObject({ completed: 0, errors: 1 });
  expect(await page.evaluate(() => window.uploadTest.puts.length)).toBe(1);
  expect(await page.evaluate(() => window.uploadTest.history.at(-1).batch.reason)).toBe('');
});

test('an empty upload batch requests no permission and sends no files', async ({ page }) => {
  await prepare(page); await page.evaluate(() => window.startUploads(0));
  await expect.poll(() => page.evaluate(() => window.uploadTest.finished)).toBe(true);
  expect(await page.evaluate(() => window.uploadTest.result)).toMatchObject({ completed: 0, errors: 0 });
  expect(await page.evaluate(() => window.uploadTest.apiCalls.length)).toBe(0);
});

for (const width of [320, 768, 834, 1280]) {
  test(`connection feedback fits ${width}px and keeps its animation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await prepare(page);
    await page.evaluate(async () => {
      const { default: RefreshRuntime } = await import('/@react-refresh');
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDomClient } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: Status } = await import('/src/components/UploadConnectionStatus.jsx');
      const { useVeyloReducedMotion } = await import('/src/utils/motionPolicy.js');
      function Check() { window.sharedMotionDisabled = useVeyloReducedMotion(); return React.createElement(Status, { batch: { offline: true, limit: 3, total: 69, completed: 12 } }); }
      ReactDomClient.createRoot(document.getElementById('root')).render(React.createElement(Check));
    });
    await page.clock.runFor(300);
    const status = page.getByRole('status'); await expect(status).toContainText('Waiting for your internet connection.'); await expect(status).toContainText('12 of 69 photos added');
    expect(await page.evaluate(() => window.sharedMotionDisabled)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await status.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  });
}
