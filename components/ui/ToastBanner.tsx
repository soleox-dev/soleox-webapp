'use client';

import { AlertCircle, Check, Info, X } from 'lucide-react';

const TONE = {
  success: {
    icon: Check,
    chip: 'bg-emerald-500 text-white',
    ring: 'border-emerald-500/30',
  },
  error: {
    icon: AlertCircle,
    chip: 'bg-rose-500 text-white',
    ring: 'border-rose-500/30',
  },
  info: {
    icon: Info,
    chip: 'bg-slate-500 text-white',
    ring: 'border-slate-300 dark:border-slate-600',
  },
} as const;

export function ToastBanner({
  message,
  type = 'success',
  onDismiss,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
}) {
  const tone = TONE[type];
  const Icon = tone.icon;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border ${tone.ring} bg-white px-3.5 py-3 text-slate-800 shadow-[0_18px_50px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] dark:ring-white/10`}
      >
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.chip}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="min-w-0 text-sm font-medium leading-snug">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
