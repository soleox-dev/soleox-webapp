/**
 * The stages and levels of the commission model (docs/commission-model-redesign.md, section 3). Pure functions.
 *
 * Engine order, the same on every deal:
 * 1. Off the Top: comes off the whole deal; has levels.
 * 2. Agent Splits: each agent's share, then team caps and bonuses (waterfall.ts).
 * 3. Before Plan, 4. Commission Plan, 5. After Plan: each agent's lines, in that order; each stage has levels.
 * 6. Net Payout.
 *
 * Levels: every percent in a level takes the same base. Level 1 takes the stage's starting amount; level N takes the
 * net after level N−1. Levels need not be consecutive (1 and 3 work like 1 and 2).
 */
import { roundCurrency } from './model';

/** Where a commission line sits in the engine order. */
export type Stage = 'OFF_THE_TOP' | 'AGENT_SPLIT' | 'BEFORE_PLAN' | 'PLAN' | 'AFTER_PLAN';

/** The stages that run on each agent's split, in order. */
export const AGENT_STAGES = ['BEFORE_PLAN', 'PLAN', 'AFTER_PLAN'] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

/** A deduction a level runs: a percent of the level's base, or dollars. */
export interface LeveledRule {
  id: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  /** 1 when absent. */
  level?: number;
}

/** A rule with its dollars, its level, and the base its percent was taken from. */
export type LeveledItem<R extends LeveledRule> = R & { amount: number; level: number; base: number };

export interface LevelTotals {
  level: number;
  /** What the level's percents are taken from. */
  base: number;
  deductions: number;
  /** The base less this level's deductions: the next level's base. */
  net: number;
}

export interface LevelRun<R extends LeveledRule> {
  /** In level order, list order within a level. */
  items: LeveledItem<R>[];
  levels: LevelTotals[];
  /** What is left after the last level. */
  net: number;
}

/**
 * When a level's net stops at $0 instead of going negative (multi-industry rule 4: floor only where a business rule
 * says so).
 * - each-level: an agent never pays more than they have at any level, as the post-splits always worked.
 * - end: only what is left after the last level stops at $0; the agent splits never share a negative pool, while
 *   off-the-top deductions in between may run past the total, as they always could.
 * - none: refunds and clawbacks can leave a negative net.
 */
export type LevelFloor = 'each-level' | 'end' | 'none';

export function ruleLevel(rule: { level?: number | null }): number {
  const level = Number(rule.level);
  return Number.isInteger(level) && level >= 1 ? level : 1;
}

/** Runs leveled rules from a starting amount. A level with no rules is skipped, so its base carries on. */
export function runLevels<R extends LeveledRule>(start: number, rules: R[], floor: LevelFloor): LevelRun<R> {
  const levelNumbers = [...new Set(rules.map(ruleLevel))].sort((a, b) => a - b);
  const items: LeveledItem<R>[] = [];
  const levels: LevelTotals[] = [];
  let base = roundCurrency(start);
  levelNumbers.forEach((level, index) => {
    const inLevel = rules.filter((rule) => ruleLevel(rule) === level);
    let deductions = 0;
    inLevel.forEach((rule) => {
      const amount = rule.type === 'PERCENT' ? roundCurrency(base * rule.value) : roundCurrency(rule.value);
      deductions += amount;
      items.push({ ...rule, amount, level, base });
    });
    const last = index === levelNumbers.length - 1;
    const stops = floor === 'each-level' || (floor === 'end' && last);
    const net = roundCurrency(stops ? Math.max(0, base - deductions) : base - deductions);
    levels.push({ level, base, deductions: roundCurrency(deductions), net });
    base = net;
  });
  // With no rules at all, the end floor still applies to the start.
  const net = levelNumbers.length === 0 && floor !== 'none' ? roundCurrency(Math.max(0, base)) : base;
  return { items, levels, net };
}

/** An agent line with the stage it runs in (Before Plan when absent: today's post-splits). */
export interface StagedRule extends LeveledRule {
  stage?: AgentStage | null;
}

export function ruleStage(rule: { stage?: string | null }): AgentStage {
  return (AGENT_STAGES as readonly string[]).includes(String(rule.stage)) ? (rule.stage as AgentStage) : 'BEFORE_PLAN';
}

export interface AgentStageRun<R extends StagedRule> {
  stage: AgentStage;
  /** The agent's amount when the stage starts: the split, or the net after the stage before. */
  start: number;
  run: LevelRun<R>;
}

/**
 * One agent's lines through Before Plan, Commission Plan and After Plan. Each stage starts from the net after the
 * one before (the split for Before Plan), and its levels restart at that amount. An agent never pays more than they
 * have (each-level floor). Stages with no lines are left out.
 */
export function runAgentStages<R extends StagedRule>(split: number, rules: R[]): { stages: AgentStageRun<R>[]; net: number } {
  const stages: AgentStageRun<R>[] = [];
  let amount = roundCurrency(Math.max(0, split));
  AGENT_STAGES.forEach((stage) => {
    const inStage = rules.filter((rule) => ruleStage(rule) === stage);
    if (inStage.length === 0) return;
    const run = runLevels(amount, inStage, 'each-level');
    stages.push({ stage, start: amount, run });
    amount = run.net;
  });
  return { stages, net: amount };
}

/**
 * An adjustment (docs/commission-model-redesign.md, section 4): a deal-specific line paid by all or chosen agents,
 * at Before Plan or After Plan. A percent is each payer's own: that percent of their stage base at the
 * adjustment's level. Dollars are divided among the payers:
 * - split: by the payers' amounts at `basis` (their splits, or what they have after Before Plan or the plan);
 * - equal; custom: by `shares` as percents (they need not add to 100; they are normalized);
 * - typed: `shares` are each payer's dollars, and `value` is ignored.
 * The rounding cent goes to the first payer, so the adjustment is paid in full.
 */
export interface Adjustment {
  id: string;
  name: string;
  entity: string;
  stage: 'BEFORE_PLAN' | 'AFTER_PLAN';
  level?: number;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  /** Agent names; empty means every agent on the deal. */
  payers: string[];
  divide: 'split' | 'equal' | 'custom' | 'typed';
  /** For divide 'split': whose amounts. Only points before the adjustment are valid (shareBasisOptions). */
  basis?: ShareBasis;
  /** For divide 'custom' (percent points) or 'typed' (dollars), by agent name. */
  shares?: Record<string, number>;
  note?: string;
}

/**
 * The amounts an adjustment can divide by: the agents' splits; what they have after the Before Plan stage; after
 * the plan; or at the adjustment's own level (after the lines in the levels above it, in its stage).
 */
export type ShareBasis = 'split' | 'after_before_plan' | 'after_plan' | 'at_level';

/** The share bases valid for an adjustment at this stage: never one that is worked out after it. */
export function shareBasisOptions(stage: Adjustment['stage']): ShareBasis[] {
  return stage === 'BEFORE_PLAN' ? ['split', 'at_level'] : ['split', 'after_before_plan', 'after_plan', 'at_level'];
}

const sameAgent = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** Each payer's dollars for an adjustment, given what every agent has at its basis. */
export function adjustmentShares(adjustment: Adjustment, payers: string[], basisAmounts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (payers.length === 0) return out;
  if (adjustment.divide === 'typed') {
    for (const payer of payers) {
      const typed = Object.entries(adjustment.shares || {}).find(([name]) => sameAgent(name, payer))?.[1];
      out[payer] = roundCurrency(Number(typed) || 0);
    }
    return out;
  }
  const weights = payers.map((payer) => {
    if (adjustment.divide === 'equal') return 1;
    if (adjustment.divide === 'custom') return Math.max(0, Number(Object.entries(adjustment.shares || {}).find(([name]) => sameAgent(name, payer))?.[1]) || 0);
    return Math.max(0, Number(Object.entries(basisAmounts).find(([name]) => sameAgent(name, payer))?.[1]) || 0);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map((weight) => roundCurrency(adjustment.value * (total > 0 ? weight / total : 1 / payers.length)));
  shares[0] = roundCurrency(shares[0] + adjustment.value - shares.reduce((sum, share) => sum + share, 0));
  payers.forEach((payer, index) => { out[payer] = shares[index]; });
  return out;
}

/** One agent's line from an adjustment. */
export type AdjustmentRule = StagedRule & { name: string; entity: string; note?: string; adjustmentId: string };

/** The deal's agents through Before Plan, the plan and After Plan, stage by stage, with adjustments shared among them. */
export interface DealStageRun<R extends StagedRule> {
  /** By agent name. */
  agents: Record<string, { split: number; stages: AgentStageRun<R | AdjustmentRule>[]; net: number }>;
}

/**
 * Runs every agent's lines stage by stage, so an adjustment can divide by the payers' amounts at any earlier point.
 * `rulesByAgent` are the agents' own lines with their stage and level already set.
 */
export function runDealStages<R extends StagedRule>(
  splits: { name: string; amount: number }[],
  rulesByAgent: Record<string, R[]>,
  adjustments: Adjustment[] = [],
): DealStageRun<R> {
  type Line = R | AdjustmentRule;
  const agents: DealStageRun<R>['agents'] = {};
  const amountNow: Record<string, number> = {};
  const after: Record<'split' | 'after_before_plan' | 'after_plan', Record<string, number>> = { split: {}, after_before_plan: {}, after_plan: {} };
  for (const { name, amount } of splits) {
    const start = roundCurrency(Math.max(0, amount));
    agents[name] = { split: start, stages: [], net: start };
    amountNow[name] = start;
    after.split[name] = start;
  }
  const rulesOf = (name: string): R[] => rulesByAgent[name] || Object.entries(rulesByAgent).find(([key]) => sameAgent(key, name))?.[1] || [];
  const payersOf = (adjustment: Adjustment) => (adjustment.payers.length
    ? splits.map((split) => split.name).filter((name) => adjustment.payers.some((payer) => sameAgent(payer, name)))
    : splits.map((split) => split.name));

  for (const stage of AGENT_STAGES) {
    const stageStart = { ...amountNow };
    const own = (name: string): Line[] => rulesOf(name).filter((rule) => ruleStage(rule) === stage);
    const stageAdjustments = adjustments.filter((adjustment) => adjustment.stage === stage);
    const levelNumbers = [...new Set([
      ...splits.flatMap((split) => own(split.name).map(ruleLevel)),
      ...stageAdjustments.map(ruleLevel),
    ])].sort((a, b) => a - b);
    // Adjustment lines by agent, worked out level by level so 'at_level' sees the net after the levels above.
    const extra: Record<string, AdjustmentRule[]> = {};
    const running = { ...stageStart };
    for (const level of levelNumbers) {
      for (const adjustment of stageAdjustments.filter((item) => ruleLevel(item) === level)) {
        const payers = payersOf(adjustment);
        const basis = adjustment.basis ?? 'split';
        const basisAmounts = basis === 'at_level' ? running : after[basis] ?? after.split;
        const perPayer = adjustment.type === 'PERCENT'
          ? Object.fromEntries(payers.map((payer) => [payer, null]))
          : adjustmentShares(adjustment, payers, basisAmounts);
        for (const payer of payers) {
          const dollars = perPayer[payer];
          (extra[payer] ||= []).push({
            id: `${adjustment.id}:${payer}`,
            adjustmentId: adjustment.id,
            name: adjustment.name,
            entity: adjustment.entity,
            note: adjustment.note,
            stage,
            level,
            type: dollars === null || dollars === undefined ? 'PERCENT' : 'AMOUNT',
            value: dollars === null || dollars === undefined ? adjustment.value : dollars,
          });
        }
      }
      // Advance every agent past this level, so a later level's 'at_level' basis sees it.
      for (const split of splits) {
        const inLevel = [...own(split.name), ...(extra[split.name] || [])].filter((rule) => ruleLevel(rule) === level);
        if (inLevel.length === 0) continue;
        const run = runLevels(running[split.name], inLevel.map((rule) => ({ ...rule, level: 1 })), 'each-level');
        running[split.name] = run.net;
      }
    }
    for (const split of splits) {
      const lines: Line[] = [...own(split.name), ...(extra[split.name] || [])];
      if (lines.length === 0) continue;
      const run = runLevels(stageStart[split.name], lines, 'each-level');
      agents[split.name].stages.push({ stage, start: stageStart[split.name], run });
      amountNow[split.name] = run.net;
    }
    if (stage === 'BEFORE_PLAN') after.after_before_plan = { ...amountNow };
    if (stage === 'PLAN') after.after_plan = { ...amountNow };
  }
  for (const split of splits) agents[split.name].net = amountNow[split.name];
  return { agents };
}
