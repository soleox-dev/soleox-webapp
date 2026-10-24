'use client';

import React, { useMemo } from 'react';
import { useRestorableState } from '@/lib/report-return';
import {
  agentPaidRows,
  compactMoney,
  fullMoney,
  inRange,
  type DateRange,
  type ReportDeal,
  type ReportPayment,
} from '@/lib/owner-reports';
import {
  AddressLink,
  DealListTable,
  StatusChip,
  cents,
  compactDollars,
  dayLabel,
  fitReport,
  rate,
  tableWrap,
  type Column,
} from './deal-list-reports';

/**
 * Owner Reports for team leads: Pipeline Forecast, Agent Scorecard, Commission Payouts, Fall-Through Report and
 * Inactive Agents. Each takes the deals that passed the report's filters, before any date rule; the date rules live
 * here, since two of them count from today instead of the date range.
 */

const DAY = 86_400_000;

function statusOf(deal: ReportDeal): string {
  return deal.status.trim().toLowerCase();
}

function live(deals: ReportDeal[]): ReportDeal[] {
  return deals.filter((deal) => !deal.archived);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * The agents on a deal and each one's share of it: by their split when the deal has splits, otherwise the primary
 * agent alone, the same way the NET Agent Leaderboard credits shared deals.
 */
function agentShares(deal: ReportDeal): Array<{ id: string; share: number }> {
  const splits = deal.agentSplits.filter((agent) => agent.split > 0);
  const weight = splits.reduce((total, agent) => total + agent.split, 0);
  if (!splits.length || weight <= 0) return deal.agentId ? [{ id: deal.agentId, share: 1 }] : [];
  return splits.map((agent) => ({ id: agent.id || agent.name, share: agent.split / weight }));
}

function shareOf(deal: ReportDeal, agentId: string): number {
  return agentShares(deal).find((agent) => agent.id === agentId)?.share ?? 0;
}

/** +12.3% vs. last year, colored up or down; a dash when there is nothing to compare with. */
function Change({ current, prior, points = false }: { current: number; prior: number; points?: boolean }) {
  if (points) {
    const delta = (current - prior) * 100;
    const tone = Math.abs(delta) < 0.005 ? 'text-slate-400' : delta > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
    return <span className={tone}>{`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts`} vs. last year</span>;
  }
  if (!prior) return <span className="text-slate-400">— vs. last year</span>;
  const change = (current - prior) / prior;
  const tone = Math.abs(change) < 0.0005 ? 'text-slate-400' : change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return <span className={tone}>{`${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`} vs. last year</span>;
}

/** A report tile: label, figure, and an optional line under it. */
function Tile({ label, value, short, sub, valueClass = '' }: { label: string; value: string; short?: string; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {/* Phones show the short amount ($113.38M): two tiles a row leave no room for the full one. */}
      <p className={`mt-0.5 truncate text-xl font-bold tabular-nums ${valueClass || 'text-slate-900 dark:text-slate-50'}`}>
        <span className={short ? 'max-md:hidden' : ''}>{value}</span>
        {short ? <span className="md:hidden">{short}</span> : null}
      </p>
      {sub ? <p className="mt-1 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

const tileGrid = 'grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4';

/** Small segmented switch for a report's own view choice. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label={label}>
      <span className="px-2 text-2xs font-medium text-slate-500 max-sm:hidden dark:text-slate-400">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`press cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition ${value === option.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A thin bar for a share of the largest value in a column. */
function Bar({ value, max, tone = 'bg-emerald-500/70 dark:bg-emerald-400/50' }: { value: number; max: number; tone?: string }) {
  return (
    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: max > 0 ? `${Math.max(2, (value / max) * 100)}%` : '0%' }} />
    </span>
  );
}

const headCell = 'px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400';
const numHead = `${headCell} text-right`;
const bodyCell = 'px-3 py-2 text-xs tabular-nums';
const numCell = `${bodyCell} text-right whitespace-nowrap`;

// ---------------------------------------------------------------------------------------------------------------
// Pipeline Forecast
// ---------------------------------------------------------------------------------------------------------------

type PipelineBucket = { key: string; label: string; deals: ReportDeal[] };

function pipelineBuckets(pending: ReportDeal[], today: Date): PipelineBucket[] {
  const months: PipelineBucket[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    months.push({ key: `${month.getFullYear()}-${month.getMonth()}`, label: month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), deals: [] });
  }
  const past: PipelineBucket = { key: 'past', label: 'Past Due', deals: [] };
  const later: PipelineBucket = { key: 'later', label: 'Later', deals: [] };
  const none: PipelineBucket = { key: 'none', label: 'No Closing Date', deals: [] };
  const horizon = new Date(today.getFullYear(), today.getMonth() + 6, 1);
  pending.forEach((deal) => {
    const date = deal.closingDate;
    if (!date) none.deals.push(deal);
    else if (date < today) past.deals.push(deal);
    else if (date >= horizon) later.deals.push(deal);
    else months.find((bucket) => bucket.key === `${date.getFullYear()}-${date.getMonth()}`)?.deals.push(deal);
  });
  return [past, ...months, later, none].filter((bucket) => bucket.deals.length > 0 || months.includes(bucket));
}

export function PipelineForecastReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const today = startOfToday();
  const pending = useMemo(() => live(deals).filter((deal) => statusOf(deal) === 'pending'), [deals]);
  const buckets = pipelineBuckets(pending, today);
  const [picked, setPicked] = useRestorableState<string | null>('pipeline-forecast:bucket', null);
  const pickedBucket = buckets.find((bucket) => bucket.key === picked) ?? null;
  const shown = pickedBucket ? pickedBucket.deals : pending;
  const sumOf = (rows: ReportDeal[], read: (deal: ReportDeal) => number) => rows.reduce((total, deal) => total + read(deal), 0);
  const pastDue = buckets.find((bucket) => bucket.key === 'past')?.deals ?? [];
  const maxGci = Math.max(0, ...buckets.map((bucket) => sumOf(bucket.deals, (deal) => deal.gciAmount)));
  const shownVolume = sumOf(shown, (deal) => deal.salesPrice);
  const shownGci = sumOf(shown, (deal) => deal.gciAmount);
  const shownTeam = sumOf(shown, (deal) => deal.teamGci);
  const columns: Column[] = [
    { key: 'agent', label: 'Primary Agent', width: 'min-w-32', sortValue: (deal) => names.get(deal.agentId) || '', cell: (deal) => names.get(deal.agentId) || '—' },
    { key: 'side', label: 'Side', sortValue: (deal) => deal.side, cell: (deal) => deal.side || '—' },
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'client', label: 'Client Name', width: 'min-w-36', sortValue: (deal) => deal.clientName, cell: (deal) => deal.clientName || '—' },
    { key: 'pending', label: 'Pending Date', align: 'right', sortValue: (deal) => deal.acceptanceDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.acceptanceDate) },
    {
      key: 'closing',
      label: 'Closing Date',
      align: 'right',
      sortValue: (deal) => deal.closingDate?.getTime() ?? null,
      cell: (deal) => (deal.closingDate && deal.closingDate < today
        ? <span className="font-semibold text-rose-600 dark:text-rose-400">{dayLabel(deal.closingDate)}</span>
        : dayLabel(deal.closingDate)),
    },
    { key: 'price', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice, cell: (deal) => cents(deal.salesPrice), total: cents(shownVolume) },
    { key: 'gci', label: 'GCI', align: 'right', sortValue: (deal) => deal.gciAmount, cell: (deal) => cents(deal.gciAmount), total: cents(shownGci) },
    { key: 'team', label: 'Team Commission', align: 'right', sortValue: (deal) => deal.teamGci, cell: (deal) => cents(deal.teamGci), total: cents(shownTeam) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className={tileGrid}>
        <Tile label="Pending Deals" value={pending.length.toLocaleString()} sub={`${compactMoney(sumOf(pending, (deal) => deal.salesPrice))} in sales volume`} />
        <Tile label="Projected GCI" value={fullMoney(sumOf(pending, (deal) => deal.gciAmount))} short={compactMoney(sumOf(pending, (deal) => deal.gciAmount))} sub="When every pending deal closes" />
        <Tile label="Projected Team Commission" value={fullMoney(sumOf(pending, (deal) => deal.teamGci))} short={compactMoney(sumOf(pending, (deal) => deal.teamGci))} sub="After off-the-top and pre-splits" />
        <Tile
          label="Past Due"
          value={pastDue.length.toLocaleString()}
          valueClass={pastDue.length ? 'text-rose-600 dark:text-rose-400' : ''}
          sub={pastDue.length ? `${compactMoney(sumOf(pastDue, (deal) => deal.gciAmount))} GCI past its closing date` : 'Every closing date is ahead'}
        />
      </div>
      <div className={tableWrap}>
        <table className="w-full">
          <thead className="report-head">
            <tr>
              <th className={headCell}>Expected Closing</th>
              <th className={numHead}>Deals</th>
              <th className={numHead}>Sales Volume</th>
              <th className={`${numHead} w-[28%]`}>GCI</th>
              <th className={numHead}>Team Commission</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => {
              const selected = bucket.key === pickedBucket?.key;
              const gci = sumOf(bucket.deals, (deal) => deal.gciAmount);
              return (
                <tr
                  key={bucket.key}
                  onClick={() => bucket.deals.length && setPicked((current) => (current === bucket.key ? null : bucket.key))}
                  aria-selected={selected}
                  className={`border-t border-slate-100 dark:border-slate-800 ${bucket.deals.length ? 'cursor-pointer' : ''} ${selected ? 'bg-brand-100 font-semibold dark:bg-brand-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  <td className={`${bodyCell} ${selected ? 'shadow-[inset_3px_0_0_var(--color-brand-500)]' : ''} ${bucket.key === 'past' && bucket.deals.length ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-medium'}`}>{bucket.label}</td>
                  <td className={numCell}>{bucket.deals.length ? bucket.deals.length.toLocaleString() : '—'}</td>
                  <td className={numCell}>{bucket.deals.length ? fullMoney(sumOf(bucket.deals, (deal) => deal.salesPrice)) : '—'}</td>
                  <td className={numCell}>
                    {bucket.deals.length ? fullMoney(gci) : '—'}
                    {bucket.deals.length ? <Bar value={gci} max={maxGci} tone={bucket.key === 'past' ? 'bg-rose-500/70 dark:bg-rose-400/60' : undefined} /> : null}
                  </td>
                  <td className={numCell}>{bucket.deals.length ? fullMoney(sumOf(bucket.deals, (deal) => deal.teamGci)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
              <td className={bodyCell}>Total</td>
              <td className={numCell}>{pending.length.toLocaleString()}</td>
              <td className={numCell}>{fullMoney(sumOf(pending, (deal) => deal.salesPrice))}</td>
              <td className={numCell}>{fullMoney(sumOf(pending, (deal) => deal.gciAmount))}</td>
              <td className={numCell}>{fullMoney(sumOf(pending, (deal) => deal.teamGci))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {pickedBucket ? `${pickedBucket.label} · ${pickedBucket.deals.length.toLocaleString()} ${pickedBucket.deals.length === 1 ? 'Deal' : 'Deals'}` : `Every Pending Deal · ${pending.length.toLocaleString()}`}
      </p>
      <DealListTable
        deals={shown}
        columns={columns}
        initialSort={{ key: 'closing', direction: 'asc' }}
        totalLabelColumn="pending"
        empty="No pending transactions match these filters."
        stateKey="pipeline-forecast"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Agent Scorecard
// ---------------------------------------------------------------------------------------------------------------

/** The agents a scorecard can show: everyone credited on a closed or pending deal in the range, top producers first. */
export function scorecardAgents(deals: ReportDeal[], range: DateRange, names: Map<string, string>): Array<{ id: string; label: string; type: string }> {
  const inPlay = live(deals).filter((deal) => {
    const status = statusOf(deal);
    return (status === 'closed' && inRange(deal.closingDate, range)) || status === 'pending';
  });
  return agentPaidRows(inPlay)
    .filter((row) => row.agentId && row.agentId !== 'unassigned')
    .map((row) => ({ id: row.agentId, label: names.get(row.agentId) || row.name || row.agentId, type: 'AGENT', volume: row.volume }))
    .sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label))
    .map(({ id, label, type }) => ({ id, label, type }));
}

type AgentFigures = { units: number; volume: number; gci: number; earned: number };

function agentFigures(deals: ReportDeal[], payments: ReportPayment[], agentId: string, range: DateRange): AgentFigures {
  const closed = live(deals).filter((deal) => statusOf(deal) === 'closed' && inRange(deal.closingDate, range));
  const figures: AgentFigures = { units: 0, volume: 0, gci: 0, earned: 0 };
  const closedIds = new Set<string>();
  closed.forEach((deal) => {
    const share = shareOf(deal, agentId);
    if (!share) return;
    closedIds.add(deal.id);
    figures.units += share;
    figures.volume += deal.salesPrice * share;
    figures.gci += deal.gciAmount * share;
  });
  payments.forEach((payment) => {
    if (payment.payeeType.toUpperCase() === 'AGENT' && payment.agentId === agentId && payment.status.toUpperCase() !== 'VOIDED' && closedIds.has(payment.transactionId)) {
      figures.earned += payment.amount;
    }
  });
  return figures;
}

export function AgentScorecardReport({ agentId, deals, payments, names, range, priorRange }: {
  agentId: string;
  deals: ReportDeal[];
  payments: ReportPayment[];
  names: Map<string, string>;
  range: DateRange;
  priorRange: DateRange;
}) {
  const current = useMemo(() => agentFigures(deals, payments, agentId, range), [agentId, deals, payments, range]);
  const prior = useMemo(() => agentFigures(deals, payments, agentId, priorRange), [agentId, deals, payments, priorRange]);
  const ranking = useMemo(() => agentPaidRows(live(deals).filter((deal) => statusOf(deal) === 'closed' && inRange(deal.closingDate, range)))
    .filter((row) => row.agentId !== 'unassigned')
    .sort((a, b) => b.volume - a.volume), [deals, range]);
  const rank = ranking.findIndex((row) => row.agentId === agentId);
  const theirs = useMemo(() => live(deals).filter((deal) => {
    if (!shareOf(deal, agentId)) return false;
    const status = statusOf(deal);
    return (status === 'closed' && inRange(deal.closingDate, range)) || status === 'pending';
  }), [agentId, deals, range]);
  const pending = theirs.filter((deal) => statusOf(deal) === 'pending');
  const pendingVolume = pending.reduce((total, deal) => total + deal.salesPrice * shareOf(deal, agentId), 0);
  if (!agentId) {
    return <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">No agent has a closed or pending transaction in this date range.</p>;
  }
  const units = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const columns: Column[] = [
    { key: 'status', label: 'Status', sortValue: (deal) => deal.status, cell: (deal) => <StatusChip status={deal.status} /> },
    { key: 'side', label: 'Side', sortValue: (deal) => deal.side, cell: (deal) => deal.side || '—' },
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'client', label: 'Client Name', width: 'min-w-36', sortValue: (deal) => deal.clientName, cell: (deal) => deal.clientName || '—' },
    { key: 'source', label: 'Lead Source', sortValue: (deal) => deal.leadSource, cell: (deal) => deal.leadSource || '—' },
    { key: 'closing', label: 'Closing Date', align: 'right', sortValue: (deal) => deal.closingDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.closingDate) },
    { key: 'share', label: 'Split', align: 'right', sortValue: (deal) => shareOf(deal, agentId), cell: (deal) => rate(shareOf(deal, agentId), 0) },
    { key: 'price', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice, cell: (deal) => cents(deal.salesPrice) },
    { key: 'gci', label: 'GCI', align: 'right', sortValue: (deal) => deal.gciAmount, cell: (deal) => cents(deal.gciAmount) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Closed Units" value={units(current.units)} sub={<Change current={current.units} prior={prior.units} />} />
        <Tile label="Sales Volume" value={fullMoney(current.volume)} short={compactMoney(current.volume)} sub={<Change current={current.volume} prior={prior.volume} />} />
        <Tile label="GCI" value={fullMoney(current.gci)} short={compactMoney(current.gci)} sub={<Change current={current.gci} prior={prior.gci} />} />
        <Tile label="Paid to Agent" value={fullMoney(current.earned)} short={compactMoney(current.earned)} sub={<Change current={current.earned} prior={prior.earned} />} />
        <Tile label="Team Rank" value={rank >= 0 ? `#${rank + 1}` : '—'} sub={rank >= 0 ? `of ${ranking.length} by sales volume` : 'No closed deals in this range'} />
        <Tile label="Pending" value={pending.length.toLocaleString()} sub={`${compactDollars(pendingVolume)} in sales volume`} valueClass={pending.length ? 'text-amber-600 dark:text-amber-400' : ''} />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{names.get(agentId) || agentId}’s Transactions · {theirs.length.toLocaleString()}</p>
      <DealListTable
        deals={theirs}
        columns={columns}
        initialSort={{ key: 'closing', direction: 'desc' }}
        totalLabelColumn="closing"
        empty="No closed or pending transactions for this agent in the date range."
        stateKey="agent-scorecard"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Commission Payouts
// ---------------------------------------------------------------------------------------------------------------

type PayeeRow = { key: string; name: string; type: 'Agent' | 'Entity'; deals: Set<string>; closed: number; scheduled: number; unpaid: number };

export function CommissionPayoutsReport({ deals, payments, names, entityNames, range }: {
  deals: ReportDeal[];
  payments: ReportPayment[];
  names: Map<string, string>;
  entityNames: Map<string, string>;
  range: DateRange;
}) {
  const [kind, setKind] = useRestorableState<'all' | 'Agent' | 'Entity'>('commission-payables:kind', 'all');
  // Payment status counts only once a team records it; until then every closed payout is simply listed.
  const tracked = payments.some((payment) => payment.status.trim() !== '');
  const rows = useMemo(() => {
    const byId = new Map(live(deals).map((deal) => [deal.id, deal]));
    const grouped = new Map<string, PayeeRow>();
    payments.forEach((payment) => {
      if (payment.status.toUpperCase() === 'VOIDED' || !payment.amount) return;
      const deal = byId.get(payment.transactionId);
      if (!deal) return;
      const status = statusOf(deal);
      const closed = status === 'closed' && inRange(deal.closingDate, range);
      const scheduled = status === 'pending' && inRange(deal.closingDate, range);
      if (!closed && !scheduled) return;
      const agent = payment.payeeType.toUpperCase() === 'AGENT';
      const key = agent ? `A:${payment.agentId}` : `E:${payment.entityId}`;
      const row = grouped.get(key) ?? {
        key,
        name: agent ? names.get(payment.agentId) || 'Unassigned Agent' : entityNames.get(payment.entityId) || 'Unnamed Entity',
        type: agent ? 'Agent' : 'Entity',
        deals: new Set<string>(),
        closed: 0,
        scheduled: 0,
        unpaid: 0,
      } satisfies PayeeRow;
      if (closed) {
        row.closed += payment.amount;
        row.deals.add(deal.id);
        const paid = ['COMPLETED', 'PAID'].includes(payment.status.trim().toUpperCase());
        if (tracked && !paid) row.unpaid += payment.amount;
      } else {
        row.scheduled += payment.amount;
      }
      grouped.set(key, row);
    });
    return [...grouped.values()].sort((a, b) => (b.closed + b.scheduled) - (a.closed + a.scheduled) || a.name.localeCompare(b.name));
  }, [deals, entityNames, names, payments, range, tracked]);
  const shown = kind === 'all' ? rows : rows.filter((row) => row.type === kind);
  const total = (read: (row: PayeeRow) => number) => shown.reduce((sum, row) => sum + read(row), 0);
  const maxTotal = Math.max(0, ...shown.map((row) => row.closed + row.scheduled));
  return (
    <div className="flex flex-col gap-4">
      <div className={tileGrid}>
        <Tile label="Closed Payouts" value={fullMoney(total((row) => row.closed))} short={compactMoney(total((row) => row.closed))} sub="On deals closed in the range" />
        <Tile label="Scheduled Payouts" value={fullMoney(total((row) => row.scheduled))} short={compactMoney(total((row) => row.scheduled))} sub="Pending deals closing in the range" valueClass="text-amber-600 dark:text-amber-400" />
        <Tile
          label="Unpaid"
          value={tracked ? fullMoney(total((row) => row.unpaid)) : 'Not Tracked'}
          valueClass={tracked && total((row) => row.unpaid) > 0 ? 'text-rose-600 dark:text-rose-400' : tracked ? '' : 'text-slate-400 dark:text-slate-500'}
          sub={tracked ? 'Closed payouts not marked paid' : 'Payments are not marked paid yet'}
        />
        <Tile label="Payees" value={shown.length.toLocaleString()} sub={`${shown.filter((row) => row.type === 'Agent').length} agents · ${shown.filter((row) => row.type === 'Entity').length} entities`} />
      </div>
      <div>
        <Segmented<'all' | 'Agent' | 'Entity'>
          label="Payees"
          value={kind}
          options={[{ id: 'all', label: 'All' }, { id: 'Agent', label: 'Agents' }, { id: 'Entity', label: 'Entities' }]}
          onChange={setKind}
        />
      </div>
      <div className={tableWrap}>
        <table className="w-full">
          <thead className="report-head">
            <tr>
              <th className={`${headCell} w-10 text-right`}>#</th>
              <th className={headCell}>Payee</th>
              <th className={headCell}>Type</th>
              <th className={numHead}>Closed Deals</th>
              <th className={numHead}>Closed</th>
              <th className={numHead}>Scheduled</th>
              {tracked ? <th className={numHead}>Unpaid</th> : null}
              <th className={`${numHead} w-[22%]`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td className="px-4 py-6 text-xs text-slate-500" colSpan={tracked ? 8 : 7}>No payouts on transactions in this date range.</td></tr>
            ) : shown.map((row, index) => (
              <tr key={row.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`${numCell} text-slate-400`}>{index + 1}</td>
                <td className={`${bodyCell} font-medium`}>{row.name}</td>
                <td className={bodyCell}>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ring-inset ${row.type === 'Agent' ? 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'}`}>{row.type}</span>
                </td>
                <td className={numCell}>{row.deals.size ? row.deals.size.toLocaleString() : '—'}</td>
                <td className={numCell}>{row.closed ? fullMoney(row.closed) : '—'}</td>
                <td className={`${numCell} text-amber-600 dark:text-amber-400`}>{row.scheduled ? fullMoney(row.scheduled) : '—'}</td>
                {tracked ? <td className={`${numCell} ${row.unpaid ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}`}>{row.unpaid ? fullMoney(row.unpaid) : '—'}</td> : null}
                <td className={`${numCell} font-semibold`}>
                  {fullMoney(row.closed + row.scheduled)}
                  <Bar value={row.closed + row.scheduled} max={maxTotal} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
              <td className={bodyCell} />
              <td className={bodyCell} colSpan={3}>Grand Total</td>
              <td className={numCell}>{fullMoney(total((row) => row.closed))}</td>
              <td className={numCell}>{fullMoney(total((row) => row.scheduled))}</td>
              {tracked ? <td className={numCell}>{fullMoney(total((row) => row.unpaid))}</td> : null}
              <td className={numCell}>{fullMoney(total((row) => row.closed + row.scheduled))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Fall-Through Report
// ---------------------------------------------------------------------------------------------------------------

type FallGroup = 'agent' | 'source' | 'side';

/** Deals that went pending in the range (acceptance date) and, of those, the ones later cancelled. */
function wentPending(deals: ReportDeal[], range: DateRange): { pending: ReportDeal[]; fell: ReportDeal[] } {
  const pending = live(deals).filter((deal) => inRange(deal.acceptanceDate, range) && ['closed', 'pending', 'cancelled'].includes(statusOf(deal)));
  return { pending, fell: pending.filter((deal) => statusOf(deal) === 'cancelled') };
}

export function FallThroughReport({ deals, names, range, priorRange }: { deals: ReportDeal[]; names: Map<string, string>; range: DateRange; priorRange: DateRange }) {
  const [group, setGroup] = useRestorableState<FallGroup>('fall-through:group', 'agent');
  const current = useMemo(() => wentPending(deals, range), [deals, range]);
  const prior = useMemo(() => wentPending(deals, priorRange), [deals, priorRange]);
  const rateOf = (part: number, whole: number) => (whole ? part / whole : 0);
  const currentRate = rateOf(current.fell.length, current.pending.length);
  const priorRate = rateOf(prior.fell.length, prior.pending.length);
  const lost = current.fell.reduce((total, deal) => total + deal.salesPrice, 0);
  const groupOf = (deal: ReportDeal) => (group === 'agent'
    ? names.get(deal.agentId) || 'Unassigned'
    : group === 'source' ? deal.leadSource || 'Unspecified' : deal.side || 'Unspecified');
  const rows = useMemo(() => {
    const grouped = new Map<string, { label: string; pending: number; fell: number; lost: number }>();
    current.pending.forEach((deal) => {
      const label = groupOf(deal);
      const row = grouped.get(label) ?? { label, pending: 0, fell: 0, lost: 0 };
      row.pending += 1;
      if (statusOf(deal) === 'cancelled') {
        row.fell += 1;
        row.lost += deal.salesPrice;
      }
      grouped.set(label, row);
    });
    return [...grouped.values()].sort((a, b) => b.fell - a.fell || rateOf(b.fell, b.pending) - rateOf(a.fell, a.pending) || a.label.localeCompare(b.label));
    // groupOf reads `group` and `names`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, group, names]);
  const columns: Column[] = [
    { key: 'agent', label: 'Primary Agent', width: 'min-w-32', sortValue: (deal) => names.get(deal.agentId) || '', cell: (deal) => names.get(deal.agentId) || '—' },
    { key: 'side', label: 'Side', sortValue: (deal) => deal.side, cell: (deal) => deal.side || '—' },
    { key: 'address', label: 'Property Address', width: 'min-w-52', sortValue: (deal) => deal.address, cell: (deal) => <AddressLink deal={deal} /> },
    { key: 'client', label: 'Client Name', width: 'min-w-36', sortValue: (deal) => deal.clientName, cell: (deal) => deal.clientName || '—' },
    { key: 'source', label: 'Lead Source', sortValue: (deal) => deal.leadSource, cell: (deal) => deal.leadSource || '—' },
    { key: 'pending', label: 'Pending Date', align: 'right', sortValue: (deal) => deal.acceptanceDate?.getTime() ?? null, cell: (deal) => dayLabel(deal.acceptanceDate) },
    { key: 'price', label: 'Sales Price', align: 'right', sortValue: (deal) => deal.salesPrice, cell: (deal) => cents(deal.salesPrice), total: cents(lost) },
  ];
  const groupLabel = group === 'agent' ? 'Agent' : group === 'source' ? 'Lead Source' : 'Side';
  const maxRate = Math.max(0, ...rows.map((row) => rateOf(row.fell, row.pending)));
  return (
    <div className="flex flex-col gap-4">
      <div className={tileGrid}>
        <Tile label="Went Pending" value={current.pending.length.toLocaleString()} sub={<Change current={current.pending.length} prior={prior.pending.length} />} />
        <Tile label="Fell Through" value={current.fell.length.toLocaleString()} valueClass={current.fell.length ? 'text-rose-600 dark:text-rose-400' : ''} sub={<Change current={current.fell.length} prior={prior.fell.length} />} />
        <Tile label="Fall-Through Rate" value={rate(currentRate, 1)} sub={<Change current={currentRate} prior={priorRate} points />} />
        <Tile label="Volume Lost" value={fullMoney(lost)} short={compactMoney(lost)} sub="Sales price of the cancelled deals" />
      </div>
      <div>
        <Segmented<FallGroup>
          label="Group By"
          value={group}
          options={[{ id: 'agent', label: 'Agent' }, { id: 'source', label: 'Lead Source' }, { id: 'side', label: 'Side' }]}
          onChange={setGroup}
        />
      </div>
      <div className={tableWrap}>
        <table className="w-full">
          <thead className="report-head">
            <tr>
              <th className={headCell}>{groupLabel}</th>
              <th className={numHead}>Went Pending</th>
              <th className={numHead}>Fell Through</th>
              <th className={`${numHead} w-[24%]`}>Fall-Through Rate</th>
              <th className={numHead}>Volume Lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-xs text-slate-500" colSpan={5}>No transactions went pending in this date range.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`${bodyCell} font-medium`}>{row.label}</td>
                <td className={numCell}>{row.pending.toLocaleString()}</td>
                <td className={`${numCell} ${row.fell ? 'text-rose-600 dark:text-rose-400' : ''}`}>{row.fell ? row.fell.toLocaleString() : '—'}</td>
                <td className={numCell}>
                  {rate(rateOf(row.fell, row.pending), 1)}
                  <Bar value={rateOf(row.fell, row.pending)} max={maxRate} tone="bg-rose-500/70 dark:bg-rose-400/60" />
                </td>
                <td className={numCell}>{row.lost ? fullMoney(row.lost) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
              <td className={bodyCell}>Total</td>
              <td className={numCell}>{current.pending.length.toLocaleString()}</td>
              <td className={numCell}>{current.fell.length.toLocaleString()}</td>
              <td className={numCell}>{rate(currentRate, 1)}</td>
              <td className={numCell}>{fullMoney(lost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cancelled Transactions · {current.fell.length.toLocaleString()}</p>
      <DealListTable
        deals={current.fell}
        columns={columns}
        initialSort={{ key: 'pending', direction: 'desc' }}
        totalLabelColumn="pending"
        empty="None of the transactions that went pending in this range were cancelled."
        stateKey="fall-through"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Inactive Agents
// ---------------------------------------------------------------------------------------------------------------

type AgentActivity = { agentId: string; last: Date; lastDeal: ReportDeal; deals: number; volume: number };

export function InactiveAgentsReport({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const [days, setDays] = useRestorableState<'30' | '60' | '90'>('inactive-agents:days', '60');
  const today = startOfToday();
  const yearAgo = new Date(today.getTime() - 365 * DAY);
  const activity = useMemo(() => {
    const byAgent = new Map<string, AgentActivity>();
    live(deals).forEach((deal) => {
      const status = statusOf(deal);
      if (status !== 'closed' && status !== 'pending') return;
      // The deal's latest date that has already happened: a future closing date is not activity yet.
      const dates = [deal.acceptanceDate, deal.closingDate].filter((date): date is Date => Boolean(date) && (date as Date) <= today);
      if (!dates.length) return;
      const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
      agentShares(deal).forEach(({ id, share }) => {
        if (!id) return;
        const row = byAgent.get(id) ?? { agentId: id, last: latest, lastDeal: deal, deals: 0, volume: 0 };
        if (latest > row.last) {
          row.last = latest;
          row.lastDeal = deal;
        }
        if (latest >= yearAgo) {
          row.deals += share;
          row.volume += deal.salesPrice * share;
        }
        byAgent.set(id, row);
      });
    });
    return [...byAgent.values()].filter((row) => row.last >= yearAgo);
    // `today` and `yearAgo` change only with the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);
  const cutoff = new Date(today.getTime() - Number(days) * DAY);
  const inactive = activity.filter((row) => row.last < cutoff).sort((a, b) => a.last.getTime() - b.last.getTime());
  const daysSince = (date: Date) => Math.round((today.getTime() - date.getTime()) / DAY);
  const inactiveVolume = inactive.reduce((total, row) => total + row.volume, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className={tileGrid}>
        <Tile label="Inactive Agents" value={inactive.length.toLocaleString()} valueClass={inactive.length ? 'text-amber-600 dark:text-amber-400' : ''} sub={`No new deal in ${days} days`} />
        <Tile label="Active Agents" value={(activity.length - inactive.length).toLocaleString()} sub={`Of ${activity.length} with a deal in 12 months`} />
        <Tile label="Their 12-Month Volume" value={fullMoney(inactiveVolume)} short={compactMoney(inactiveVolume)} sub="Sales volume the inactive agents produced" />
        <Tile label="Longest Quiet" value={inactive.length ? `${daysSince(inactive[0].last)} Days` : '—'} sub={inactive.length ? names.get(inactive[0].agentId) || inactive[0].agentId : 'Everyone is active'} />
      </div>
      <div>
        <Segmented<'30' | '60' | '90'>
          label="No New Deal In"
          value={days}
          options={[{ id: '30', label: '30 Days' }, { id: '60', label: '60 Days' }, { id: '90', label: '90 Days' }]}
          onChange={setDays}
        />
      </div>
      <div className={tableWrap}>
        <table className="w-full">
          <thead className="report-head">
            <tr>
              <th className={`${headCell} w-10 text-right`}>#</th>
              <th className={headCell}>Agent</th>
              <th className={headCell}>Last Transaction</th>
              <th className={numHead}>Last Activity</th>
              <th className={numHead}>Days Since</th>
              <th className={numHead}>Deals (12 Mo.)</th>
              <th className={numHead}>Volume (12 Mo.)</th>
            </tr>
          </thead>
          <tbody>
            {inactive.length === 0 ? (
              <tr><td className="px-4 py-6 text-xs text-slate-500" colSpan={7}>Every agent with a deal in the last 12 months had a new one in the last {days} days.</td></tr>
            ) : inactive.map((row, index) => (
              <tr key={row.agentId} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`${numCell} text-slate-400`}>{index + 1}</td>
                <td className={`${bodyCell} font-medium`}>{names.get(row.agentId) || row.agentId}</td>
                <td className={`${bodyCell} min-w-52`}><AddressLink deal={row.lastDeal} /></td>
                <td className={numCell}>{dayLabel(row.last)}</td>
                <td className={`${numCell} font-semibold ${daysSince(row.last) >= 90 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{daysSince(row.last).toLocaleString()}</td>
                <td className={numCell}>{row.deals.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                <td className={numCell}>{fullMoney(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { fitReport };
