'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_TONES = {
  danger: 'bg-rose-600 hover:bg-rose-500',
  primary: 'bg-brand-600 hover:bg-brand-500',
} as const;

export function ConfirmDialog({
  title,
  message,
  error,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting...',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isPending = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  error?: string | null;
  confirmLabel?: string;
  pendingLabel?: string;
  /** null leaves only the confirm button, for a notice. */
  cancelLabel?: string | null;
  tone?: keyof typeof CONFIRM_TONES;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Enter should never delete by accident, so a destructive dialog starts on Cancel.
  useEffect(() => {
    (tone === 'danger' && cancelRef.current ? cancelRef.current : confirmRef.current)?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPending, onCancel]);

  return (
    <div
      className="app-modal fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4"
        onClick={(event) => event.stopPropagation()}
        role={cancelLabel === null ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div>
          <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{message}</p>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          {cancelLabel !== null && (
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg text-white cursor-pointer disabled:opacity-50 ${CONFIRM_TONES[tone]}`}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: keyof typeof CONFIRM_TONES;
};

/**
 * The app's dialog in place of window.confirm and window.alert.
 * `confirm` resolves true on the confirm button and false on Cancel, Escape, or a click outside.
 * `notify` shows one OK button and resolves when it closes. Render `dialog` once in the component.
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<(ConfirmRequest & { notice: boolean; resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmRequest) => new Promise<boolean>((resolve) => setRequest({ ...options, notice: false, resolve })),
    [],
  );
  const notify = useCallback(
    (options: Omit<ConfirmRequest, 'tone'>) => new Promise<void>((resolve) => setRequest({ ...options, notice: true, resolve: () => resolve() })),
    [],
  );

  const close = useCallback((ok: boolean) => {
    setRequest((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);
  const cancel = useCallback(() => close(false), [close]);

  const dialog = request ? (
    <ConfirmDialog
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel ?? (request.notice ? 'OK' : 'Delete')}
      cancelLabel={request.notice ? null : 'Cancel'}
      tone={request.tone ?? (request.notice ? 'primary' : 'danger')}
      onCancel={cancel}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirm, notify, dialog };
}
