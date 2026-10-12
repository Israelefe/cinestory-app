import fs from 'node:fs/promises';
import path from 'node:path';
import { root, repo } from '../src/server/config.mjs';
const forbidden = [/\buseReducedMotion\b/, /prefers-reduced-motion/, /reducedMotion\s*[:=]\s*['"](?:user|always)['"]/];
async function walk(dir) { const out = []; for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) out.push(...await walk(file)); else if (/\.(jsx?|css|mjs)$/.test(file)) out.push(file); } return out; }
const failures = [];
for (const file of await walk(path.join(root, 'src/ui'))) { const text = await fs.readFile(file, 'utf8'); if (forbidden.some(pattern => pattern.test(text))) failures.push(file); }
const shared = await fs.readFile(path.join(repo, 'client/src/utils/motionPolicy.js'), 'utf8');
if (!shared.includes("reducedMotion: 'never'")) failures.push('Shared Veylo motion policy changed.');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; } else console.log('Veylo motion policy verified.');
