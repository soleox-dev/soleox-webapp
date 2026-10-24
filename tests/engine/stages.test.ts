import { describe, expect, it } from 'vitest';
import { runAgentStages, runLevels } from '@/lib/commission-engine/stages';

const pct = (id: string, value: number, level?: number, stage?: 'BEFORE_PLAN' | 'PLAN' | 'AFTER_PLAN') => ({ id, type: 'PERCENT' as const, value, level, stage });
const amt = (id: string, value: number, level?: number, stage?: 'BEFORE_PLAN' | 'PLAN' | 'AFTER_PLAN') => ({ id, type: 'AMOUNT' as const, value, level, stage });

describe('runLevels', () => {
  it('takes every percent in a level from the same base, and the next level from its net', () => {
    const run = runLevels(10000, [pct('a', 0.1), pct('b', 0.2), pct('stock', 0.05, 2)], 'each-level');
    expect(run.items.map((item) => [item.id, item.base, item.amount])).toEqual([
      ['a', 10000, 1000],
      ['b', 10000, 2000],
      ['stock', 7000, 350],
    ]);
    expect(run.net).toBe(6650);
  });

  it('runs any number of levels, skipping empty ones', () => {
    const run = runLevels(1000, [pct('l1', 0.1), pct('l3', 0.5, 3), amt('l5', 100, 5)], 'none');
    expect(run.levels.map((level) => [level.level, level.base, level.net])).toEqual([
      [1, 1000, 900],
      [3, 900, 450],
      [5, 450, 350],
    ]);
  });

  it('Off the Top: pre-splits as Level 2 take what is left after Level 1; only the pool stops at $0', () => {
    const run = runLevels(5000, [pct('referral', 0.25), pct('brokerage', 0.2, 2)], 'end');
    expect(run.items.map((item) => item.amount)).toEqual([1250, 750]);
    expect(run.net).toBe(3000);
    const over = runLevels(100, [amt('credit', 150), amt('fee', 10, 2)], 'end');
    expect(over.levels[0].net).toBe(-50);
    expect(over.net).toBe(0);
  });

  it('floors only as asked: none lets a refund leave a negative net', () => {
    expect(runLevels(100, [amt('clawback', 150)], 'none').net).toBe(-50);
    expect(runLevels(100, [amt('fee', 150)], 'each-level').net).toBe(0);
    expect(runLevels(-20, [], 'end').net).toBe(0);
    expect(runLevels(-20, [], 'none').net).toBe(-20);
  });
});

describe('runAgentStages', () => {
  it('runs Before Plan, then the plan, then After Plan, each starting from the net before it', () => {
    const result = runAgentStages(10000, [
      amt('tc', 300, 1, 'AFTER_PLAN'),
      pct('company', 0.2, 1, 'PLAN'),
      pct('stock', 0.05, 2, 'PLAN'),
      amt('credit', 500, 1, 'BEFORE_PLAN'),
      pct('after-pct', 0.1, 1, 'AFTER_PLAN'),
    ]);
    expect(result.stages.map((stage) => [stage.stage, stage.start, stage.run.net])).toEqual([
      ['BEFORE_PLAN', 10000, 9500],
      ['PLAN', 9500, 7220],
      ['AFTER_PLAN', 7220, 6198],
    ]);
    // An After Plan percent is a percent of the net after the plan.
    expect(result.stages[2].run.items.find((item) => item.id === 'after-pct')?.amount).toBe(722);
    expect(result.net).toBe(6198);
  });

  it('treats a line with no stage as Before Plan (today\'s post-splits) and leaves empty stages out', () => {
    const result = runAgentStages(1000, [pct('fee', 0.1)]);
    expect(result.stages.map((stage) => stage.stage)).toEqual(['BEFORE_PLAN']);
    expect(result.net).toBe(900);
  });
});
