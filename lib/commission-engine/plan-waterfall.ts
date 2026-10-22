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
  feeSharePercent?: number;
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
        feeSharePercent: context.feeSharePercent ?? 100,
        waivedLines: context.waivedLines ?? [],
        agents,
        sides,
      },
      context.history,
    );
  problems.push(...plans.warnings.map((warning) => warning.message));

  // Plan lines go first among the agent's Level 1 post-splits, after the credits that come off before the plan.
  const level1 = { ...base.postSplitRulesByAgent };
  for (const agent of plans.agents) {
    const lines: DynamicRule[] = agent.lines.map((line) => ({
      id: `plan_${agent.agentId}_${line.key}`,
      name: line.name,
      entity: line.payee,
      note: '',
      type: 'AMOUNT',
      value: line.amount,
      planLineKey: line.key,
      ...(agent.planVersionId ? { planVersionId: agent.planVersionId } : {}),
      ...(line.edited ? { planTyped: true } : {}),
      ...(line.waived ? { planWaived: true } : {}),
    }));
    const existing = level1[agent.name] || [];
    const credits = existing.filter((rule) => rule.beforePlan);
    level1[agent.name] = [...credits, ...lines, ...existing.filter((rule) => !rule.beforePlan)];
  }

  return { waterfall: { ...base, postSplitRulesByAgent: level1 }, plans, problems };
}
