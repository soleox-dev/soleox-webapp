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
