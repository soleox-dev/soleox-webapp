'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { OptionMenu } from '@/components/ui/option-menu';
import { useRegisterSave } from '@/components/save-leave-guard';
import { FieldChevron, UnderlineField, underlineControl, underlineShell } from '@/components/ui/underline-field';
import { duplicateTmsIdReason, isDuplicateTmsIdReason, syncFinishedSummary } from '@/lib/sync-finished-summary';

interface FieldOption {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
}

interface MappingRow {
  sourceHeader: string;
  fieldKey: string;
  policy: 'tms_wins' | 'lock_on_edit' | 'keep_until_tms' | 'disconnected';
}

interface SyncDetail {
  rowNumber: number | null;
  tmsId: string | null;
  outcome: string;
  reason?: string;
}

interface LastRun {
  status: string;
  started_at: string;
  finished_at: string | null;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  unchanged_count: number;
  connected_count: number;
  disconnected_count: number;
  message: string | null;
  details: SyncDetail[];
}

interface ProtectionRow {
  id: string;
  tmsId: string | null;
  propertyAddress: string | null;
  fieldKey: string;
  fieldLabel: string;
  protection: string;
  protectedBy: string | null;
  protectedAt: string | null;
}

const CLIENT_ID = 'DEMO';

const POLICY_OPTIONS: Array<{
  value: Exclude<MappingRow['policy'], 'disconnected'>;
  label: string;
  closedClass: string;
  optionClass: string;
}> = [
  {
    value: 'tms_wins',
    label: 'TMS wins',
    closedClass: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/50 dark:bg-sky-950/60 dark:text-sky-100',
    optionClass: 'bg-sky-50 text-sky-950 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900',
  },
  {
    value: 'lock_on_edit',
    label: 'Lock after a user edit',
    closedClass: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/60 dark:text-rose-100',
    optionClass: 'bg-rose-50 text-rose-950 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-100 dark:hover:bg-rose-900',
  },
  {
    value: 'keep_until_tms',
    label: 'Keep a user value until the TMS has one',
    closedClass: 'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-500/50 dark:bg-violet-950/60 dark:text-violet-100',
    optionClass: 'bg-violet-50 text-violet-950 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900',
  },
];

interface IntegrationDraft {
  spreadsheet: string;
  tabName: string;
  tmsName: string;
  enabled: boolean;
  mappings: MappingRow[];
}

function connectedFieldKey(fieldKey: string, fields: Array<{ fieldKey: string }>): string {
  return fields.some((field) => field.fieldKey === fieldKey) ? fieldKey : '';
}

function normalizeMappings(rows: MappingRow[], fields: Array<{ fieldKey: string }> = []): MappingRow[] {
  return rows.map((mapping) => {
    const fieldKey = connectedFieldKey(mapping.fieldKey || '', fields);
    return {
      sourceHeader: mapping.sourceHeader,
      fieldKey,
      policy: fieldKey ? (mapping.policy === 'disconnected' ? 'tms_wins' : mapping.policy) : 'disconnected',
    };
  });
}

function draftKey(draft: IntegrationDraft, fields: Array<{ fieldKey: string }>): string {
  return JSON.stringify({
    spreadsheet: draft.spreadsheet,
    tabName: draft.tabName,
    tmsName: draft.tmsName.trim(),
    enabled: draft.enabled,
    mappings: normalizeMappings(draft.mappings, fields),
  });
}

function PolicySelect({
  value,
  disabled,
  onChange,
}: {
  value: MappingRow['policy'];
  disabled: boolean;
  onChange: (policy: Exclude<MappingRow['policy'], 'disconnected'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const selected = POLICY_OPTIONS.find((option) => option.value === value) ?? POLICY_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 132;
      const openUp = rect.bottom + 4 + menuHeight > window.innerHeight && rect.top > menuHeight + 4;
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 40,
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rowClass = 'flex items-center justify-between gap-2 whitespace-nowrap border px-3 py-2 text-xs font-semibold';

  if (value === 'disconnected') {
    return (
      <div className="grid w-max">
        {POLICY_OPTIONS.map((option) => (
          <span key={option.value} aria-hidden className={`invisible col-start-1 row-start-1 pointer-events-none border-transparent ${rowClass}`}>
            {option.label}
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </span>
        ))}
        <div className={`col-start-1 row-start-1 rounded-lg border-amber-300 bg-amber-100/70 font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 ${rowClass}`}>
          Not synced
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid w-max">
        {POLICY_OPTIONS.map((option) => (
          <span key={option.value} aria-hidden className={`invisible col-start-1 row-start-1 pointer-events-none border-transparent ${rowClass}`}>
            {option.label}
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </span>
        ))}
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`col-start-1 row-start-1 rounded-lg disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${rowClass} ${selected.closedClass}`}
        >
          <span>{selected.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      </div>
      {open && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          className="overflow-hidden rounded-lg border border-slate-200 shadow-lg dark:border-slate-600"
        >
          {POLICY_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-semibold cursor-pointer ${option.optionClass} ${option.value === value ? 'ring-1 ring-inset ring-current' : ''}`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}

function formatWhen(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TransactionIntegrationsPage() {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [spreadsheet, setSpreadsheet] = useState('');
  const [tabName, setTabName] = useState('SOLEOX Integration');
  const [tmsName, setTmsName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [persistedEnabled, setPersistedEnabled] = useState(false);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [protections, setProtections] = useState<ProtectionRow[]>([]);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const [serviceAccountConfigured, setServiceAccountConfigured] = useState(false);
  const [defaultViewFormula, setDefaultViewFormula] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedDraftKey, setSavedDraftKey] = useState('');

  const applyPayload = (data: Record<string, unknown>) => {
    const connection = data.connection as { spreadsheetId?: string; spreadsheetUrl?: string; tabName?: string; tmsName?: string; enabled?: boolean } | null;
    const nextSpreadsheet = connection?.spreadsheetUrl || connection?.spreadsheetId || '';
    const nextTabName = connection?.tabName || 'SOLEOX Integration';
    const nextTmsName = connection?.tmsName || '';
    const nextEnabled = Boolean(connection?.enabled);
    const nextFields = Array.isArray(data.fields) ? data.fields as FieldOption[] : [];
    const nextMappings = normalizeMappings(Array.isArray(data.mappings) ? data.mappings as MappingRow[] : [], nextFields);
    setSpreadsheet(nextSpreadsheet);
    setTabName(nextTabName);
    setTmsName(nextTmsName);
    setEnabled(nextEnabled);
    setPersistedEnabled(nextEnabled);
    setFields(nextFields);
    setMappings(nextMappings);
    setSavedDraftKey(draftKey({
      spreadsheet: nextSpreadsheet,
      tabName: nextTabName,
      tmsName: nextTmsName,
      enabled: nextEnabled,
      mappings: nextMappings,
    }, nextFields));
    setLastRun((data.lastRun as LastRun | null) ?? null);
    setProtections(Array.isArray(data.protections) ? data.protections as ProtectionRow[] : []);
    setServiceAccountEmail((data.serviceAccountEmail as string | null) ?? null);
    setServiceAccountConfigured(Boolean(data.serviceAccountConfigured));
    setDefaultViewFormula(String(data.defaultViewFormula || ''));
    setCanManage(Boolean(data.canManage));
    setLoaded(true);
  };

  const load = async () => {
    const response = await fetch('/api/integrations/google-sheets', { headers: { 'x-client-id': CLIENT_ID } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || 'The integration could not be loaded.');
    applyPayload(data);
  };

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The integration could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tmsMapped = mappings.some((mapping) => mapping.fieldKey === 'tms_id');
  const syncReady = Boolean(defaultViewFormula.trim()) && tmsMapped && persistedEnabled && serviceAccountConfigured;
  const isDirty = loaded && savedDraftKey !== draftKey({ spreadsheet, tabName, tmsName, enabled, mappings }, fields);

  const fieldOptions = useMemo(() => fields.slice().sort((left, right) => left.fieldLabel.localeCompare(right.fieldLabel)), [fields]);

  const updateMapping = (index: number, patch: Partial<MappingRow>) => {
    setMappings((current) => current.map((mapping, mappingIndex) => {
      if (mappingIndex !== index) return mapping;
      const next = { ...mapping, ...patch };
      if (!next.fieldKey) next.policy = 'disconnected';
      else if (next.policy === 'disconnected') next.policy = 'tms_wins';
      return next;
    }));
  };

  const preview = async () => {
    setIsPreviewing(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/integrations/google-sheets/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({ clientId: CLIENT_ID, spreadsheetId: spreadsheet, tabName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The spreadsheet could not be read.');
      const suggested: MappingRow[] = Array.isArray(data.mappings) ? data.mappings : [];
      setMappings((current) => {
        const saved = new Map(current.map((mapping) => [mapping.sourceHeader.toLowerCase(), mapping]));
        const used = new Set<string>();
        return suggested.map((mapping) => {
          const existing = saved.get(mapping.sourceHeader.toLowerCase());
          if (existing && !existing.fieldKey) return existing;
          if (existing?.fieldKey && !used.has(existing.fieldKey)) {
            used.add(existing.fieldKey);
            return existing;
          }
          if (mapping.fieldKey && used.has(mapping.fieldKey)) {
            return { ...mapping, fieldKey: '', policy: 'disconnected' };
          }
          if (mapping.fieldKey) used.add(mapping.fieldKey);
          return mapping;
        });
      });
      setMessage(`Loaded ${data.headers?.length || 0} columns from ${data.rowCount || 0} rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The spreadsheet could not be read.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const save = async (): Promise<boolean> => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/integrations/google-sheets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({
          clientId: CLIENT_ID,
          spreadsheetId: spreadsheet,
          tabName,
          tmsName,
          enabled,
          mappings: mappings.map((mapping) => {
            const fieldKey = connectedFieldKey(mapping.fieldKey, fields);
            return {
              sourceHeader: mapping.sourceHeader,
              fieldKey: fieldKey || null,
              policy: fieldKey ? mapping.policy : 'disconnected',
            };
          }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The integration could not be saved.');
      applyPayload(data);
      setMessage('Integration saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The integration could not be saved.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useRegisterSave({
    id: 'sheet-integration',
    active: isDirty && canManage,
    saving: isSaving,
    onSave: save,
  });

  const syncNow = async () => {
    setIsSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/integrations/google-sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({ clientId: CLIENT_ID }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || data.run?.message || 'Sync failed.');
      if (isDirty) {
        const refresh = await fetch('/api/integrations/google-sheets', { headers: { 'x-client-id': CLIENT_ID } });
        const latest = await refresh.json().catch(() => ({}));
        if (refresh.ok && latest.success !== false) {
          setLastRun((latest.lastRun as LastRun | null) ?? null);
          setProtections(Array.isArray(latest.protections) ? latest.protections as ProtectionRow[] : []);
        }
      } else {
        await load();
      }
      const run = data.run;
      setMessage(`Sync finished. ${syncFinishedSummary({
        createdCount: run.createdCount,
        updatedCount: run.updatedCount,
        skippedCount: run.skippedCount,
        errorCount: run.errorCount,
        connectedCount: run.connectedCount ?? 0,
        disconnectedCount: run.disconnectedCount ?? 0,
        details: run.details,
      })}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
      if (!isDirty) await load().catch(() => undefined);
    } finally {
      setIsSyncing(false);
    }
  };

  const clearProtection = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/field-protections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
        body: JSON.stringify({ clientId: CLIENT_ID, id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'The field lock could not be cleared.');
      setProtections((current) => current.filter((item) => item.id !== id));
      setMessage('Field lock cleared. The next sync can update that column.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The field lock could not be cleared.');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transactions: TMS Integrations</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Soleox reads the SOLEOX Integration tab and adds every sheet row that has a TMS ID. It updates transactions that are in the default view. Commission calculations and payments stay in Soleox.
          </p>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={!canManage || isSyncing || isLoading || !syncReady}
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50 cursor-pointer"
        >
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm italic text-slate-400">Loading integration…</p>
      ) : (
        <div className="space-y-8">
          {error && (
            <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
          )}

          {loaded && (
          <>
          {!defaultViewFormula.trim() && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
              Save a default view on the <Link href="/commission-tracker/settings/transaction-view" className="font-semibold underline">Views</Link> page before syncing. A blank filter would include reconciled transactions.
            </p>
          )}
          {!serviceAccountConfigured && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
              Google Sheets is not configured on the server yet. Add the Soleox service account before loading a spreadsheet.
            </p>
          )}
          {serviceAccountEmail && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Share the spreadsheet with <span className="font-semibold text-slate-900 dark:text-white">{serviceAccountEmail}</span> so Soleox can read the tab.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_16rem]">
            <UnderlineField label="TMS">
              <input value={tmsName} onChange={(event) => setTmsName(event.target.value)} placeholder="SkySlope, Open To Close, etc." maxLength={60} className={underlineControl} disabled={!canManage} />
            </UnderlineField>
            <UnderlineField label="Spreadsheet">
              <input value={spreadsheet} onChange={(event) => setSpreadsheet(event.target.value)} placeholder="Paste the Google Sheets link" className={underlineControl} disabled={!canManage} />
            </UnderlineField>
            <UnderlineField label="Tab">
              <input value={tabName} onChange={(event) => setTabName(event.target.value)} className={underlineControl} disabled={!canManage} />
            </UnderlineField>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={!canManage} className="h-4 w-4 accent-brand-600" />
            Sync this spreadsheet every hour
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={preview} disabled={!canManage || isPreviewing} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50 cursor-pointer">
              {isPreviewing ? 'Loading columns…' : 'Load columns'}
            </button>
            <button type="button" onClick={save} disabled={!canManage || isSaving || !isDirty} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50 cursor-pointer">
              {isSaving ? 'Saving…' : 'Save integration'}
            </button>
            {message && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{message}</span>}
          </div>

          {!tmsMapped && mappings.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">Map one column to TMS ID. Rows without it are not imported.</p>
          )}

          {mappings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400 dark:border-slate-700">
                    <th className="py-2 pr-3 font-semibold">Sheet column</th>
                    <th className="py-2 pr-3 font-semibold">Soleox field</th>
                    <th className="py-2 font-semibold">When values differ</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping, index) => {
                    const fieldKey = connectedFieldKey(mapping.fieldKey, fieldOptions);
                    const disconnected = !fieldKey;
                    return (
                    <tr key={`${mapping.sourceHeader}-${index}`} className={disconnected ? 'border-b border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-950/30' : 'border-b border-slate-100 dark:border-slate-700/60'}>
                      <td className={`py-2 pr-3 font-medium ${disconnected ? 'text-amber-800 dark:text-amber-200' : 'text-slate-900 dark:text-white'}`}>{mapping.sourceHeader}</td>
                      <td className="py-2 pr-3">
                        <div className={`${underlineShell} ${disconnected ? 'border-b-amber-500' : ''}`}>
                          <OptionMenu
                            value={fieldKey}
                            disabled={!canManage}
                            placeholder="Disconnected"
                            className={`${underlineControl} overview-field-select`}
                            options={[
                              { value: '', label: 'Disconnected' },
                              ...fieldOptions.map((field) => ({
                                value: field.fieldKey,
                                label: field.fieldLabel,
                                disabled: mappings.some((item, itemIndex) => itemIndex !== index && item.fieldKey === field.fieldKey),
                              })),
                            ]}
                            onChange={(next) => updateMapping(index, { fieldKey: next })}
                          />
                          <FieldChevron />
                        </div>
                      </td>
                      <td className="py-2">
                        <PolicySelect
                          value={fieldKey ? mapping.policy : 'disconnected'}
                          disabled={!canManage || !fieldKey}
                          onChange={(policy) => updateMapping(index, { policy })}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {lastRun && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Last sync</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {formatWhen(lastRun.finished_at || lastRun.started_at)} · {lastRun.status}. {lastRun.created_count} added, {lastRun.updated_count} updated, {lastRun.connected_count ?? 0} connected to TMS, {lastRun.disconnected_count ?? 0} disconnected from TMS, {lastRun.skipped_count} outside the default view, {lastRun.unchanged_count} already up to date, {lastRun.error_count} errors.
              </p>
              {lastRun.message && <p className="text-sm text-slate-600 dark:text-slate-400">{lastRun.message}</p>}
              {Array.isArray(lastRun.details) && lastRun.details.length > 0 && (
                <ul className="max-h-64 space-y-1 overflow-auto text-xs text-slate-600 dark:text-slate-400">
                  {lastRun.details.slice(0, 30).map((detail, index) => {
                    const reason = detail.reason && isDuplicateTmsIdReason(detail.reason) ? duplicateTmsIdReason() : detail.reason;
                    return (
                    <li key={`${detail.tmsId}-${detail.rowNumber}-${index}`}>
                      Row {detail.rowNumber ?? '—'}{detail.tmsId ? ` · ${detail.tmsId}` : ''} · {detail.outcome}{reason ? ` · ${reason}` : ''}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Fields held from the TMS</h3>
            {protections.length === 0 ? (
              <p className="text-xs italic text-slate-400">No user edits are holding a column back from the next sync.</p>
            ) : (
              <ul className="space-y-2">
                {protections.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-white">{item.fieldLabel}</span>
                      {' · '}
                      {item.tmsId || item.propertyAddress || item.fieldKey}
                      {' · '}
                      {item.protection === 'locked' ? 'Locked after a user edit' : 'Kept until the TMS sends a value'}
                    </div>
                    <button type="button" onClick={() => clearProtection(item.id)} disabled={!canManage} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400 cursor-pointer">
                      Resume TMS updates
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </>
          )}
        </div>
      )}
    </section>
  );
}
