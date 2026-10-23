import { anniversaryStart } from '@/lib/agent-allocations';
import { calendarDate, moneyField } from '@/lib/team-cap-report';

export type AgentCapDefinition = {
  id: string;
  enabled: boolean;
  entityId: string;
  capAmountFieldKey: string | null;
  resetDateFieldKey: string | null;
  hideOverAllocations: boolean;
};

export type AgentCapHistoryRow = {
  agentId: string;
  entityId: string;
  amount: number;
  closingDate: string | null;
};

/** Progress for one agent against one post-split entity, before this transaction is added. */
export type AgentCapCell = {
  capAmount: number;
  prior: number;
  hideOverAllocations: boolean;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const reachedAmount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeDollars = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Reached amount and cap limit for the progress bar. A round thousand is 8K. */
export function capProgressLabel(shown: number, cap: number): { label: string; amount: string; limit: string; share: number } {
  const reached = roundCurrency(Math.max(0, shown));
  const limit = roundCurrency(Math.max(0, cap));
  const amount = `$${reachedAmount.format(reached)}`;
  const limitText = `$${compactLimit(limit)}`;
  return {
    label: `${amount} of ${limitText}`,
    amount,
    limit: limitText,
    share: limit > 0 ? reached / limit : 0,
  };
}

/** A round thousand is 8K. Anything else is the nearest dollar, such as 750. */
function compactLimit(amount: number): string {
  const dollars = Math.round(roundCurrency(amount));
  if (dollars !== 0 && dollars % 1000 === 0) return `${dollars / 1000}K`;
  return wholeDollars.format(dollars);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addYears(iso: string, years: number): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const year = Number(parts[1]) + years;
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Dollars of this entity already saved for the agent in the cap year that contains the deal. */
function priorAmount(
  history: AgentCapHistoryRow[],
  agentId: string,
  entityId: string,
  resetDate: string | null,
  dealDate: string | null,
): number {
  const start = anniversaryStart(resetDate, dealDate);
  const next = start ? addYears(start, 1) : null;
  if (!start || !next) return 0;
  return roundCurrency(history.reduce((sum, row) => {
    if (row.agentId !== agentId || row.entityId !== entityId) return sum;
    const day = calendarDate(row.closingDate);
    if (!day || day < start || day >= next) return sum;
    return sum + Math.max(0, row.amount);
  }, 0));
}

/** One cell per agent and entity. The first enabled cap for an entity wins. */
export function buildAgentCapCells(args: {
  caps: AgentCapDefinition[];
  agents: { id: string; fields: Record<string, string> }[];
  history: AgentCapHistoryRow[];
  dealDate: string | null;
}): Record<string, Record<string, AgentCapCell>> {
  const caps = args.caps.filter((cap) => cap.enabled && cap.entityId);
  const seen = new Set<string>();
  const cells: Record<string, Record<string, AgentCapCell>> = {};
  for (const cap of caps) {
    if (seen.has(cap.entityId)) continue;
    seen.add(cap.entityId);
    for (const agent of args.agents) {
      const capAmount = moneyField(agent.fields[cap.capAmountFieldKey || '']);
      if (capAmount == null || Math.abs(capAmount) < 0.005) continue;
      const resetDate = calendarDate(agent.fields[cap.resetDateFieldKey || '']);
      const cell: AgentCapCell = {
        capAmount,
        prior: priorAmount(args.history, agent.id, cap.entityId, resetDate, args.dealDate),
        hideOverAllocations: cap.hideOverAllocations,
      };
      cells[agent.id] = { ...cells[agent.id], [cap.entityId]: cell };
    }
  }
  return cells;
}

/** The line under the post-split. Hide over-allocations stops the shown total at the cap. */
export function formatAgentCapLine(cell: AgentCapCell, current: number): { label: string; amount: string; limit: string; detail: string; share: number } {
  const prior = roundCurrency(Math.max(0, cell.prior));
  const now = roundCurrency(Math.max(0, current));
  const after = roundCurrency(prior + now);
  const cap = roundCurrency(Math.max(0, cell.capAmount));
  const shown = cell.hideOverAllocations ? roundCurrency(Math.min(after, cap)) : after;
  const shownPrior = cell.hideOverAllocations ? roundCurrency(Math.min(prior, cap)) : prior;
  const progress = capProgressLabel(shown, cap);
  const detail = `Before this transaction: ${money.format(shownPrior)}\nThis transaction: ${money.format(now)}\nIncluding this transaction: ${money.format(shown)} of ${money.format(cap)}`;
  return { label: progress.label, amount: progress.amount, limit: progress.limit, detail, share: progress.share };
}
