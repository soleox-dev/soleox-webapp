'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface CancelEditPromptProps {
  open: boolean;
  sectionLabel: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function CancelEditPrompt({ open, sectionLabel, onKeepEditing, onDiscard }: CancelEditPromptProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') onDiscard();
      else onKeepEditing();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onDiscard, onKeepEditing]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-edit-title"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5"
      >
        <div>
          <h3 id="cancel-edit-title" className="text-base font-bold text-slate-900 dark:text-white">
            Cancel edits?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Discard your {sectionLabel} changes and return to view mode?
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onKeepEditing}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
