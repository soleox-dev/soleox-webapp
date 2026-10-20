import React, { useLayoutEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { SectionLinks, type TransactionSectionId, type TransactionSectionLink } from './SectionLinks';

interface HeaderCardProps {
  isNewTransaction: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
  hasUnsavedChanges?: boolean;
  saveBlocked?: boolean;
  saveBlockedReason?: string;
  /** The pinned strip's height, which places the sticky sidebar under it. */
  onHeightChange?: (height: number) => void;
  /** The deal this page shows. Its address becomes the title once it is known. */
  deal?: { address?: string; status?: string; side?: string; closingDate?: string; id?: string } | null;
  /** Returns to the Transactions list. */
  onBack?: () => void;
  sections?: TransactionSectionLink[];
  activeSection?: TransactionSectionId;
  onSelectSection?: (id: TransactionSectionId) => void;
  children?: React.ReactNode;
}

/** Status colors: waiting is amber, open is the brand sky, done is emerald, and stopped is rose. */
function statusTone(status: string): string {
  const value = status.toLowerCase();
  if (/closed|paid|sold|settled/.test(value)) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (/pending|contract|escrow/.test(value)) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (/cancel|expired|withdrawn|terminated|lost/.test(value)) return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
  return 'bg-brand-500/10 text-brand-700 dark:text-brand-400';
}

/**
 * The title card scrolls away. The pill below it holds the transaction search, the status
 * badges, and the actions, and stays pinned under the top bar. The page measures the pill
 * (#transaction-detail-header) to place the sticky sidebar under it.
 */
export function HeaderCard({ isNewTransaction, isSaving, onSave, onDiscard, onDelete, hasUnsavedChanges = false, saveBlocked = false, saveBlockedReason, onHeightChange, deal, onBack, sections, activeSection = 'overview', onSelectSection, children }: HeaderCardProps) {
  // Measured here, on this card's own element, so the height stays right when the card remounts.
  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || !onHeightChange) return;
    const sync = () => onHeightChange(strip.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <>
      <div className="!mb-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-6 py-4 shadow-xs transition-colors">
        {/* The deal is the title: its address, then status, side, closing date, and id. */}
        {deal?.address && !isNewTransaction ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{deal.address}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              {deal.status && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(deal.status)}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{deal.status}</span>}
              {deal.side && <span>{deal.side}</span>}
              {deal.closingDate && <><span aria-hidden>·</span><span>Closing {deal.closingDate}</span></>}
              {deal.id && <><span aria-hidden>·</span><span className="font-mono text-xs text-slate-400 dark:text-slate-500">{deal.id}</span></>}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isNewTransaction ? 'New transaction' : 'Transaction detail'}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Overview, commission waterfall, and payments</p>
          </>
        )}
      </div>

      {/* A strip in the page color around the pill, so content scrolling under it stays hidden.
          It runs into the page gutters so card shadows and borders do not show beside it. */}
      <div
        ref={stripRef}
        id="transaction-detail-header"
        className="sticky top-[var(--app-nav-offset,4rem)] z-40 !mb-3 -mx-4 bg-slate-100 px-4 py-3 md:-mx-6 md:px-6 transition-[top] duration-200 ease-out motion-reduce:transition-none dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white py-1.5 pl-5 pr-2 shadow-xl transition-colors md:flex-nowrap md:rounded-full dark:border-slate-700 dark:bg-slate-800">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Transactions"
              title="Back to Transactions"
              className="-ml-3 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          {onBack && <span aria-hidden className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />}
          <div className="min-w-0 flex-1">{children}</div>
          {isNewTransaction && (
            <span className="shrink-0 px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full">
              NEW TRANSACTION
            </span>
          )}
          {hasUnsavedChanges && (
            <span className="shrink-0 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full">
              UNSAVED CHANGES
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {!isNewTransaction && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-full border border-rose-300 text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:border-rose-500/40 dark:text-rose-400 inline-flex items-center gap-1.5"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={onDiscard}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Discard Changes
              </button>
            )}
            {(hasUnsavedChanges || isSaving) && (
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || saveBlocked}
                title={saveBlocked ? saveBlockedReason : undefined}
                className="px-4 py-1.5 font-bold text-xs rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                <span>{isSaving ? '⏳' : '💾'}</span>
                <span>{isSaving ? 'Saving Transaction...' : 'Save Transaction'}</span>
              </button>
            )}
          </div>
        </div>
        {/* The section links sit centered under the pill, apart from the actions. */}
        {sections && onSelectSection && (
          <div className="mt-2 flex justify-center">
            <SectionLinks sections={sections} active={activeSection} onSelect={onSelectSection} />
          </div>
        )}
      </div>
    </>
  );
}
