const types = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AggregateError', 'ChunkLoadError']);
export function browserDiagnostic(error, { mechanism = 'window', filename, lineno, colno, origin = globalThis.location?.origin, release = 'unknown' } = {}) {
  const frames = [];
  function add(location, line, column) {
    try {
      const url = new URL(location, origin);
      if (url.origin !== origin || !/^\/assets\/[A-Za-z0-9_-]{1,120}\.m?js$/.test(url.pathname)) return;
      const frame = { asset: url.pathname, line: Number(line) || 0, column: Number(column) || 0 };
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
