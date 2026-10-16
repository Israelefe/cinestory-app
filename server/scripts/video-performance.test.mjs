import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withVideoInspection, inspectLocalVideo, extractVideoFrame, runMediaTool } from '../src/services/videoMedia.service.js';
import { encodeAdaptiveVideo } from '../src/services/videoEncode.service.js';

const root = fileURLToPath(new URL('../../.visual-review/video-performance-tests/', import.meta.url));
const tool = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-muxers'], { encoding: 'utf8', windowsHide: true });
const supported = tool.status === 0 && /\bE\s+hls\s/.test(tool.stdout);
function storage(t) {
  const previous = { ...process.env };
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
}
async function source() {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'film-'));
  const file = path.join(directory, 'source.mp4');
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-y', file]);
  return { file, directory, metadata: await inspectLocalVideo(file, 10800) };
}

test('large-file inspection reads metadata and a cover through bounded private ranges', { skip: !supported, timeout: 60000 }, async t => {
  storage(t);
  const original = await source();
  const bytes = await readFile(original.file);
  const total = 1_000_000_000;
  const padding = Buffer.alloc(8); padding.writeUInt32BE(total - bytes.length); padding.write('free', 4);
  const ranges = []; let transferred = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(new URL(url).hostname, /r2\.cloudflarestorage\.com$/);
    const range = options.headers.range;
    assert.match(range, /^bytes=\d+-\d+$/);
    const [start, end] = range.slice(6).split('-').map(Number);
    ranges.push([start, end]);
    let offset = start;
    const body = new ReadableStream({ pull(controller) {
      if (offset > end) { controller.close(); return; }
      const chunk = Buffer.alloc(Math.min(64 * 1024, end - offset + 1));
      for (const [data, at] of [[bytes, 0], [padding, bytes.length]]) {
        const left = Math.max(offset, at), right = Math.min(offset + chunk.length, at + data.length);
        if (right > left) data.copy(chunk, left - offset, left - at, right - at);
      }
      offset += chunk.length; transferred += chunk.length; controller.enqueue(chunk);
    } });
    return new Response(body, { status: 206, headers: { 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${total}` } });
  });
  await withVideoInspection({ filename: 'large.mp4', objectKey: 'private/large.mp4', bytes: total }, async ({ file, directory }) => {
    assert.match(file, /^http:\/\/127\.0\.0\.1:/);
    const metadata = await inspectLocalVideo(file, 10800);
    assert.equal(metadata.width, 1280); assert.equal(metadata.height, 720);
    assert.equal(Math.round(metadata.duration), 10);
    const cover = await extractVideoFrame(file, directory, 1);
    assert.ok(cover.length > 0);
  });
  assert.ok(ranges.length > 1);
  assert.ok(transferred < 64 * 1024 ** 2, `Inspection transferred ${transferred} bytes instead of the 1 GB original.`);
  t.diagnostic(JSON.stringify({ originalBytes: total, inspectionBytesRead: transferred, rangeRequests: ranges.length }));
});

test('closed segments upload before encoding finishes and preserve the full film', { skip: !supported, timeout: 60000 }, async t => {
  storage(t);
  const original = await source(); const before = await readFile(original.file);
  let percent = 0; let uploadedDuringEncoding = 0;
  const uploaded = new Map();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const key = decodeURIComponent(new URL(url).pathname.slice('/test/'.length));
    if (key.endsWith('.ts') && percent < 99) uploadedDuringEncoding++;
    uploaded.set(key, Buffer.from(await new Response(options.body).arrayBuffer()));
    return new Response(null, { status: 200 });
  });
  const result = await encodeAdaptiveVideo({ ...original, prefix: 'overlap/', onProgress: progress => { percent = progress.percent; } });
  assert.ok(uploadedDuringEncoding > 0, 'Network transfer must overlap actual encoding.');
  assert.ok(result.variants[0].segments.length >= 5);
  for (const [index, segment] of result.variants[0].segments.entries()) assert.equal(uploaded.get(`overlap/q720/s${String(index).padStart(6, '0')}.ts`).length, segment.bytes);
  assert.deepEqual(await readFile(original.file), before);
});

test('segment upload failure stops encoding without publishing a playable manifest', { skip: !supported, timeout: 60000 }, async t => {
  storage(t);
  const original = await source(); const before = await readFile(original.file);
  const keys = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const key = decodeURIComponent(new URL(url).pathname.slice('/test/'.length)); keys.push(key);
    await new Response(options.body).arrayBuffer();
    return new Response(null, { status: 503 });
  });
  await assert.rejects(encodeAdaptiveVideo({ ...original, prefix: 'failed/' }), { code: 'R2_REQUEST_FAILED' });
  assert.ok(keys.some(key => key.endsWith('.ts')));
  assert.ok(keys.every(key => !key.endsWith('.m3u8')));
  assert.deepEqual(await readFile(original.file), before);
});
