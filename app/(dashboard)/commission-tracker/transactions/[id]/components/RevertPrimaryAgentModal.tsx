// app/(dashboard)/commission-tracker/transactions/[id]/components/RevertPrimaryAgentModal.tsx
import React from 'react';

interface RevertPrimaryAgentModalProps {
  isOpen: boolean;
  formerAgentName: string;
  newAgentName: string;
  onRevertYes: () => void;
  onRevertNo: () => void;
}

export function RevertPrimaryAgentModal({
  isOpen,
  formerAgentName,
  newAgentName,
  onRevertYes,
  onRevertNo,
}: RevertPrimaryAgentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-amber-500/30 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-xl flex-shrink-0">
            ↩️
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Revert Primary Agent?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              The Primary Agent transfer was cancelled.
            </p>
          </div>
        </div>

        {/* Message Card */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Would you like to revert the Primary Agent back to <strong className="text-slate-900 dark:text-white font-semibold">{formerAgentName}</strong> in case you changed it by accident?
          </p>
          <ul className="text-slate-500 dark:text-slate-400 space-y-1 text-[11px] list-disc list-inside pt-1">
            <li>
              <strong>Yes</strong>: Reverts Primary Agent back to <span className="text-slate-700 dark:text-slate-300">{formerAgentName}</span> and keeps you in Edit Mode.
            </li>
            <li>
              <strong>No</strong>: Keeps <span className="text-slate-700 dark:text-slate-300">{newAgentName}</span> selected and keeps you in Edit Mode.
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onRevertNo}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            No, Keep Changes
          </button>
          <button
            type="button"
            onClick={onRevertYes}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 transition cursor-pointer"
          >
            Yes, Revert to {formerAgentName}
          </button>
        </div>
      </div>
    </div>
  );
}
