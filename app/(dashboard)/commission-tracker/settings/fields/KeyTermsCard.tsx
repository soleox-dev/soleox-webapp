'use client';

import { phoneSheetFlush } from '@/lib/page-frame';
import React, { useMemo, useState } from 'react';
import { DragHandle, moveItem, useDragReorder } from '@/components/ui/reorder-controls';
import { OptionMenu } from '@/components/ui/option-menu';
import { TrashIcon } from '@/components/ui/trash-icon';
import { useRegisterSave } from '@/components/save-leave-guard';
import { UnderlineField, underlineControl } from '@/components/ui/underline-field';

export interface KeyTermsField {
  field_key: string;
  field_label: string;
  field_type: string;
  is_enabled: boolean;
  key_terms_position?: number | null;
}

/** The fields' saved Key Terms keys, in position order. */
export function savedKeyTerms(fields: KeyTermsField[]): string[] {
  return fields
    .filter((field) => field.key_terms_position != null)
    .sort((a, b) => Number(a.key_terms_position) - Number(b.key_terms_position))
    .map((field) => field.field_key);
}

/**
 * Picks the transaction fields shown in Key Terms at the top of Transaction Detail, and their order.
 * Only the Key Terms position changes: sections and the Transactions table keep their own order.
 */
export function KeyTermsCard({
  fields,
  onSaved,
  onError,
}: {
  fields: KeyTermsField[];
  onSaved: (fieldKeys: string[]) => void;
  onError: (message: string) => void;
}) {
  const saved = useMemo(() => savedKeyTerms(fields), [fields]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const keys = draft ?? saved;
  const dirty = draft !== null && draft.join('|') !== saved.join('|');
  const byKey = useMemo(() => new Map(fields.map((field) => [field.field_key, field])), [fields]);

  const addOptions = fields
    .filter((field) => field.is_enabled && !keys.includes(field.field_key))
    .map((field) => ({ value: field.field_key, label: field.field_label || field.field_key }));

  const drag = useDragReorder((from, to) => setDraft(moveItem(keys, from, to)));

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    setSaving(true);
    try {
      const response = await fetch('/api/schema/key-terms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTable: 'transactions', fieldKeys: keys }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Key Terms could not be saved.');
      onSaved(keys);
      setDraft(null);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Key Terms could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  useRegisterSave({
    id: 'key-terms',
    active: dirty,
    saving,
    onSave: save,
    onDiscard: () => setDraft(null),
  });

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden transition-colors ${phoneSheetFlush}`}>
      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Key Terms</h2>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
            Shown as one table at the top of Transaction Detail, in this order, instead of in their own sections there.
            Sections and the Transactions table are not affected.
          </p>
        </div>
        {dirty && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-500 text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Key Terms'}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {keys.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">No fields yet. Add the dates and amounts people look for first.</p>
        )}
        {keys.map((key, index) => {
          const field = byKey.get(key);
          return (
            <div
              key={key}
              {...drag.rowProps(index)}
              className={`flex items-center gap-3 rounded-lg border bg-slate-50 px-3 py-2 dark:bg-slate-900/40 ${
                drag.overIndex === index ? 'border-brand-500' : 'border-slate-200 dark:border-slate-700'
              } ${drag.dragIndex === index ? 'opacity-40' : ''}`}
            >
              <DragHandle {...drag.handleProps(index)} />
              <span className="w-5 shrink-0 text-right text-2xs font-semibold text-slate-400">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900 dark:text-white">
                {field?.field_label || key}
                {field && !field.is_enabled && <span className="ml-2 font-normal text-amber-600 dark:text-amber-400">Turned off, so it won&apos;t show</span>}
              </span>
              <span className="shrink-0 text-2xs text-slate-400">{field?.field_type}</span>
              <button
                type="button"
                onClick={() => setDraft(keys.filter((other) => other !== key))}
                aria-label={`Remove ${field?.field_label || key} from Key Terms`}
                title="Remove from Key Terms"
                className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer"
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}
        <div className="max-w-xs pt-1">
          <UnderlineField label="Add a Field">
            <OptionMenu
              id="key-terms-add"
              value=""
              options={addOptions}
              onChange={(value) => {
                if (value && !keys.includes(value)) setDraft([...keys, value]);
              }}
              placeholder="Choose a field"
              aria-label="Add a Field to Key Terms"
              className={`${underlineControl} overview-field-select pr-4`}
            />
          </UnderlineField>
        </div>
      </div>
    </div>
  );
}
