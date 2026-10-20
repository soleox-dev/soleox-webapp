// app/commission-tracker/transactions/[id]/components/FinalDisbursements.tsx
import React from 'react';
import { Building2, UserRound } from 'lucide-react';
import { formatPercentRate } from '@/lib/percent';
import { roundCurrency } from '../types';
import { SectionIcon } from './SectionIcon';
import { AgentSplitExcessNotice } from './AgentSplitExcessNotice';

export interface AgentDisbursement {
  name: string;
  amount: number;
  isPrimary: boolean;
  isTeamLead: boolean;
}

interface FinalDisbursementsProps {
  agentDisbursements: AgentDisbursement[];
  entityDisbursements: [string, number][];
  totalCommission: number;
  agentSplitTotal?: number;
  agentSplitExcess?: number;
  remainingCommission?: number;
  /** False when the deal qualifies for no commission template, so a shortfall is not an error. */
  requiresFullAllocation?: boolean;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function ColumnSubtotal({
  label,
  amount,
  totalCommission,
  tone,
}: {
  label: string;
  amount: number;
  totalCommission: number;
  tone: 'agent' | 'entity';
}) {
  const share = totalCommission > 0 ? amount / totalCommission : 0;
  const isAgent = tone === 'agent';

  return (
    <div
      className={`mt-auto flex items-center justify-between gap-3 border-t pt-3 ${
        isAgent ? 'border-emerald-500/30' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <span
        className={`text-xs font-bold ${
          isAgent ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {totalCommission > 0 ? formatPercentRate(share) : '—'}
        </span>
        <span
          className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
            isAgent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
          }`}
        >
          {formatCurrency(amount)}
        </span>
      </div>
    </div>
  );
}

function PaymentShareCard({
  name,
  amount,
  totalCommission,
  kind,
  isPrimary = false,
  isTeamLead = false,
}: {
  name: string;
  amount: number;
  totalCommission: number;
  kind: 'agent' | 'entity';
  isPrimary?: boolean;
  isTeamLead?: boolean;
}) {
  const share = totalCommission > 0 ? amount / totalCommission : 0;
  const fill = Math.min(100, Math.max(0, share * 100));
  const isAgent = kind === 'agent';
  const Icon = isAgent ? UserRound : Building2;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-4 py-3 ${
        isAgent
          ? 'border-emerald-500/30 bg-slate-50 dark:bg-slate-900'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 ${
          isAgent ? 'bg-emerald-500/15 dark:bg-emerald-400/15' : 'bg-slate-300/70 dark:bg-slate-600/45'
        }`}
        style={{ width: `${fill}%` }}
        aria-hidden
      />
      <div className="relative flex items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${isAgent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className={`min-w-0 truncate text-sm ${isAgent ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
          {name}
        </span>
        {isPrimary && (
          <span className="shrink-0 rounded-full border border-brand-500/30 bg-brand-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-brand-800 dark:text-brand-300">
            Primary
          </span>
        )}
        {isTeamLead && (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800 dark:text-amber-300">
            Lead
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
          {totalCommission > 0 ? formatPercentRate(share) : '—'}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap ${isAgent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
          {formatCurrency(amount)}
        </span>
      </div>
    </div>
  );
}

export function FinalDisbursements({
  agentDisbursements,
  entityDisbursements,
  totalCommission,
  agentSplitTotal = 0,
  agentSplitExcess = 0,
  remainingCommission = 0,
  requiresFullAllocation = true,
}: FinalDisbursementsProps) {
  const agentTotal = agentDisbursements.reduce((sum, agent) => sum + agent.amount, 0);
  const entityTotal = entityDisbursements.reduce((sum, [, amount]) => sum + amount, 0);
  const totalPayments = roundCurrency(agentTotal + entityTotal);
  const paymentsShare = totalCommission > 0 ? totalPayments / totalCommission : 0;
  const paymentsExceedCommission = totalPayments > totalCommission + 0.009;
  const unallocatedCommission = roundCurrency(totalCommission - totalPayments);
  // Only a deal that qualifies for a commission template has to allocate the whole commission.
  const paymentsShortOfCommission = requiresFullAllocation && totalCommission > 0.009 && unallocatedCommission > 0.009;
  const paymentsOffCommission = paymentsExceedCommission || paymentsShortOfCommission;
  const showSplitWarning = agentSplitExcess > 0.009;

  return (
    <section id="disbursements" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden scroll-mt-[calc(var(--app-nav-offset,4rem)+var(--txn-header-height)+0.75rem)] transition-colors">
      <div
        className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <SectionIcon name="disbursements" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Payments Breakdown</h2>
        </div>

      </div>

      {showSplitWarning && (
        <div className="px-6 py-5">
          <AgentSplitExcessNotice
            total={agentSplitTotal}
            remaining={remainingCommission}
            excess={agentSplitExcess}
          />
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 px-6 pb-6 md:grid-cols-2 md:gap-0 ${showSplitWarning ? 'pt-0' : 'pt-6'}`}>
        <div className="flex h-full flex-col gap-3 md:pr-6">
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
            Payments to Agents
          </span>

          {agentDisbursements.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No agent payments.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {agentDisbursements.map((agent) => (
                <PaymentShareCard
                  key={agent.name}
                  name={agent.name}
                  amount={agent.amount}
                  totalCommission={totalCommission}
                  kind="agent"
                  isPrimary={agent.isPrimary}
                  isTeamLead={agent.isTeamLead}
                />
              ))}
            </div>
          )}

          <ColumnSubtotal
            label="Total to Agents"
            amount={agentTotal}
            totalCommission={totalCommission}
            tone="agent"
          />
        </div>

        <div className="flex h-full flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-700 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
            Payments to Entities
          </span>

          {entityDisbursements.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No entity payments.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {entityDisbursements.map(([entity, amount]) => (
                <PaymentShareCard
                  key={entity}
                  name={entity}
                  amount={amount}
                  totalCommission={totalCommission}
                  kind="entity"
                />
              ))}
            </div>
          )}

          <ColumnSubtotal
            label="Total to Entities"
            amount={entityTotal}
            totalCommission={totalCommission}
            tone="entity"
          />
        </div>
      </div>

      {paymentsShortOfCommission && (
        <div className="px-6 pb-4">
          <p
            role="alert"
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300"
          >
            Total Payments are {formatCurrency(totalPayments)}, which leaves {formatCurrency(unallocatedCommission)} of the {formatCurrency(totalCommission)} commission unallocated. This transaction cannot be saved until the entire commission is allocated among agents and entities.
          </p>
        </div>
      )}

      <div className={`flex items-center justify-between border-t px-6 py-4 ${
        paymentsOffCommission
          ? 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/40'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
      }`}>
        <span className={`text-lg font-semibold ${paymentsOffCommission ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>
          Total Payments
        </span>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${paymentsOffCommission ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {totalCommission > 0 ? formatPercentRate(paymentsShare) : '—'}
          </span>
          <span className={`text-lg font-semibold tabular-nums whitespace-nowrap ${paymentsOffCommission ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>
            {formatCurrency(totalPayments)}
          </span>
        </div>
      </div>
    </section>
  );
}
