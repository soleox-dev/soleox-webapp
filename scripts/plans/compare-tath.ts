/**
 * Commission Plans phase 4: compares what TATH's 116-rule template calculates on each golden deal with what the eXp
 * Commission Plans calculate for the same splits, line by line. Nothing is written to the database.
 *
 *   PLAN_COMPARE_OUT=report.json npx vitest run tests/plans/tath-compare.test.ts
 *
 * Each agent's proposed plan comes from today's cap columns (design: Migration step 1). Typed overrides on the
 * template submission stay typed in the plan, so a difference is always the formulas disagreeing.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computePlanDeal,
  loadPlanPresets,
  type PlanAgentInput,
  type PlanHistoryLine,
  type PlanSide,
} from '@/lib/commission-engine';
import { loadClient, loadDeal, dealIds, EXPECTED_ROOT } from '@/tests/engine/fixtures';

const CLIENT = 'TATH';
const presets = loadPlanPresets();

/** TATH entity names to plan line keys. */
const LINE_BY_ENTITY: Record<string, string> = {
  'Company Comm': 'company_dollar',
  'Flat Cap Fee': 'post_cap_fee',
  Liability: 'risk_management',
  'Broker Nm620': 'broker_review',
  Stock: 'stock',
};
const SLOTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'tl'] as const;
const slotAgentParam = (slot: (typeof SLOTS)[number]) => (slot === 'tl' ? 'team_lead' : `agent_${slot.slice(1)}`);
const OVERRIDES: Record<string, string> = {
  company_dollar: 'company_comm_cap_override',
  post_cap_fee: 'flat_cap_fee_override',
  risk_management: 'liability_cap_override',
};

type Row = Record<string, unknown>;
const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
const money = (value: unknown): number | null => {
  const raw = text(value).replace(/[$,\s]/g, '');
  if (!raw) return null;
  const parsed = Number(raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const attr = (agent: Row, key: string) => {
  const custom = (agent.custom_attributes as Row | undefined) || {};
  return custom[key] ?? agent[key];
};

export function proposedPlanKey(agent: Row): string {
  const cap = money(attr(agent, 'custom_company_comm_cap'));
  const feeCap = money(attr(agent, 'custom_exp_250_fee_cap'));
  if (cap === 16000) return agent.is_team_lead || !feeCap ? 'exp-16000-team-lead' : 'exp-16000';
  if (cap === 8000) return 'exp-8000';
  return 'exp-4000';
}

export type LineDiff = {
  dealId: string;
  closingDate: string;
  agent: string;
  plan: string;
  line: string;
  template: number;
  planAmount: number;
  difference: number;
  typed: boolean;
  explanation: string;
};

export function compareTath() {
  const client = loadClient(CLIENT) as unknown as { agents: Row[]; ledger: unknown[][] };
  const agentsByName = new Map(client.agents.map((agent) => [text(agent.agent_name), agent]));
  const entityKey: Record<string, string> = {
    ENT_5A0A184950C5: 'company_dollar',
    ENT_A62BC6AB3907: 'post_cap_fee',
    ENT_D3EEBD4798E4: 'risk_management',
    ENT_CD8F0DC899EC: 'broker_review',
    ENT_9A537FFD60AC: 'stock',
  };
  // Saved eXp lines of every TATH deal, as the template's SUMIFS read them: Closed and Pending deals only.
  const ledger: PlanHistoryLine[] = client.ledger.flatMap((row) => {
    const [amount, agentId, entityId, , dealId, closingDate, status] = row as [number, string, string, string, string, string, string];
    const lineKey = entityKey[entityId];
    if (!lineKey || !closingDate || (status !== 'Closed' && status !== 'Pending')) return [];
    return [{ dealId, agentId, capDate: closingDate.slice(0, 10), savedAt: null, lineKey, amount: Number(amount) || 0 }];
  });

  const diffs: LineDiff[] = [];
  /** Deals the template does not run on (no submission, or not eligible), so there is nothing to compare. */
  const skipped: string[] = [];
  const deals: { dealId: string; closingDate: string; agents: { agent: string; plan: string; lines: Record<string, { template: number; plan: number }> }[]; warnings: string[] }[] = [];

  for (const dealId of dealIds(CLIENT)) {
    const fixture = loadDeal(CLIENT, dealId) as unknown as { deal: Row; submissions: Row[] };
    const expected = JSON.parse(fs.readFileSync(path.join(EXPECTED_ROOT, CLIENT, `${dealId}.json`), 'utf8'));
    // The template's own calculation (the popup's resubmit), not the saved lines: some saved deals carry lines
    // from earlier imports or template versions.
    const waterfall = expected.popupResubmit?.waterfall;
    if (!waterfall) {
      skipped.push(dealId);
      continue;
    }
    const params = ((fixture.submissions[0]?.submitted_parameters || {}) as Record<string, unknown>);
    const deal = fixture.deal;
    const closingDate = text(deal.closing_date).slice(0, 10);
    const pool = Number(waterfall.commissionAfterPreSplit);

    // Which template slot each agent is in, for adjustments, overrides and stock options.
    const slotOf = new Map<string, (typeof SLOTS)[number]>();
    SLOTS.forEach((slot) => {
      const name = text(params[slotAgentParam(slot)]);
      if (name && !slotOf.has(name)) slotOf.set(name, slot);
    });
    const adjustments = SLOTS.filter((slot) => slot !== 'tl').reduce((sum, slot) => sum + (money(params[`${slot}_adj_amount`]) || 0), 0);

    const templateLines = new Map<string, number>();
    const afterPlan = new Map<string, { name: string; amount: number }[]>();
    for (const item of [...waterfall.postSplitItems, ...waterfall.postSplit2Items] as Row[]) {
      const lineKey = LINE_BY_ENTITY[text(item.entity)];
      const amount = Number(item.amount) || 0;
      if (lineKey) templateLines.set(`${item.agentName}|${lineKey}`, (templateLines.get(`${item.agentName}|${lineKey}`) || 0) + amount);
      else afterPlan.set(text(item.agentName), [...(afterPlan.get(text(item.agentName)) || []), { name: text(item.entity), amount }]);
    }

    const sides: Record<string, PlanSide> = {};
    const agents: PlanAgentInput[] = [];
    const warnings: string[] = [];
    for (const split of waterfall.agentSplitItems as Row[]) {
      const name = text(split.agentName);
      const row = agentsByName.get(name);
      if (!row) {
        warnings.push(`${name} is not in the agent list.`);
        continue;
      }
      const slot = slotOf.get(name);
      const amount = Number(split.amount) || 0;
      // TATH's bonuses are the slot adjustments, paid by the team lead's remainder.
      const bonus = slot && slot !== 'tl' ? money(params[`${slot}_adj_amount`]) || 0 : slot === 'tl' ? -adjustments : 0;
      const beforeBonuses = amount - bonus;
      sides[name] = { side: beforeBonuses, sideAfterBonuses: amount, notes: bonus ? [`Bonus (template adjustment): ${bonus > 0 ? '+' : ''}${bonus.toFixed(2)}.`] : [] };
      const overrides: Record<string, number> = {};
      if (slot) {
        for (const [lineKey, suffix] of Object.entries(OVERRIDES)) {
          const typed = money(params[`${slot}_${suffix}`]);
          if (typed !== null) overrides[lineKey] = typed;
        }
      }
      const stockOption = slot ? text(params[`${slot}_stock_option`]) : '';
      const stock = stockOption === 'Yes' || (stockOption !== 'No' && money(attr(row, 'custom_stock')) !== null);
      const planKey = proposedPlanKey(row);
      agents.push({
        id: name,
        name,
        splitPercent: pool > 0 ? (beforeBonuses / pool) * 100 : 0,
        plan: presets[planKey],
        roles: row.is_team_lead ? ['team_lead'] : [],
        capYearStart: text(attr(row, 'custom_exp_cap_date')).slice(0, 10) || null,
        optedIn: stock ? ['stock'] : [],
        overrides,
        afterPlan: afterPlan.get(name) || [],
      });
    }

    const idByName = new Map(client.agents.map((agent) => [text(agent.agent_name), text(agent.id)]));
    const history = ledger
      .filter((line) => line.dealId !== dealId)
      .map((line) => ({ ...line, agentId: [...idByName].find(([, id]) => id === line.agentId)?.[0] || line.agentId }));
    const feeShare = money(params.broker_units_percent);
    const result = computePlanDeal(
      {
        id: dealId,
        gci: pool,
        capDate: closingDate,
        savedAt: text(deal.created_at) || null,
        feeSharePercent: feeShare !== null ? feeShare * 100 : 100,
        // TATH's "Broker Nm620 fee waived" is the deal waiving broker review.
        waivedLines: text(params.broker_nm620_fee_waived) === 'Yes' ? ['broker_review'] : [],
        agents,
        sides,
      },
      history,
    );
    warnings.push(...result.warnings.map((warning) => warning.message));

    const summary = { dealId, closingDate, agents: [] as { agent: string; plan: string; lines: Record<string, { template: number; plan: number }> }[], warnings };
    for (const agent of result.agents) {
      const input = agents.find((item) => item.id === agent.agentId)!;
      const lines: Record<string, { template: number; plan: number }> = {};
      for (const lineKey of Object.values(LINE_BY_ENTITY)) {
        const template = Math.round((templateLines.get(`${agent.name}|${lineKey}`) || 0) * 100) / 100;
        const planLine = agent.lines.find((line) => line.key === lineKey);
        const planAmount = planLine?.amount ?? 0;
        lines[lineKey] = { template, plan: planAmount };
        if (Math.abs(template - planAmount) >= 0.005) {
          diffs.push({
            dealId,
            closingDate,
            agent: agent.name,
            plan: input.plan.name,
            line: planLine?.name || lineKey,
            template,
            planAmount,
            difference: Math.round((planAmount - template) * 100) / 100,
            typed: Boolean(planLine?.edited),
            explanation: planLine?.explanation || agent.explanation.join(' '),
          });
        }
      }
      summary.agents.push({ agent: agent.name, plan: input.plan.name, lines });
    }
    deals.push(summary);
  }
  return { deals, diffs, skipped };
}
