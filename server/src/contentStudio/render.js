import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, makeCancelSignal } from '@remotion/renderer';
import { compositionProps } from './presentation.js';
import { consumeUnits } from './allowance.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = path.resolve(root, '.runtime/content-studio');
let bundled;
export function contentBrowserExecutable() {
  if (process.env.CONTENT_BROWSER_EXECUTABLE) return process.env.CONTENT_BROWSER_EXECUTABLE;
  if (process.platform === 'win32') return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  return undefined;
}
export async function prepareRenderer() {
  await fs.mkdir(runtime, { recursive: true });
  if (!bundled) bundled = bundle({ entryPoint: path.resolve(root, 'admin/src/content-studio/render-entry.jsx'), outDir: path.join(runtime, 'bundle'), publicDir: null }).catch(error => { bundled = null; throw error; });
  return bundled;
}
export async function exportCampaign({ project, version, signal, checkpoint, progress }) {
  const serveUrl = await prepareRenderer();
  const browserExecutable = contentBrowserExecutable();
  const jobs = [];
  for (const format of version.brief.formats) {
    const count = format === 'carousel' ? version.plan.scenes.length : 1;
    for (let slide = 0; slide < count; slide++) jobs.push({ id: `${format}-${slide + 1}`, format, slide });
  }
  // A separate cover travels with every video.
  if (version.brief.formats.includes('video') && !version.brief.formats.includes('story')) jobs.push({ id: 'cover-1', format: 'story', slide: 0, cover: true });

  const safeTitle = (project.title || 'campaign')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'campaign';
  const exportsDir = path.resolve(root, 'exports', `${safeTitle}-${String(project._id).slice(-6)}`);
  await fs.mkdir(exportsDir, { recursive: true });

  for (let index = 0; index < jobs.length; index++) {
    signal.throwIfAborted();
    const job = jobs[index];
    if (version.outputs.some(output => output.id === job.id)) continue;
    await consumeUnits(1);
    const inputProps = compositionProps(project, version, job.format, job.slide);
    const composition = await selectComposition({ serveUrl, id: 'VeyloContent', inputProps, browserExecutable, timeoutInMilliseconds: 60_000, logLevel: 'error' });
    const outputFilename = `${job.id}.${job.format === 'video' ? 'mp4' : 'png'}`;
    const outputLocation = path.join(exportsDir, outputFilename);
    const { cancel, cancelSignal } = makeCancelSignal();
    const onAbort = () => cancel();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      signal.throwIfAborted();
      const common = { serveUrl, composition, inputProps, outputLocation, browserExecutable, timeoutInMilliseconds: 60_000, logLevel: 'error' };
      if (job.format === 'video') {
        await renderMedia({
          ...common,
          codec: 'h264',
          audioCodec: 'aac',
          audioBitrate: '192k',
          pixelFormat: 'yuv420p',
          crf: 18,
          concurrency: Math.max(1, Math.min(4, Number(process.env.CONTENT_RENDER_CONCURRENCY) || 2)),
          cancelSignal,
          onProgress: ({ progress: value }) => progress(`Rendering video · ${Math.round(value * 100)}%`, 65 + (index + value) / jobs.length * 29)
        });
      } else {
        await renderStill({ ...common, output: outputLocation, cancelSignal, imageFormat: 'png', frame: 0 });
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    signal.throwIfAborted();

    const stat = await fs.stat(outputLocation);
    version.outputs.push({
      ...job,
      localPath: outputLocation,
      filename: outputFilename,
      exportFolder: exportsDir,
      width: composition.width,
      height: composition.height,
      bytes: stat.size,
      duration: job.format === 'video' ? composition.durationInFrames / composition.fps : undefined
    });
    await checkpoint();
    progress(`Exported ${index + 1} of ${jobs.length}`, 65 + (index + 1) / jobs.length * 29);
  }

  // Automatically open the exports folder in Windows File Explorer
  if (process.platform === 'win32') {
    try {
      const { exec } = await import('node:child_process');
      exec(`explorer.exe "${exportsDir}"`);
    } catch {}
  }
}
