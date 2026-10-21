'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Loader2, Undo2, X } from 'lucide-react';
import { duplicateTmsIdReason, isDuplicateTmsIdReason } from '@/lib/sync-finished-summary';

export interface SyncFieldChange {
  fieldKey: string;
  fieldLabel: string;
  before: string;
  after: string;
}

export interface SyncRunDetail {
  rowNumber: number | null;
  tmsId: string | null;
  outcome: string;
  reason?: string;
  transactionId?: string;
  label?: string;
  changes?: SyncFieldChange[];
  propertyAddress?: string | null;
  transactionSide?: string | null;
}

export function SyncSummaryLine({
  text,
  errorCount,
  createdCount = 0,
  updatedCount = 0,
  connectedCount,
  disconnectedCount,
  onShowErrors,
  onShowAdded,
  onShowUpdated,
  onShowConnected,
  onShowDisconnected,
}: {
  text: string;
  errorCount: number;
  createdCount?: number;
  updatedCount?: number;
  connectedCount?: number;
  disconnectedCount?: number;
  onShowErrors: () => void;
  onShowAdded?: () => void;
  onShowUpdated?: () => void;
  onShowConnected?: () => void;
  onShowDisconnected?: () => void;
}) {
  const pieces: Array<{ type: 'text' | 'errors' | 'added' | 'updated' | 'connected' | 'disconnected'; value: string }> = [{ type: 'text', value: text }];
  const mark = (marker: string, type: 'errors' | 'added' | 'updated' | 'connected' | 'disconnected') => {
    const next: typeof pieces = [];
    pieces.forEach((piece) => {
      if (piece.type !== 'text') {
        next.push(piece);
        return;
      }
      const index = piece.value.lastIndexOf(marker);
      if (index < 0) {
        next.push(piece);
        return;
      }
      if (index > 0) next.push({ type: 'text', value: piece.value.slice(0, index) });
      next.push({ type, value: marker });
      const rest = piece.value.slice(index + marker.length);
      if (rest) next.push({ type: 'text', value: rest });
    });
    pieces.splice(0, pieces.length, ...next);
  };
  if (createdCount > 0 && onShowAdded) mark(`${createdCount} added`, 'added');
  if (updatedCount > 0 && onShowUpdated) mark(`${updatedCount} updated`, 'updated');
  if (connectedCount !== undefined && onShowConnected) {
    mark(`${connectedCount} connected to TMS`, 'connected');
  }
  if (disconnectedCount !== undefined && onShowDisconnected) {
    mark(`${disconnectedCount} disconnected from TMS`, 'disconnected');
  }
  if (errorCount > 0) mark(`${errorCount} error${errorCount === 1 ? '' : 's'}`, 'errors');
  if (pieces.length === 1 && pieces[0].type === 'text') return <>{text}</>;
  return (
    <>
      {pieces.map((piece, index) => {
        if (piece.type === 'text') return <React.Fragment key={index}>{piece.value}</React.Fragment>;
        const className = piece.type === 'connected' || piece.type === 'added'
          ? 'cursor-pointer font-semibold text-emerald-600 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-500 dark:text-emerald-400 dark:decoration-emerald-400/40'
          : piece.type === 'updated'
            ? 'cursor-pointer font-semibold text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400 dark:decoration-sky-400/40'
            : piece.type === 'disconnected'
              ? 'cursor-pointer font-semibold text-amber-600 underline decoration-amber-600/40 underline-offset-2 hover:text-amber-500 dark:text-amber-300 dark:decoration-amber-300/40'
              : 'cursor-pointer font-semibold text-rose-600 underline decoration-rose-600/40 underline-offset-2 hover:text-rose-500 dark:text-rose-300 dark:decoration-rose-300/40';
        const onClick = piece.type === 'connected'
          ? onShowConnected
          : piece.type === 'disconnected'
            ? onShowDisconnected
            : piece.type === 'added'
              ? onShowAdded
              : piece.type === 'updated'
                ? onShowUpdated
                : onShowErrors;
        return (
          <button
            key={index}
            type="button"
            onClick={onClick}
            className={className}
          >
            {piece.value}
          </button>
        );
      })}
    </>
  );
}

export function readableSyncReason(reason: string, fieldLabels: Record<string, string>): string {
  const keys = Object.keys(fieldLabels).sort((left, right) => right.length - left.length);
  return keys.reduce((text, key) => {
    const label = fieldLabels[key];
    if (!label || label === key) return text;
    return text.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), label);
  }, reason);
}

type SyncErrorGroup = {
  key: string;
  duplicate: boolean;
  label: string;
  rows: SyncRunDetail[];
};

function errorTypeLabel(detail: SyncRunDetail, fieldLabels: Record<string, string>): { key: string; duplicate: boolean; label: string } {
  const reason = detail.reason?.trim() || '';
  if (isDuplicateTmsIdReason(reason)) {
    return { key: 'duplicate-tms-id', duplicate: true, label: duplicateTmsIdReason() };
  }
  let text = readableSyncReason(reason, fieldLabels);
  if (detail.tmsId) {
    text = text.split(detail.tmsId).join(' ').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
  }
  const label = text || 'This row could not be synced.';
  return { key: label, duplicate: false, label };
}

function groupSyncErrors(failed: SyncRunDetail[], fieldLabels: Record<string, string>): SyncErrorGroup[] {
  const groups: SyncErrorGroup[] = [];
  failed.forEach((detail) => {
    const type = errorTypeLabel(detail, fieldLabels);
    const existing = groups.find((group) => group.key === type.key);
    if (existing) {
      existing.rows.push(detail);
      return;
    }
    groups.push({ key: type.key, duplicate: type.duplicate, label: type.label, rows: [detail] });
  });
  groups.forEach((group) => {
    if (group.duplicate) group.label = duplicateTmsIdReason(group.rows.length);
  });
  return groups;
}

type SyncErrorIdentity = {
  propertyAddress: string;
  transactionSide: string;
};

function errorIdentity(detail: SyncRunDetail, identityByTmsId?: Map<string, SyncErrorIdentity>): SyncErrorIdentity {
  const known = detail.tmsId ? identityByTmsId?.get(detail.tmsId.toLowerCase()) : undefined;
  const propertyAddress = String(detail.propertyAddress || known?.propertyAddress || '').trim();
  const transactionSide = String(detail.transactionSide || known?.transactionSide || '').trim();
  return {
    propertyAddress: propertyAddress || '—',
    transactionSide: transactionSide || '—',
  };
}

function syncErrorTableText(
  failed: SyncRunDetail[],
  fieldLabels: Record<string, string>,
  identityByTmsId?: Map<string, SyncErrorIdentity>,
): string {
  const cell = (value: string) => (/[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return groupSyncErrors(failed, fieldLabels).map((group) => {
    const rows = [
      group.label,
      ['Property Address', 'Side', 'Sheet Row', 'TMS ID'].join('\t'),
      ...group.rows.map((detail) => {
        const identity = errorIdentity(detail, identityByTmsId);
        return [
          cell(identity.propertyAddress),
          cell(identity.transactionSide),
          cell(detail.rowNumber == null ? '' : String(detail.rowNumber)),
          cell(detail.tmsId || ''),
        ].join('\t');
      }),
    ];
    return rows.join('\n');
  }).join('\n\n');
}

function SyncErrorGroups({
  details,
  fieldLabels,
  identityByTmsId,
}: {
  details: SyncRunDetail[];
  fieldLabels: Record<string, string>;
  identityByTmsId?: Map<string, SyncErrorIdentity>;
}) {
  const groups = groupSyncErrors(details, fieldLabels);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          <p className="text-sm text-slate-700 dark:text-slate-200">{group.label}</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-2xs text-slate-500">
                <th className="py-2 pr-4 font-semibold">Property Address</th>
                <th className="py-2 pr-4 font-semibold">Side</th>
                <th className="px-4 py-2 text-center font-semibold">Sheet Row</th>
                <th className="py-2 font-semibold">TMS ID</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((detail, index) => {
                const identity = errorIdentity(detail, identityByTmsId);
                return (
                  <tr key={`err-${detail.tmsId}-${detail.rowNumber}-${index}`} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="py-2 pr-4 align-top font-medium text-slate-800 dark:text-slate-100">{identity.propertyAddress}</td>
                    <td className="py-2 pr-4 align-top text-slate-700 dark:text-slate-200">{identity.transactionSide}</td>
                    <td className="px-4 py-2 align-top text-center tabular-nums text-slate-700 dark:text-slate-200">{detail.rowNumber ?? '—'}</td>
                    <td className="py-2 align-top font-mono text-xs text-slate-500 dark:text-slate-400">{detail.tmsId || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export function SyncErrorsDialog({
  details,
  fieldLabels,
  identityByTmsId,
  onClose,
}: {
  details: SyncRunDetail[];
  fieldLabels: Record<string, string>;
  identityByTmsId?: Map<string, SyncErrorIdentity>;
  onClose: () => void;
}) {
  const failed = details.filter((detail) => detail.outcome === 'error');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyTable = async () => {
    const text = syncErrorTableText(failed, fieldLabels, identityByTmsId);
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const selected = document.execCommand('copy');
    area.remove();
    if (selected) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
    try {
      await navigator.clipboard.writeText(text);
      if (!selected) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      if (!selected) return;
    }
  };

  return (
    <div
      className="app-modal fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-errors-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 id="sync-errors-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {failed.length} Sync Error{failed.length === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">These sheet rows were not written to Soleox.</p>
          </div>
          <button
            type="button"
            onClick={copyTable}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} aria-hidden /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">
          <SyncErrorGroups details={failed} fieldLabels={fieldLabels} identityByTmsId={identityByTmsId} />
        </div>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function SyncResultDialog({
  summary,
  note,
  details,
  fieldLabels,
  identityByTmsId,
  focus = null,
  undone = false,
  undoSummary = null,
  onUndo,
  confirmUndo = false,
  onClose,
}: {
  summary: string;
  note: string | null;
  details: SyncRunDetail[];
  fieldLabels: Record<string, string>;
  identityByTmsId?: Map<string, SyncErrorIdentity>;
  focus?: 'added' | 'updated' | null;
  /** The run was undone. undoSummary says what the undo did, when it happened in this session. */
  undone?: boolean;
  undoSummary?: string | null;
  /** Shown only for the latest sync, to someone who can sync. Resolves to the line to show. */
  onUndo?: () => Promise<string>;
  /** Open on the undo confirmation, as the Undo sync link on the page does. */
  confirmUndo?: boolean;
  onClose: () => void;
}) {
  const [undoStep, setUndoStep] = useState<'idle' | 'confirm' | 'running'>(confirmUndo && onUndo ? 'confirm' : 'idle');
  const [undoError, setUndoError] = useState<string | null>(null);
  const added = details.filter((detail) => detail.outcome === 'create');
  const updated = details.filter((detail) => detail.outcome === 'update' && (detail.changes?.length || 0) > 0);
  const notAdded = details.filter((detail) => detail.outcome === 'skip' && !detail.transactionId);
  const failed = details.filter((detail) => detail.outcome === 'error');
  const showAdded = focus !== 'updated' && added.length > 0;
  const showUpdated = focus !== 'added' && updated.length > 0;
  const showRest = focus === null;
  const changedFieldCount = updated.reduce((sum, detail) => sum + (detail.changes?.length || 0), 0);

  const runUndo = async () => {
    if (!onUndo) return;
    setUndoStep('running');
    setUndoError(null);
    try {
      await onUndo();
      setUndoStep('idle');
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : 'The sync could not be undone.');
      setUndoStep('confirm');
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="app-modal fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[1400px] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-result-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            <h3 id="sync-result-title" className="text-lg font-bold text-slate-900 dark:text-white">Sync with TMS</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{summary}</p>
            {note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{note}</p>}
            {undone && (
              <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                {undoSummary || 'This sync was undone.'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-start gap-2">
          {onUndo && !undone && undoStep === 'idle' && (
            <button
              type="button"
              onClick={() => { setUndoError(null); setUndoStep('confirm'); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              <span>Undo Sync</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="group -mr-1.5 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:text-slate-400 dark:hover:bg-slate-700/70 dark:hover:text-white"
          >
            <X className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" strokeWidth={2} aria-hidden />
          </button>
          </div>
        </div>
        {onUndo && !undone && undoStep !== 'idle' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-900/60 dark:bg-amber-950/40" role="alert">
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">Undo This Sync?</p>
              <p className="mt-0.5">
                {[
                  changedFieldCount > 0 ? `Puts back the ${changedFieldCount.toLocaleString()} ${changedFieldCount === 1 ? 'field' : 'fields'} it changed on ${updated.length.toLocaleString()} ${updated.length === 1 ? 'transaction' : 'transactions'}` : '',
                  added.length > 0 ? `deletes the ${added.length.toLocaleString()} ${added.length === 1 ? 'transaction' : 'transactions'} it added` : '',
                ].filter(Boolean).join(' and ')}. Anything edited since the sync is kept. The next sync brings the TMS values back unless they change in the TMS.
              </p>
              {undoError && <p className="mt-1 font-medium text-rose-700 dark:text-rose-400">{undoError}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => { setUndoError(null); setUndoStep('idle'); }}
                disabled={undoStep === 'running'}
                className="h-8 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runUndo()}
                disabled={undoStep === 'running'}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {undoStep === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                <span>{undoStep === 'running' ? 'Undoing…' : 'Undo Sync'}</span>
              </button>
            </div>
          </div>
        )}
        <div className="space-y-5 overflow-y-auto px-5 py-3">
          {showRest && added.length === 0 && updated.length === 0 && notAdded.length === 0 && failed.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">No transactions were added, and no TMS fields changed.</p>
          )}
          {showAdded && (
            <section>
              <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Added from TMS</h4>
              <ul className="mt-2 space-y-1">
                {added.map((detail) => (
                  <li key={`add-${detail.transactionId || detail.tmsId}`}>
                    {detail.transactionId ? (
                      <Link
                        href={`/commission-tracker/transactions/${detail.transactionId}`}
                        onClick={onClose}
                        className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {detail.label || detail.tmsId}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-700 dark:text-slate-200">{detail.label || detail.tmsId}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showUpdated && (
            <section>
              <h4 className="text-xs font-bold text-sky-600 dark:text-sky-400">Updated from TMS</h4>
              <table className="mt-2 w-full border-collapse text-left text-xs">
                <thead className="sticky -top-3 z-10 bg-white dark:bg-slate-800">
                  <tr className="text-2xs text-slate-500">
                    <th className="w-[40%] py-1.5 pr-3 font-semibold">Transaction</th>
                    <th className="py-1.5 pr-3 font-semibold">Field</th>
                    <th className="py-1.5 pr-3 font-semibold">Before</th>
                    <th className="py-1.5 font-semibold">After</th>
                  </tr>
                </thead>
                <tbody>
                  {updated.flatMap((detail) => {
                    const changes = detail.changes || [];
                    const key = detail.transactionId || detail.tmsId;
                    return changes.map((change, index) => (
                      <tr
                        key={`upd-${key}-${change.fieldKey}`}
                        className={index === 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''}
                      >
                        {index === 0 && (
                          <td rowSpan={changes.length} className="py-1 pr-3 align-top">
                            {detail.transactionId ? (
                              <Link
                                href={`/commission-tracker/transactions/${detail.transactionId}`}
                                onClick={onClose}
                                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                              >
                                {detail.label || detail.tmsId}
                              </Link>
                            ) : (
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{detail.label || detail.tmsId}</span>
                            )}
                          </td>
                        )}
                        <td className="py-1 pr-3 align-top text-slate-800 dark:text-slate-100">{change.fieldLabel}</td>
                        <td className="py-1 pr-3 align-top text-slate-500 dark:text-slate-400">{change.before}</td>
                        <td className="py-1 align-top text-slate-800 dark:text-slate-100">{change.after}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </section>
          )}
          {showRest && notAdded.length > 0 && (
            <section>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">Not Added</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These sheet rows are outside the default view, so Soleox did not create them.</p>
              <ul className="mt-2 space-y-1">
                {notAdded.map((detail, index) => (
                  <li key={`skip-${detail.tmsId}-${detail.rowNumber}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">{detail.tmsId || `Row ${detail.rowNumber ?? '—'}`}</span>
                    {detail.rowNumber ? <span className="text-slate-500"> · row {detail.rowNumber}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showRest && failed.length > 0 && (
            <section>
              <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400">Could Not Sync</h4>
              <div className="mt-2">
                <SyncErrorGroups details={failed} fieldLabels={fieldLabels} identityByTmsId={identityByTmsId} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
