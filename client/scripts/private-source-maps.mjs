import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

export function buildRevision() {
  const value = process.env.VITE_APP_REVISION || process.env.CF_PAGES_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || '';
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/.test(value) && !['.', '..'].includes(value) ? value : 'unknown';
}

export function privateSourceMaps() {
  let config;
  return { name: 'veylo-private-source-maps', apply: 'build', configResolved(value) { config = value; }, async writeBundle() {
    if (process.env.VEYLO_PRIVATE_SOURCE_MAPS !== 'true') return;
    const revision = buildRevision();
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/.test(revision) || ['.', '..', 'unknown'].includes(revision)) throw new Error('Set VITE_APP_REVISION to this release before generating private source maps.');
    const assets = path.resolve(config.root, config.build.outDir, 'assets');
    const destination = path.resolve(config.root, '..', '.private-sourcemaps', revision);
    await mkdir(destination, { recursive: true });
    for (const file of await readdir(assets)) {
      if (/^[A-Za-z0-9_-]{1,120}\.m?js\.map$/.test(file)) await rename(path.join(assets, file), path.join(destination, file));
    }
  } };
}
