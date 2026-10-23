/**
 * The way back from a transaction opened in Owner Reports. A report link remembers (for this browser tab) which report
 * it came from, its scroll position, and the report's filters; Back on Transaction Detail returns there and the
 * report puts its filters and scroll back. Every call fails quietly when session storage is unavailable.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const RETURN_KEY = 'soleox-report-return';
const UI_KEY = 'soleox-report-ui';
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

// ---------------------------------------------------------------------------------------------------------------
// Views inside a report (a drilldown, a picked status, a column sort): saved as they change, restored on Back
// ---------------------------------------------------------------------------------------------------------------

/** True from the moment Back starts restoring a report until its views have drawn. */
let restoringViews = false;

export function beginViewRestore(): void {
  restoringViews = true;
}

export function endViewRestore(): void {
  restoringViews = false;
}

function readViews(): Record<string, unknown> {
  return read<Record<string, unknown>>(UI_KEY) || {};
}

/**
 * useState for a view inside a report, under a key unique to that view. Every change is saved for this tab; the
 * saved value is used only while Back is restoring the report, so a plain visit starts from `initial`. Values must be
 * plain JSON (no Maps or Sets).
 */
export function useRestorableState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!key || !restoringViews) return initial;
    const views = readViews();
    return key in views ? (views[key] as T) : initial;
  });
  useEffect(() => {
    // An empty key is plain useState: nothing saved, nothing restored.
    if (!key) return;
    const views = readViews();
    views[key] = value;
    write(UI_KEY, views);
  }, [key, value]);
  return [value, setValue];
}

/**
 * An effect that resets a view when one of its inputs changes value, never just because the report drew (or React
 * ran effects twice in development), so a view restored on Back survives the report drawing.
 */
export function useResetEffect(reset: () => void, deps: unknown[]): void {
  const previous = useRef<unknown[] | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = deps;
    if (before && deps.some((value, index) => !Object.is(value, before[index]))) reset();
  }, deps);
}
