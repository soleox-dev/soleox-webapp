/**
 * From a template run to plan input: each agent's split % before bonuses (what per-deal fees are shared by) and
 * their side after bonuses and paid-by credits (what company dollar, the post-cap fraction and stock use).
 */
import { roundHalfUpCents, type PlanSide } from './plans';
import type { AppliedAgentCredit, AppliedAgentSplit, AppliedBonus } from './template';

export interface TemplatePlanSides {
  /** By agent name, as the template names agents. */
  splitPercent: Record<string, number>;
  sides: Record<string, PlanSide>;
}

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * `pool` is what the agent splits share (the waterfall's amount after off-the-top and pre-splits). Split % is
 * kept unrounded, as the template formulas did with (split − adjustment) ÷ baseline_after_pre_splits.
 */
export function planSidesFromTemplate(
  applied: { agentSplits?: AppliedAgentSplit[]; bonuses?: AppliedBonus[]; agentCredits?: AppliedAgentCredit[] },
  pool: number,
): TemplatePlanSides {
  const splitPercent: Record<string, number> = {};
  const sides: Record<string, PlanSide> = {};
  const names: string[] = [];
  for (const split of applied.agentSplits || []) if (!names.some((name) => same(name, split.name))) names.push(split.name);

  for (const name of names) {
    const afterBonusSplit = (applied.agentSplits || []).filter((split) => same(split.name, name)).reduce((sum, split) => sum + split.amount, 0);
    const received = (applied.bonuses || []).filter((bonus) => same(bonus.to, name)).reduce((sum, bonus) => sum + bonus.amount, 0);
    const paid = (applied.bonuses || []).filter((bonus) => same(bonus.from, name)).reduce((sum, bonus) => sum + bonus.amount, 0);
    const credits = (applied.agentCredits || []).filter((credit) => same(credit.agentName, name));
    const creditTotal = credits.reduce((sum, credit) => sum + credit.amount, 0);
    const beforeBonuses = roundHalfUpCents(afterBonusSplit - received + paid);
    splitPercent[name] = pool > 0 ? (beforeBonuses / pool) * 100 : 0;
    const notes = [`Split before bonuses: ${money(beforeBonuses)} of ${money(pool)} (${Number(splitPercent[name].toFixed(4))}%).`];
    (applied.bonuses || []).forEach((bonus) => {
      if (same(bonus.to, name)) notes.push(`${bonus.name}: ${money(bonus.amount)} from ${bonus.from}.`);
      if (same(bonus.from, name)) notes.push(`${bonus.name}: ${money(bonus.amount)} to ${bonus.to}.`);
    });
    credits.forEach((credit) => notes.push(`${credit.name}: ${money(credit.amount)} paid from this side before the plan.`));
    const sideAfterBonuses = roundHalfUpCents(afterBonusSplit - creditTotal);
    notes.push(`Side after bonuses and credits: ${money(sideAfterBonuses)}.`);
    sides[name] = { side: roundHalfUpCents(beforeBonuses - creditTotal), sideAfterBonuses, notes };
  }
  return { splitPercent, sides };
}
