'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { TrashIcon } from '@/components/ui/trash-icon';
import {
  DEMO_TRANSACTION_DEFAULT_VIEW,
  type TransactionDefaultView,
  type TransactionSortRule,
} from '@/lib/transaction-default-view';
import { useRegisterSave } from '@/components/save-leave-guard';

interface SchemaField {
  field_key: string;
  field_label: string;
  field_type?: string;
  is_enabled?: boolean;
}

const CLIENT_ID = 'DEMO';

export default function TransactionDefaultViewPage() {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [view, setView] = useState<TransactionDefaultView>(DEMO_TRANSACTION_DEFAULT_VIEW);
  const [baseline, setBaseline] = useState(() => JSON.stringify(DEMO_TRANSACTION_DEFAULT_VIEW));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const headers = { 'x-client-id': CLIENT_ID };
        const [viewRes, schemaRes] = await Promise.all([
          fetch('/api/transaction-default-view', { headers }),
          fetch('/api/schema/transactions', { headers }),
        ]);
        const viewData = await viewRes.json().catch(() => ({}));
        const schemaData = await schemaRes.json().catch(() => ({}));
        if (!viewRes.ok) throw new Error(viewData.error || 'Failed to load the default view.');
        if (cancelled) return;

        const catalog: SchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
        const unique = new Map<string, SchemaField>();
        catalog.forEach((field) => {
          if (field.is_enabled === false || !field.field_key || unique.has(field.field_key)) return;
          unique.set(field.field_key, field);
        });
        setFields(Array.from(unique.values()));
        const nextView = {
          filterFormula: String(viewData.filterFormula || ''),
          sortRules: Array.isArray(viewData.sortRules) ? viewData.sortRules : [],
        };
        setView(nextView);
        setBaseline(JSON.stringify(nextView));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the default view.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const formulaNames = useMemo<FormulaName[]>(() => {
    const names = new Map<string, FormulaName>();
    fields.forEach((field) => {
      names.set(field.field_key, { name: field.field_key, label: field.field_label || field.field_key, kind: 'field' });
    });
    if (!names.has('transaction_status')) names.set('transaction_status', { name: 'transaction_status', label: 'Status', kind: 'field' });
    if (!names.has('finance_status')) names.set('finance_status', { name: 'finance_status', label: 'Finance Status', kind: 'field' });
    if (!names.has('closing_date')) names.set('closing_date', { name: 'closing_date', label: 'Closing Date', kind: 'field' });
    names.set('status', { name: 'status', label: 'Status', kind: 'field' });
    return Array.from(names.values());
  }, [fields]);

  const sortFields = formulaNames.filter((field) => field.name !== 'status');

  const updateRule = (index: number, patch: Partial<TransactionSortRule>) => {
    setView((current) => ({
      ...current,
      sortRules: current.sortRules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)),
    }));
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    setView((current) => {
      const next = current.sortRules.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [rule] = next.splice(index, 1);
      next.splice(target, 0, rule);
      return { ...current, sortRules: next };
    });
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/transaction-default-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({
          clientId: CLIENT_ID,
          filterFormula: view.filterFormula,
          sortRules: view.sortRules,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to save the default view.');
      setBaseline(JSON.stringify(view));
      setMessage('Default view saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the default view.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const viewDirty = !isLoading && JSON.stringify(view) !== baseline;
  useRegisterSave({
    id: 'transaction-default-view',
    active: viewDirty,
    saving: isSaving,
    onSave: save,
    onDiscard: () => {
      setView(JSON.parse(baseline) as TransactionDefaultView);
      setMessage(null);
      setError(null);
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transactions: Default View</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          The Default tab lists transactions where this formula is true, then sorts them by the columns below. Empty sort values stay at the bottom.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm italic text-slate-400">Loading default view…</p>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <FormulaEditor
              label="Include when"
              value={view.filterFormula}
              onChange={(filterFormula) => setView((current) => ({ ...current, filterFormula }))}
              names={formulaNames}
              fitContent
              hint="Leave this blank to include every transaction. status is another name for transaction_status."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sort order</h3>
              <button
                type="button"
                onClick={() => setView((current) => ({
                  ...current,
                  sortRules: [...current.sortRules, { fieldKey: sortFields[0]?.name || 'closing_date', direction: 'asc' }],
                }))}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add column
              </button>
            </div>

            {view.sortRules.length === 0 ? (
              <p className="text-xs italic text-slate-400">No sort columns. The ledger keeps its own column sort.</p>
            ) : (
              <div className="space-y-2">
                {view.sortRules.map((rule, index) => (
                  <div key={`${rule.fieldKey}-${index}`} className="flex flex-wrap items-center gap-2">
                    <span className="w-5 text-xs font-semibold text-slate-400">{index + 1}</span>
                    <select
                      value={rule.fieldKey}
                      onChange={(event) => updateRule(index, { fieldKey: event.target.value })}
                      className="min-w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {sortFields.map((field) => (
                        <option key={field.name} value={field.name}>{field.label}</option>
                      ))}
                    </select>
                    <select
                      value={rule.direction}
                      onChange={(event) => updateRule(index, { direction: event.target.value === 'desc' ? 'desc' : 'asc' })}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                    <button type="button" onClick={() => moveRule(index, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move sort earlier">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button type="button" onClick={() => moveRule(index, 1)} disabled={index === view.sortRules.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move sort later">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView((current) => ({ ...current, sortRules: current.sortRules.filter((_, ruleIndex) => ruleIndex !== index) }))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                      aria-label="Remove sort column"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!viewDirty || isSaving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving…' : 'Save Default View'}
            </button>
            {message && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{message}</span>}
            {error && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
