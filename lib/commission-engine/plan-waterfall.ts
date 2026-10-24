/**
 * Commission Plans inside a deal's waterfall. The template (or the saved lines) sets the splits, team caps,
 * bonuses and paid-by credits; the plan step then works out each agent's plan lines from the split they ended
 * with and puts them first among that agent's Level 1 post-splits, after any paid-by credit. Everything after
 * (payouts, payments, what saving writes) is the waterfall's as before.
 */
import { computePlanDeal, type PlanAgentInput, type PlanDealResult, type PlanHistoryLine, type PlanSide } from './plans';
import type { AgentConfig, DynamicRule, WaterfallState } from './model';
import type { WaterfallResult } from './waterfall';

/** What the plan step needs about the deal, worked out by the caller (the deal page, or the server later). */
export interface DealPlanContext {
  /**
   * Plans calculate this deal: the client switched them on, the deal's Cap Date is on or after the start date,
   * and the deal is not in the client's FINISHED view. When false the saved lines stand untouched.
   */
  active: boolean;
  capDate: string;
  savedAt?: string | null;
  /** A typed Fee Share %. Without one, feeShareDefault works it out from the deal. */
  feeSharePercent?: number | null;
  /**
   * The default Fee Share: 50% for a double end booked as one transaction (doubleEnd), then reduced by the share of
   * Total Commission paid off the top to these brokerage-agent entities (an External eXp Agent's referral).
   */
  feeShareDefault?: { doubleEnd: boolean; brokerageAgentEntities: string[] };
  waivedLines?: string[];
  /** Each agent's plan and plan fields, by agent id; an agent with a split and no entry has no plan. */
  agents: Record<string, Omit<PlanAgentInput, 'id' | 'name' | 'splitPercent' | 'overrides' | 'afterPlan'>>;
  /** Plan lines saved on other deals. */
  history: PlanHistoryLine[];
}

export interface DealPlanStep {
  /** The waterfall with this deal's plan lines in place of any earlier ones. */
  waterfall: WaterfallState;
  plans: PlanDealResult;
  /** Why the plan lines cannot be saved yet: an agent without a plan or without Cap Year Start. */
  problems: string[];
}

const isPlanRule = (rule: DynamicRule) => Boolean(rule.planLineKey);

function withoutPlanRules(rules: Record<string, DynamicRule[]>): Record<string, DynamicRule[]> {
  return Object.fromEntries(Object.entries(rules).map(([name, list]) => [name, list.filter((rule) => !isPlanRule(rule))]));
}

/** Plan lines typed by hand on the deal, by agent name and line key: they win over the plan. */
function typedPlanLines(state: WaterfallState): Record<string, Record<string, number>> {
  const typed: Record<string, Record<string, number>> = {};
  for (const rules of [state.postSplitRulesByAgent, state.postSplit2RulesByAgent]) {
    for (const [name, list] of Object.entries(rules)) {
      for (const rule of list) {
        if (rule.planLineKey && rule.planTyped && rule.type === 'AMOUNT') typed[name] = { ...(typed[name] || {}), [rule.planLineKey]: rule.value };
      }
    }
  }
  return typed;
}

/** The waterfall without plan lines, for the first pass that sets every split. */
export function waterfallWithoutPlans(state: WaterfallState): WaterfallState {
  return {
    ...state,
    postSplitRulesByAgent: withoutPlanRules(state.postSplitRulesByAgent),
    postSplit2RulesByAgent: withoutPlanRules(state.postSplit2RulesByAgent),
  };
}

/** The typed Fee Share, or the default worked out from the first pass's off-the-top and pre-split lines. */
export function feeShareFor(context: Pick<DealPlanContext, 'feeSharePercent' | 'feeShareDefault'>, first: WaterfallResult): number {
  if (context.feeSharePercent !== null && context.feeSharePercent !== undefined && Number.isFinite(context.feeSharePercent)) return context.feeSharePercent;
  const fallback = context.feeShareDefault;
  if (!fallback) return 100;
  const names = new Set(fallback.brokerageAgentEntities.map((name) => name.trim().toLowerCase()));
  const paid = [...(first.offTheTopItems || []), ...(first.preSplitItems || [])]
    .filter((item: { entity?: string }) => names.has(String(item.entity || '').trim().toLowerCase()))
    .reduce((sum: number, item: { amount?: number }) => sum + (Number(item.amount) || 0), 0);
  const total = Number(first.totalCommission) || 0;
  const share = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  return Number(((fallback.doubleEnd ? 50 : 100) * (1 - share)).toFixed(6));
}

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Works out the plan lines from a first waterfall pass (the splits after team caps and bonuses) and returns the
 * waterfall to compute again with them in place.
 */
export function applyPlansToWaterfall(state: WaterfallState, first: WaterfallResult, context: DealPlanContext, dealId: string): DealPlanStep {
  const typed = typedPlanLines(state);
  const base = waterfallWithoutPlans(state);
  const pool = Number(first.commissionAfterPreSplit) || 0;
  const idle = new Set(first.idleAgentIds || []);
  const problems: string[] = [];
  const sides: Record<string, PlanSide> = {};
  const agents: PlanAgentInput[] = [];

  for (const split of first.agentSplitItems.filter(Boolean)) {
    const agent: AgentConfig | undefined = state.agents.find((item) => item.id === split.agentId);
    if (!agent || idle.has(agent.id)) continue;
    const amount = Number(split.amount) || 0;
    const planned = context.agents[agent.id];
    if (!planned) {
      if (amount > 0) problems.push(`${agent.name} has no Commission Plan. Assign one on Agents.`);
      continue;
    }
    const bonusNet = agent.bonusNet || 0;
    const credits = first.postSplitItems
      .filter((item: { agentId: string; beforePlan?: boolean }) => item.agentId === agent.id && item.beforePlan)
      .reduce((sum: number, item: { amount: number }) => sum + (Number(item.amount) || 0), 0);
    const beforeBonuses = amount - bonusNet;
    const notes = [`Split from the waterfall: ${money(amount)} of ${money(pool)}.`];
    if (bonusNet) notes.push(`Bonuses on this deal: ${bonusNet > 0 ? '+' : '−'}${money(Math.abs(bonusNet))}; fees are shared by the ${money(beforeBonuses)} split without them.`);
    if (credits) notes.push(`Credits paid from this split before the plan: ${money(credits)}.`);
    sides[agent.id] = { side: beforeBonuses - credits, sideAfterBonuses: amount - credits, notes };
    agents.push({
      ...planned,
      id: agent.id,
      name: agent.name,
      splitPercent: pool > 0 ? (beforeBonuses / pool) * 100 : 0,
      overrides: typed[agent.name] || {},
    });
  }

  const plans = computePlanDeal(
      {
        id: dealId,
        gci: pool,
        capDate: context.capDate,
        savedAt: context.savedAt ?? null,
        feeSharePercent: feeShareFor(context, first),
        waivedLines: context.waivedLines ?? [],
        agents,
        sides,
      },
      context.history,
    );
  problems.push(...plans.warnings.map((warning) => warning.message));

  // Plan lines go first among the agent's post-splits at their level, after the credits that come off before the plan.
  // Level 1 lines join the first map, Level 2+ lines (eXp's stock) the second, as the screens show the two levels.
  const level1 = { ...base.postSplitRulesByAgent };
  const level2 = { ...base.postSplit2RulesByAgent };
  for (const agent of plans.agents) {
    const lines: DynamicRule[] = agent.lines.map((line) => ({
      id: `plan_${agent.agentId}_${line.key}`,
      name: line.name,
      entity: line.payee,
      note: '',
      type: 'AMOUNT',
      value: line.amount,
      planLineKey: line.key,
      // The plan stage (stages.ts), at the line's level in the plan: eXp's stock is Level 2, from the net after Level 1.
      stage: 'PLAN',
      level: line.level,
      ...(agent.planVersionId ? { planVersionId: agent.planVersionId } : {}),
      ...(line.edited ? { planTyped: true } : {}),
      ...(line.waived ? { planWaived: true } : {}),
    }));
    const existing = level1[agent.name] || [];
    const credits = existing.filter((rule) => rule.beforePlan);
    level1[agent.name] = [...credits, ...lines.filter((line) => (line.level ?? 1) === 1), ...existing.filter((rule) => !rule.beforePlan)];
    const later = lines.filter((line) => (line.level ?? 1) > 1);
    if (later.length) level2[agent.name] = [...later, ...(level2[agent.name] || [])];
  }

  // A plan line and another post-split paying the same entity would charge the agent twice: the template still has
  // a rule the plan now covers. Save waits until that rule is removed.
  for (const agent of plans.agents) {
    const own = [...(base.postSplitRulesByAgent[agent.name] || []), ...(base.postSplit2RulesByAgent[agent.name] || [])]
      .filter((rule) => !rule.beforePlan)
      .map((rule) => rule.entity.trim().toLowerCase());
    const twice = [...new Set(agent.lines.map((line) => line.payee).filter((payee) => own.includes(payee.trim().toLowerCase())))];
    if (twice.length) {
      const names = listOf(twice);
      problems.push(`${agent.name} pays ${names} twice: once by the plan and once by a template or typed line. Remove the template's ${names} ${twice.length === 1 ? 'rule' : 'rules'} before saving.`);
    }
  }

  return { waterfall: { ...base, postSplitRulesByAgent: level1, postSplit2RulesByAgent: level2 }, plans, problems };
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A plan line whose saved amount differs from what the plans calculate now. */
export interface PlanLineChange {
  agent: string;
  line: string;
  saved: number | null;
  now: number | null;
}

/**
 * What recalculating with plans would change on a deal saved with plans: each agent's saved plan lines (by line key)
 * against the plan step's lines. Typed lines are kept by the plan step, so they never show as changes.
 */
export function planLineChanges(saved: WaterfallState, recalculated: DealPlanStep): PlanLineChange[] {
  const changes: PlanLineChange[] = [];
  const savedLines = new Map<string, { agent: string; line: string; amount: number }>();
  // Plan lines at any level: eXp's stock is saved as a Level 2 line.
  for (const map of [saved.postSplitRulesByAgent, saved.postSplit2RulesByAgent]) {
    for (const [agent, rules] of Object.entries(map)) {
      for (const rule of rules) if (rule.planLineKey && rule.type === 'AMOUNT') savedLines.set(`${agent}|${rule.planLineKey}`, { agent, line: rule.name || '', amount: rule.value });
    }
  }
  const seen = new Set<string>();
  for (const agent of recalculated.plans.agents) {
    for (const line of agent.lines) {
      const key = `${agent.name}|${line.key}`;
      seen.add(key);
      const before = savedLines.get(key);
      if (!before) {
        if (line.amount !== 0) changes.push({ agent: agent.name, line: line.name, saved: null, now: line.amount });
      } else if (Math.abs(before.amount - line.amount) >= 0.005) {
        changes.push({ agent: agent.name, line: line.name, saved: before.amount, now: line.amount });
      }
    }
  }
  for (const [key, before] of savedLines) {
    if (!seen.has(key) && before.amount !== 0) changes.push({ agent: before.agent, line: before.line, saved: before.amount, now: null });
  }
  return changes;
}
