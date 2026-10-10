// Shared by the independent Node monitor and the Cloudflare scheduled monitor.
async function boundedText(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) throw new Error('MONITOR_RESPONSE_TOO_LARGE');
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); }
}

export async function probe(url, fetcher = fetch) {
  const started = performance.now();
  let response, bundle;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store' });
    let healthy = false;
    if (response.ok && new URL(url).pathname === '/ready') healthy = JSON.parse(await boundedText(response, 8192)).status === 'ready';
    else if (response.ok && /text\/html/i.test(response.headers.get('content-type') || '')) {
      const html = await boundedText(response, 262144);
      const source = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
      if (source) {
        const asset = new URL(source, url);
        if (asset.origin === new URL(url).origin && asset.pathname.startsWith('/assets/') && !asset.username && !asset.password) {
          bundle = await fetcher(asset, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store' });
          healthy = bundle.ok && /javascript|ecmascript/i.test(bundle.headers.get('content-type') || '');
        }
      }
    }
    return { healthy, latencyMs: Math.min(60000, Math.round(performance.now() - started)) };
  } catch { return { healthy: false, latencyMs: Math.min(60000, Math.round(performance.now() - started)) }; }
  finally {
    await response?.body?.cancel().catch(() => {});
    await bundle?.body?.cancel().catch(() => {});
  }
}

export function advanceMonitor(previous = {}, healthy) {
  const state = { failures: 0, successes: 0, incident: false, ...previous };
  state.failures = healthy ? 0 : Math.min(100000, state.failures + 1);
  state.successes = healthy ? Math.min(100000, state.successes + 1) : 0;
  const transition = !state.incident && state.failures >= 3 ? 'outage' : state.incident && state.successes >= 2 ? 'recovery' : null;
  if (transition) state.incident = transition === 'outage';
  return { ...state, transition };
}
