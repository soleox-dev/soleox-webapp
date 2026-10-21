const WRITE_LIMIT = 300;
const WRITE_WINDOW_MS = 60_000;
const SYNC_GAP_MS = 15_000;
const SYNC_HOUR_LIMIT = 30;
const SYNC_HOUR_MS = 60 * 60 * 1000;
const SYNC_UNDO_GAP_MS = 30_000;
const SYNC_UNDO_PATH = '/api/integrations/google-sheets/sync/undo';

type Allowance = { ok: true } | { ok: false; retryAfterSeconds: number };

const windows = new Map<string, number[]>();

function recentStamps(key: string, windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return (windows.get(key) ?? []).filter((stamp) => stamp > cutoff);
}

function retryAfter(stamps: number[], windowMs: number, now: number): number {
  const oldest = stamps[0] ?? now;
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

function allow(key: string, limit: number, windowMs: number, now: number): Allowance {
  const recent = recentStamps(key, windowMs, now);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return { ok: false, retryAfterSeconds: retryAfter(recent, windowMs, now) };
  }
  recent.push(now);
  windows.set(key, recent);
  return { ok: true };
}

function sweep(now: number) {
  if (windows.size < 1000) return;
  for (const [key, stamps] of windows) {
    if (stamps.every((stamp) => now - stamp > SYNC_HOUR_MS)) windows.delete(key);
  }
}

function isSync(pathname: string): boolean {
  if (pathname === SYNC_UNDO_PATH) return false;
  return pathname === '/api/integrations/google-sheets/sync' || pathname.startsWith('/api/integrations/google-sheets/sync/');
}

/**
 * Sync is limited per brokerage. Undo has its own limit, so it works right after a sync, but only once every 30 seconds.
 * Other writes are limited per person on that brokerage.
 */
export function limitApiWrite(input: { email: string; clientId: string; pathname: string; now?: number }): Allowance {
  const now = input.now ?? Date.now();
  sweep(now);
  if (input.pathname === SYNC_UNDO_PATH) {
    return allow(`sync-undo-gap:${input.clientId}`, 1, SYNC_UNDO_GAP_MS, now);
  }
  if (isSync(input.pathname)) {
    const gapKey = `sync-gap:${input.clientId}`;
    const hourKey = `sync-hour:${input.clientId}`;
    const gap = recentStamps(gapKey, SYNC_GAP_MS, now);
    const hour = recentStamps(hourKey, SYNC_HOUR_MS, now);
    if (gap.length >= 1) return { ok: false, retryAfterSeconds: retryAfter(gap, SYNC_GAP_MS, now) };
    if (hour.length >= SYNC_HOUR_LIMIT) return { ok: false, retryAfterSeconds: retryAfter(hour, SYNC_HOUR_MS, now) };
    windows.set(gapKey, [...gap, now]);
    windows.set(hourKey, [...hour, now]);
    return { ok: true };
  }

  return allow(`write:${input.clientId}:${input.email.toLowerCase()}`, WRITE_LIMIT, WRITE_WINDOW_MS, now);
}
