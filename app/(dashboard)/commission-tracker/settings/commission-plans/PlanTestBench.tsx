'use client';

import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { computePlanDeal, validatePlan, type CommissionPlan, type PlanDealResult } from '@/lib/commission-engine';
import { NumberField, TextField, money } from './plan-inputs';

type BenchAgent = {
  id: string;
  name: string;
  splitPercent: number;
  teamLead: boolean;
  /** Paid this cap year before the deal, by line key. */
  paid: Record<string, number>;
  optedIn: boolean;
};

const CAP_YEAR_START = '2026-01-01';
const CAP_DATE = '2026-06-15';

let nextAgent = 3;
const benchAgent = (name: string, splitPercent: number): BenchAgent => ({ id: `bench_${nextAgent++}`, name, splitPercent, teamLead: false, paid: {}, optedIn: false });

/** Lines that keep a yearly total, so the bench asks what was already paid on them. */
function yearlyLines(plan: CommissionPlan) {
  return plan.lines.filter((line) => {
    if (line.type === 'capped_percent') return line.capAmount !== null && line.capAmount !== undefined;
    if (line.type === 'per_deal_fee') return line.yearlyLimit !== undefined || Boolean(line.tiers?.length);
    if (line.type === 'formula') return line.yearlyLimit !== undefined;
    return false;
  });
}

/**
 * Runs the plan as it stands in the editor on a sample deal, so every line and its explanation can be checked
 * before the plan is saved. Nothing here is stored.
 */
export function PlanTestBench({ plan }: { plan: CommissionPlan }) {
  const [gci, setGci] = useState(10000);
  const [feeShare, setFeeShare] = useState(100);
  const [agents, setAgents] = useState<BenchAgent[]>([benchAgent('Agent A', 80), benchAgent('Agent B', 20)]);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const yearly = yearlyLines(plan);
  const hasOptIn = plan.lines.some((line) => line.type === 'percent_of_net' && line.optIn);

  const run = useMemo((): { result?: PlanDealResult; error?: string } => {
    const problems = validatePlan(plan);
    if (problems.length) return { error: problems[0] };
    try {
      return {
        result: computePlanDeal({
          id: 'TEST_BENCH',
          gci,
          capDate: CAP_DATE,
          feeSharePercent: feeShare,
          agents: agents.map((agent) => ({
            id: agent.id,
            name: agent.name || 'Agent',
            splitPercent: agent.splitPercent,
            plan,
            roles: agent.teamLead ? ['team_lead'] : [],
            capYearStart: CAP_YEAR_START,
            startingBalances: { capYearOf: CAP_YEAR_START, amounts: agent.paid },
            optedIn: agent.optedIn ? plan.lines.map((line) => line.key) : [],
          })),
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The plan could not be calculated.' };
    }
  }, [plan, gci, feeShare, agents]);

  const setAgent = (id: string, patch: Partial<BenchAgent>) => setAgents((current) => current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)));
  const splitTotal = agents.reduce((sum, agent) => sum + agent.splitPercent, 0);
  const result = run.result;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <NumberField label="GCI" prefix="$" value={gci} onChange={(value) => setGci(value ?? 0)} />
        <NumberField label="Fee Share" suffix="%" value={feeShare} onChange={(value) => setFeeShare(value ?? 100)} />
      </div>

      <div className="space-y-2">
        {agents.map((agent) => (
          <div key={agent.id} className="grid grid-cols-2 items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-6 dark:bg-slate-900/50">
            <TextField label="Agent" value={agent.name} onChange={(name) => setAgent(agent.id, { name })} />
            <NumberField label="Split" suffix="%" value={agent.splitPercent} onChange={(value) => setAgent(agent.id, { splitPercent: value ?? 0 })} />
            {yearly.map((line) => (
              <NumberField
                key={line.key}
                label={`${line.name} paid this year`}
                prefix="$"
                value={agent.paid[line.key] ?? 0}
                onChange={(value) => setAgent(agent.id, { paid: { ...agent.paid, [line.key]: value ?? 0 } })}
              />
            ))}
            <div className="flex items-center gap-3 pb-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={agent.teamLead} onChange={(event) => setAgent(agent.id, { teamLead: event.target.checked })} />
                Team lead
              </label>
              {hasOptIn && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={agent.optedIn} onChange={(event) => setAgent(agent.id, { optedIn: event.target.checked })} />
                  Opted in
                </label>
              )}
              <button type="button" disabled={agents.length === 1} onClick={() => setAgents((current) => current.filter((item) => item.id !== agent.id))} className="ml-auto cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 disabled:cursor-default disabled:opacity-30" aria-label={`Remove ${agent.name}`} title="Remove agent">
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setAgents((current) => [...current, benchAgent(`Agent ${String.fromCharCode(64 + current.length + 1)}`, 0)])} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-brand-500/15 dark:hover:text-brand-400">
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Agent
          </button>
          {Math.abs(splitTotal - 100) > 0.0001 && <span className="text-2xs font-semibold text-amber-700 dark:text-amber-400">Splits add up to {Number(splitTotal.toFixed(4))}%.</span>}
        </div>
      </div>

      {run.error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{run.error}</p>}

      {result && (
        <div className="report-table overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-2xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-4">Line</th>
                {result.agents.map((agent) => (
                  <th key={agent.agentId} className="py-2 pr-4 text-right">{agent.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-slate-100 dark:border-slate-700/60">
                <td className="py-1.5 pr-4 text-slate-500">Side after bonuses</td>
                {result.agents.map((agent) => (
                  <td key={agent.agentId} className="py-1.5 pr-4 text-right">{money(agent.sideAfterBonuses)}</td>
                ))}
              </tr>
              {plan.lines.map((line) => (
                <tr key={line.key} className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-1.5 pr-4 font-semibold text-slate-800 dark:text-slate-200">{line.name}</td>
                  {result.agents.map((agent) => {
                    const item = agent.lines.find((entry) => entry.key === line.key);
                    return (
                      <td key={agent.agentId} className="py-1.5 pr-4 text-right" title={item?.explanation}>
                        {item ? `−${money(item.amount)}` : '—'}
                        {item?.postCapFraction !== undefined && item.postCapFraction > 0 && (
                          <span className="ml-1 text-2xs text-slate-400">{Number((item.postCapFraction * 100).toFixed(2))}% post-cap</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="font-bold text-slate-900 dark:text-white">
                <td className="py-2 pr-4">Net</td>
                {result.agents.map((agent) => (
                  <td key={agent.agentId} className="py-2 pr-4 text-right">{money(agent.netCash)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-slate-500 dark:text-slate-400">
            {Object.entries(result.payeeTotals).map(([payee, amount]) => (
              <span key={payee}>
                {payee}: <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{money(amount)}</span>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.agents.map((agent) => (
              <button key={agent.agentId} type="button" onClick={() => setOpenAgent(openAgent === agent.agentId ? null : agent.agentId)} className={`cursor-pointer rounded-md px-2 py-1 text-2xs font-semibold transition ${openAgent === agent.agentId ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                How {agent.name}&apos;s lines were worked out
              </button>
            ))}
          </div>
          {openAgent && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
              {result.agents.find((agent) => agent.agentId === openAgent)?.explanation.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
