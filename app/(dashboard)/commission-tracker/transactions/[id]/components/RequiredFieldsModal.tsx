// app/commission-tracker/transactions/[id]/components/RequiredFieldsModal.tsx
import React from 'react';

interface RequiredFieldsModalProps {
  isOpen: boolean;
  missingLabels: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function RequiredFieldsModal({
  isOpen,
  missingLabels,
  onCancel,
  onConfirm,
}: RequiredFieldsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-rose-500/30 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xl">
            ⚠️
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Missing Required Fields
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              The following required field(s) have been left blank in the Transaction Overview form:
            </p>
          </div>
        </div>

        <div className="max-h-36 overflow-y-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 divide-y divide-slate-200 dark:divide-slate-800">
          {missingLabels.map((lbl, i) => (
            <div key={i} className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
              <span>{lbl}</span>
              <span className="text-[10px] bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded uppercase font-bold">
                Blank
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Are you sure you want to proceed and apply changes with these fields incomplete?
        </p>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Back to Edit
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer"
          >
            Apply Changes Anyway
          </button>
        </div>
      </div>
    </div>
  );
}