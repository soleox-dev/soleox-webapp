'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  capMoney,
  formatAnniversary,
  formatUs,
  type CapDealLine,
  type CapStanding,
  type TeamCapDefinition,
} from '@/lib/team-cap-report';

type ColumnSort = { key: string; direction: 'asc' | 'desc' };

function compareSort(a: string | number | null, b: string | number | null, direction: 'asc' | 'desc'): number {
  const emptyA = a === null || a === '';
  const emptyB = b === null || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  const factor = direction === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * factor;
}

function sortBy<T>(rows: T[], sort: ColumnSort | null, valueOf: (row: T, key: string) => string | number | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => compareSort(valueOf(a, sort.key), valueOf(b, sort.key), sort.direction));
}

function SortHead({ column, label, sort, onSort, align = 'left', title }: {
  column: string;
  label: string;
  sort: ColumnSort | null;
  onSort: (column: string) => void;
  align?: 'left' | 'right';
  title?: string;
}) {
  const active = sort?.key === column;
  return (
    <th title={title} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2.5 align-middle ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex w-full cursor-pointer items-center gap-1 bg-transparent p-0 font-[inherit] text-[length:inherit] text-inherit [appearance:none] focus-visible:underline ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        <span>{label}</span>
        {active ? <span aria-hidden="true" className="shrink-0 text-[0.7rem] leading-none">{sort.direction === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </th>
  );
}

function useColumnSort() {
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const toggle = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };
  return { sort, toggle };
}

function rowStripe(index: number, total = false): string {
  if (total) return 'bg-slate-200 font-semibold dark:bg-slate-700';
  return index % 2 === 1
    ? 'bg-slate-100 dark:bg-slate-800'
    : 'bg-white dark:bg-slate-900';
}

type CapHeat = 'over' | 'met' | 'hot' | 'warm' | 'cool';

/** Share of the goal, matched to the percent shown beside the bar. */
function capHeat(percent: number): CapHeat {
  const shown = Math.round(percent * 1000) / 10;
  if (shown > 100) return 'over';
  if (shown >= 100) return 'met';
  if (shown >= 90) return 'hot';
  if (shown >= 70) return 'warm';
  return 'cool';
}

const capHeatBar: Record<CapHeat, string> = {
  over: 'bg-rose-500',
  met: 'bg-emerald-500',
  hot: 'bg-orange-500',
  warm: 'bg-yellow-400',
  cool: 'bg-sky-500',
};

const capHeatText: Record<CapHeat, string> = {
  over: 'text-rose-600 dark:text-rose-300',
  met: 'text-emerald-700 dark:text-emerald-300',
  hot: 'text-orange-600 dark:text-orange-300',
  warm: 'text-yellow-700 dark:text-yellow-300',
  cool: 'text-sky-700 dark:text-sky-300',
};

function GoalMeter({ total, goal, percent }: { total: number; goal: number | null; percent: number | null }) {
  if (goal == null || percent == null) return <span className="text-slate-400">—</span>;
  const heat = capHeat(percent);
  const width = Math.min(100, Math.max(0, percent * 100));
  return (
    <div className="ml-auto w-[9.5rem]">
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="font-medium text-slate-800 dark:text-slate-100">{capMoney(goal)}</span>
        <span className={`text-[11px] font-semibold ${capHeatText[heat]}`}>{(percent * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" title={`${capMoney(total)} of ${capMoney(goal)}`}>
        <div className={`h-1.5 rounded-full ${capHeatBar[heat]}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function LeftAmount({ left, percent }: { left: number | null; percent: number | null }) {
  if (left == null || percent == null) return <span className="text-slate-400">—</span>;
  return <span className={`font-medium ${capHeatText[capHeat(percent)]}`}>{capMoney(left)}</span>;
}

function standingValue(row: CapStanding, key: string): string | number | null {
  if (key === 'rank') return row.rank;
  if (key === 'agent') return row.agentName;
  if (key === 'reset') return row.resetDate;
  if (key === 'start') return row.start;
  if (key === 'end') return row.end;
  if (key === 'closed') return row.closed;
  if (key === 'pending') return row.pending;
  if (key === 'total') return row.total;
  if (key === 'goal') return row.goal;
  if (key === 'left') return row.left;
  return null;
}

function lineValue(row: CapDealLine, key: string): string | number | null {
  if (key === 'status') return row.status;
  if (key === 'agent') return row.primaryAgent;
  if (key === 'side') return row.side;
  if (key === 'address') return row.address;
  if (key === 'closing') return row.closingDate;
  if (key === 'price') return row.salesPrice;
  if (key === 'source') return row.leadSource;
  if (key === 'amount') return row.amount;
  if (key === 'cumulative' || key === 'toward') return row.cumulative;
  return null;
}

function CapSection({ cap, rows, openAgentId, onOpen }: {
  cap: TeamCapDefinition;
  rows: CapStanding[];
  openAgentId: string | null;
  onOpen: (agentId: string) => void;
}) {
  const standingsSort = useColumnSort();
  const detailSort = useColumnSort();
  const ordered = sortBy(rows, standingsSort.sort, standingValue);
  const open = rows.find((row) => row.agentId === openAgentId) || null;
  const rankedLines = (open?.lines || []).map((line, index) => ({ ...line, rank: index + 1 }));
  const detail = sortBy(rankedLines, detailSort.sort, (row, key) => key === 'rank' ? row.rank : lineValue(row, key));
  const closed = rows.reduce((sum, row) => sum + row.closed, 0);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  const total = closed + pending;
  const goal = rows.reduce((sum, row) => sum + (row.goal || 0), 0);
  const hasGoal = rows.some((row) => row.goal != null);
  const left = hasGoal ? goal - total : null;
  const standingsWrapRef = useRef<HTMLDivElement>(null);
  const standingsBodyRef = useRef<HTMLTableElement>(null);
  const standingsFootRef = useRef<HTMLTableElement>(null);
  const standingsFootScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrap = standingsWrapRef.current;
    const body = standingsBodyRef.current;
    const foot = standingsFootRef.current;
    if (!wrap || !body || !foot) return;
    const sync = () => {
      const widths = [...body.querySelectorAll('thead th')].map((cell) => cell.getBoundingClientRect().width);
      foot.style.width = `${body.scrollWidth}px`;
      [...foot.querySelectorAll('td')].forEach((cell, index) => {
        const width = `${widths[index] || 0}px`;
        cell.style.width = width;
        cell.style.minWidth = width;
        cell.style.maxWidth = width;
      });
      wrap.style.maxHeight = '';
      wrap.style.height = '';
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrap);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync);
    };
  }, [open, ordered, closed, pending, total, goal, left]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {open ? (
        <div className="report-table report-table-fit min-h-0 flex-1 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[960px] text-xs">
            <thead className="report-head-dark text-xs font-medium normal-case text-white">
              <tr>
                <SortHead column="rank" label="#" sort={detailSort.sort} onSort={detailSort.toggle} align="right" />
                <SortHead column="status" label="Status" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="agent" label="Primary agent" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="side" label="Side" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="address" label="Property" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="closing" label="Closing date" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="price" label="Sales price" sort={detailSort.sort} onSort={detailSort.toggle} align="right" />
                <SortHead column="source" label="Lead source" sort={detailSort.sort} onSort={detailSort.toggle} />
                <SortHead column="amount" label="Contribution" sort={detailSort.sort} onSort={detailSort.toggle} align="right" title={cap.kind === 'agent' ? 'Post-split dollars paid to this cap’s entity on the transaction' : 'Team cap dollars recorded for this agent on the transaction'} />
                <SortHead column="cumulative" label="Cumulative" sort={detailSort.sort} onSort={detailSort.toggle} align="right" />
                <SortHead column="toward" label="Toward goal" sort={detailSort.sort} onSort={detailSort.toggle} align="right" title="Cumulative contribution against this agent's goal" />
              </tr>
            </thead>
            <tbody>
              {detail.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">No contributions in this cap year.</td>
                </tr>
              ) : detail.map((line, index) => (
                <tr key={line.transactionId} className={rowStripe(index)}>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{line.rank}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${line.pending ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>{line.status || '—'}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{line.primaryAgent}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{line.side || '—'}</td>
                  <td className="px-3 py-2 min-w-[14rem]">{line.address || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatUs(line.closingDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{capMoney(line.salesPrice)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{line.leadSource || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{capMoney(line.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{capMoney(line.cumulative)}</td>
                  <td className="px-3 py-2"><GoalMeter total={line.cumulative} goal={open.goal} percent={open.goal ? line.cumulative / open.goal : null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={standingsWrapRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div
            className="report-table report-table-fit min-h-0 flex-1 rounded-none border-0"
            onScroll={(event) => {
              if (standingsFootScrollRef.current) standingsFootScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
          >
            <table ref={standingsBodyRef} className="w-full min-w-[880px] text-xs">
              <thead className="report-head-dark text-xs font-medium normal-case text-white">
                <tr>
                  <SortHead column="rank" label="#" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" />
                  <SortHead column="agent" label="Agent" sort={standingsSort.sort} onSort={standingsSort.toggle} />
                  <SortHead column="reset" label="Reset" sort={standingsSort.sort} onSort={standingsSort.toggle} title="The month and day this agent's cap year starts" />
                  <SortHead column="start" label="Cap start" sort={standingsSort.sort} onSort={standingsSort.toggle} />
                  <SortHead column="end" label="Cap end" sort={standingsSort.sort} onSort={standingsSort.toggle} />
                  <SortHead column="closed" label="Closed" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" title="Closed contribution in this cap year" />
                  <SortHead column="pending" label="Pending" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" title="Pending contribution in this cap year" />
                  <SortHead column="total" label="Contribution" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" title="Closed plus pending" />
                  <SortHead column="goal" label="Goal" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" />
                  <SortHead column="left" label="Left to cap" sort={standingsSort.sort} onSort={standingsSort.toggle} align="right" title="Goal minus closed and pending. Negative means the agent is past the goal." />
                </tr>
              </thead>
              <tbody>
                {ordered.map((row, index) => (
                  <tr
                    key={row.agentId}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer ${rowStripe(index)} hover:bg-emerald-50 dark:hover:bg-emerald-950/60`}
                    onClick={() => onOpen(row.agentId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpen(row.agentId);
                      }
                    }}
                  >
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{row.rank}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{row.agentName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatAnniversary(row.resetDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatUs(row.start)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatUs(row.end)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{capMoney(row.closed)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{capMoney(row.pending)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">{capMoney(row.total)}</td>
                    <td className="px-3 py-2.5"><GoalMeter total={row.total} goal={row.goal} percent={row.percent} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"><LeftAmount left={row.left} percent={row.percent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ordered.length > 0 ? (
            <div ref={standingsFootScrollRef} className="shrink-0 overflow-x-hidden border-t border-slate-200 bg-slate-200 font-bold dark:border-slate-700 dark:bg-slate-700">
              <table ref={standingsFootRef} className="text-xs font-bold">
                <tbody>
                  <tr>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{capMoney(closed)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{capMoney(pending)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{capMoney(total)}</td>
                    <td className="px-3 py-2.5"><GoalMeter total={total} goal={hasGoal ? goal : null} percent={hasGoal && goal > 0 ? total / goal : null} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"><LeftAmount left={left} percent={hasGoal && goal > 0 ? total / goal : null} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function TeamCapsReport({ sections, open, onOpen, empty }: {
  sections: Array<{ cap: TeamCapDefinition; rows: CapStanding[] }>;
  open: { capId: string; agentId: string } | null;
  onOpen: (value: { capId: string; agentId: string } | null) => void;
  empty: string;
}) {
  if (sections.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sections.map((section) => (
        <CapSection
          key={section.cap.id}
          cap={section.cap}
          rows={section.rows}
          openAgentId={open?.capId === section.cap.id ? open.agentId : null}
          onOpen={(agentId) => onOpen({ capId: section.cap.id, agentId })}
        />
      ))}
    </div>
  );
}
