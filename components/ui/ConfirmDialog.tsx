'use client';

import React from 'react';

export function ConfirmDialog({
  title,
  message,
  error,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting...',
  isPending = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  error?: string | null;
  confirmLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div>
          <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{message}</p>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50"
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
