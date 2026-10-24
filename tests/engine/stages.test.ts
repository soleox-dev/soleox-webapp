import { describe, expect, it } from 'vitest';
import { runAgentStages, runDealStages, runLevels, shareBasisOptions } from '@/lib/commission-engine/stages';

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

describe('adjustments (runDealStages)', () => {
  const splits = [{ name: 'Ann', amount: 6000 }, { name: 'Ben', amount: 4000 }];
  const plan = { Ann: [pct('company', 0.2, 1, 'PLAN')], Ben: [pct('company', 0.1, 1, 'PLAN')] };
  const credit = (extra: object) => ({ id: 'credit', name: 'Client Credit', entity: 'Client', type: 'AMOUNT' as const, value: 1000, payers: [], divide: 'split' as const, stage: 'BEFORE_PLAN' as const, ...extra });
  const lines = (run: ReturnType<typeof runDealStages>, agent: string) => run.agents[agent].stages.flatMap((stage) => stage.run.items).map((item) => [item.stage, 'name' in item ? item.name : item.id, item.amount]);

  it('Before Plan, all agents by split: comes off each split and shrinks what the plan takes', () => {
    const run = runDealStages(splits, plan, [credit({})]);
    expect(lines(run, 'Ann')).toEqual([['BEFORE_PLAN', 'Client Credit', 600], ['PLAN', 'company', 1080]]);
    expect(lines(run, 'Ben')).toEqual([['BEFORE_PLAN', 'Client Credit', 400], ['PLAN', 'company', 360]]);
    expect([run.agents.Ann.net, run.agents.Ben.net]).toEqual([4320, 3240]);
  });

  it('Before Plan, one chosen agent: only that agent pays', () => {
    const run = runDealStages(splits, plan, [credit({ payers: ['Ben'] })]);
    expect(lines(run, 'Ann')).toEqual([['PLAN', 'company', 1200]]);
    expect(lines(run, 'Ben')[0]).toEqual(['BEFORE_PLAN', 'Client Credit', 1000]);
  });

  it('After Plan, all agents, by what each has after the plan', () => {
    const run = runDealStages(splits, plan, [credit({ stage: 'AFTER_PLAN', basis: 'after_plan' })]);
    // After the plan: Ann 4800, Ben 3600 → shares 1000 × 4800/8400 and 1000 × 3600/8400.
    expect(lines(run, 'Ann')[1]).toEqual(['AFTER_PLAN', 'Client Credit', 571.43]);
    expect(lines(run, 'Ben')[1]).toEqual(['AFTER_PLAN', 'Client Credit', 428.57]);
  });

  it('After Plan, chosen agents: equal, custom percents, or typed dollars', () => {
    const equal = runDealStages(splits, plan, [credit({ stage: 'AFTER_PLAN', value: 100, divide: 'equal', payers: ['Ann', 'Ben'] })]);
    expect([lines(equal, 'Ann')[1][2], lines(equal, 'Ben')[1][2]]).toEqual([50, 50]);
    const thirds = runDealStages(splits, plan, [credit({ stage: 'AFTER_PLAN', value: 100, divide: 'custom', shares: { Ann: 1, Ben: 2 } })]);
    expect([lines(thirds, 'Ann')[1][2], lines(thirds, 'Ben')[1][2]]).toEqual([33.33, 66.67]);
    const typed = runDealStages(splits, plan, [credit({ stage: 'AFTER_PLAN', divide: 'typed', shares: { Ann: 300, Ben: 200 } })]);
    expect([lines(typed, 'Ann')[1][2], lines(typed, 'Ben')[1][2]]).toEqual([300, 200]);
  });

  it('a TC fee: After Plan, paid by the agent the template names, from the agent\'s cash', () => {
    const run = runDealStages(splits, plan, [credit({ id: 'tc', name: 'TC Fee', entity: 'TC', stage: 'AFTER_PLAN', value: 300, payers: ['Ann'] })]);
    expect(lines(run, 'Ann')).toEqual([['PLAN', 'company', 1200], ['AFTER_PLAN', 'TC Fee', 300]]);
    expect(run.agents.Ann.net).toBe(4500);
  });

  it('a percent adjustment is each payer\'s own percent of their base at that stage', () => {
    const run = runDealStages(splits, plan, [credit({ type: 'PERCENT', value: 0.1, stage: 'AFTER_PLAN' })]);
    expect([lines(run, 'Ann')[1][2], lines(run, 'Ben')[1][2]]).toEqual([480, 360]);
  });

  it('offers only share bases worked out before the adjustment', () => {
    expect(shareBasisOptions('BEFORE_PLAN')).toEqual(['split', 'at_level']);
    expect(shareBasisOptions('AFTER_PLAN')).toEqual(['split', 'after_before_plan', 'after_plan', 'at_level']);
  });
});

describe('adjustment shares', () => {
  it('gives the rounding cent to the first payer, so the adjustment is paid in full', () => {
    const shares = runDealStages(
      [{ name: 'A', amount: 100 }, { name: 'B', amount: 100 }, { name: 'C', amount: 100 }],
      {},
      [{ id: 'x', name: 'Credit', entity: 'Client', stage: 'BEFORE_PLAN', type: 'AMOUNT', value: 100, payers: [], divide: 'equal' }],
    );
    const paid = ['A', 'B', 'C'].map((name) => shares.agents[name].stages[0].run.items[0].amount);
    expect(paid).toEqual([33.34, 33.33, 33.33]);
  });
});
