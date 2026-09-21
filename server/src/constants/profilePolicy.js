export const STUDIO_NAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const PORTFOLIO_HANDLE_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const PORTFOLIO_HANDLE_REDIRECT_MS = 90 * 24 * 60 * 60 * 1000;
export const PORTFOLIO_HANDLE_RESERVATION_MS = 365 * 24 * 60 * 60 * 1000;

export function nextChangeAt(lastChangedAt, cooldownMs, now = Date.now()) {
  if (!lastChangedAt) return null;
  const last = new Date(lastChangedAt).getTime();
  if (!Number.isFinite(last)) return null;
  const next = last + cooldownMs;
  return next > now ? new Date(next) : null;
}

export function isoDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
