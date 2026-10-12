import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createStudio } from '../src/server/app.mjs';
import { root } from '../src/server/config.mjs';
if (Number(process.versions.node.split('.')[0]) < 26) throw new Error('Install Node.js 26.4 or later before starting the studio.');
if (!await fs.access(path.join(root, 'dist/index.html')).then(() => true).catch(() => false) || (process.argv.includes('--build') || process.argv.includes('--dev'))) {
  await import('./verify-motion.mjs'); const { build } = await import('vite'); await build({ root, configFile: path.join(root, 'vite.config.js'), configLoader: 'native' });
}
const studio = await createStudio(); await studio.listen();
console.log(`Veylo Content Studio is running at ${studio.config.origin}\nYour PC stores jobs and renders videos. Keep this window open.`);
if (process.argv.includes('--open')) { if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', studio.config.origin], { windowsHide: true, stdio: 'ignore' }); else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [studio.config.origin], { stdio: 'ignore' }); }
let closing = false; for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await studio.close(); process.exit(0); });
