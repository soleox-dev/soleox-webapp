/**
 * Commission Plan caps for the Caps report (Owner Reports). Each capped plan line (a capped percentage, or a per-deal
 * fee with tiers or a yearly limit) is a cap; lines with the same name on different plans share one entry, and each
 * agent keeps their own plan's amount. The goal, the cap year and what counts follow the plan engine: the agent's
 * Cap Amounts override, their Cap Year Start, saved plan lines (and earlier lines to the entities Plan Settings
 * maps), and a starting balance that belongs to that cap year. Pure: the caller loads /api/owner-reports/plan-caps.
 */
import {
  capYearFor,
  planAgentFromRow,
  planInForce,
  planLineCap,
  type CommissionPlanRow,
  type CommissionPlanVersionRow,
  type PlanAgentRow,
  type PlanHistoryLine,
  type PlanSettingsRow,
} from '@/lib/commission-engine';
import { dateKey, type ReportDeal } from '@/lib/owner-reports';
import type { CapDealLine, CapStanding, TeamCapDefinition } from '@/lib/team-cap-report';

export type PlanCapData = {
  settings: PlanSettingsRow;
  plans: CommissionPlanRow[];
  versions: CommissionPlanVersionRow[];
  agents: PlanAgentRow[];
  history: PlanHistoryLine[];
};

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dayBefore(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dealDay(deal: ReportDeal): string | null {
  if (deal.closingDate) return dateKey(deal.closingDate);
  if (deal.acceptanceDate) return dateKey(deal.acceptanceDate);
  return null;
}

function dealLine(deal: ReportDeal, names: Map<string, string>, amount: number, paidOnly = false): CapDealLine {
  return {
    transactionId: deal.id,
    status: deal.status,
    primaryAgent: names.get(deal.agentId) || deal.agentId || '—',
    side: deal.side,
    address: deal.address,
    closingDate: deal.closingDate ? dateKey(deal.closingDate) : null,
    salesPrice: deal.salesPrice,
    leadSource: deal.leadSource,
    amount,
    cumulative: 0,
    pending: deal.status.trim().toLowerCase() === 'pending',
    ...(paidOnly ? { paidOnly: true } : {}),
  };
}

export function planCapSections(args: {
  data: PlanCapData;
  /** The report's deals after its filters, by id; plan lines on other deals do not count here. */
  deals: Map<string, ReportDeal>;
  names: Map<string, string>;
  /** Today, or the same day last year for the previous cap year. */
  asOf: string;
  /** Transaction ids where each agent received a payment (Show All Paid Transactions). */
  paid?: Map<string, Set<string>>;
}): Array<{ cap: TeamCapDefinition; rows: CapStanding[]; count: number }> {
  const { data, deals, names, asOf, paid } = args;
  const groups = new Map<string, { cap: TeamCapDefinition; rows: CapStanding[] }>();

  for (const agent of data.agents) {
    const planRow = data.plans.find((plan) => plan.id === agent.commission_plan_id);
    if (!planRow) continue;
    let plan;
    try {
      plan = planInForce(planRow, data.versions, asOf);
    } catch {
      // No version of the plan in force on that day yet.
      continue;
    }
    const input = planAgentFromRow(agent, { plan, settings: data.settings, splitPercent: 100 });
    const year = input.capYearStart ? capYearFor(asOf, input.capYearStart) : null;
    const agentName = names.get(agent.id) || agent.agent_name;

    for (const line of plan.lines) {
      const planCap = planLineCap(line);
      if (planCap === undefined) continue;
      const goal = line.type === 'capped_percent' ? input.capAmounts?.[line.key] ?? planCap : planCap;
      // A line with no cap has nothing to fill.
      if (goal == null || goal <= 0) continue;

      const name = line.name.trim();
      const groupKey = name.toLowerCase();
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          cap: {
            id: `plan:${groupKey}`,
            name,
            enabled: true,
            kind: 'plan',
            splitPercentFieldKey: null,
            capAmountFieldKey: null,
            // Plan cap years run from the agent field Plan Settings names as Cap Year Start.
            resetDateFieldKey: data.settings.cap_year_start_field_key || null,
            recipientAgentId: null,
            entityId: null,
            hideOverAllocations: false,
          },
          rows: [],
        };
        groups.set(groupKey, group);
      }

      const lines: CapDealLine[] = [];
      const paidLines: CapDealLine[] = [];
      if (year) {
        // A starting balance counts first, in the cap year it belongs to.
        const balances = input.startingBalances;
        const starting = balances?.amounts[line.key];
        if (balances && starting && input.capYearStart && capYearFor(balances.capYearOf, input.capYearStart).start === year.start) {
          lines.push({
            transactionId: '',
            status: 'Starting Balance',
            primaryAgent: agentName,
            side: '',
            address: 'Paid before these deals were in Soleox',
            closingDate: year.start,
            salesPrice: 0,
            leadSource: '',
            amount: cents(starting),
            cumulative: 0,
            pending: false,
          });
        }
        const byDeal = new Map<string, CapDealLine>();
        for (const row of data.history) {
          if (row.agentId !== agent.id || (row.lineKey !== line.key && row.countsTowardCap !== line.key)) continue;
          const day = row.capDate.slice(0, 10);
          if (day < year.start || day >= year.end) continue;
          const deal = deals.get(row.dealId);
          if (!deal || Math.abs(row.amount) < 0.005) continue;
          const existing = byDeal.get(deal.id);
          if (existing) existing.amount = cents(existing.amount + row.amount);
          else byDeal.set(deal.id, dealLine(deal, names, cents(row.amount)));
        }
        lines.push(...[...byDeal.values()].sort((a, b) => (a.closingDate || '').localeCompare(b.closingDate || '') || a.transactionId.localeCompare(b.transactionId)));
        paid?.get(agent.id)?.forEach((transactionId) => {
          const deal = deals.get(transactionId);
          const day = deal ? dealDay(deal) : null;
          if (!deal || byDeal.has(deal.id) || !day || day < year.start || day >= year.end) return;
          paidLines.push(dealLine(deal, names, 0, true));
        });
      }

      let running = 0;
      for (const item of lines) {
        running = cents(running + item.amount);
        item.cumulative = running;
      }
      const closed = cents(lines.filter((item) => !item.pending).reduce((sum, item) => sum + item.amount, 0));
      const pending = cents(lines.filter((item) => item.pending).reduce((sum, item) => sum + item.amount, 0));
      const total = cents(closed + pending);
      group.rows.push({
        agentId: agent.id,
        agentName,
        rank: 0,
        resetDate: input.capYearStart ?? null,
        start: year?.start ?? null,
        end: year ? dayBefore(year.end) : null,
        closed,
        pending,
        total,
        goal,
        left: cents(goal - total),
        percent: total / goal,
        lines,
        paidLines,
      });
    }
  }

  return [...groups.values()]
    .map(({ cap, rows }) => {
      rows.sort((a, b) => b.total - a.total || a.agentName.localeCompare(b.agentName));
      rows.forEach((row, index) => { row.rank = index + 1; });
      const count = rows.reduce((sum, row) => sum + row.lines.filter((item) => item.transactionId).length, 0);
      return { cap, rows, count };
    })
    .sort((a, b) => a.cap.name.localeCompare(b.cap.name));
}
