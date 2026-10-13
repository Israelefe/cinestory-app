import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createStudio } from '../src/server/app.mjs';
import { root, configuration } from '../src/server/config.mjs';
if (Number(process.versions.node.split('.')[0]) < 26) throw new Error('Install Node.js 26.4 or later before starting the studio.');
function openStudio(origin) {
  if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', origin], { windowsHide: true, stdio: 'ignore' });
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [origin], { stdio: 'ignore' });
}
let alreadyRunning = false;
if (process.argv.includes('--open') && !process.argv.includes('--build') && !process.argv.includes('--dev')) {
  const { origin } = configuration(); let running = false;
  try {
    const response = await fetch(origin + '/api/session', { signal: AbortSignal.timeout(1500) }), session = await response.json();
    running = response.ok && typeof session.authenticated === 'boolean' && typeof session.needsOwner === 'boolean';
  } catch {}
  if (running) { console.log('Opening the studio that is already running.'); openStudio(origin); alreadyRunning = true; }
}
if (!alreadyRunning) {
if (!await fs.access(path.join(root, 'dist/index.html')).then(() => true).catch(() => false) || (process.argv.includes('--build') || process.argv.includes('--dev'))) {
  await import('./verify-motion.mjs'); const { build } = await import('vite'); await build({ root, configFile: path.join(root, 'vite.config.js'), configLoader: 'native' });
}
const studio = await createStudio(); await studio.listen();
console.log(`Veylo Content Studio is running at ${studio.config.origin}\nYour PC stores jobs and renders videos. Keep this window open.`);
if (process.argv.includes('--open')) openStudio(studio.config.origin);
let closing = false; for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await studio.close(); process.exit(0); });
}
