import React from 'react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  isSaving?: boolean;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
  description?: string;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function UnsavedChangesModal({
  isOpen,
  isSaving = false,
  saveDisabled = false,
  saveDisabledReason,
  description = 'You have applied changes to the Transaction Overview and/or Commission Waterfall that have not been saved to the database yet. Leave without saving?',
  onStay,
  onDiscard,
  onSave,
}: UnsavedChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="app-modal fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-amber-500/30 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xl flex-shrink-0">
            ⚠️
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Unsaved changes
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            className="text-xs px-3 py-2 rounded-lg font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition cursor-pointer disabled:opacity-50"
          >
            Stay on page
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="text-xs px-3 py-2 rounded-lg font-bold border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || saveDisabled}
            title={saveDisabled ? saveDisabledReason : undefined}
            className="text-xs px-3 py-2 rounded-lg font-bold bg-brand-600 text-white hover:bg-brand-500 transition cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save & leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
