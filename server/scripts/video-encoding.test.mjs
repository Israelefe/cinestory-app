import { VIDEO_QUALITY_VERSION } from '../src/services/videoQuality.service.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodingVariants, parseHlsPlaylist, encodeAdaptiveVideo } from '../src/services/videoEncode.service.js';
import { inspectLocalVideo, runMediaTool } from '../src/services/videoMedia.service.js';
import { packageOriginalVideo } from '../src/services/videoPackage.service.js';
import { originalVideoCompatible, originalPlaybackFile } from '../src/services/videoOriginal.service.js';

const root = fileURLToPath(new URL('../../.visual-review/video-hls/', import.meta.url));
const formats = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-muxers'], { encoding: 'utf8', windowsHide: true });
const hasEncoder = formats.status === 0 && /\bE\s+hls\s/.test(formats.stdout);

for (const scenario of ['landscape', 'portrait', 'long-gop', 'open-gop', '4k', 'rotated', 'silent']) test(`lossless ${scenario} playback preserves every decoded video frame and encoded audio packet`, { skip: !hasEncoder && 'Requires full FFmpeg and FFprobe.', timeout: 180000 }, async t => {
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'original-'));
  let source = path.join(directory, 'source.mp4');
  const width = scenario === 'portrait' ? 360 : scenario === '4k' ? 3840 : 640;
  const height = scenario === 'portrait' ? 640 : scenario === '4k' ? 2160 : 360;
  const duration = scenario === 'long-gop' ? 14 : scenario === '4k' ? 1 : 8;
  const visual = scenario === '4k' ? `color=c=navy:size=${width}x${height}:rate=60` : `testsrc2=size=${width}x${height}:rate=60`;
  await runMediaTool('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', visual, ...(scenario === 'silent' ? [] : ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000']), '-t', String(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', scenario === 'long-gop' ? '1800' : '120', ...(scenario === 'open-gop' ? ['-bf', '2', '-x264-params', 'open-gop=1'] : []), '-sc_threshold', '0', '-threads', '2', '-c:a', 'aac', '-y', source]);
  if (scenario === 'rotated') {
    const rotated = path.join(directory, 'rotated.mp4');
    await runMediaTool('ffmpeg', ['-v', 'error', '-i', source, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', '-y', rotated]); source = rotated;
  }
  const original = await readFile(source); const metadata = await inspectLocalVideo(source, 10800);
  assert.equal(metadata.frameRate, 60);
  const previous = { ...process.env }; const uploads = new Map();
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.method, 'PUT');
    uploads.set(decodeURIComponent(new URL(url).pathname.slice('/test/'.length)), Buffer.from(await new Response(options.body).arrayBuffer()));
    return new Response(null, { status: 200 });
  });
  const prefix = 'fixture/'; const result = await packageOriginalVideo({ file: source, directory, metadata, bytes: original.length, prefix });
  const target = path.join(root, 'original-' + scenario); await mkdir(target, { recursive: true });
  for (const [key, bytes] of uploads) { const local = path.join(target, key.slice(prefix.length)); await mkdir(path.dirname(local), { recursive: true }); await writeFile(local, bytes); }
  const playback = path.join(target, result.hls ? 'master.m3u8' : 'playback.mp4');
  assert.equal(Boolean(result.hls), !['long-gop', 'open-gop', 'rotated'].includes(scenario));
  if (result.hls) assert.deepEqual([result.hls.variants[0].width, result.hls.variants[0].height], [width, height]);
  else {
    const mp4 = uploads.get(result.key);
    assert.ok(mp4.indexOf(Buffer.from('moov')) < mp4.indexOf(Buffer.from('mdat')), 'MP4 metadata must precede the media for fast startup.');
  }
  const frames = async file => (await runMediaTool('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'file,crypto,data', '-threads', '2', '-i', file.replaceAll('\\', '/'), '-map', '0:v:0', '-an', '-f', 'framemd5', '-'])).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  assert.deepEqual(await frames(playback), await frames(source));
  if (scenario !== 'silent') {
    for (const [label, file] of [['source', source], ['playback', playback]]) await runMediaTool('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'file,crypto,data', '-i', file.replaceAll('\\', '/'), '-map', '0:a:0', '-c', 'copy', '-f', 'adts', '-y', path.join(directory, label + '.aac')]);
    assert.deepEqual(await readFile(path.join(directory, 'playback.aac')), await readFile(path.join(directory, 'source.aac')));
  } else assert.equal(metadata.audioCodec, '');
  assert.deepEqual(await readFile(source), original, 'The uploaded original must never be modified.');
  await assert.rejects(packageOriginalVideo({ file: source, directory, metadata, bytes: original.length, prefix, guard: async () => { throw Object.assign(new Error('Lease lost'), { code: 'VIDEO_JOB_SUPERSEDED' }); } }), { code: 'VIDEO_JOB_SUPERSEDED' });
});

test('native WebM playback preserves its original VP9 and Opus file', { skip: !hasEncoder && 'Requires full FFmpeg and FFprobe.', timeout: 60000 }, async t => {
  const renderer = fileURLToPath(new URL('../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe', import.meta.url));
  const previous = process.env.FFMPEG_PATH;
  t.after(() => { if (previous === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = previous; });
  const directory = path.join(root, 'original-webm'); await mkdir(directory, { recursive: true });
  const input = path.join(directory, 'source.mp4');
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-c:a', 'aac', '-y', input]);
  if (process.platform === 'win32' && existsSync(renderer)) process.env.FFMPEG_PATH = renderer;
  const file = path.join(directory, 'playback.webm');
  await runMediaTool('ffmpeg', ['-v', 'error', '-i', input, '-c:v', 'libvpx-vp9', '-lossless', '1', '-threads', '2', '-c:a', 'libopus', '-y', file]);
  const metadata = await inspectLocalVideo(file, 10800); const original = await readFile(file);
  const asset = { ...metadata, filename: 'playback.webm', objectKey: 'private/original.webm', bytes: original.length };
  assert.equal(metadata.videoCodec, 'vp9'); assert.equal(metadata.audioCodec, 'opus');
  assert.equal(originalVideoCompatible(asset), true);
  const resource = originalPlaybackFile(asset, 'original');
  assert.equal(resource.key, asset.objectKey); assert.equal(resource.bytes, original.length); assert.equal(resource.contentType, 'video/webm');
});
test('quality ladders preserve portrait framing and never upscale small films', () => {
  assert.deepEqual(encodingVariants({ width: 1920, height: 1080 }).map(row => [row.width, row.height]), [[1280, 720], [1920, 1080]]);
  assert.deepEqual(encodingVariants({ width: 1080, height: 1920 }).map(row => [row.width, row.height]), [[720, 1280], [1080, 1920]]);
  assert.deepEqual(encodingVariants({ width: 3840, height: 2160 }).map(row => Math.min(row.width, row.height)), [720, 1080, 1440, 2160]);
  assert.deepEqual(encodingVariants({ width: 1440, height: 2560 }).map(row => Math.min(row.width, row.height)), [720, 1080, 1440]);
  assert.deepEqual(encodingVariants({ width: 320, height: 240 }).map(row => [row.width, row.height]), [[320, 240]]);
  assert.deepEqual(encodingVariants({ width: 8192, height: 16 }).map(row => [row.width, row.height]), [[8192, 16]]);
  assert.ok(encodingVariants({ width: 3840, height: 2160, frameRate: 60 })[0].bitrate < 4_000_000);
});
test('a moving 60 fps film retains every frame with 720p segment peaks suitable for a 6 Mbps connection', { skip: !hasEncoder && 'Requires full FFmpeg and FFprobe.', timeout: 180000 }, async t => {
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'auto-720-mobile-'));
  const source = path.join(directory, 'source.mp4');
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=60', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', '-g', '120', '-threads', '2', '-y', source]);
  const original = await readFile(source), metadata = await inspectLocalVideo(source, 10800), uploads = new Map(), previous = { ...process.env };
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  t.mock.method(globalThis, 'fetch', async (url, options) => { uploads.set(decodeURIComponent(new URL(url).pathname.slice('/test/'.length)), Buffer.from(await new Response(options.body).arrayBuffer())); return new Response(null, { status: 200 }); });
  const result = await encodeAdaptiveVideo({ file: source, directory, metadata, prefix: 'mobile/' });
  assert.equal(result.variants.length, 1); assert.ok(result.variants[0].segments.every(row => row.bytes * 8 / row.seconds < 5_500_000));
  const segment = path.join(directory, 'encoded.ts'); await writeFile(segment, uploads.get('mobile/q720/s000000.ts'));
  const probe = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', segment]));
  const stream = probe.streams.find(row => row.codec_type === 'video'); const [rate, divisor] = stream.avg_frame_rate.split('/').map(Number);
  assert.equal(rate / divisor, 60); assert.equal(stream.width, 1280); assert.equal(stream.height, 720); assert.deepEqual(await readFile(source), original);
});
test('a high-bitrate 720p upload gets one bounded 720p quality instead of an oversized lossless stream', { skip: !hasEncoder && 'Requires full FFmpeg and FFprobe.', timeout: 180000 }, async t => {
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'auto-720-'));
  const source = path.join(directory, 'source.mp4');
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', '-g', '60', '-threads', '2', '-y', source]);
  const original = await readFile(source), metadata = await inspectLocalVideo(source, 10800);
  assert.ok(original.length * 8 / metadata.duration > 2_800_000);
  const previous = { ...process.env };
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  t.mock.method(globalThis, 'fetch', async (url, options) => { assert.equal(options.method, 'PUT'); await new Response(options.body).arrayBuffer(); return new Response(null, { status: 200 }); });
  const result = await encodeAdaptiveVideo({ file: source, directory, metadata, prefix: '720p-check/' });
  assert.equal(result.variants.length, 1); assert.equal(result.variants[0].name, 'q720'); assert.equal(result.variants[0].source, false);
  assert.ok(result.bytes < original.length); assert.deepEqual(await readFile(source), original);
});
test('HLS output validation rejects missing endings, external paths and duration mismatch', () => {
  const valid = '#EXTM3U\n#EXTINF:6.000,\ns000000.ts\n#EXTINF:2.000,\ns000001.ts\n#EXT-X-ENDLIST\n';
  assert.equal(parseHlsPlaylist(valid, 8).length, 2);
  for (const text of [valid.replace('#EXT-X-ENDLIST', ''), valid.replace('s000000.ts', '../original.mp4'), valid.replace('s000000.ts', 'https://other.example/a.ts'), valid.replace('6.000', '99.000')]) assert.throws(() => parseHlsPlaylist(text, 8));
  assert.throws(() => parseHlsPlaylist(valid, 60));
});

for (const [label, width, height, expected] of [['2K', 2560, 1440, [720, 1080, 1440]], ['4K', 3840, 2160, [720, 1080, 1440, 2160]]]) test(`automatic ${label} playback includes every required quality and preserves 60 fps`, { skip: !hasEncoder && 'Requires full FFmpeg and FFprobe.', timeout: 180000 }, async t => {
  await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'auto-'));
  const source = path.join(directory, 'source.mp4');
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=navy:size=${width}x${height}:rate=60`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '120', '-threads', '2', '-c:a', 'aac', '-y', source]);
  const original = await readFile(source); const metadata = await inspectLocalVideo(source, 10800);
  const previous = { ...process.env }; const uploads = new Map(); const progress = []; const previews = [];
  Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    uploads.set(decodeURIComponent(new URL(url).pathname.slice('/test/'.length)), Buffer.from(await new Response(options.body).arrayBuffer()));
    return new Response(null, { status: 200 });
  });
  const result = await encodeAdaptiveVideo({ file: source, directory, metadata, prefix: 'fixture/', onProgress: async value => progress.push(value), onRendition: async value => previews.push(value.variants.map(row => row.name)) });
  assert.equal(result.ladderVersion, VIDEO_QUALITY_VERSION);
  assert.deepEqual(result.variants.map(row => Math.min(row.width, row.height)), expected);
  assert.deepEqual(previews.map(row => row.length), expected.map((_, index) => index + 1));
  assert.ok(progress.some(row => row.percent > 0 && row.percent < 100));
  assert.ok(result.variants.at(-1).source, 'A compatible source should be packaged without re-encoding.');
  const target = path.join(root, 'adaptive-' + label.toLowerCase()); await mkdir(target, { recursive: true });
  for (const [key, bytes] of uploads) { const file = path.join(target, key.slice('fixture/'.length)); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  for (const variant of result.variants) {
    const probe = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(target, variant.name, 's000000.ts')]));
    const output = probe.streams.find(stream => stream.codec_type === 'video');
    const [rate, divisor] = output.avg_frame_rate.split('/').map(Number);
    assert.equal(rate / divisor, 60); assert.equal(output.width, variant.width); assert.equal(output.height, variant.height);
    assert.ok(variant.segments.every(segment => segment.seconds <= 2.5));
  }
  assert.deepEqual(await readFile(source), original);
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
  assert.equal(result.variants.length, portrait ? 1 : 2); assert.ok(result.bytes > 0);
  const target = path.join(root, portrait ? 'portrait' : 'landscape'); await mkdir(target, { recursive: true });
  for (const [key, bytes] of uploads) { const file = path.join(target, key.slice(prefix.length)); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  const master = await readFile(path.join(target, 'master.m3u8'), 'utf8');
  for (const variant of result.variants) {
    assert.match(master, new RegExp(variant.name + '/index\\.m3u8')); assert.ok(variant.segments.length >= 1);
    const segment = path.join(target, variant.name, 's000000.ts');
    const probe = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', segment]));
    const video = probe.streams.find(row => row.codec_type === 'video'); const audio = probe.streams.find(row => row.codec_type === 'audio');
    assert.equal(video.codec_name, 'h264'); assert.equal(audio.codec_name, 'aac'); assert.equal(video.width, variant.width); assert.equal(video.height, variant.height);
    assert.equal(uploads.get(prefix + variant.name + '/s000000.ts').length, variant.segments[0].bytes);
    assert.ok(Math.abs(variant.segments.reduce((sum, row) => sum + row.seconds, 0) - 8) < .1);
  }
  await assert.rejects(encodeAdaptiveVideo({ file: source, directory, metadata, prefix: 'cancelled/', guard: async () => { throw Object.assign(new Error('Lease lost'), { code: 'VIDEO_JOB_SUPERSEDED' }); } }), { code: 'VIDEO_JOB_SUPERSEDED' });
});
