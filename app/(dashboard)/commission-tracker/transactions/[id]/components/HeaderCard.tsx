import React from 'react';

interface HeaderCardProps {
  isNewTransaction: boolean;
  isSaving: boolean;
  onSave: () => void;
  status: string;
}

export function HeaderCard({ isNewTransaction, isSaving, onSave, status }: HeaderCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex justify-between items-center transition-colors">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Soleox Commission Hub</h1>
          {isNewTransaction && (
            <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded">
              NEW TRANSACTION
            </span>
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Transaction Overview, Waterfall Engine & Disbursement Processing</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
        >
          <span>{isSaving ? '⏳' : '💾'}</span>
          <span>{isSaving ? 'Saving Transaction...' : 'Save Transaction'}</span>
        </button>
        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          STATUS: {status}
        </div>
      </div>
    </div>
  );
}