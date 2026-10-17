'use client';

import { useLayoutEffect, useRef } from 'react';
import { capProgressLabel } from '@/lib/agent-cap-progress';
import { toPercentPoints } from '@/lib/percent';
import { roundCurrency } from '../types';
import { DecimalInput } from './DecimalInput';
import { HoverNote } from './HoverNote';

export type AgentAllocationLine = {
  id: string;
  agent_id: string;
  kind: 'team_cap' | 'sales_volume';
  amount: number | null;
  calculated_amount: number | null;
  is_override: boolean | null;
  period_start: string | null;
  team_cap_id?: string | null;
  cap_name?: string | null;
  tracked?: boolean;
  cap_amount?: number | null;
  prior_amount?: number | null;
  team_percent?: number | null;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function adjustedSplitView(
  computed: { capAdjusted?: boolean; displayPercent?: number; amount?: number } | undefined,
): { percentPoints: number; dollar: number } | null {
  if (!computed?.capAdjusted) return null;
  return {
    percentPoints: toPercentPoints(Number(computed.displayPercent) || 0),
    dollar: Number(computed.amount) || 0,
  };
}

export type TeamCapGroup = {
  id: string;
  name: string;
  lines: AgentAllocationLine[];
};

export function teamCapStanding(line: AgentAllocationLine): { label: string; detail: string; share: number; exceeded: boolean } | null {
  if (line.kind !== 'team_cap' || line.tracked === false) return null;
  const cap = line.cap_amount == null ? null : Number(line.cap_amount);
  if (cap == null || !Number.isFinite(cap) || Math.abs(cap) < 0.005) return null;
  const prior = roundCurrency(Math.max(0, Number(line.prior_amount) || 0));
  const current = roundCurrency(Math.max(0, Number(line.amount) || 0));
  const after = roundCurrency(prior + current);
  const exceeded = Boolean(line.is_override) && after > cap + 0.005;
  const progress = capProgressLabel(after, cap);
  const percent = line.team_percent == null || !Number.isFinite(Number(line.team_percent))
    ? ''
    : `Pays ${Number(line.team_percent).toLocaleString('en-US', { maximumFractionDigits: 2 })}% of the agent split until ${money.format(cap)}.\n`;
  const detail = `${percent}Before this transaction: ${money.format(prior)}\nThis transaction: ${money.format(current)}\nIncluding this transaction: ${money.format(after)} of ${money.format(cap)}`;
  return { label: progress.label, detail, share: progress.share, exceeded };
}

export function teamCapGroups(allocations: AgentAllocationLine[]): TeamCapGroup[] {
  const groups = new Map<string, TeamCapGroup>();
  allocations.forEach((line) => {
    if (line.kind !== 'team_cap') return;
    const id = line.team_cap_id || line.cap_name || 'team_cap';
    const group = groups.get(id) || { id, name: line.cap_name || 'Team Cap', lines: [] };
    group.lines.push(line);
    groups.set(id, group);
  });
  return [...groups.values()];
}

export function TeamCapAmount({
  line,
  isEditing,
  onAmountChange,
}: {
  line: AgentAllocationLine | undefined;
  isEditing: boolean;
  onAmountChange?: (agentId: string, teamCapId: string, amount: number | null) => void;
}) {
  if (!line) {
    return <span className="inline-flex w-[6.5rem] justify-end pr-2 text-xs font-semibold text-amber-800/40 dark:text-amber-200/30">—</span>;
  }
  const amount = Number(line.amount) || 0;
  const calculated = line.calculated_amount == null ? null : Number(line.calculated_amount);
  const canEdit = Boolean(isEditing && onAmountChange && line.team_cap_id);
  const edited = Boolean(line.is_override);
  const standing = teamCapStanding(line);
  const exceeded = Boolean(standing?.exceeded);
  const amountTone = exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-amber-800 dark:text-amber-100';
  const editedTone = exceeded ? 'text-rose-600/80 dark:text-rose-300/80' : 'text-amber-700/80 dark:text-amber-300/80';
  const standingNote = standing ? (
    <span className="pr-2">
      <AgentCapNote label={standing.label} detail={standing.detail} share={standing.share} />
    </span>
  ) : null;
  if (!canEdit) {
    return (
      <span className="inline-flex flex-col items-end">
        <span className="inline-flex w-[6.5rem] items-baseline justify-end gap-1 pr-2">
          <span className={`text-xs font-semibold ${amountTone}`}>{money.format(amount)}</span>
          {edited ? <span className={`text-[9px] font-bold uppercase tracking-wide ${editedTone}`}>edited</span> : null}
        </span>
        {standingNote}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
    <span className="inline-flex items-center justify-end gap-1">
      {edited && calculated != null ? (
        <button
          type="button"
          onClick={() => onAmountChange?.(line.agent_id, line.team_cap_id || '', null)}
          title={`Use the calculated ${money.format(calculated)}`}
          className={`text-[9px] font-bold uppercase tracking-wide cursor-pointer ${editedTone} ${exceeded ? 'hover:text-rose-700 dark:hover:text-rose-200' : 'hover:text-amber-900 dark:hover:text-amber-100'}`}
        >
          calculated
        </button>
      ) : null}
      <span className="underline-field relative inline-flex w-[6.5rem] rounded-t-md border-b border-b-amber-300 transition-colors dark:border-b-amber-700 focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]">
        <DecimalInput
          value={amount}
          onChange={(next) => {
            if (calculated != null && Math.abs(next - calculated) < 0.005) {
              onAmountChange?.(line.agent_id, line.team_cap_id || '', null);
              return;
            }
            onAmountChange?.(line.agent_id, line.team_cap_id || '', roundCurrency(Math.max(0, next)));
          }}
          useCommas
          filled
          onKeyDown={(event) => { if (event.key === '-') event.preventDefault(); }}
          placeholder="0.00"
          className={`h-7 w-full border-0 bg-transparent pl-5 pr-2 text-right text-xs font-semibold focus:outline-none ${exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-amber-900 dark:text-amber-100'}`}
        />
        <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs font-semibold ${exceeded ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'}`}>$</span>
      </span>
    </span>
    {standingNote}
    </span>
  );
}

function matchCapBarWidths(bar: HTMLElement) {
  const root = bar.closest('#commission') ?? document.body;
  const bars = [...root.querySelectorAll<HTMLElement>('[data-cap-bar]')];
  if (bars.length === 0) return;
  for (const item of bars) item.style.width = 'max-content';
  const max = Math.max(...bars.map((item) => item.getBoundingClientRect().width));
  const px = `${Math.ceil(max)}px`;
  for (const item of bars) item.style.width = px;
}

export function AgentCapNote({ label, detail, share }: { label: string; detail: string; share: number }) {
  const barRef = useRef<HTMLSpanElement>(null);
  const width = Math.min(100, Math.max(0, share * 100));
  const over = share > 1;
  const fill = over ? 'bg-rose-400' : 'bg-emerald-400';
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (bar) matchCapBarWidths(bar);
  }, [label]);
  return (
    <HoverNote label={detail}>
      <span ref={barRef} data-cap-bar tabIndex={0} className="relative mt-0.5 inline-flex h-4 shrink-0 cursor-help items-center justify-end overflow-hidden rounded-sm bg-slate-200 outline-none dark:bg-slate-800">
        <span aria-hidden className={`absolute inset-y-0 left-0 z-0 ${fill}`} style={{ width: `${width}%` }} />
        <span className="relative z-10 px-1 text-right text-[10px] font-bold leading-none tabular-nums text-slate-950 dark:text-white dark:[text-shadow:0_0_2px_#020617,0_0_3px_#020617]">{label}</span>
      </span>
    </HoverNote>
  );
}

export function AgentAllocationNotes({ agentId, allocations }: { agentId: string; allocations: AgentAllocationLine[] }) {
  const lines = allocations.filter((line) => line.agent_id === agentId && line.kind !== 'team_cap');
  if (lines.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      {lines.map((line) => (
        <p key={line.id}>
          {line.kind === 'sales_volume' ? 'Agent allocation' : `${line.cap_name || (line.tracked === false ? 'Team lead' : 'Team cap')}${line.tracked === false && line.cap_name ? ' · team lead' : ''}`} {money.format(Number(line.amount) || 0)}
          {line.is_override ? ' · edited' : ''}
        </p>
      ))}
    </div>
  );
}
