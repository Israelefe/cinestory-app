import { mkdir, readdir, rename, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function buildRevision() {
  let gitRevision = '';
  try { gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const value = process.env.VITE_APP_REVISION || process.env.CF_PAGES_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || gitRevision;
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/.test(value) && !['.', '..'].includes(value) ? value : 'unknown';
}
export const privateMapsEnabled = () => process.env.VEYLO_PRIVATE_SOURCE_MAPS === 'true' || Boolean(process.env.POSTHOG_CLI_API_KEY || process.env.POSTHOG_CLI_PROJECT_ID);
export async function archiveSourceMaps(root, outDir, copyOnly = false) {
  const revision = buildRevision();
  if (revision === 'unknown') throw new Error('Set VITE_APP_REVISION before generating private source maps.');
  const assets = path.resolve(root, outDir, 'assets');
  const destination = path.resolve(root, '..', '.private-sourcemaps', revision);
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(assets)) {
    if (/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,119}\.m?js\.map$/.test(file)) await (copyOnly ? copyFile : rename)(path.join(assets, file), path.join(destination, file));
  }
}

export function privateSourceMaps() {
  let config;
  return { name: 'veylo-private-source-maps', apply: 'build', configResolved(value) { config = value; }, writeBundle: { sequential: true, order: 'post', async handler() {
    if (privateMapsEnabled()) await archiveSourceMaps(config.root, config.build.outDir);
  } } };
}
