const RECOVERY_KEY = 'veylo:page-load-recovery';
const RECOVERY_WINDOW_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /unable to preload css/i,
  /vite:preloaderror/i,
];

function errorMessage(error) {
  if (typeof error === 'string') return error;
  return String(error?.message || error?.reason?.message || error?.reason || error || '');
}

export function isPageChunkError(error) {
  const message = errorMessage(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function readRecovery() {
  try {
    return JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearPageLoadRecovery() {
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // A blocked session store must never stop the page from opening.
  }
}

export function recoverPageLoadOnce(source = 'page') {
  if (typeof window === 'undefined' || !window.navigator.onLine) return false;

  const now = Date.now();
  const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const previous = readRecovery();

  if (previous?.route === route && now - previous.at < RECOVERY_WINDOW_MS) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ route, source, at: now }));
  } catch {
    // Reload once even where storage is unavailable; the error boundary remains the fallback.
  }

  window.location.reload();
  return true;
}

export function installPageLoadRecovery() {
  const onPreloadError = (event) => {
    event.preventDefault();
    recoverPageLoadOnce('vite-preload');
  };

  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}

