'use client';

import { phoneSheet } from '@/lib/page-frame';
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { validateFormula } from '../commission-templates/formula-validator';
import { OptionMenu } from '@/components/ui/option-menu';
import { TrashIcon } from '@/components/ui/trash-icon';
import { FieldChevron, UnderlineField, underlineControl, underlineShell } from '@/components/ui/underline-field';
import {
  MAX_TRANSACTION_VIEWS,
  seededTransactionViews,
  transactionViewNameError,
  type TransactionSortRule,
  type TransactionView,
  type TransactionViewsConfig,
} from '@/lib/transaction-default-view';
import { useRegisterSave } from '@/components/save-leave-guard';

interface SchemaField {
  field_key: string;
  field_label: string;
  field_type?: string;
  is_enabled?: boolean;
}

const CLIENT_ID = 'DEMO';

function newViewId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `view_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export default function TransactionViewsPage() {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [config, setConfig] = useState<TransactionViewsConfig>(() => seededTransactionViews(CLIENT_ID));
  const [baseline, setBaseline] = useState(() => JSON.stringify(seededTransactionViews(CLIENT_ID)));
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
        if (!viewRes.ok) throw new Error(viewData.error || 'Failed to load views.');
        if (cancelled) return;

        const catalog: SchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
        const unique = new Map<string, SchemaField>();
        catalog.forEach((field) => {
          if (field.is_enabled === false || !field.field_key || unique.has(field.field_key)) return;
          unique.set(field.field_key, field);
        });
        setFields(Array.from(unique.values()));
        const next: TransactionViewsConfig = {
          defaultViewId: String(viewData.defaultViewId || ''),
          views: Array.isArray(viewData.views) ? viewData.views : [],
        };
        if (next.views.length === 0 || !next.views.some((view) => view.id === next.defaultViewId)) {
          throw new Error('Failed to load views.');
        }
        setConfig(next);
        setBaseline(JSON.stringify(next));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load views.');
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
  const knownNames = formulaNames.map((field) => field.name);

  const updateView = (id: string, patch: Partial<TransactionView>) => {
    setConfig((current) => ({
      ...current,
      views: current.views.map((view) => (view.id === id ? { ...view, ...patch } : view)),
    }));
  };

  const updateRule = (id: string, index: number, patch: Partial<TransactionSortRule>) => {
    setConfig((current) => ({
      ...current,
      views: current.views.map((view) => {
        if (view.id !== id) return view;
        return {
          ...view,
          sortRules: view.sortRules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)),
        };
      }),
    }));
  };

  const moveRule = (id: string, index: number, direction: -1 | 1) => {
    setConfig((current) => ({
      ...current,
      views: current.views.map((view) => {
        if (view.id !== id) return view;
        const next = view.sortRules.slice();
        const target = index + direction;
        if (target < 0 || target >= next.length) return view;
        const [rule] = next.splice(index, 1);
        next.splice(target, 0, rule);
        return { ...view, sortRules: next };
      }),
    }));
  };

  const moveView = (index: number, direction: -1 | 1) => {
    setConfig((current) => {
      const next = current.views.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [view] = next.splice(index, 1);
      next.splice(target, 0, view);
      return { ...current, views: next };
    });
  };

  const addView = () => {
    setConfig((current) => {
      if (current.views.length >= MAX_TRANSACTION_VIEWS) return current;
      const used = new Set(current.views.map((view) => view.name));
      let name = 'New view';
      for (let number = current.views.length + 1; number < 10; number += 1) {
        const candidate = `View ${number}`;
        if (!used.has(candidate) && !transactionViewNameError(candidate, [...used])) {
          name = candidate;
          break;
        }
      }
      const view: TransactionView = {
        id: newViewId(),
        name,
        filterFormula: '',
        sortRules: [{ fieldKey: sortFields[0]?.name || 'closing_date', direction: 'asc' }],
      };
      return { ...current, views: [...current.views, view] };
    });
  };

  const removeView = (id: string) => {
    setConfig((current) => {
      if (current.views.length <= 1) return current;
      const views = current.views.filter((view) => view.id !== id);
      const defaultViewId = views.some((view) => view.id === current.defaultViewId) ? current.defaultViewId : views[0].id;
      return { views, defaultViewId };
    });
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      for (const view of config.views) {
        const nameError = transactionViewNameError(
          view.name,
          config.views.filter((other) => other.id !== view.id).map((other) => other.name),
        );
        if (nameError) throw new Error(nameError);
        const formulaError = validateFormula(view.filterFormula, knownNames);
        if (formulaError) throw new Error(`${view.name}: ${formulaError}`);
      }
      const res = await fetch('/api/transaction-default-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({
          clientId: CLIENT_ID,
          views: config.views,
          defaultViewId: config.defaultViewId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to save views.');
      const saved: TransactionViewsConfig = {
        defaultViewId: String(data.defaultViewId || config.defaultViewId),
        views: Array.isArray(data.views) ? data.views : config.views,
      };
      setConfig(saved);
      setBaseline(JSON.stringify(saved));
      setMessage('Views saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save views.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const viewDirty = !isLoading && JSON.stringify(config) !== baseline;
  useRegisterSave({
    id: 'transaction-default-view',
    active: viewDirty,
    saving: isSaving,
    onSave: save,
    onDiscard: () => {
      setConfig(JSON.parse(baseline) as TransactionViewsConfig);
      setMessage(null);
      setError(null);
    },
  });

  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Views</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            These names are the tabs on Transactions, after All. Add up to {MAX_TRANSACTION_VIEWS}. One view is the default: it opens after sign-in, and it chooses which transactions sync with TMS and which ones get a commission template status.
          </p>
        </div>
        <button
          type="button"
          onClick={addView}
          disabled={isLoading || config.views.length >= MAX_TRANSACTION_VIEWS}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400 cursor-pointer disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Add View
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm italic text-slate-400">Loading views…</p>
      ) : (
        <div className="space-y-6">
          {config.views.map((view, index) => {
            const nameError = transactionViewNameError(
              view.name,
              config.views.filter((other) => other.id !== view.id).map((other) => other.name),
            );
            const isDefault = view.id === config.defaultViewId;
            return (
              <div key={view.id} className="space-y-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <UnderlineField label="Name" className="w-56">
                      <input
                        value={view.name}
                        onChange={(event) => updateView(view.id, { name: event.target.value })}
                        className={underlineControl}
                        maxLength={40}
                        aria-invalid={Boolean(nameError)}
                      />
                    </UnderlineField>
                    <button
                      type="button"
                      aria-pressed={isDefault}
                      onClick={() => setConfig((current) => ({ ...current, defaultViewId: view.id }))}
                      className={`mb-0.5 rounded-md px-2.5 py-1 text-xs font-bold cursor-pointer ${
                        isDefault
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-brand-400'
                      }`}
                    >
                      {isDefault ? 'Default View' : 'Set as Default'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveView(index, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move View Earlier">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button type="button" onClick={() => moveView(index, 1)} disabled={index === config.views.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move View Later">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeView(view.id)}
                      disabled={config.views.length <= 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`Remove ${view.name || 'view'}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {nameError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{nameError}</p>}

                <FormulaEditor
                  label="Include When"
                  value={view.filterFormula}
                  onChange={(filterFormula) => updateView(view.id, { filterFormula })}
                  names={formulaNames}
                  fitContent
                  hint="Leave this blank to include every transaction. status is another name for transaction_status."
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sort Order</h3>
                    <button
                      type="button"
                      onClick={() => updateView(view.id, {
                        sortRules: [...view.sortRules, { fieldKey: sortFields[0]?.name || 'closing_date', direction: 'asc' }],
                      })}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      Add Column
                    </button>
                  </div>
                  {view.sortRules.length === 0 ? (
                    <p className="text-xs italic text-slate-400">No sort columns. The ledger keeps its own column sort.</p>
                  ) : (
                    <div className="space-y-2">
                      {view.sortRules.map((rule, ruleIndex) => (
                        <div key={`${view.id}-${rule.fieldKey}-${ruleIndex}`} className="flex flex-wrap items-center gap-2">
                          <span className="w-5 text-xs font-semibold text-slate-400">{ruleIndex + 1}</span>
                          <div className={`${underlineShell} min-w-48`}>
                            <OptionMenu
                              className={`${underlineControl} overview-field-select`}
                              value={rule.fieldKey}
                              options={sortFields.map((field) => ({ value: field.name, label: field.label }))}
                              onChange={(fieldKey) => updateRule(view.id, ruleIndex, { fieldKey })}
                            />
                            <FieldChevron />
                          </div>
                          <div className={`${underlineShell} w-36`}>
                            <OptionMenu
                              className={`${underlineControl} overview-field-select`}
                              value={rule.direction}
                              options={[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]}
                              onChange={(direction) => updateRule(view.id, ruleIndex, { direction: direction === 'desc' ? 'desc' : 'asc' })}
                            />
                            <FieldChevron />
                          </div>
                          <button type="button" onClick={() => moveRule(view.id, ruleIndex, -1)} disabled={ruleIndex === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move Sort Earlier">
                            <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </button>
                          <button type="button" onClick={() => moveRule(view.id, ruleIndex, 1)} disabled={ruleIndex === view.sortRules.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move Sort Later">
                            <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateView(view.id, { sortRules: view.sortRules.filter((_, itemIndex) => itemIndex !== ruleIndex) })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            aria-label="Remove Sort Column"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!viewDirty || isSaving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving…' : 'Save Views'}
            </button>
            {message && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{message}</span>}
            {error && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
