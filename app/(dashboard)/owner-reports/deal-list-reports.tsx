'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  fullMoney,
  inRange,
  periodColumns,
  periodKey,
  type DateRange,
  type ReportDeal,
} from '@/lib/owner-reports';

/**
 * Owner Reports that list deals row by row: Transaction List, Listings by List Date and Price Change Analysis.
 * Each takes the deals that already passed the report's filters and date rule (`dealInReport` in reports-client).
 */

type Align = 'left' | 'right';

type Column = {
  key: string;
  label: string;
  align?: Align;
  /** Value the column sorts on. */
  sortValue: (deal: ReportDeal) => string | number | null;
  cell: (deal: ReportDeal) => React.ReactNode;
  /** Grand Total cell; omitted columns stay empty. */
  total?: React.ReactNode;
  /** Minimum width for text columns, so addresses and names wrap less. */
  width?: string;
  /** Classes for the body cell, from the deal (Price Change % shading). */
  cellClass?: (deal: ReportDeal) => string;
};

type Sort = { key: string; direction: 'asc' | 'desc' };

const tableWrap = 'report-table rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
/**
 * Transaction List and Listings fill the rest of the screen on wide, tall screens: the page stops scrolling and the
 * table scrolls on its own, header pinned on top and Grand Total at the bottom (screenFitReport in reports-client).
 */
const fitTableWrap = 'report-table report-table-fit min-h-0 rounded-xl border border-slate-200 bg-white screenfit:flex-1 dark:border-slate-800 dark:bg-slate-900';
const fitReport = 'flex flex-col gap-4 screenfit:min-h-0 screenfit:flex-1';

function dayLabel(date: Date | null): string {
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function cents(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rate(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function signedMoney(value: number): string {
  return `${value < 0 ? '−' : ''}${fullMoney(Math.abs(value))}`;
}

const DAY = 86_400_000;

/** Days on market: list date to pending (acceptance) date. Null until both are recorded. */
function daysOnMarket(deal: ReportDeal): number | null {
  if (!deal.listDate || !deal.acceptanceDate) return null;
  const days = Math.round((deal.acceptanceDate.getTime() - deal.listDate.getTime()) / DAY);
  return days >= 0 ? days : null;
}

function hasPrices(deal: ReportDeal): boolean {
  return deal.listPrice > 0 && deal.salesPrice > 0;
}

function soldListing(deal: ReportDeal): boolean {
  const status = deal.status.trim().toLowerCase();
  return status === 'closed' || status === 'pending';
}

/** Price change as a share of list price; null without both prices. */
function priceChange(deal: ReportDeal): number | null {
  return hasPrices(deal) ? (deal.salesPrice - deal.listPrice) / deal.listPrice : null;
}

function sum(deals: ReportDeal[], read: (deal: ReportDeal) => number): number {
  return deals.reduce((total, deal) => total + read(deal), 0);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function StatusChip({ status }: { status: string }) {
  const key = status.trim().toLowerCase();
  const tone = key === 'closed'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900'
    : key === 'pending'
      ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900'
      : key === 'cancelled'
        ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ring-inset ${tone}`}>{status || 'No Status'}</span>;
}

function AddressLink({ deal }: { deal: ReportDeal }) {
  if (!deal.address) return <span className="text-slate-400">—</span>;
  return (
    <a href={`/commission-tracker/transactions/${encodeURIComponent(deal.id)}`} className="font-medium hover:text-brand-700 hover:underline dark:hover:text-brand-400">
      {deal.address}
    </a>
  );
}

/** Sortable deal table with row numbers and a Grand Total row. */
function DealListTable({ deals, columns, initialSort, totalLabelColumn, empty, fit = false, fitClass = '' }: {
  deals: ReportDeal[];
  columns: Column[];
  initialSort: Sort;
  /** Column whose Grand Total cell holds the "Grand Total" label (the cell before the first total). */
  totalLabelColumn: string;
  empty: string;
  /** Fill the screen and scroll inside (see fitTableWrap). */
  fit?: boolean;
  /** Extra sizing for a fitted table that shares its row with other panels. */
  fitClass?: string;
}) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const ordered = useMemo(() => {
    const column = columns.find((item) => item.key === sort.key) ?? columns[0];
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...deals].sort((a, b) => {
      const left = column.sortValue(a);
      const right = column.sortValue(b);
      // Blanks sort last either way.
      if (left == null || left === '') return right == null || right === '' ? 0 : 1;
      if (right == null || right === '') return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [columns, deals, sort]);
  const toggle = (key: string) => setSort((current) => (
    current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
  ));
  // In a fitted table the Grand Total row stays pinned to the bottom while the rows scroll.
  const footCell = `border-t-2 border-slate-200 bg-slate-100 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800 ${fit ? 'sticky bottom-0 z-[3]' : ''}`;
  const alignClass = (align?: Align) => (align === 'right' ? 'text-right' : 'text-left');
  return (
    <div className={fit ? `${fitTableWrap} ${fitClass}` : tableWrap}>
      <table className="pin-col-2 w-full text-xs">
        <thead className="report-head">
          <tr>
            <th className="w-10 px-3 py-2.5 text-left align-middle font-semibold">#</th>
            {columns.map((column) => {
              const active = sort.key === column.key;
              return (
                <th key={column.key} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2.5 align-middle font-semibold ${alignClass(column.align)} ${column.width ?? ''}`}>
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={`inline-flex cursor-pointer items-center gap-0.5 ${column.align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}
                  >
                    <span>{column.label}</span>
                    {active ? (sort.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-6 text-sm text-slate-500">{empty}</td>
            </tr>
          ) : ordered.map((deal, index) => (
            <tr key={deal.id || index} className="border-t border-slate-100 even:bg-slate-50 dark:border-slate-800 dark:even:bg-slate-800/40">
              <td className="px-3 py-2 align-top tabular-nums text-slate-500">{index + 1}.</td>
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-2 align-top ${alignClass(column.align)} ${column.align === 'right' ? 'whitespace-nowrap tabular-nums' : ''} ${column.cellClass?.(deal) ?? ''}`}>
                  {column.cell(deal)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {ordered.length > 0 ? (
          <tfoot>
            <tr className="font-semibold">
              <td className={footCell} />
              {columns.map((column) => (
                <td key={column.key} className={`${footCell} whitespace-nowrap tabular-nums ${alignClass(column.align)}`}>
                  {column.key === totalLabelColumn ? 'Grand Total' : column.total ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** One scorecard figure: label, value, and an optional line under it. */
function Score({ label, value, tone = '', sub, note }: { label: string; value: string; tone?: string; sub?: React.ReactNode; note?: boolean }) {
  return (
    <div className="min-w-0 px-2 py-1 text-center">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {note ? <span className="text-rose-500"> *</span> : null}
      </p>
      <p className={`mt-0.5 truncate text-xl font-bold tabular-nums md:text-2xl ${tone}`}>{value}</p>
      {sub ? <div className="mt-0.5 text-2xs tabular-nums">{sub}</div> : null}
    </div>
  );
}

const scoreBand = 'grid gap-y-3 rounded-xl border border-slate-200 bg-white px-2 py-3 dark:border-slate-800 dark:bg-slate-900';

const STATUS_TONES = {
  closed: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600 dark:text-amber-400',
  cancelled: 'text-rose-600 dark:text-rose-400',
} as const;

function StatusSplit({ deals, read, format }: { deals: ReportDeal[]; read: (deal: ReportDeal) => number; format: (value: number) => string }) {
  return (
    <div className="mt-1 grid grid-cols-3 gap-1">
      {(['closed', 'pending', 'cancelled'] as const).map((status) => (
        <div key={status} className="min-w-0">
          <p className={`text-2xs font-medium ${STATUS_TONES[status]}`}>{status === 'closed' ? 'Closed' : status === 'pending' ? 'Pending' : 'Cancelled'}</p>
          <p className={`truncate text-sm font-semibold tabular-nums ${STATUS_TONES[status]}`}>
            {format(sum(deals.filter((deal) => deal.status.trim().toLowerCase() === status), read))}
          </p>
        </div>
      ))}
    </div>
  );
}

function compactDollars(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(Math.round(value));
}

export function TransactionListReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const volume = sum(deals, (deal) => deal.salesPrice);
  const gci = sum(deals, (deal) => deal.gciAmount);
  const columns: Column[] = [
    { key: 'status', label: 'Status', sortValue: (deal) => deal.status, cell: (deal) => <StatusChip status={deal.status} /> },
    { key: 'agent', label: 'Primary Agent', width: 'min-w-32', sortValue: (deal) => names.get(deal.agentId) || '', cell: (deal) => names.get(deal.agentId) || '—' },
    { key: 'side', label: 'Side', sortValue: (deal) => deal.side, cell: (deal) => deal.side || '—' },
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'client', label: 'Client Name', width: 'min-w-36', sortValue: (deal) => deal.clientName, cell: (deal) => deal.clientName || '—' },
    { key: 'source', label: 'Lead Source', sortValue: (deal) => deal.leadSource, cell: (deal) => deal.leadSource || '—' },
    { key: 'pending', label: 'Pending Date', align: 'right', sortValue: (deal) => deal.acceptanceDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.acceptanceDate) },
    { key: 'closing', label: 'Closing Date', align: 'right', sortValue: (deal) => deal.closingDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.closingDate) },
    { key: 'price', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice, cell: (deal) => cents(deal.salesPrice), total: cents(volume) },
    { key: 'rate', label: 'GCI %', align: 'right', sortValue: (deal) => deal.gciPerc, cell: (deal) => rate(deal.gciPerc), total: rate(volume ? gci / volume : null) },
    { key: 'gci', label: 'GCI', align: 'right', sortValue: (deal) => deal.gciAmount, cell: (deal) => cents(deal.gciAmount), total: cents(gci) },
  ];
  return (
    <div className={fitReport}>
      <div className={`${scoreBand} shrink-0 grid-cols-1 md:grid-cols-[1fr_2fr_2fr]`}>
        <Score label="Transactions" value={deals.length.toLocaleString()} />
        <div className="min-w-0 px-2 text-center">
          <Score label="Sales Volume" value={fullMoney(volume)} />
          <StatusSplit deals={deals} read={(deal) => deal.salesPrice} format={compactDollars} />
        </div>
        <div className="min-w-0 px-2 text-center">
          <Score label="GCI" value={fullMoney(gci)} />
          <StatusSplit deals={deals} read={(deal) => deal.gciAmount} format={fullMoney} />
        </div>
      </div>
      <DealListTable
        deals={deals}
        columns={columns}
        initialSort={{ key: 'closing', direction: 'desc' }}
        totalLabelColumn="closing"
        empty="No transactions match these filters."
        fit
      />
      <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">Every transaction closing in the date range, and pending ones that went pending in it.</p>
    </div>
  );
}

export function ListingsReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const listVolume = sum(deals, (deal) => deal.listPrice);
  const sold = deals.filter(soldListing);
  const salesVolume = sum(sold, (deal) => deal.salesPrice);
  const priced = sold.filter(hasPrices);
  const overUnder = sum(priced, (deal) => deal.salesPrice - deal.listPrice);
  const gci = sum(deals, (deal) => deal.gciAmount);
  const tableSales = sum(deals, (deal) => deal.salesPrice);
  const doms = deals.map(daysOnMarket).filter((value): value is number => value != null);
  const avgDom = average(doms);
  const listed = deals.filter((deal) => deal.listPrice > 0);
  const columns: Column[] = [
    { key: 'agent', label: 'Primary Agent', width: 'min-w-32', sortValue: (deal) => names.get(deal.agentId) || '', cell: (deal) => names.get(deal.agentId) || '—' },
    { key: 'status', label: 'Status', sortValue: (deal) => deal.status, cell: (deal) => <StatusChip status={deal.status} /> },
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'side', label: 'Side', sortValue: (deal) => deal.side, cell: (deal) => deal.side || '—' },
    { key: 'client', label: 'Client Name', width: 'min-w-36', sortValue: (deal) => deal.clientName, cell: (deal) => deal.clientName || '—' },
    { key: 'source', label: 'Lead Source', sortValue: (deal) => deal.leadSource, cell: (deal) => deal.leadSource || '—' },
    { key: 'list', label: 'List Date', align: 'right', sortValue: (deal) => deal.listDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.listDate) },
    { key: 'pending', label: 'Pending Date', align: 'right', sortValue: (deal) => deal.acceptanceDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.acceptanceDate) },
    { key: 'closing', label: 'Closing Date', align: 'right', sortValue: (deal) => deal.closingDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.closingDate) },
    { key: 'listPrice', label: 'List Price', align: 'right', sortValue: (deal) => deal.listPrice || null, cell: (deal) => (deal.listPrice ? fullMoney(deal.listPrice) : '—'), total: fullMoney(listVolume) },
    { key: 'salesPrice', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice || null, cell: (deal) => (deal.salesPrice ? fullMoney(deal.salesPrice) : '—'), total: fullMoney(tableSales) },
    {
      key: 'overUnder',
      label: 'Over/Under Asking',
      align: 'right',
      sortValue: (deal) => (soldListing(deal) && hasPrices(deal) ? deal.salesPrice - deal.listPrice : null),
      cell: (deal) => (soldListing(deal) && hasPrices(deal) ? signedMoney(deal.salesPrice - deal.listPrice) : '—'),
      cellClass: (deal) => (soldListing(deal) && hasPrices(deal) && deal.salesPrice < deal.listPrice ? 'text-rose-600 dark:text-rose-400' : ''),
      total: signedMoney(overUnder),
    },
    { key: 'rate', label: 'GCI %', align: 'right', sortValue: (deal) => deal.gciPerc, cell: (deal) => rate(deal.gciPerc), total: rate(tableSales ? gci / tableSales : null) },
    { key: 'gci', label: 'GCI', align: 'right', sortValue: (deal) => deal.gciAmount, cell: (deal) => cents(deal.gciAmount), total: cents(gci) },
    { key: 'dom', label: 'DOM', align: 'right', sortValue: daysOnMarket, cell: (deal) => daysOnMarket(deal)?.toLocaleString() ?? '—', total: avgDom == null ? '—' : Math.round(avgDom).toLocaleString() },
  ];
  return (
    <div className={fitReport}>
      <div className={`${scoreBand} shrink-0 grid-cols-2 md:grid-cols-4 xl:grid-cols-8`}>
        <Score label="Listings" value={deals.length.toLocaleString()} tone="text-pink-600 dark:text-pink-400" />
        <Score label="List Volume" value={fullMoney(listVolume)} tone="text-teal-600 dark:text-teal-400" />
        <Score label="Avg. List Price" value={listed.length ? fullMoney(listVolume / listed.length) : '—'} tone="text-purple-600 dark:text-purple-400" />
        <Score label="Sales Volume" value={fullMoney(salesVolume)} tone="text-teal-600 dark:text-teal-400" />
        <Score label="Avg. Sales Price" value={sold.length ? fullMoney(salesVolume / sold.length) : '—'} tone="text-purple-600 dark:text-purple-400" />
        <Score label="Avg. Sold vs. Asking" value={priced.length ? signedMoney(overUnder / priced.length) : '—'} tone="text-emerald-600 dark:text-emerald-400" note />
        <Score label="Total Sold vs. Asking" value={signedMoney(overUnder)} tone="text-emerald-600 dark:text-emerald-400" note />
        <Score label="Average DOM" value={avgDom == null ? '—' : Math.round(avgDom).toLocaleString()} tone="text-blue-600 dark:text-blue-400" />
      </div>
      <DealListTable
        deals={deals}
        columns={columns}
        initialSort={{ key: 'list', direction: 'asc' }}
        totalLabelColumn="closing"
        empty="No listings were taken in this date range."
        fit
      />
      <div className="shrink-0 space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p>Every listing-side transaction with a list date in the range, whatever its status. Sales figures count closed and pending listings.</p>
        <p><span className="text-rose-500">*</span> Leaves out transactions where the list price has not been recorded.</p>
        <p>DOM (days on market) runs from the list date to the pending date.</p>
      </div>
    </div>
  );
}

/** Price Change buckets, most over asking first. */
const CHANGE_BUCKETS = [
  { key: 'over20', label: '20%+ Over', dot: 'bg-emerald-500', test: (change: number) => change >= 0.2 },
  { key: 'over10', label: '10–20% Over', dot: 'bg-emerald-300', test: (change: number) => change >= 0.1 && change < 0.2 },
  { key: 'over0', label: '0–10% Over', dot: 'bg-amber-200', test: (change: number) => change >= 0 && change < 0.1 },
  { key: 'under', label: 'Under', dot: 'bg-rose-300', test: (change: number) => change < 0 },
] as const;

/** Green shading for the Price Change % cell, stronger the further over asking; rose under asking. */
function changeShade(change: number | null): string {
  if (change == null) return '';
  if (change >= 0.2) return 'bg-emerald-400/70 dark:bg-emerald-600/60';
  if (change >= 0.1) return 'bg-emerald-300/60 dark:bg-emerald-700/50';
  if (change >= 0) return 'bg-emerald-100 dark:bg-emerald-900/40';
  return 'bg-rose-100 dark:bg-rose-950/50';
}

function Delta({ current, prior, format, suffix = '' }: { current: number | null; prior: number | null; format: (value: number) => string; suffix?: string }) {
  if (current == null || prior == null) return <span className="text-slate-400">—</span>;
  const change = current - prior;
  const tone = change > 0 ? 'text-emerald-600 dark:text-emerald-400' : change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500';
  return <span className={`font-semibold ${tone}`}>{change > 0 ? '▲' : change < 0 ? '▼' : ''} {format(Math.abs(change))}{suffix}</span>;
}

function relative(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function RelativeDelta({ current, prior }: { current: number | null; prior: number | null }) {
  const change = relative(current, prior);
  return <Delta current={change} prior={change == null ? null : 0} format={(value) => rate(value, 1)} />;
}

/** Average Price Change % by period: this range (solid) and the same dates a year earlier (light), with the average dashed. */
function ChangeChart({ deals, priorDeals, range }: { deals: ReportDeal[]; priorDeals: ReportDeal[]; range: DateRange }) {
  const columns = periodColumns(range);
  const series = (rows: ReportDeal[], shiftYears: number) => columns.map((column) => average(rows.flatMap((deal) => {
    if (!deal.closingDate) return [];
    const date = new Date(deal.closingDate);
    date.setFullYear(date.getFullYear() + shiftYears);
    const change = priceChange(deal);
    return periodKey(date, range) === column.key && change != null ? [change] : [];
  })));
  const current = series(deals, 0);
  const prior = series(priorDeals, 1);
  const overall = average(deals.map(priceChange).filter((value): value is number => value != null));
  const values = [...current, ...prior, overall].filter((value): value is number => value != null);
  if (values.length === 0) return <p className="px-4 py-8 text-sm text-slate-500">No listings with both prices in this range.</p>;
  const top = Math.max(0.1, Math.ceil(Math.max(...values) * 10) / 10);
  const bottom = Math.min(0, Math.floor(Math.min(...values) * 10) / 10);
  const width = 480;
  const height = 220;
  const left = 40;
  const right = 12;
  const plotTop = 12;
  const plotBottom = height - 28;
  const x = (index: number) => left + (columns.length <= 1 ? (width - left - right) / 2 : (index / (columns.length - 1)) * (width - left - right));
  const y = (value: number) => plotTop + ((top - value) / (top - bottom)) * (plotBottom - plotTop);
  const ticks: number[] = [];
  for (let tick = bottom; tick <= top + 1e-9; tick += 0.1) ticks.push(Math.round(tick * 10) / 10);
  const path = (points: Array<number | null>) => {
    let d = '';
    let open = false;
    points.forEach((value, index) => {
      if (value == null) { open = false; return; }
      d += `${open ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      open = true;
    });
    return d;
  };
  const labelEvery = Math.max(1, Math.ceil(columns.length / 6));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Average price change percent by period">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'stroke-slate-300 dark:stroke-slate-600' : 'stroke-slate-100 dark:stroke-slate-800'} />
          <text x={left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500 text-2xs">{Math.round(tick * 100)}%</text>
        </g>
      ))}
      {columns.map((column, index) => (index % labelEvery === 0 ? (
        <text key={column.key} x={x(index)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-2xs">{column.label}</text>
      ) : null))}
      {overall != null ? (
        <g>
          <line x1={left} x2={width - right} y1={y(overall)} y2={y(overall)} strokeDasharray="5 4" className="stroke-pink-500" strokeWidth={1.5} />
          <text x={left + 4} y={y(overall) - 5} className="fill-pink-600 text-2xs font-semibold dark:fill-pink-400">Avg. {rate(overall)}</text>
        </g>
      ) : null}
      <path d={path(prior)} fill="none" className="stroke-sky-300 dark:stroke-sky-700" strokeWidth={2} />
      <path d={path(current)} fill="none" className="stroke-brand-600 dark:stroke-brand-400" strokeWidth={2.5} />
      {current.map((value, index) => (value == null ? null : <circle key={index} cx={x(index)} cy={y(value)} r={3} className="fill-brand-600 dark:fill-brand-400" />))}
    </svg>
  );
}

export function PriceChangeReport({ deals, priorDeals, names, range }: {
  deals: ReportDeal[];
  priorDeals: ReportDeal[];
  names: Map<string, string>;
  range: DateRange;
}) {
  const stats = (rows: ReportDeal[]) => {
    const priced = rows.filter(hasPrices);
    const changes = priced.map((deal) => priceChange(deal) as number);
    return {
      count: priced.length,
      list: average(priced.map((deal) => deal.listPrice)),
      sale: average(priced.map((deal) => deal.salesPrice)),
      dollars: average(priced.map((deal) => deal.salesPrice - deal.listPrice)),
      change: average(changes),
      buckets: CHANGE_BUCKETS.map((bucket) => changes.filter(bucket.test).length),
    };
  };
  const now = stats(deals);
  const before = stats(priorDeals);
  const shown = deals.filter(hasPrices);
  const columns: Column[] = [
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'agent', label: 'Primary Agent', width: 'min-w-32', sortValue: (deal) => names.get(deal.agentId) || '', cell: (deal) => names.get(deal.agentId) || '—' },
    { key: 'closing', label: 'Closing Date', align: 'right', sortValue: (deal) => deal.closingDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.closingDate) },
    { key: 'status', label: 'Status', sortValue: (deal) => deal.status, cell: (deal) => <StatusChip status={deal.status} /> },
    { key: 'list', label: 'List Price', align: 'right', sortValue: (deal) => deal.listPrice, cell: (deal) => fullMoney(deal.listPrice), total: now.list == null ? '—' : fullMoney(now.list) },
    { key: 'sale', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice, cell: (deal) => fullMoney(deal.salesPrice), total: now.sale == null ? '—' : fullMoney(now.sale) },
    {
      key: 'dollars',
      label: 'Price Change',
      align: 'right',
      sortValue: (deal) => deal.salesPrice - deal.listPrice,
      cell: (deal) => signedMoney(deal.salesPrice - deal.listPrice),
      cellClass: (deal) => (deal.salesPrice < deal.listPrice ? 'text-rose-600 dark:text-rose-400' : ''),
      total: now.dollars == null ? '—' : signedMoney(now.dollars),
    },
    {
      key: 'change',
      label: 'Price Change %',
      align: 'right',
      sortValue: priceChange,
      cell: (deal) => rate(priceChange(deal)),
      cellClass: (deal) => `font-medium ${changeShade(priceChange(deal))}`,
      total: rate(now.change),
    },
  ];
  return (
    <div className={fitReport}>
      <div className={`${scoreBand} shrink-0 grid-cols-2 md:grid-cols-5`}>
        <Score label="Listings" value={now.count.toLocaleString()} sub={<Delta current={now.count} prior={before.count} format={(value) => value.toLocaleString()} suffix=" from prior year" />} />
        <Score label="Avg. List Price" value={now.list == null ? '—' : fullMoney(now.list)} sub={<RelativeDelta current={now.list} prior={before.list} />} />
        <Score label="Avg. Sales Price" value={now.sale == null ? '—' : fullMoney(now.sale)} sub={<RelativeDelta current={now.sale} prior={before.sale} />} />
        <Score label="Avg. Price Change" value={now.dollars == null ? '—' : signedMoney(now.dollars)} sub={<RelativeDelta current={now.dollars} prior={before.dollars} />} />
        <Score label="Avg. Price Change %" value={rate(now.change)} sub={<Delta current={now.change} prior={before.change} format={(value) => rate(value)} />} />
      </div>
      {/* Wide screens: table and side panels side by side, each scrolling in the space left. Narrower fitted screens
          stack them and scroll this area, with the table capped to it so its header and total stay in view. */}
      <div className="grid items-start gap-4 screenfit:min-h-0 screenfit:flex-1 max-xl:screenfit:grid-rows-[100%_auto] max-xl:screenfit:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_24rem] xl:screenfit:grid-rows-[minmax(0,1fr)] xl:screenfit:items-stretch">
        <DealListTable
          deals={shown}
          columns={columns}
          initialSort={{ key: 'change', direction: 'desc' }}
          totalLabelColumn="status"
          empty="No closed or pending listings with both a list price and a sales price in this date range."
          fit
          fitClass="screenfit:h-full"
        />
        <div className="space-y-4 xl:screenfit:min-h-0 xl:screenfit:overflow-y-auto">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-2 bg-slate-200 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <p className="px-4 py-2.5">Price Change</p>
              <p className="px-4 py-2.5 text-right">Listings</p>
            </div>
            {CHANGE_BUCKETS.map((bucket, index) => (
              <div key={bucket.key} className="grid grid-cols-2 items-center border-t border-slate-100 dark:border-slate-800">
                <p className="flex items-center gap-2.5 px-4 py-3 text-sm">
                  <span aria-hidden className={`h-3 w-3 rounded-full ${bucket.dot}`} />
                  {bucket.label}
                </p>
                <div className="px-4 py-2 text-right">
                  <p className="text-xl font-bold tabular-nums">{now.buckets[index].toLocaleString()}</p>
                  <p className="text-2xs tabular-nums"><Delta current={now.buckets[index]} prior={before.buckets[index]} format={(value) => value.toLocaleString()} /></p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p className="rounded-t-xl bg-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Average Price Change %</p>
            <div className="p-3">
              <ChangeChart deals={shown} priorDeals={priorDeals} range={range} />
              <div className="mt-1 flex items-center justify-center gap-4 text-2xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-brand-600 dark:bg-brand-400" />This Period</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-sky-300 dark:bg-sky-700" />Prior Year</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">Closed and pending listing-side transactions closing in the date range, with both a list price and a sales price. Price change is the sales price minus the list price; the prior year covers the same dates a year earlier.</p>
    </div>
  );
}

/** Deals a report covers in a range, kept here so the prior-year comparison uses the same rule. */
export function priceChangeDeals(deals: ReportDeal[], range: DateRange, isListingSide: (side: string) => boolean): ReportDeal[] {
  return deals.filter((deal) => !deal.archived && isListingSide(deal.side) && soldListing(deal) && inRange(deal.closingDate, range));
}
