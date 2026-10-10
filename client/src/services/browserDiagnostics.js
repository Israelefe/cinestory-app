const types = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError', 'ChunkLoadError']);
export function browserDiagnostic(error, { mechanism = 'window', filename, lineno, colno, origin = globalThis.location?.origin, release = 'unknown', chunkIds = globalThis._posthogChunkIds } = {}) {
  const frames = [];
  const chunks = new Map();
  for (const [stack, id] of Object.entries(chunkIds || {}).slice(0, 200)) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) continue;
    for (const row of stack.split('\n').slice(1, 8)) {
      const match = row.match(/(https?:\/\/[^\s)]+):\d+:\d+/);
      if (!match) continue;
      try { const url = new URL(match[1]); if (url.origin === origin) { chunks.set(url.pathname, id); break; } } catch {}
    }
  }
  function add(location, line, column) {
    try {
      const url = new URL(location, origin);
      if (url.origin !== origin || !/^\/assets\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,119}\.m?js$/.test(url.pathname)) return;
      const frame = { asset: url.pathname, line: Number(line) || 0, column: Number(column) || 0 };
      if (chunks.has(url.pathname)) frame.chunkId = chunks.get(url.pathname);
      if (!frames.some(item => JSON.stringify(item) === JSON.stringify(frame))) frames.push(frame);
    } catch { /* Ignore extension, cross-origin and non-code locations. */ }
  }
  for (const row of String(error?.stack || '').split('\n').slice(1, 16)) {
    const match = row.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
    if (match) add(match[1], match[2], match[3]);
  }
  if (!frames.length && filename) add(filename, lineno, colno);
  return { type: types.has(error?.name) ? error.name : 'Error', mechanism, release, frames: frames.slice(0, 8) };
}
