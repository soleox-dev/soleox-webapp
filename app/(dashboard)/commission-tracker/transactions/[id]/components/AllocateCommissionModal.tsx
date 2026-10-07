import React from 'react';

interface AllocateCommissionModalProps {
  isOpen: boolean;
  agentName: string;
  isSaving?: boolean;
  onYes: () => void;
  onNo: () => void;
  onCancel: () => void;
}

export function AllocateCommissionModal({
  isOpen,
  agentName,
  isSaving = false,
  onYes,
  onNo,
  onCancel,
}: AllocateCommissionModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4"
      onClick={() => {
        if (!isSaving) onCancel();
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-amber-500/30 w-full max-w-xl rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="allocate-commission-title"
      >
        <div>
          <h3 id="allocate-commission-title" className="text-base font-bold text-slate-900 dark:text-white">
            Allocate the commission to the Primary Agent?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            {agentName
              ? `The waterfall was reset. Yes records the full commission as a payment to ${agentName}. No saves this transaction with no commission lines and no payments.`
              : 'The waterfall was reset, and this transaction has no Primary Agent. Saving will record no commission lines and no payments.'}
          </p>
        </div>
        <div className="flex flex-nowrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onNo}
            disabled={isSaving}
            className="shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'No, record no payments'}
          </button>
          {agentName && (
            <button
              type="button"
              onClick={onYes}
              disabled={isSaving}
              className="shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : `Yes, pay ${agentName}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
