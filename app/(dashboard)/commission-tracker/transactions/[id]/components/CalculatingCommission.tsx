import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Stands in for commission amounts while their inputs (the submitted template, caps and
 * allocations) still load, so a provisional result is never shown as the real one.
 */
export function CalculatingCommission({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-6">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
        Calculating commission…
      </div>
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-3 dark:border-slate-700">
            <div className="h-3 w-40 max-w-[50%] animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
