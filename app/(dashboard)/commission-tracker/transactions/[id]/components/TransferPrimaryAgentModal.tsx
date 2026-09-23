// app/(dashboard)/commission-tracker/transactions/[id]/components/TransferPrimaryAgentModal.tsx
import React from 'react';

interface TransferPrimaryAgentModalProps {
  isOpen: boolean;
  formerAgentName: string;
  newAgentName: string;
  primarySplitPercent?: number;
  level1RulesCount: number;
  level2RulesCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TransferPrimaryAgentModal({
  isOpen,
  formerAgentName,
  newAgentName,
  primarySplitPercent = 100,
  level1RulesCount,
  level2RulesCount,
  onConfirm,
  onCancel,
}: TransferPrimaryAgentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-emerald-500/30 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xl flex-shrink-0">
            🔄
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Transfer Primary Agent Splits & Deductions?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              You updated the Primary Agent in the Transaction Overview. The Agent Splits and Post-splits for the former Primary Agent will be transferred to the new Primary Agent.
            </p>
          </div>
        </div>

        {/* Visual Agent Comparison Card */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {/* Former Primary */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider block">
                Former Primary Agent
              </span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 block truncate">
                👤 {formerAgentName}
              </span>
            </div>

            {/* New Primary */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                New Primary Agent
              </span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 block truncate">
                👤 {newAgentName}
              </span>
            </div>
          </div>

          {/* Transfer Summary */}
          <div className="border-t border-slate-200 dark:border-slate-800/80 pt-2.5 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
            <div className="flex justify-between items-center">
              <span>Primary Agent Split:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {primarySplitPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Level 1 Post-Split Deductions (Brokerage/Fees):</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {level1RulesCount} {level1RulesCount === 1 ? 'rule' : 'rules'} transferred
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Level 2 Post-Split Deductions (Stock/Elective):</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {level2RulesCount} {level2RulesCount === 1 ? 'rule' : 'rules'} transferred
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Do you want to confirm this change and transfer all splits and post-split deductions to <strong className="text-slate-800 dark:text-slate-200">{newAgentName}</strong>?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
          >
            Confirm & Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
