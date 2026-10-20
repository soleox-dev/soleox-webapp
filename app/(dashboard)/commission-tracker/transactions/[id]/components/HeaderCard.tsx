import React, { useLayoutEffect, useRef } from 'react';
import { TrashIcon } from '@/components/ui/trash-icon';

interface HeaderCardProps {
  isNewTransaction: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
  hasUnsavedChanges?: boolean;
  saveBlocked?: boolean;
  saveBlockedReason?: string;
  /** The pinned strip's height, which places the sticky sidebar under it. */
  onHeightChange?: (height: number) => void;
  children?: React.ReactNode;
}

/**
 * The title card scrolls away. The pill below it holds the transaction search, the status
 * badges, and the actions, and stays pinned under the top bar. The page measures the pill
 * (#transaction-detail-header) to place the sticky sidebar under it.
 */
export function HeaderCard({ isNewTransaction, isSaving, onSave, onDiscard, onDelete, hasUnsavedChanges = false, saveBlocked = false, saveBlockedReason, onHeightChange, children }: HeaderCardProps) {
  // Measured here, on this card's own element, so the height stays right when the card remounts.
  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || !onHeightChange) return;
    const sync = () => onHeightChange(strip.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <>
      <div className="!mb-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-6 py-4 shadow-xl transition-colors">
        <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Transaction Detail</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Overview, commission waterfall, and payments</p>
      </div>

      {/* A strip in the page color around the pill, so content scrolling under it stays hidden.
          It runs into the page gutters so card shadows and borders do not show beside it. */}
      <div
        ref={stripRef}
        id="transaction-detail-header"
        className="sticky top-[var(--app-nav-offset,4rem)] z-40 !mb-3 -mx-4 bg-slate-100 px-4 py-3 md:-mx-6 md:px-6 transition-[top] duration-200 ease-out motion-reduce:transition-none dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1.5 pl-5 pr-2 shadow-xl transition-colors dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0 flex-1">{children}</div>
          {isNewTransaction && (
            <span className="shrink-0 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
              NEW TRANSACTION
            </span>
          )}
          {hasUnsavedChanges && (
            <span className="shrink-0 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full">
              UNSAVED CHANGES
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!isNewTransaction && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-full border border-rose-300 text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:border-rose-500/40 dark:text-rose-400 inline-flex items-center gap-1.5"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={onDiscard}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Discard Changes
              </button>
            )}
            {(hasUnsavedChanges || isSaving) && (
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || saveBlocked}
                title={saveBlocked ? saveBlockedReason : undefined}
                className="px-4 py-1.5 font-bold text-xs rounded-full shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                <span>{isSaving ? '⏳' : '💾'}</span>
                <span>{isSaving ? 'Saving Transaction...' : 'Save Transaction'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
