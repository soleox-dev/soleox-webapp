'use client';

import React, { useMemo, useState } from 'react';
import { underlineControl, underlineLabel, underlineShell } from '@/components/ui/underline-field';

export type BulkRenameAction = 'add_start' | 'add_end' | 'remove_start' | 'remove_end' | 'remove_any' | 'replace';

const ACTIONS: { value: BulkRenameAction; label: string }[] = [
  { value: 'add_start', label: 'Add to Start' },
  { value: 'add_end', label: 'Add to End' },
  { value: 'remove_start', label: 'Remove from Start' },
  { value: 'remove_end', label: 'Remove from End' },
  { value: 'remove_any', label: 'Remove Anywhere' },
  { value: 'replace', label: 'Find and Replace' },
];

/**
 * A rule's new name for one bulk action. Text matches exactly as typed, spaces and capitals included, and the
 * result loses any space left at either end. A name the action does not touch comes back unchanged.
 */
export function renamedRule(name: string, action: BulkRenameAction, text: string, replacement = ''): string {
  if (!text) return name;
  const next = action === 'add_start' ? `${text}${name}`
    : action === 'add_end' ? `${name}${text}`
    : action === 'remove_start' ? (name.startsWith(text) ? name.slice(text.length) : name)
    : action === 'remove_end' ? (name.endsWith(text) ? name.slice(0, name.length - text.length) : name)
    : action === 'remove_any' ? name.split(text).join('')
    : name.split(text).join(replacement);
  return next.trim();
}

/** The Rename Selected popup on a template's rules list: one action at a time, previewed before it is applied. */
export function BulkRuleRename({
  rules,
  saving,
  error,
  onApply,
  onClose,
}: {
  rules: { id: string; rule_name: string }[];
  saving: boolean;
  error: string | null;
  onApply: (names: { id: string; rule_name: string }[]) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState<BulkRenameAction>('remove_start');
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');

  const preview = useMemo(() => rules.map((rule) => {
    const next = renamedRule(rule.rule_name, action, text, replacement);
    return { ...rule, next, changed: next !== rule.rule_name, empty: !next };
  }), [rules, action, text, replacement]);
  const changes = preview.filter((row) => row.changed && !row.empty);
  const emptied = preview.some((row) => row.empty);
  const adding = action === 'add_start' || action === 'add_end';

  return (
    <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <form
        role="dialog"
        aria-label="Rename Selected Rules"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (changes.length > 0 && !emptied && !saving) onApply(changes.map(({ id, next }) => ({ id, rule_name: next })));
        }}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="shrink-0 space-y-4 px-6 pt-6 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Rename Selected Rules</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Only the names change. Keys, formulas, and the run order stay as they are.
            </p>
          </div>
          <div role="radiogroup" aria-label="Action" className="flex flex-wrap gap-1.5">
            {ACTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={action === option.value}
                onClick={() => setAction(option.value)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition cursor-pointer ${action === option.value
                  ? 'border-brand-500/50 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={`grid gap-4 ${action === 'replace' ? 'sm:grid-cols-2' : ''}`}>
            <label className={underlineShell}>
              <span className={underlineLabel}>{action === 'replace' ? 'Find' : adding ? 'Text to Add' : 'Text to Remove'}</span>
              <input
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Example: A1 "
                className={`${underlineControl} whitespace-pre`}
              />
            </label>
            {action === 'replace' && (
              <label className={underlineShell}>
                <span className={underlineLabel}>Replace With</span>
                <input
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  placeholder="Leave empty to remove"
                  className={underlineControl}
                />
              </label>
            )}
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Text matches exactly as typed, including spaces and capitals. Type the space too, as in &ldquo;A1 &rdquo;.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-slate-200 px-6 py-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            Preview <span className="font-normal text-slate-500 dark:text-slate-400">— {changes.length} of {rules.length} {rules.length === 1 ? 'rule' : 'rules'} change</span>
          </p>
          <ul className="space-y-1 text-xs">
            {preview.map((row) => (
              <li key={row.id} className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2 ${row.changed ? '' : 'opacity-50'}`}>
                <span className="truncate text-slate-600 dark:text-slate-300" title={row.rule_name}>{row.rule_name}</span>
                <span aria-hidden className="text-slate-400">→</span>
                <span
                  className={`truncate font-semibold ${row.empty ? 'text-rose-600 dark:text-rose-400' : row.changed ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  title={row.next}
                >
                  {row.empty ? 'Name would be empty' : row.changed ? row.next : 'No change'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 space-y-2 px-6 py-4">
          {emptied && <p className="text-xs text-rose-600 dark:text-rose-400">A rule cannot be left without a name. Change the text, or unselect that rule.</p>}
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving || changes.length === 0 || emptied}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Renaming…' : `Rename ${changes.length} ${changes.length === 1 ? 'Rule' : 'Rules'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
