import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodingVariants, parseHlsPlaylist, encodeAdaptiveVideo } from '../src/services/videoEncode.service.js';
import { inspectLocalVideo, runMediaTool } from '../src/services/videoMedia.service.js';

const root = fileURLToPath(new URL('../../.visual-review/video-hls/', import.meta.url));
const formats = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-muxers'], { encoding: 'utf8', windowsHide: true });
const hasEncoder = formats.status === 0 && /\bE\s+hls\s/.test(formats.stdout);
test('quality ladders preserve portrait framing and never upscale small films', () => {
  assert.deepEqual(encodingVariants({ width: 1920, height: 1080 }).map(row => [row.width, row.height]), [[640, 360], [852, 480], [1280, 720], [1920, 1080]]);
  assert.deepEqual(encodingVariants({ width: 1080, height: 1920 }).map(row => [row.width, row.height]), [[360, 640], [480, 852], [720, 1280], [1080, 1920]]);
  assert.deepEqual(encodingVariants({ width: 320, height: 240 }).map(row => [row.width, row.height]), [[320, 240]]);
  assert.deepEqual(encodingVariants({ width: 8192, height: 16 }).map(row => [row.width, row.height]), [[1920, 2]]);
});
test('HLS output validation rejects missing endings, external paths and duration mismatch', () => {
  const valid = '#EXTM3U\n#EXTINF:6.000,\ns000000.ts\n#EXTINF:2.000,\ns000001.ts\n#EXT-X-ENDLIST\n';
  assert.equal(parseHlsPlaylist(valid, 8).length, 2);
  for (const text of [valid.replace('#EXT-X-ENDLIST', ''), valid.replace('s000000.ts', '../original.mp4'), valid.replace('s000000.ts', 'https://other.example/a.ts'), valid.replace('6.000', '99.000')]) assert.throws(() => parseHlsPlaylist(text, 8));
  assert.throws(() => parseHlsPlaylist(valid, 60));
});
for (const portrait of [false, true]) test(`real FFmpeg produces complete adaptive ${portrait ? 'portrait' : 'landscape'} HLS with audio`, { skip: !hasEncoder && 'Install full FFmpeg with the HLS muxer and set FFMPEG_PATH/FFPROBE_PATH.', timeout: 180000 }, async t => {
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'encode-'));
  const source = path.join(directory, 'source.mp4');
  const width = portrait ? 720 : 1920, height = portrait ? 1280 : 1080;
  await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=24`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-y', source]);
  const metadata = await inspectLocalVideo(source, 10800);
  const uploads = new Map();
  const previous = { ...process.env };
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.method, 'PUT');
    const key = decodeURIComponent(new URL(url).pathname.slice('/test/'.length));
    const bytes = Buffer.isBuffer(options.body) ? options.body : Buffer.from(await new Response(options.body).arrayBuffer());
    uploads.set(key, bytes); return new Response(null, { status: 200 });
  });
  const prefix = 'fixture/'; const result = await encodeAdaptiveVideo({ file: source, directory, metadata, prefix });
  assert.equal(result.variants.length, portrait ? 3 : 4); assert.ok(result.bytes > 0);
  const target = path.join(root, portrait ? 'portrait' : 'landscape'); await mkdir(target, { recursive: true });
  for (const [key, bytes] of uploads) { const file = path.join(target, key.slice(prefix.length)); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  const master = await readFile(path.join(target, 'master.m3u8'), 'utf8');
  for (const variant of result.variants) {
    assert.match(master, new RegExp(variant.name + '/index\\.m3u8')); assert.equal(variant.segments.length, 2);
    const segment = path.join(target, variant.name, 's000000.ts');
    const probe = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', segment]));
    const video = probe.streams.find(row => row.codec_type === 'video'); const audio = probe.streams.find(row => row.codec_type === 'audio');
    assert.equal(video.codec_name, 'h264'); assert.equal(audio.codec_name, 'aac'); assert.equal(video.width, variant.width); assert.equal(video.height, variant.height);
    assert.equal(uploads.get(prefix + variant.name + '/s000000.ts').length, variant.segments[0].bytes);
    assert.ok(Math.abs(variant.segments.reduce((sum, row) => sum + row.seconds, 0) - 8) < .1);
  }
  await assert.rejects(encodeAdaptiveVideo({ file: source, directory, metadata, prefix: 'cancelled/', guard: async () => { throw Object.assign(new Error('Lease lost'), { code: 'VIDEO_JOB_SUPERSEDED' }); } }), { code: 'VIDEO_JOB_SUPERSEDED' });
});
