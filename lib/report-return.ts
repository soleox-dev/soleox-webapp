/**
 * The way back from a transaction opened in Owner Reports. A report link remembers (for this browser tab) which report
 * it came from, its scroll position, and the report's filters; Back on Transaction Detail returns there and the
 * report puts its filters and scroll back. Every call fails quietly when session storage is unavailable.
 */
const RETURN_KEY = 'soleox-report-return';
const VIEW_KEY = 'soleox-report-view';
const RESTORE_KEY = 'soleox-report-restore';
/** A way back older than this is stale: the user has long moved on. */
const RETURN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type ReportReturn = {
  /** The report's path and query, such as /owner-reports/transaction-list. */
  path: string;
  /** The report's name for the Back button, such as Transaction List. */
  label: string;
  windowScroll: number;
  /** The scroll of the report's own table when it fills the screen. */
  tableScroll: number;
  savedAt: number;
};

function read<T>(key: string): T | null {
  try {
    const text = window.sessionStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: Back goes to Transactions as before.
  }
}

export function rememberReportReturn(entry: Omit<ReportReturn, 'savedAt'>): void {
  write(RETURN_KEY, { ...entry, savedAt: Date.now() });
}

/** The report to go back to, if a report link opened this transaction recently in this tab. */
export function readReportReturn(): ReportReturn | null {
  const entry = read<ReportReturn>(RETURN_KEY);
  if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith('/owner-reports')) return null;
  return Date.now() - (entry.savedAt || 0) > RETURN_MAX_AGE_MS ? null : entry;
}

/** Back was used: the report should restore its filters and scroll once. */
export function markReportRestore(): void {
  write(RESTORE_KEY, true);
}

/** Whether to restore, consumed so a later plain visit starts fresh. */
export function takeReportRestore(): ReportReturn | null {
  const restore = read<boolean>(RESTORE_KEY);
  write(RESTORE_KEY, null);
  if (!restore) return null;
  const entry = readReportReturn();
  write(RETURN_KEY, null);
  return entry;
}

/** The report's filters as last set in this tab. */
export function saveReportView<T>(view: T): void {
  write(VIEW_KEY, view);
}

export function readReportView<T>(): T | null {
  return read<T>(VIEW_KEY);
}
