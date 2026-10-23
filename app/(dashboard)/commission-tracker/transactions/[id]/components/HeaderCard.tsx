import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, TriangleAlert } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { SectionLinks, type TransactionSectionId, type TransactionSectionLink } from './SectionLinks';
import { swallowNextClick } from '@/lib/swallow-click';

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
  /** Where Back goes, such as an Owner Report's name; Transactions by default. */
  backLabel?: string;
  sections?: TransactionSectionLink[];
  activeSection?: TransactionSectionId;
  onSelectSection?: (id: TransactionSectionId) => void;
  /** The transaction search. It opens from Switch deal, from the address, or with "/". */
  children?: React.ReactNode;
  /** Key Terms to show under the bar, once their table has scrolled out of view. */
  keyTerms?: { key: string; label: string; value: string; currency: boolean; empty: boolean }[] | null;
}

/** Status colors: waiting is amber, open is the brand sky, done is emerald, and stopped is rose. */
function statusTone(status: string): string {
  const value = status.toLowerCase();
  if (/closed|paid|sold|settled/.test(value)) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (/pending|contract|escrow/.test(value)) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (/cancel|expired|withdrawn|terminated|lost/.test(value)) return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
  return 'bg-brand-500/10 text-brand-700 dark:text-brand-400';
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(status)}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/** The transaction ID; a click copies it. */
function IdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={copied ? 'Copied' : 'Copy transaction ID'}
      className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-2xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 max-md:hidden dark:text-slate-500 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
    >
      {copied ? 'Copied' : id}
    </button>
  );
}

/**
 * One header for the deal: a pinned bar with Back, the address (the page title; a click opens the search), side,
 * status, and ID, and the actions: Switch deal, Delete, and the unsaved Save / Discard. Under it, the Key Terms
 * once their table is out of view. The page measures the pinned strip (#transaction-detail-header) to place
 * content and section jumps under it.
 */
export function HeaderCard({ isNewTransaction, isSaving, onSave, onDiscard, onDelete, hasUnsavedChanges = false, saveBlocked = false, saveBlockedReason, onHeightChange, deal, onBack, backLabel = 'Transactions', sections, activeSection = 'overview', onSelectSection, children, keyTerms }: HeaderCardProps) {
  // Measured here, on this card's own element, so the height stays right when the card remounts.
  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const sync = () => onHeightChange?.(strip.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [onHeightChange]);

  // The transaction search, in a popover.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const openSearch = () => setSearchOpen(true);
  useEffect(() => {
    if (!searchOpen) return;
    window.setTimeout(() => searchRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 0);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current?.contains(target) || searchButtonRef.current?.contains(target)) return;
      swallowNextClick();
      setSearchOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [searchOpen]);
  // A chosen deal closes the search.
  useEffect(() => {
    setSearchOpen(false);
  }, [deal?.id]);
  // "/" opens the search from anywhere on the page, unless someone is typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const hasDeal = Boolean(deal?.address) && !isNewTransaction;
  const title = hasDeal ? String(deal?.address) : isNewTransaction ? 'New Transaction' : 'Transaction Detail';

  const actions = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {isNewTransaction && (
        <span className="shrink-0 rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-400">New</span>
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
          <span>{isSaving ? 'Saving transaction...' : 'Save Transaction'}</span>
        </button>
      )}
      {children && (
        <button
          ref={searchButtonRef}
          type="button"
          onClick={() => setSearchOpen((open) => !open)}
          aria-expanded={searchOpen}
          aria-haspopup="dialog"
          title="Switch to another transaction ( / )"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
        >
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="sr-only">Switch Deal</span>
          <kbd className="hidden rounded border border-slate-200 px-1 font-mono text-2xs text-slate-400 sm:inline dark:border-slate-600">/</kbd>
        </button>
      )}
      {!isNewTransaction && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isSaving}
          className="px-3 py-1.5 text-xs font-bold rounded-full border border-rose-300 text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:border-rose-500/40 dark:text-rose-400 inline-flex items-center gap-1.5"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* A strip in the page color around the header, so content scrolling under it stays hidden.
          It runs into the page gutters so card shadows and borders do not show beside it. */}
      <div
        ref={stripRef}
        id="transaction-detail-header"
        className="sticky top-[var(--app-nav-offset,4rem)] z-40 !mb-3 -mx-4 bg-slate-100 px-4 pt-3 pb-2 max-sm:pt-0 md:-mx-6 md:px-6 transition-[top] duration-200 ease-out motion-reduce:transition-none dark:bg-slate-900"
      >
        <div
          // On a phone the header runs the full width of the screen, right under the navigation bar, like the
          // section bands below it, instead of a card inside the page gutter.
          className="relative rounded-[22px] border border-slate-200 bg-white py-1.5 pl-3 pr-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:px-4 max-sm:shadow-none"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={`Back to ${backLabel}`}
                  title={`Back to ${backLabel}`}
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  <span className="hidden sm:inline">Back</span>
                </button>
              )}
              {onBack && <span aria-hidden className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />}
              {/* The address, side, and status. Clicking the address opens the search. */}
              {/* Clipped rather than spilling under the buttons when the bar runs out of room. */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                <h1 className="min-w-0 truncate">
                  <button
                    type="button"
                    onClick={children ? openSearch : undefined}
                    title={children ? 'Switch to another transaction' : undefined}
                    className={`max-w-full truncate text-left text-sm font-semibold text-slate-900 dark:text-white ${children ? 'cursor-pointer hover:text-brand-700 dark:hover:text-brand-400' : 'cursor-default'}`}
                  >
                    {title}
                  </button>
                </h1>
                {hasDeal && deal?.side && <span className="shrink-0 text-xs text-slate-500 max-sm:hidden dark:text-slate-400">{deal.side}</span>}
                {/* On a phone the address gets the room; side and status show in the page itself. */}
                {hasDeal && deal?.status && <span className="contents max-sm:hidden"><StatusChip status={deal.status} /></span>}
                {hasDeal && deal?.id && <IdChip id={deal.id} />}
              </div>
              {actions}
            </div>

          {/* Key Terms ride along on one line once their table is out of view; they scroll sideways when there are many.
              Clicking goes back to them in the Overview, where they are edited. */}
          {keyTerms && keyTerms.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectSection?.('overview')}
              title="Go to Key Terms"
              className="mt-1 flex w-full cursor-pointer items-baseline gap-x-5 overflow-x-auto whitespace-nowrap border-t border-slate-100 px-2.5 pt-1.5 pb-0.5 text-left [scrollbar-width:none] dark:border-slate-700/60"
            >
              {keyTerms.map((term) => (
                <span key={term.key} className="inline-flex shrink-0 items-baseline gap-1.5">
                  <span className="text-2xs text-slate-500 dark:text-slate-400">{term.label}</span>
                  <span className={`text-xs font-semibold ${
                    term.empty
                      ? 'font-normal text-slate-400 dark:text-slate-500'
                      : term.currency
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-white'
                  }`}>
                    {term.value}
                  </span>
                </span>
              ))}
            </button>
          )}

          {/* Why Save is locked, in words, while there is something to save. */}
          {hasUnsavedChanges && saveBlocked && saveBlockedReason && (
            <p role="status" className={`flex items-start gap-1.5 text-xs font-medium leading-4 text-rose-600 dark:text-rose-400 mt-1 px-2.5 pb-0.5`}>
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <span><span className="font-bold">Can&rsquo;t save yet.</span> {saveBlockedReason}</span>
            </p>
          )}
          {children && searchOpen && (
            <div
              ref={searchRef}
              role="dialog"
              aria-label="Switch transaction"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false);
                  searchButtonRef.current?.focus();
                }
              }}
              className="absolute inset-x-2 top-[calc(100%+0.5rem)] z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              {children}
            </div>
          )}
        </div>
        {/* The section links sit centered under the header, apart from the actions. */}
        {sections && onSelectSection && (
          <div className={`flex justify-center transition-[margin] duration-200 ease-out motion-reduce:transition-none mt-2`}>
            <SectionLinks sections={sections} active={activeSection} onSelect={onSelectSection} />
          </div>
        )}
      </div>
    </>
  );
}
