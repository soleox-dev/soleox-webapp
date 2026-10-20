import React from 'react';

export interface FlowPayee {
  name: string;
  amount: number;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Entities in brand blues, agents in emerald, so money to agents reads as money in. */
const ENTITY_TONES = ['bg-brand-600 dark:bg-brand-400', 'bg-brand-400 dark:bg-brand-600', 'bg-sky-300 dark:bg-sky-800', 'bg-slate-400 dark:bg-slate-500'];
const AGENT_TONES = ['bg-emerald-600 dark:bg-emerald-400', 'bg-emerald-400 dark:bg-emerald-600', 'bg-teal-500 dark:bg-teal-500', 'bg-emerald-300 dark:bg-emerald-700'];
const MAX_ENTITY_SEGMENTS = 3;

/**
 * Where the commission goes, drawn to scale: entities, then agents, then anything unallocated.
 * Read-only; it uses the same payouts as Payments.
 */
export function CommissionFlowBar({ total, agents, entities }: { total: number; agents: FlowPayee[]; entities: FlowPayee[] }) {
  if (!(total > 0.009)) return null;
  const sortedEntities = entities.filter((item) => item.amount > 0.009).sort((a, b) => b.amount - a.amount);
  const shownEntities = sortedEntities.slice(0, MAX_ENTITY_SEGMENTS);
  const otherEntities = sortedEntities.slice(MAX_ENTITY_SEGMENTS).reduce((sum, item) => sum + item.amount, 0);
  const entitySegments = [
    ...shownEntities,
    ...(otherEntities > 0.009 ? [{ name: `Other entities (${sortedEntities.length - MAX_ENTITY_SEGMENTS})`, amount: otherEntities }] : []),
  ].map((item, index) => ({ ...item, tone: ENTITY_TONES[index % ENTITY_TONES.length] }));
  const agentSegments = agents.filter((item) => item.amount > 0.009).map((item, index) => ({ ...item, tone: AGENT_TONES[index % AGENT_TONES.length] }));
  // Every payout counts toward the total, including a negative one, so this agrees with Payments.
  // Only positive amounts can be drawn as segments.
  const allocated = [...entities, ...agents].reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const drawnTotal = [...entitySegments, ...agentSegments].reduce((sum, item) => sum + item.amount, 0);
  const remainder = Math.round((total - allocated) * 100) / 100;
  const segments = [
    ...entitySegments,
    ...agentSegments,
    ...(remainder > 0.009 ? [{ name: 'Unallocated', amount: remainder, tone: 'bg-[repeating-linear-gradient(135deg,var(--color-slate-300)_0_4px,transparent_4px_8px)] dark:bg-[repeating-linear-gradient(135deg,var(--color-slate-600)_0_4px,transparent_4px_8px)]' }] : []),
  ];
  const balanced = Math.abs(remainder) <= 0.009;
  const description = segments.map((item) => `${item.name} ${money.format(item.amount)}`).join(', ');

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Where the commission goes
          <span className="ml-2 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{money.format(total)}</span>
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${balanced ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : remainder > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'}`}>
          {balanced ? 'Fully allocated' : remainder > 0 ? `${money.format(remainder)} unallocated` : `${money.format(-remainder)} over the commission`}
        </span>
      </div>
      <div role="img" aria-label={description} className="flex h-3.5 gap-0.5 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700">
        {segments.map((item) => (
          <span
            key={item.name}
            title={`${item.name}: ${money.format(item.amount)}`}
            className={`block h-full ${item.tone}`}
            style={{ width: `${Math.max(0.6, (item.amount / Math.max(total, drawnTotal + Math.max(0, remainder))) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5">
        {segments.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-sm ${item.tone}`} />
            {item.name}
            <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">{money.format(item.amount)}</span>
          </span>
        ))}
        {/* A negative payout has no segment to draw, so it shows here in rose. */}
        {[...agents, ...entities].filter((item) => item.amount < -0.009).map((item) => (
          <span key={`negative-${item.name}`} className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm border border-rose-400" />
            {item.name}
            <span className="text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">{money.format(item.amount)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
