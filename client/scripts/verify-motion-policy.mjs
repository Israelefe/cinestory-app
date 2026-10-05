import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VEYLO_MOTION_CONFIG, useVeyloReducedMotion } from '../src/utils/motionPolicy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css', '.html', '.vue', '.svelte']);

export function motionPolicyViolations(source) {
  const errors = [];
  if (/prefers-reduced-motion|motion-(?:reduce|safe)\s*:/i.test(source)) {
    errors.push('Device motion queries and Tailwind motion variants are prohibited.');
  }
  if (/\buseReducedMotion(?:Config)?\b/.test(source)) {
    errors.push('Use useVeyloReducedMotion from src/utils/motionPolicy.js.');
  }
  if (/\breducedMotion\s*[:=]\s*['"](?:user|always)['"]/.test(source)) {
    errors.push('The animation provider must keep full motion.');
  }
  if (/\bMotionConfig\s+as\b/.test(source)) {
    errors.push('Keep MotionConfig unaliased so its shared configuration can be verified.');
  }
  for (const provider of source.matchAll(/<MotionConfig\b([^>]*)>/g)) {
    if (provider[1].trim() !== '{...VEYLO_MOTION_CONFIG}') {
      errors.push('Every MotionConfig must use only {...VEYLO_MOTION_CONFIG}.');
    }
  }
  return errors;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(path)) ? [path] : [];
  }));
  return groups.flat();
}

export async function verifyMotionPolicy() {
  assert.deepEqual(VEYLO_MOTION_CONFIG, { reducedMotion: 'never' }, 'Veylo must keep full motion.');
  assert.ok(Object.isFrozen(VEYLO_MOTION_CONFIG), 'The shared motion configuration must be immutable.');
  assert.equal(useVeyloReducedMotion(), false, 'The shared component flag must keep motion enabled.');
  const files = [...await sourceFiles(resolve(root, 'src')), ...await sourceFiles(resolve(root, 'public')), resolve(root, 'tailwind.config.js')];
  const failures = (await Promise.all(files.map(async path => {
    const errors = motionPolicyViolations(await readFile(path, 'utf8'));
    return errors.map(error => `${path.slice(root.length + 1)}: ${error}`);
  }))).flat();
  const app = await readFile(resolve(root, 'src/App.jsx'), 'utf8');
  if (!app.includes('<MotionConfig {...VEYLO_MOTION_CONFIG}>')) {
    failures.push('src/App.jsx: The application must use the shared motion provider.');
  }
  assert.equal(failures.length, 0, `Veylo motion policy failed:\n${failures.join('\n')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyMotionPolicy();
  console.log('Veylo motion policy verified: shared full motion, no device-based suppression.');
}
