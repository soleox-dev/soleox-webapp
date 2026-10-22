'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { swallowNextClick } from '@/lib/swallow-click';

/** The value a column filter uses for an empty cell. */
export const BLANK_FILTER_VALUE = '__blank__';
/** Stored when every value is unticked: no row passes. */
export const NONE_FILTER_VALUE = '__none__';
const BLANK_LABEL = '(Blank)';
const MAX_SHOWN = 300;

export interface ColumnFilterOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The options for one column: each distinct shown value once, with how many rows have it.
 * Blank cells become one "(Blank)" option at the top. Numbers and dates sort by value.
 */
export function columnFilterOptions(texts: string[], kind: 'text' | 'number' | 'date' = 'text'): ColumnFilterOption[] {
  const counts = new Map<string, number>();
  texts.forEach((text) => counts.set(text, (counts.get(text) || 0) + 1));
  const blank = counts.get(BLANK_FILTER_VALUE) || 0;
  counts.delete(BLANK_FILTER_VALUE);
  const numeric = (text: string) => Number(text.replace(/[^0-9.-]/g, ''));
  const options = [...counts.entries()].map(([value, count]) => ({ value, label: value, count }));
  options.sort((a, b) => {
    if (kind === 'number') {
      const diff = numeric(a.value) - numeric(b.value);
      if (Number.isFinite(diff) && diff !== 0) return diff;
    }
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });
  return blank > 0 ? [{ value: BLANK_FILTER_VALUE, label: BLANK_LABEL, count: blank }, ...options] : options;
}

/** True when the row's shown value is one of the picked values. Nothing picked (all ticked) lets every row through. */
export function matchesColumnFilter(text: string, picked: string[] | undefined): boolean {
  return !picked || picked.length === 0 || picked.includes(text);
}

function pickedLabel(value: string): string {
  return value === BLANK_FILTER_VALUE ? BLANK_LABEL : value;
}

type SortDirection = 'asc' | 'desc' | null;

/**
 * A column header: the label opens a filter menu like the report filters (search, every value ticked to
 * start, Select all and Reset), and the sort control sits at the far right.
 * `picked` is empty while every value is ticked; otherwise it lists the ticked values.
 */
export function ColumnHeader({
  label,
  align = 'left',
  picked,
  loadOptions,
  onChange,
  sortDirection,
  onSort,
}: {
  label: string;
  align?: 'left' | 'center' | 'right';
  picked: string[];
  /** Called when the menu opens, so the options reflect the rows other filters leave. */
  loadOptions: () => ColumnFilterOption[];
  onChange: (next: string[]) => void;
  sortDirection: SortDirection;
  onSort: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filtered = picked.length > 0;
  const none = picked.length === 1 && picked[0] === NONE_FILTER_VALUE;
  const summary = !filtered ? '' : none ? 'None' : picked.length <= 3 ? picked.map(pickedLabel).join(', ') : `${picked.length} selected`;

  return (
    <div className={`group/col flex w-full items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className={`relative inline-flex min-w-0 ${align === 'center' ? 'mx-auto' : ''}`}>
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={filtered}
          title={filtered ? `Filtering ${label}: ${summary}` : `Filter ${label}`}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-0.5 font-semibold transition hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${
            filtered ? 'text-brand-700 dark:text-brand-300' : ''
          }`}
        >
          {/* A long header (over about 16 characters) wraps onto balanced lines about 9rem wide, as many as it needs,
              so a column of narrow values is not stretched by its header. Shorter ones stay on one line. Either way
              the whole name shows. */}
          <span className={label.length > 16
            ? `min-w-[4.75rem] max-w-[9rem] whitespace-normal break-words text-balance leading-tight ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`
            : 'whitespace-nowrap'}
          >
            {label}
          </span>
          {filtered ? (
            <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold leading-none text-white ${none ? 'bg-amber-500' : 'bg-brand-600'}`}>
              {none ? 0 : picked.length}
            </span>
          ) : null}
        </button>
        {filtered ? (
          <button
            type="button"
            title={`Clear ${label} filter`}
            aria-label={`Clear ${label} filter`}
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            className="absolute -right-2 -top-1.5 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-white text-slate-700 opacity-0 shadow-sm ring-1 ring-slate-300 pointer-events-none hover:bg-slate-100 group-hover/col:pointer-events-auto group-hover/col:opacity-100 dark:bg-slate-950 dark:text-white dark:ring-slate-500"
          >
            <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
          </button>
        ) : null}
      </span>
      <SortButton label={label} direction={sortDirection} onSort={onSort} pushAway={align !== 'right'} />
      {open ? (
        <ColumnFilterMenu
          anchor={buttonRef}
          label={label}
          picked={picked}
          loadOptions={loadOptions}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** The sort control: arrows that show the direction, faint until the header is hovered when unsorted. */
export function SortButton({ label, direction, onSort, pushAway = true }: {
  label: string;
  direction: SortDirection;
  onSort: () => void;
  /** Pushes the control to the far side of the header. */
  pushAway?: boolean;
}) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSort();
      }}
      aria-label={`Sort ${label}${direction === 'asc' ? ', sorted ascending' : direction === 'desc' ? ', sorted descending' : ''}`}
      title={direction === 'asc' ? 'Sorted ascending' : direction === 'desc' ? 'Sorted descending' : `Sort by ${label}`}
      className={`${pushAway ? 'ml-auto' : 'mr-auto'} inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md transition ${
        direction
          ? 'bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-500/20 dark:text-brand-300 dark:hover:bg-brand-500/30'
          : 'text-slate-400 opacity-60 hover:bg-slate-200 hover:text-slate-700 group-hover/col:opacity-100 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

function ColumnFilterMenu({ anchor, label, picked, loadOptions, onChange, onClose }: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  label: string;
  picked: string[];
  loadOptions: () => ColumnFilterOption[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  // Read once per opening: the list stays put while values are ticked.
  const [options] = useState(loadOptions);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const allTicked = picked.length === 0;
  const isChecked = (value: string) => allTicked || pickedSet.has(value);
  const needle = query.trim().toLowerCase();
  const matches = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const shown = matches.slice(0, MAX_SHOWN);
  // Picked values the rows no longer have still show, so they can be unticked.
  const stale = picked.filter((value) => value !== NONE_FILTER_VALUE && !options.some((option) => option.value === value));

  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.current;
      const menu = menuRef.current;
      if (!button || !menu) return;
      const rect = button.getBoundingClientRect();
      const width = menu.offsetWidth;
      const gutter = 8;
      const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter);
      // Below the header when it fits; on a short screen it opens upward if there is more room there.
      const below = window.innerHeight - rect.bottom - 4 - gutter;
      const above = rect.top - 4 - gutter;
      const wanted = Math.min(448, menu.scrollHeight);
      if (below >= wanted || below >= above) {
        setPosition({ top: rect.bottom + 4, left, maxHeight: Math.max(160, Math.min(448, below)) });
      } else {
        const maxHeight = Math.max(160, Math.min(448, above));
        setPosition({ top: rect.top - 4 - Math.min(wanted, maxHeight), left, maxHeight });
      }
    };
    place();
    // On a touch screen focusing the search raises the keyboard and scrolls the page, which would close the
    // menu at once; there the search is focused only when tapped.
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) searchRef.current?.focus();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchor.current?.contains(target)) return;
      swallowNextClick(event);
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // The menu is placed against the header, so it closes when the page or table scrolls under it. A scroll in
    // the first moment after opening (the browser settling the tap) does not count.
    const openedAt = performance.now();
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (performance.now() - openedAt < 400) return;
      // Typing in the menu's search raises the phone keyboard, which scrolls the page; that is not leaving.
      if (menuRef.current?.contains(document.activeElement)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose]);

  const allValues = options.map((option) => option.value);
  // Ticking every value again goes back to no filter; unticking the last one keeps no rows.
  const commit = (next: string[]) => {
    if (next.length === 0) onChange([NONE_FILTER_VALUE]);
    else if (allValues.every((value) => next.includes(value)) && next.every((value) => allValues.includes(value))) onChange([]);
    else onChange(next);
  };
  const toggle = (value: string) => {
    const current = allTicked ? allValues : picked.filter((item) => item !== NONE_FILTER_VALUE);
    commit(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={`Filter ${label}`}
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, maxHeight: position?.maxHeight ?? 448 }}
      className="fixed z-[90] flex w-72 flex-col rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="space-y-1 px-1 pb-1 pt-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={allTicked}
            className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800"
          >
            Reset
          </button>
        </div>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 focus-within:border-brand-500 dark:border-slate-700 dark:bg-slate-950">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label={`Search ${label}`}
            className="h-full w-full min-w-0 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 pt-1 dark:border-slate-800">
        {stale.map((value) => (
          <OptionRow key={`stale-${value}`} label={pickedLabel(value)} count={0} checked onToggle={() => toggle(value)} onOnly={() => onChange([value])} />
        ))}
        {shown.length === 0 && stale.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-400">No matches</p>
        ) : shown.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            count={option.count}
            checked={isChecked(option.value)}
            onToggle={() => toggle(option.value)}
            onOnly={() => onChange([option.value])}
          />
        ))}
        {matches.length > shown.length ? (
          <p className="px-2 py-2 text-xs text-slate-400">
            Showing {shown.length.toLocaleString()} of {matches.length.toLocaleString()}. Search to narrow the list.
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function OptionRow({ label, count, checked, onToggle, onOnly }: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  onOnly: () => void;
}) {
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onToggle();
        }
      }}
      className="group/option flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
    >
      <input type="checkbox" readOnly tabIndex={-1} checked={checked} className="pointer-events-none" />
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
      <span className="relative shrink-0">
        <span className="block min-w-[3rem] text-right text-xs tabular-nums text-slate-400 group-hover/option:opacity-0">{count.toLocaleString()}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOnly();
          }}
          className="absolute inset-0 hidden cursor-pointer items-center justify-end group-hover/option:flex"
        >
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold leading-none tracking-wide text-brand-800 ring-1 ring-brand-200 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-100 dark:ring-brand-700 dark:hover:bg-brand-800">ONLY</span>
        </button>
      </span>
    </div>
  );
}
