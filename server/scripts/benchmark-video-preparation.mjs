import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { encodeAdaptiveVideo, encodingVariants } from '../src/services/videoEncode.service.js';
import { inspectLocalVideo, runMediaTool } from '../src/services/videoMedia.service.js';

const option = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseline = option('baseline', '068aa43');
const seconds = Number(option('seconds', '8'));
const latencyMs = Number(option('latency-ms', '80'));
if (!/^[a-f\d]{7,40}$/i.test(baseline) || !Number.isInteger(seconds) || seconds < 4 || seconds > 60 || !Number.isInteger(latencyMs) || latencyMs < 0 || latencyMs > 1000) throw new Error('Invalid benchmark options.');
const root = fileURLToPath(new URL('../../.visual-review/video-performance/', import.meta.url));
await mkdir(root, { recursive: true });
const oldCode = execFileSync('git', ['show', `${baseline}:server/src/services/videoEncode.service.js`], { encoding: 'utf8', windowsHide: true });
const importedCode = oldCode.replace(/from '(\.\/[^']+)'/g, (_, source) => `from '${new URL(source, new URL('../src/services/', import.meta.url)).href}'`);
const baselinePath = path.join(root, 'baseline-encode.mjs');
await writeFile(baselinePath, importedCode);
const oldEncoder = (await import(pathToFileURL(baselinePath).href)).encodeAdaptiveVideo;
const sources = [];
for (const portrait of [false, true]) {
  const file = path.join(root, portrait ? 'portrait.mp4' : 'landscape.mp4');
  const [width, height] = portrait ? [1080, 1920] : [1920, 1080];
  await runMediaTool('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-y', file]);
  const original = await readFile(file);
  sources.push({ file, metadata: await inspectLocalVideo(file, 10800), bytes: original.length, hash: crypto.createHash('sha256').update(original).digest('hex') });
}
Object.assign(process.env, { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'benchmark-only', R2_SECRET_ACCESS_KEY: 'benchmark-only', R2_BUCKET_NAME: 'benchmark' });
let metrics;
globalThis.fetch = async (url, options) => {
  if (new URL(url).hostname !== 'a'.repeat(32) + '.r2.cloudflarestorage.com' || options.method !== 'PUT') throw new Error('Benchmark storage is local only.');
  const bytes = (await new Response(options.body).arrayBuffer()).byteLength;
  metrics.requests++; metrics.uploadBytes += bytes;
  if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
  return new Response(null, { status: 200 });
};
async function measure(label, encode, concurrency) {
  metrics = { requests: 0, uploadBytes: 0 };
  let next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = next++;
      if (index >= 6) return;
      const source = sources[index % sources.length];
      const directory = await mkdtemp(path.join(root, label + '-'));
      const result = await encode({ file: source.file, directory, metadata: source.metadata, prefix: `${label}/${index}/` });
      if (result.variants.length !== encodingVariants(source.metadata).length) throw new Error('A required quality was missing.');
    }
  }));
  const result = { label, concurrency, seconds: Math.round((performance.now() - started) / 10) / 100, ...metrics };
  console.log(JSON.stringify(result));
  return result;
}
const results = [];
results.push(await measure('baseline', oldEncoder, 1));
results.push(await measure('optimized-one-worker', encodeAdaptiveVideo, 1));
results.push(await measure('optimized-two-workers', encodeAdaptiveVideo, 2));
results.push(await measure('optimized-four-workers', encodeAdaptiveVideo, 4));
for (const source of sources) if (crypto.createHash('sha256').update(await readFile(source.file)).digest('hex') !== source.hash) throw new Error('The original changed.');
const report = { scope: 'All qualities for six local 1080p films; local storage simulation, not a production latency guarantee.', baseline, durationSecondsPerFilm: seconds,
  originalBytesForSixFilms: sources.reduce((sum, source) => sum + source.bytes * 3, 0), simulatedStorageRequestLatencyMs: latencyMs, results,
  oneWorkerSpeedup: results[0].seconds / results[1].seconds, twoWorkerSpeedup: results[0].seconds / results[2].seconds, fourWorkerSpeedup: results[0].seconds / results[3].seconds, originalsUnchanged: true };
await writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
