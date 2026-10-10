import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const maps = new Map();
export async function symbolicateBrowserDiagnostic(diagnostic) {
  if (!diagnostic || !process.env.BROWSER_SOURCE_MAP_DIR || !/^[A-Za-z0-9._-]{1,80}$/.test(diagnostic.release || '') || ['.', '..', 'unknown'].includes(diagnostic.release)) return diagnostic;
  const root = path.resolve(process.env.BROWSER_SOURCE_MAP_DIR), releaseDir = path.resolve(root, diagnostic.release);
  if (!releaseDir.startsWith(root + path.sep)) return diagnostic;
  const frames = await Promise.all(diagnostic.frames.map(async frame => {
    if (!/^\/assets\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,119}\.m?js$/.test(frame.asset)) return frame;
    const file = path.join(releaseDir, `${path.basename(frame.asset)}.map`);
    try {
      let map = maps.get(file);
      if (!map) {
        if ((await stat(file)).size > 32 * 1024 * 1024) return frame;
        map = new TraceMap(JSON.parse(await readFile(file, 'utf8')));
        if (maps.size >= 20) maps.delete(maps.keys().next().value);
        maps.set(file, map);
      }
      const position = originalPositionFor(map, { line: Math.max(1, frame.line), column: Math.max(0, frame.column - 1) });
      const source = position.source?.replaceAll('\\', '/').match(/(?:^|\/)src\/([A-Za-z0-9_./-]+\.[jt]sx?)$/)?.[1];
      // Code paths only, never sourcesContent, source lines or function names.
      if (!source || source.split('/').includes('..') || !position.line) return frame;
      return { ...frame, original: { source: `src/${source}`, line: position.line, column: position.column + 1 } };
    } catch { return frame; }
  }));
  return { ...diagnostic, frames };
}
