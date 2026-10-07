'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { FormulaEditor, type FormulaName } from '../commission-templates/FormulaEditor';
import { SectionCollapseButton } from '../../transactions/[id]/components/SectionCollapseButton';
import { toggleFromSectionHeader } from '../../transactions/[id]/components/sectionHeaderClick';
import { TrashIcon } from '@/components/ui/trash-icon';
import {
  DEMO_TRANSACTION_SCORECARDS,
  SCORECARD_COLOR_LABEL,
  SCORECARD_COLOR_STYLES,
  SCORECARD_COLORS,
  emptyScorecard,
  type ScorecardMetric,
  type ScorecardMetricKind,
  type TransactionScorecard,
} from '@/lib/transaction-scorecards';

interface SchemaField {
  field_key: string;
  field_label: string;
  field_type?: string;
  is_enabled?: boolean;
}

const CLIENT_ID = 'DEMO';
const METRIC_KINDS: { value: ScorecardMetricKind; label: string }[] = [
  { value: 'count', label: 'Count of records' },
  { value: 'sum', label: 'Sum of a field' },
  { value: 'average', label: 'Average of a field' },
];

const inputClass = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const labelClass = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeScorecards(cards: TransactionScorecard[]): string {
  return JSON.stringify(cards.map((card) => ({
    id: card.id,
    name: card.name,
    color: card.color,
    filterFormula: card.filterFormula,
    metrics: card.metrics.map((metric) => ({
      name: metric.name,
      kind: metric.kind,
      fieldKey: metric.kind === 'count' ? '' : metric.fieldKey || '',
    })),
  })));
}

export default function ScorecardsSettingsPage() {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [scorecards, setScorecards] = useState<TransactionScorecard[]>(DEMO_TRANSACTION_SCORECARDS);
  const [baseline, setBaseline] = useState(() => serializeScorecards(DEMO_TRANSACTION_SCORECARDS));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!colorPickerId) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-color-picker]')) return;
      setColorPickerId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colorPickerId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const headers = { 'x-client-id': CLIENT_ID };
        const [scoreRes, schemaRes] = await Promise.all([
          fetch('/api/transaction-scorecards', { headers }),
          fetch('/api/schema/transactions', { headers }),
        ]);
        const scoreData = await scoreRes.json().catch(() => ({}));
        const schemaData = await schemaRes.json().catch(() => ({}));
        if (!scoreRes.ok) throw new Error(scoreData.error || 'Failed to load scorecards.');
        if (cancelled) return;

        const catalog: SchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
        const unique = new Map<string, SchemaField>();
        catalog.forEach((field) => {
          if (field.is_enabled === false || !field.field_key || unique.has(field.field_key)) return;
          unique.set(field.field_key, field);
        });
        setFields(Array.from(unique.values()));
        if (Array.isArray(scoreData.scorecards)) {
          setScorecards(scoreData.scorecards);
          setBaseline(serializeScorecards(scoreData.scorecards));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load scorecards.');
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
    if (!names.has('acceptance_date')) names.set('acceptance_date', { name: 'acceptance_date', label: 'Acceptance Date', kind: 'field' });
    if (!names.has('closing_date')) names.set('closing_date', { name: 'closing_date', label: 'Closing Date', kind: 'field' });
    names.set('status', { name: 'status', label: 'Status', kind: 'field' });
    return Array.from(names.values());
  }, [fields]);

  const metricFields = fields.filter((field) => field.field_type === 'NUMBER' || field.field_type === 'CURRENCY' || field.field_type === 'PERCENT');

  const updateCard = (id: string, patch: Partial<TransactionScorecard>) => {
    setScorecards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  };

  const updateMetric = (id: string, index: number, patch: Partial<ScorecardMetric>) => {
    setScorecards((current) => current.map((card) => {
      if (card.id !== id) return card;
      return {
        ...card,
        metrics: card.metrics.map((metric, metricIndex) => {
          if (metricIndex !== index) return metric;
          const next = { ...metric, ...patch };
          if (next.kind === 'count') return { name: next.name, kind: 'count' };
          return next;
        }),
      };
    }));
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    setScorecards((current) => {
      const next = current.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [card] = next.splice(index, 1);
      next.splice(target, 0, card);
      return next;
    });
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/transaction-scorecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({ clientId: CLIENT_ID, scorecards }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || 'Failed to save scorecards.');
      const saved = Array.isArray(data.scorecards) ? data.scorecards : scorecards;
      setScorecards(saved);
      setBaseline(serializeScorecards(saved));
      setMessage('Scorecards saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scorecards.');
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = serializeScorecards(scorecards) !== baseline;

  const toggleCard = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setColorPickerId((current) => (current === id ? null : current));
  };

  useEffect(() => {
    if (isDirty) setMessage(null);
  }, [isDirty]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="sticky top-6 z-40 rounded-t-xl border-b border-slate-200 bg-white px-6 py-5 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-slate-100 before:content-[''] dark:border-slate-700 dark:bg-slate-800 dark:before:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transactions: Scorecards</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cards above the transactions table. Each card includes deals where its formula is true, and shows one or two metrics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {message && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{message}</span>}
            {error && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</span>}
            {isDirty && (
              <button
                type="button"
                onClick={save}
                disabled={isSaving}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? 'Saving…' : 'Save Scorecards'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const id = newId();
                setScorecards((current) => [...current, emptyScorecard(id)]);
                setExpandedIds((current) => new Set(current).add(id));
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Add scorecard
            </button>
          </div>
        </div>
      </div>
      <div className="p-6">

      {isLoading ? (
        <p className="text-sm italic text-slate-400">Loading scorecards…</p>
      ) : (
        <div className="space-y-3">
          {scorecards.length === 0 ? (
            <p className="text-xs italic text-slate-400">No scorecards. The transactions page will not show cards until you add one.</p>
          ) : scorecards.map((card, index) => {
            const swatch = SCORECARD_COLOR_STYLES[card.color]?.swatch || SCORECARD_COLOR_STYLES.blue.swatch;
            const expanded = expandedIds.has(card.id);
            const summary = [
              card.filterFormula.trim(),
              card.metrics.map((metric) => metric.name.trim()).filter(Boolean).join(', '),
            ].filter(Boolean).join(' · ');
            return (
              <article key={card.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div
                  className={`flex min-w-0 items-center gap-2 ${expanded ? 'mb-4' : ''} cursor-pointer`}
                  onClick={(event) => toggleFromSectionHeader(event, () => toggleCard(card.id))}
                >
                  <div className="relative" data-color-picker>
                    <button
                      type="button"
                      aria-label={`Scorecard color, ${SCORECARD_COLOR_LABEL[card.color]}`}
                      aria-expanded={colorPickerId === card.id}
                      onClick={() => setColorPickerId((current) => (current === card.id ? null : card.id))}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer"
                    >
                      <span className={`h-3 w-3 rounded-full ${swatch}`} />
                    </button>
                    {colorPickerId === card.id && (
                      <div className="absolute left-0 top-full z-30 mt-1.5 grid grid-cols-[repeat(6,2rem)] gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {SCORECARD_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={SCORECARD_COLOR_LABEL[color]}
                            aria-pressed={card.color === color}
                            onClick={() => {
                              updateCard(card.id, { color });
                              setColorPickerId(null);
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded-full cursor-pointer ${card.color === color ? 'bg-slate-100 ring-1 ring-slate-400 dark:bg-slate-800 dark:ring-slate-500' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                          >
                            <span className={`h-4 w-4 rounded-full ${SCORECARD_COLOR_STYLES[color].swatch}`} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    value={card.name}
                    onChange={(event) => updateCard(card.id, { name: event.target.value })}
                    placeholder="New scorecard"
                    aria-label="Scorecard name"
                    style={{ width: `${Math.min(32, Math.max((card.name || 'New scorecard').length + 1, 8))}ch` }}
                    className="max-w-full border-0 border-b border-b-slate-300 bg-transparent px-0.5 py-0 text-sm font-semibold text-slate-900 placeholder:font-semibold placeholder:text-slate-400 focus:border-b-emerald-500 focus:outline-none focus:ring-0 dark:border-b-slate-600 dark:text-white dark:placeholder:text-slate-500"
                  />
                  {!expanded && summary && (
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{summary}</span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => moveCard(index, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move scorecard earlier">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button type="button" onClick={() => moveCard(index, 1)} disabled={index === scorecards.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:cursor-not-allowed" aria-label="Move scorecard later">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setScorecards((current) => current.filter((item) => item.id !== card.id))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                      aria-label={`Delete ${card.name || 'scorecard'}`}
                    >
                      <TrashIcon />
                    </button>
                    <SectionCollapseButton collapsed={!expanded} onClick={() => toggleCard(card.id)} />
                  </div>
                </div>

                {expanded && (
                <>
                <FormulaEditor
                  label="Qualifying formula"
                  value={card.filterFormula}
                  onChange={(filterFormula) => updateCard(card.id, { filterFormula })}
                  names={formulaNames}
                  fitContent
                  hint='Leave this blank to include every transaction. YEAR(acceptance_date)=YEAR(TODAY()) keeps dates in the current calendar year.'
                />

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Metrics</h4>
                    {card.metrics.length < 2 && (
                      <button
                        type="button"
                        onClick={() => updateCard(card.id, { metrics: [...card.metrics, { name: '', kind: 'sum', fieldKey: metricFields[0]?.field_key || '' }] })}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        Add metric
                      </button>
                    )}
                  </div>
                  {card.metrics.map((metric, metricIndex) => (
                    <div key={`${card.id}-metric-${metricIndex}`} className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <label className="space-y-1">
                        <span className={labelClass}>Metric name</span>
                        <input
                          value={metric.name}
                          onChange={(event) => updateMetric(card.id, metricIndex, { name: event.target.value })}
                          className={`${inputClass} w-full`}
                          placeholder={metricIndex === 0 ? 'Units' : 'Volume'}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Calculation</span>
                        <select
                          value={metric.kind}
                          onChange={(event) => {
                            const kind = event.target.value as ScorecardMetricKind;
                            updateMetric(card.id, metricIndex, {
                              kind,
                              fieldKey: kind === 'count' ? undefined : metric.fieldKey || metricFields[0]?.field_key || '',
                            });
                          }}
                          className={`${inputClass} w-full`}
                        >
                          {METRIC_KINDS.map((kind) => (
                            <option key={kind.value} value={kind.value}>{kind.label}</option>
                          ))}
                        </select>
                      </label>
                      {metric.kind === 'count' ? (
                        <div />
                      ) : (
                        <label className="space-y-1">
                          <span className={labelClass}>Field</span>
                          <select
                            value={metric.fieldKey || ''}
                            onChange={(event) => updateMetric(card.id, metricIndex, { fieldKey: event.target.value })}
                            className={`${inputClass} w-full`}
                          >
                            <option value="">Choose a field</option>
                            {metricFields.map((field) => (
                              <option key={field.field_key} value={field.field_key}>{field.field_label || field.field_key}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => updateCard(card.id, { metrics: card.metrics.filter((_, itemIndex) => itemIndex !== metricIndex) })}
                        disabled={card.metrics.length === 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-500/10 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        aria-label="Remove metric"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
                </>
                )}
              </article>
            );
          })}
        </div>
      )}
      </div>
    </section>
  );
}
