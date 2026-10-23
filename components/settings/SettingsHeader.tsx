import React from 'react';
import { phoneSheet } from '@/lib/page-frame';

/** The card every Settings page sits in: one border, a light shadow, the same padding. */
export const SETTINGS_CARD = `rounded-xl border border-slate-200 bg-white p-6 shadow-xs transition-colors dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`;

/**
 * The top of every Settings page: its name, one line on what it controls, and its main action on the right.
 * Put it at the top of the page's first card, or in a card of its own when the page has several cards.
 */
export function SettingsHeader({
  title,
  description,
  actions,
  status,
  className = '',
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A short confirmation such as "Caps saved.", shown just left of the actions. */
  status?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {(actions || status) && (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {status && <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{status}</p>}
          {actions}
        </div>
      )}
    </div>
  );
}

/** The primary action button on a Settings page (Save, Add, Sync now). */
export const SETTINGS_PRIMARY_BUTTON = 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
