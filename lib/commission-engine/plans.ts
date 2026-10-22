/**
 * Commission Plans: what each team agent owes the brokerage on a deal (company dollar, post-cap fee, risk
 * management, broker review, stock), written once per plan instead of copied per agent slot in a template.
 * Pure functions: the deal, the agents with their plans, earlier deals' plan lines and typed amounts in; every
 * plan line with its explanation, each agent's net and the payee totals out. Plans and presets are data.
 *
 * Line order on a deal: off-the-top (referral, approved client credits), sides by split %, bonuses between
 * sides, then each agent's plan lines in plan order, then the agent's own deductions after the plan (TC fee).
 * Per-deal fees are shared by the original split %; capped and percent-of-net lines use the side after bonuses.
 */
import { z } from 'zod';
import { readTransactionField } from './model';
import {
  evaluateFormula as evaluateTemplateFormula,
  type FormulaValue,
} from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { validateFormula as validateTemplateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';

// ---------------------------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------------------------

interface PlanLineBase {
  /** Stable key; year-to-date totals, starting balances and typed amounts are kept per key. */
  key: string;
  name: string;
  /** Who receives the line's dollars (an entity name). */
  payee: string;
}

/** A rate of the agent's side after bonuses, up to what is left of a yearly cap. Yields the post-cap fraction. */
export interface CappedPercentLine extends PlanLineBase {
  type: 'capped_percent';
  /** 0.2 for 20%. */
  rate: number;
  /** The plan's cap; omitted or null means no cap. An agent's capAmounts override it for that agent. */
  capAmount?: number | null;
}

/** A tier of a per-deal fee: this amount applies until the line's yearly total reaches untilPaid. */
export interface FeeTier {
  amount: number;
  untilPaid: number;
}

/** A fixed amount per deal, shared by split % and multiplied by the deal's Fee Share. */
export interface PerDealFeeLine extends PlanLineBase {
  type: 'per_deal_fee';
  /** The amount per deal (after any tiers are filled). */
  amount: number;
  /** Multiply by the post-cap fraction of this capped_percent line. */
  multiplierFrom?: string;
  /** Yearly limit for the line; the deal that reaches it pays the remainder. */
  yearlyLimit?: number;
  /** Tiers that come before `amount`, filled by the line's yearly total; a deal crossing one is blended. */
  tiers?: FeeTier[];
  /** Agents with one of these roles skip the tiers and pay `amount` from the start. */
  skipTiersForRoles?: string[];
  /** Multiply by the deal's Fee Share (default true). */
  appliesFeeShare?: boolean;
  /**
   * The editor's state while the last tier has not been set to No Limit yet (false): every tier is then in `tiers`,
   * and the plan cannot be saved until No Limit is selected, which moves the last tier's amount to `amount`.
   */
  endsWithNoLimit?: boolean;
  /**
   * The fee is never more than this rate of the agent's split before bonuses (0.2: eXp's post-cap fee is at most
   * 20% of the split). Applied before the yearly limit.
   */
  maxPercentOfSide?: number;
}

/** A rate of the agent's side after bonuses less chosen earlier lines, opt-in per agent. */
export interface PercentOfNetLine extends PlanLineBase {
  type: 'percent_of_net';
  rate: number;
  /** Keys of earlier lines taken off the side first. */
  after: string[];
  /** The line applies only to agents who opted in to it (the agent's optedIn); otherwise to every agent. */
  optIn?: boolean;
}

/**
 * Any amount the template formula language can express. Names: gci, side, side_after_bonuses, split_percent,
 * fee_share, share_past_cap (the first capped line's; also post_cap_fraction), share_past_cap_<key> (also post_cap_fraction_<key>), ytd_<key> (paid this cap
 * year before this deal) and line_<key> (an earlier line on this deal).
 */
export interface FormulaPlanLine extends PlanLineBase {
  type: 'formula';
  formula: string;
  yearlyLimit?: number;
  /** The key of a capped_percent line whose yearly total this line also counts toward. */
  countsTowardCap?: string;
}

export type PlanLine = CappedPercentLine | PerDealFeeLine | PercentOfNetLine | FormulaPlanLine;

export interface CommissionPlan {
  id: string;
  name: string;
  /** The version of the plan in force on the deal's Cap Date, when the plan comes from the database. */
  versionId?: string;
  lines: PlanLine[];
}

const lineBase = { key: z.string().min(1), name: z.string().min(1), payee: z.string().min(1) };

/** Checks a plan read from data (a preset file now, a database row later). */
export const commissionPlanSchema: z.ZodType<CommissionPlan> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lines: z.array(
    z.discriminatedUnion('type', [
      z.object({ ...lineBase, type: z.literal('capped_percent'), rate: z.number(), capAmount: z.number().nullable().optional() }),
      z.object({
        ...lineBase,
        type: z.literal('per_deal_fee'),
        amount: z.number(),
        multiplierFrom: z.string().optional(),
        yearlyLimit: z.number().optional(),
        tiers: z.array(z.object({ amount: z.number(), untilPaid: z.number() })).optional(),
        skipTiersForRoles: z.array(z.string()).optional(),
        appliesFeeShare: z.boolean().optional(),
        endsWithNoLimit: z.boolean().optional(),
        maxPercentOfSide: z.number().optional(),
      }),
      z.object({ ...lineBase, type: z.literal('percent_of_net'), rate: z.number(), after: z.array(z.string()), optIn: z.boolean().optional() }),
      z.object({ ...lineBase, type: z.literal('formula'), formula: z.string().min(1), yearlyLimit: z.number().optional(), countsTowardCap: z.string().optional() }),
    ]),
  ),
});

const LINE_KEY = /^[a-z][a-z0-9_]*$/;

/** The names a Formula line at `index` can read: the deal, the agent, and the plan's lines before it. */
export function planFormulaNames(plan: CommissionPlan, index: number): string[] {
  const names = ['gci', 'side', 'side_after_bonuses', 'split_percent', 'fee_share'];
  const earlier = plan.lines.slice(0, index);
  // share_past_cap is the name to use; post_cap_fraction, its first name, keeps working in saved formulas.
  if (earlier.some((line) => line.type === 'capped_percent')) names.push('share_past_cap', 'post_cap_fraction');
  for (const line of earlier) {
    names.push(`line_${line.key}`);
    if (line.type === 'capped_percent') names.push(`share_past_cap_${line.key}`, `post_cap_fraction_${line.key}`);
  }
  for (const line of plan.lines) names.push(`ytd_${line.key}`);
  return names;
}

/**
 * What is wrong with a plan before it is saved, one message per problem: line keys (unique, lower_snake_case),
 * references to earlier lines, rates, amounts, tiers and formulas. An empty list means the plan can be saved.
 */
export function validatePlan(plan: CommissionPlan): string[] {
  const problems: string[] = [];
  if (!plan.name.trim()) problems.push('The plan needs a name.');
  const seen = new Set<string>();
  plan.lines.forEach((line, index) => {
    const label = line.name.trim() || `Line ${index + 1}`;
    const earlier = plan.lines.slice(0, index);
    const earlierLine = (key: string) => earlier.find((other) => other.key === key);
    if (!line.name.trim()) problems.push(`Line ${index + 1} needs a name.`);
    if (!LINE_KEY.test(line.key)) problems.push(`${label}: the key must start with a letter and use only a-z, 0-9 and _.`);
    else if (seen.has(line.key)) problems.push(`${label}: the key ${line.key} is used by another line.`);
    seen.add(line.key);
    if (!line.payee.trim()) problems.push(`${label} needs a payee.`);
    if (line.type === 'capped_percent' || line.type === 'percent_of_net') {
      if (!(line.rate >= 0 && line.rate <= 1)) problems.push(`${label}: the rate must be between 0% and 100%.`);
    }
    if (line.type === 'capped_percent' && line.capAmount !== null && line.capAmount !== undefined && !(line.capAmount >= 0)) {
      problems.push(`${label}: the cap cannot be negative.`);
    }
    if (line.type === 'per_deal_fee') {
      if (!(line.amount >= 0)) problems.push(`${label}: the amount cannot be negative.`);
      if (line.multiplierFrom && earlierLine(line.multiplierFrom)?.type !== 'capped_percent') {
        problems.push(`${label}: the share past the cap must come from a percentage-up-to-a-cap line above it.`);
      }
      if (line.endsWithNoLimit === false) problems.push(`${label}: choose No Limit in the last tier's For the Next.`);
      let previous = 0;
      for (const tier of line.tiers || []) {
        if (!(tier.amount >= 0) || !(tier.untilPaid > previous)) {
          problems.push(`${label}: every tier but the last needs a For the Next amount above $0.`);
          break;
        }
        previous = tier.untilPaid;
      }
    }
    if (line.type === 'per_deal_fee' && line.maxPercentOfSide !== undefined && !(line.maxPercentOfSide >= 0 && line.maxPercentOfSide <= 1)) {
      problems.push(`${label}: the most it can be must be between 0% and 100% of the split.`);
    }
    if ((line.type === 'per_deal_fee' || line.type === 'formula') && line.yearlyLimit !== undefined && !(line.yearlyLimit >= 0)) {
      problems.push(`${label}: the yearly limit cannot be negative.`);
    }
    if (line.type === 'percent_of_net') {
      const missing = line.after.filter((key) => !earlierLine(key));
      if (missing.length) problems.push(`${label}: ${missing.join(', ')} must be lines above it.`);
    }
    if (line.type === 'formula') {
      if (!line.formula.trim()) problems.push(`${label} needs a formula.`);
      else {
        const error = validateTemplateFormula(line.formula, planFormulaNames(plan, index));
        if (error) problems.push(`${label}: ${error}`);
      }
      if (line.countsTowardCap && !plan.lines.some((other) => other.key === line.countsTowardCap && other.type === 'capped_percent')) {
        problems.push(`${label}: it can only count toward a capped percentage line.`);
      }
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Deal input
// ---------------------------------------------------------------------------------------------------------------

/** Referral or approved client credit, taken before the sides are worked out. */
export interface OffTheTopItem {
  name: string;
  amount: number;
  /** Agents who pay it from their own sides; omitted means it comes off GCI, shared by everyone's split. */
  paidBy?: string[];
  /**
   * How the Paid By agents share it, as agreed with the team lead: by their split % (default), equally, or the
   * amounts typed in paidAmounts, which must add up to the credit. A rounding cent goes to the first payer.
   */
  shareBy?: 'split' | 'equal' | 'amounts';
  /** Typed share per Paid By agent, for shareBy 'amounts'. */
  paidAmounts?: Record<string, number>;
}

/** A bonus moves dollars between sides: a bonus to one agent is a concession from another. */
export interface PlanBonus {
  fromAgentId: string;
  toAgentId: string;
  amount: number;
}

/** What the agent had paid in the cap year before their deals were in the app. */
export interface StartingBalances {
  /** Any date in the cap year these balances belong to (YYYY-MM-DD). */
  capYearOf: string;
  /** Amounts by line key. */
  amounts: Record<string, number>;
}

export interface PlanAgentInput {
  id: string;
  name: string;
  /** 85 for 85%. */
  splitPercent: number;
  plan: CommissionPlan;
  /** For skipTiersForRoles, e.g. team_lead. */
  roles?: string[];
  /** The agent's Cap Year Start (YYYY-MM-DD); every yearly total resets on its anniversary. */
  capYearStart?: string | null;
  /** Keys of the opt-in lines (percent_of_net with optIn) the agent chose, e.g. stock. */
  optedIn?: string[];
  /** Caps that differ from the plan for this agent, by capped line key: a rare exception. */
  capAmounts?: Record<string, number>;
  startingBalances?: StartingBalances | null;
  /** Typed line amounts by key; a typed amount wins over the plan and counts as paid. */
  overrides?: Record<string, number>;
  /** The agent's deductions after the plan (TC fee), out of their cash. */
  afterPlan?: { name: string; amount: number; payee?: string }[];
}

export interface PlanDealInput {
  id: string;
  gci: number;
  /** The date that orders deals for caps (the client's Cap Date field), YYYY-MM-DD. */
  capDate: string;
  /** When the deal was saved; orders deals with the same Cap Date. */
  savedAt?: string | null;
  /** 100 by default; 50 for a double end booked as one transaction, 80 for an eXp agent referral. */
  feeSharePercent?: number;
  /**
   * Plan lines this deal does not charge, by key, for every agent (some rentals and outgoing referrals pay no
   * broker review or risk management). A waived line is $0 and adds nothing to year-to-date totals; a typed
   * amount still wins.
   */
  waivedLines?: string[];
  offTheTop?: OffTheTopItem[];
  bonuses?: PlanBonus[];
  agents: PlanAgentInput[];
  /**
   * Sides already worked out by the waterfall (template splits, bonuses and credits), by agent id. When given,
   * offTheTop and bonuses are not applied again; each agent's splitPercent still shares the per-deal fees.
   */
  sides?: Record<string, PlanSide>;
}

/** An agent's side from the waterfall: before bonuses, after bonuses and credits, and how it was reached. */
export interface PlanSide {
  side: number;
  sideAfterBonuses: number;
  notes: string[];
}

/** One plan line already paid on an earlier deal. */
export interface PlanHistoryLine {
  dealId: string;
  agentId: string;
  capDate: string;
  savedAt?: string | null;
  lineKey: string;
  amount: number;
  /** For a formula line that counts toward a cap: that capped line's key. */
  countsTowardCap?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------------------------

export interface PlanLineResult {
  key: string;
  name: string;
  type: PlanLine['type'];
  payee: string;
  /** What is paid: the typed amount when edited, otherwise the calculated amount. */
  amount: number;
  calculated: number;
  edited: boolean;
  /** The deal waives this line: $0, with the plan's amount kept in calculated. */
  waived?: boolean;
  /** For a capped_percent line: the part of the side the cap no longer covers, unrounded. */
  postCapFraction?: number;
  /** Paid on this line in the cap year before this deal, starting balance included. */
  ytdBefore: number;
  countsTowardCap?: string;
  explanation: string;
}

export interface PlanAgentResult {
  agentId: string;
  name: string;
  planId: string;
  planVersionId?: string;
  splitPercent: number;
  /** split % × GCI after shared off-the-top, less any credit the agent pays alone. */
  side: number;
  sideAfterBonuses: number;
  /** Null when the agent has no Cap Year Start; a plan with yearly totals is then not calculated. */
  capYear: { start: string; end: string } | null;
  lines: PlanLineResult[];
  afterPlan: { name: string; amount: number; payee?: string }[];
  /** sideAfterBonuses − plan lines − deductions after the plan. */
  netCash: number;
  explanation: string[];
}

export interface PlanWarning {
  code: 'missing_cap_year_start';
  agentId: string;
  message: string;
}

export interface PlanDealResult {
  dealId: string;
  gci: number;
  feeSharePercent: number;
  offTheTop: OffTheTopItem[];
  agents: PlanAgentResult[];
  /** What the user must fix before the deal's plan lines can be trusted, e.g. a missing Cap Year Start. */
  warnings: PlanWarning[];
  /** False while any warning stands: some agent's plan lines were not calculated, so the deal cannot be saved. */
  complete: boolean;
  /** Plan lines and deductions after the plan, by payee. */
  payeeTotals: Record<string, number>;
  /** Off-the-top + plan lines + deductions after the plan + net cash; equals GCI when the splits add to 100%. */
  accountedFor: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------------------------------------------

/**
 * Half-up to the cent. Trims binary noise first so 75 × 1.5% = 1.125 rounds to 1.13 as eXp's statements do
 * (1.125 is stored as 1.12499…, which a plain Math.round sends down).
 */
export function roundHalfUpCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cents = Math.floor(Number((Math.abs(value) * 100).toFixed(6)) + 0.5);
  const rounded = cents / 100;
  return value < 0 ? -rounded : rounded;
}

const cents = (value: number) => Math.round(value * 100);
const addCents = (...values: number[]) => values.reduce((sum, value) => sum + cents(value), 0) / 100;

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (fraction: number, digits = 2) => `${Number((fraction * 100).toFixed(digits))}%`;

// ---------------------------------------------------------------------------------------------------------------
// Cap years
// ---------------------------------------------------------------------------------------------------------------

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDay(value: string): { y: number; m: number; d: number } {
  const match = String(value || '').match(DAY);
  if (!match) throw new Error(`"${value}" is not a date (YYYY-MM-DD).`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatDay(y: number, m: number, d: number): string {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/**
 * The cap year a date falls in: from the latest anniversary of Cap Year Start on or before the date, up to (not
 * including) the next one. Feb 29 starts on Feb 28 in other years.
 */
export function capYearFor(date: string, capYearStart: string): { start: string; end: string } {
  const day = parseDay(date);
  const anchor = parseDay(capYearStart);
  let start = formatDay(day.y, anchor.m, anchor.d);
  let year = day.y;
  if (start > date.slice(0, 10)) {
    year -= 1;
    start = formatDay(year, anchor.m, anchor.d);
  }
  return { start, end: formatDay(year + 1, anchor.m, anchor.d) };
}

/** Whether an earlier deal comes before this one: by Cap Date, then by save time. An unsaved deal comes last. */
function comesBefore(
  other: { capDate: string; savedAt?: string | null },
  deal: { capDate: string; savedAt?: string | null },
): boolean {
  const a = other.capDate.slice(0, 10);
  const b = deal.capDate.slice(0, 10);
  if (a !== b) return a < b;
  if (!deal.savedAt) return true;
  return (other.savedAt || '') < deal.savedAt;
}

/** Paid on a line key in the agent's cap year before this deal, with the starting balance when it belongs here. */
function yearToDate(
  key: string,
  agent: PlanAgentInput,
  deal: PlanDealInput,
  capYear: { start: string; end: string } | null,
  history: PlanHistoryLine[],
): { total: number; fromDeals: number; starting: number } {
  if (!capYear) return { total: 0, fromDeals: 0, starting: 0 };
  let fromDeals = 0;
  for (const row of history) {
    if (row.agentId !== agent.id || row.dealId === deal.id) continue;
    if (row.lineKey !== key && row.countsTowardCap !== key) continue;
    const day = row.capDate.slice(0, 10);
    if (day < capYear.start || day >= capYear.end) continue;
    if (!comesBefore(row, deal)) continue;
    fromDeals += cents(row.amount);
  }
  let starting = 0;
  const balances = agent.startingBalances;
  if (balances && balances.amounts[key] !== undefined) {
    const balanceYear = capYearFor(balances.capYearOf, agent.capYearStart);
    if (balanceYear.start === capYear.start) starting = cents(balances.amounts[key]);
  }
  return { total: (fromDeals + starting) / 100, fromDeals: fromDeals / 100, starting: starting / 100 };
}

// ---------------------------------------------------------------------------------------------------------------
// Sides
// ---------------------------------------------------------------------------------------------------------------

function workOutSides(deal: PlanDealInput) {
  const byId = new Map(deal.agents.map((agent) => [agent.id, agent]));
  const offTheTop = deal.offTheTop || [];
  const shared = offTheTop.filter((item) => !item.paidBy || item.paidBy.length === 0);
  const pool = deal.gci - shared.reduce((sum, item) => sum + item.amount, 0);
  const notes = new Map<string, string[]>(deal.agents.map((agent) => [agent.id, []]));
  const side = new Map<string, number>();

  for (const agent of deal.agents) {
    const amount = roundHalfUpCents((agent.splitPercent / 100) * pool);
    side.set(agent.id, amount);
    notes.get(agent.id)!.push(
      shared.length
        ? `Side: ${pct(agent.splitPercent / 100, 4)} of ${money(pool)} (GCI ${money(deal.gci)} less ${shared.map((item) => `${item.name} ${money(item.amount)}`).join(', ')}) is ${money(amount)}.`
        : `Side: ${pct(agent.splitPercent / 100, 4)} of GCI ${money(deal.gci)} is ${money(amount)}.`,
    );
  }

  for (const item of offTheTop) {
    if (!item.paidBy || item.paidBy.length === 0) continue;
    const payers = item.paidBy.map((id) => {
      const agent = byId.get(id);
      if (!agent) throw new Error(`${item.name} is paid by an agent who is not on the deal (${id}).`);
      return agent;
    });
    const shareBy = item.shareBy || 'split';
    const splitTotal = payers.reduce((sum, agent) => sum + agent.splitPercent, 0);
    let shares: { agent: PlanAgentInput; amount: number; how: string }[];
    if (shareBy === 'amounts') {
      shares = payers.map((agent) => {
        const typed = item.paidAmounts?.[agent.id];
        if (typed === undefined || !Number.isFinite(typed)) throw new Error(`${item.name} needs the amount ${agent.name} pays.`);
        return { agent, amount: roundHalfUpCents(typed), how: 'typed' };
      });
      const typedTotal = addCents(...shares.map((share) => share.amount));
      if (cents(typedTotal) !== cents(item.amount)) {
        throw new Error(`${item.name}: the amounts typed per agent add up to ${money(typedTotal)}, not ${money(item.amount)}.`);
      }
    } else {
      shares = payers.map((agent) => {
        const share = shareBy === 'split' && splitTotal > 0 ? agent.splitPercent / splitTotal : 1 / payers.length;
        const how = shareBy === 'split' && splitTotal > 0 ? `${pct(share, 4)} by split` : `an equal ${pct(share, 4)}`;
        return { agent, amount: roundHalfUpCents(item.amount * share), how };
      });
      // The credit is paid in full: a cent lost or gained in rounding goes to the first payer.
      const gap = cents(item.amount) - cents(addCents(...shares.map((share) => share.amount)));
      if (gap !== 0) shares[0].amount = addCents(shares[0].amount, gap / 100);
    }
    for (const { agent, amount, how } of shares) {
      side.set(agent.id, addCents(side.get(agent.id)!, -amount));
      notes.get(agent.id)!.push(
        payers.length === 1
          ? `${item.name} ${money(amount)} is paid from this side alone, before the plan: side ${money(side.get(agent.id)!)}.`
          : `${item.name}: ${money(amount)} of ${money(item.amount)} (${how}) is paid from this side before the plan: side ${money(side.get(agent.id)!)}.`,
      );
    }
  }

  const afterBonuses = new Map(side);
  for (const bonus of deal.bonuses || []) {
    const from = byId.get(bonus.fromAgentId);
    const to = byId.get(bonus.toAgentId);
    if (!from || !to) throw new Error(`A bonus of ${money(bonus.amount)} names an agent who is not on the deal.`);
    afterBonuses.set(from.id, addCents(afterBonuses.get(from.id)!, -bonus.amount));
    afterBonuses.set(to.id, addCents(afterBonuses.get(to.id)!, bonus.amount));
    notes.get(from.id)!.push(`Concession of ${money(bonus.amount)} to ${to.name}: side after bonuses ${money(afterBonuses.get(from.id)!)}.`);
    notes.get(to.id)!.push(`Bonus of ${money(bonus.amount)} from ${from.name}: side after bonuses ${money(afterBonuses.get(to.id)!)}.`);
  }

  return { side, afterBonuses, notes };
}

function sidesGiven(deal: PlanDealInput, sides: Record<string, PlanSide>) {
  const side = new Map<string, number>();
  const afterBonuses = new Map<string, number>();
  const notes = new Map<string, string[]>();
  for (const agent of deal.agents) {
    const given = sides[agent.id];
    if (!given) throw new Error(`The waterfall has no split for ${agent.name}.`);
    side.set(agent.id, roundHalfUpCents(given.side));
    afterBonuses.set(agent.id, roundHalfUpCents(given.sideAfterBonuses));
    notes.set(agent.id, [...given.notes]);
  }
  return { side, afterBonuses, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------------------------

interface LineContext {
  deal: PlanDealInput;
  agent: PlanAgentInput;
  capYear: { start: string; end: string } | null;
  history: PlanHistoryLine[];
  /** split % as a fraction */
  share: number;
  feeShare: number;
  side: number;
  sideAfterBonuses: number;
  earlier: PlanLineResult[];
}

type Calculated = { amount: number; postCapFraction?: number; explanation: string };

function earlierLine(ctx: LineContext, key: string, forLine: string): PlanLineResult {
  const found = ctx.earlier.find((line) => line.key === key);
  if (!found) throw new Error(`${forLine} reads "${key}", which is not an earlier line of plan ${ctx.agent.plan.name}.`);
  return found;
}

function cappedPercent(line: CappedPercentLine, ctx: LineContext, ytd: number): Calculated {
  const base = Math.max(0, ctx.sideAfterBonuses);
  const full = line.rate * base;
  const agentCap = ctx.agent.capAmounts?.[line.key];
  const ownCap = agentCap !== undefined && agentCap !== null && Number.isFinite(agentCap) ? agentCap : null;
  const cap = ownCap ?? line.capAmount;
  const head = `${pct(line.rate)} of ${money(base)} is ${money(roundHalfUpCents(full))}`;
  if (cap === null || cap === undefined) {
    return { amount: roundHalfUpCents(full), postCapFraction: 0, explanation: `${line.name}: ${head}; no cap.` };
  }
  const left = Math.max(0, cap - ytd);
  const charge = Math.min(full, left);
  const postCapFraction = full > 0 ? 1 - charge / full : left <= 0 ? 1 : 0;
  const capText = `${money(cap)} cap${ownCap !== null ? ' (this agent\'s own cap)' : ''}`;
  if (left <= 0) {
    return { amount: 0, postCapFraction, explanation: `${line.name}: already capped (${money(ytd)} paid of the ${capText}), so $0.00; share past the cap ${pct(postCapFraction)}.` };
  }
  if (full <= left) {
    return { amount: roundHalfUpCents(charge), postCapFraction, explanation: `${line.name}: ${head}; ${money(left)} left of the ${capText}, so ${money(roundHalfUpCents(charge))}; share past the cap 0%.` };
  }
  return {
    amount: roundHalfUpCents(charge),
    postCapFraction,
    explanation: `${line.name}: ${head}; ${money(left)} left of the ${capText}, so ${money(roundHalfUpCents(charge))}; share past the cap 1 − ${money(charge)} ÷ ${money(full)} = ${pct(postCapFraction)}.`,
  };
}

function limitToYear(amount: number, limit: number | undefined, ytd: number, name: string, text: string): Calculated {
  if (limit === undefined || limit === null) return { amount, explanation: text };
  const left = Math.max(0, addCents(limit, -ytd));
  if (amount <= left) return { amount, explanation: `${text} ${money(ytd)} of the ${money(limit)} yearly limit paid.` };
  return { amount: left, explanation: `${text} Only ${money(left)} is left of the ${money(limit)} yearly limit (${money(ytd)} paid), so ${name} is ${money(left)}.` };
}

function perDealFee(line: PerDealFeeLine, ctx: LineContext, ytd: number): Calculated {
  const feeShare = line.appliesFeeShare === false ? 1 : ctx.feeShare;
  let multiplier = 1;
  let multiplierText = '';
  if (line.multiplierFrom) {
    const source = earlierLine(ctx, line.multiplierFrom, line.name);
    multiplier = source.postCapFraction ?? 0;
    multiplierText = ` × share past the cap ${pct(multiplier)}`;
  }
  const units = ctx.share * feeShare * multiplier;
  const feeShareText = feeShare !== 1 ? ` × Fee Share ${pct(feeShare)}` : '';
  const factors = `× split ${pct(ctx.share, 4)}${feeShareText}${multiplierText}`;

  const roles = ctx.agent.roles || [];
  const skipped = (line.skipTiersForRoles || []).find((role) => roles.includes(role));
  const tiers = skipped ? [] : line.tiers || [];

  // Fill each tier by the line's yearly total; a deal that crosses one pays the rest of the tier at its rate and
  // the remaining part of the deal at the next rate.
  let raw = 0;
  let paid = ytd;
  let part = 1;
  const steps: string[] = [];
  for (const tier of tiers) {
    if (part <= 0) break;
    const room = tier.untilPaid - paid;
    if (room <= 0) continue;
    const atTier = tier.amount * units * part;
    if (atTier <= room) {
      raw += atTier;
      paid += atTier;
      part = 0;
      steps.push(`${money(tier.amount)} ${factors} is ${money(roundHalfUpCents(atTier))} (${money(ytd)} of ${money(tier.untilPaid)} paid at ${money(tier.amount)})`);
      break;
    }
    raw += room;
    paid += room;
    const covered = room / atTier;
    steps.push(`${money(tier.amount)} ${factors}${part < 1 ? ` × ${pct(part)}` : ''} is ${money(roundHalfUpCents(atTier))}, but only ${money(room)} is left before ${money(tier.untilPaid)}, which covers ${pct(covered)}`);
    part *= 1 - covered;
  }
  if (part > 0) {
    const atAmount = line.amount * units * part;
    raw += atAmount;
    steps.push(`${money(line.amount)} ${factors}${part < 1 ? ` × the other ${pct(part)}` : ''} is ${money(roundHalfUpCents(atAmount))}`);
  }
  let amount = roundHalfUpCents(raw);
  let limitText = '';
  if (line.maxPercentOfSide !== undefined && line.maxPercentOfSide !== null) {
    const most = roundHalfUpCents(line.maxPercentOfSide * Math.max(0, ctx.side));
    if (amount > most) {
      limitText = ` That is more than ${pct(line.maxPercentOfSide)} of the ${money(ctx.side)} split, so ${money(most)}.`;
      amount = most;
    }
  }
  const skipText = skipped ? ` (${skipped.replace(/_/g, ' ')} skips the ${money(line.tiers?.[0]?.amount ?? 0)} tier)` : '';
  const text = `${line.name}${skipText}: ${steps.join('; ')}${steps.length > 1 ? `; total ${money(roundHalfUpCents(raw))}` : ''}.${limitText}`;
  return limitToYear(amount, line.yearlyLimit, ytd, line.name, text);
}

function percentOfNet(line: PercentOfNetLine, ctx: LineContext): Calculated {
  if (line.optIn && !(ctx.agent.optedIn || []).includes(line.key)) {
    return { amount: 0, explanation: `${line.name}: the agent has not opted in, so $0.00.` };
  }
  const taken = line.after.map((key) => earlierLine(ctx, key, line.name));
  const base = addCents(ctx.sideAfterBonuses, ...taken.map((item) => -item.amount));
  const amount = roundHalfUpCents(line.rate * base);
  const less = taken.map((item) => `${item.name} ${money(item.amount)}`).join(', ');
  return { amount, explanation: `${line.name}: ${pct(line.rate)} of ${money(base)} (side ${money(ctx.sideAfterBonuses)}${less ? ` less ${less}` : ''}) is ${money(amount)}.` };
}

function formulaLine(line: FormulaPlanLine, ctx: LineContext, ytd: number): Calculated {
  const names = new Map<string, FormulaValue>();
  names.set('gci', { type: 'number', value: ctx.deal.gci });
  names.set('side', { type: 'number', value: ctx.side });
  names.set('side_after_bonuses', { type: 'number', value: ctx.sideAfterBonuses });
  names.set('split_percent', { type: 'percent', value: ctx.share });
  names.set('fee_share', { type: 'percent', value: ctx.feeShare });
  const firstCapped = ctx.earlier.find((item) => item.postCapFraction !== undefined);
  if (firstCapped) {
    names.set('share_past_cap', { type: 'percent', value: firstCapped.postCapFraction! });
    names.set('post_cap_fraction', { type: 'percent', value: firstCapped.postCapFraction! });
  }
  for (const item of ctx.earlier) {
    names.set(`line_${item.key}`.toLowerCase(), { type: 'number', value: item.amount });
    if (item.postCapFraction !== undefined) {
      names.set(`share_past_cap_${item.key}`.toLowerCase(), { type: 'percent', value: item.postCapFraction });
      names.set(`post_cap_fraction_${item.key}`.toLowerCase(), { type: 'percent', value: item.postCapFraction });
    }
  }
  for (const other of ctx.agent.plan.lines) {
    names.set(`ytd_${other.key}`.toLowerCase(), { type: 'number', value: yearToDate(other.key, ctx.agent, ctx.deal, ctx.capYear, ctx.history).total });
  }
  const resolve = (name: string): FormulaValue => names.get(name.toLowerCase()) ?? { type: 'error' };
  const result = evaluateTemplateFormula(line.formula, resolve);
  const value = result && (result.type === 'number' || result.type === 'percent') ? result.value : result?.type === 'blank' ? 0 : null;
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`${line.name} could not be calculated for ${ctx.agent.name}: check the formula ${line.formula}.`);
  }
  const amount = roundHalfUpCents(value);
  return limitToYear(amount, line.yearlyLimit, ytd, line.name, `${line.name}: ${line.formula} is ${money(amount)}.`);
}

// ---------------------------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------------------------

/** Whether a plan keeps yearly totals (a cap, a yearly limit, tiers, or a formula reading them), so it needs Cap Year Start. */
export function planNeedsCapYear(plan: CommissionPlan): boolean {
  return plan.lines.some((line) => {
    if (line.type === 'capped_percent') return line.capAmount !== null && line.capAmount !== undefined;
    if (line.type === 'per_deal_fee') return line.yearlyLimit !== undefined || Boolean(line.tiers?.length);
    if (line.type === 'formula') return line.yearlyLimit !== undefined || Boolean(line.countsTowardCap) || /\bytd_/i.test(line.formula);
    return false;
  });
}

/** Runs every team agent's plan on one deal. `history` holds plan lines paid on earlier deals. */
export function computePlanDeal(deal: PlanDealInput, history: PlanHistoryLine[] = []): PlanDealResult {
  const feeSharePercent = deal.feeSharePercent ?? 100;
  const { side, afterBonuses, notes } = deal.sides ? sidesGiven(deal, deal.sides) : workOutSides(deal);
  const payeeTotals: Record<string, number> = {};
  const addPayee = (payee: string | undefined, amount: number) => {
    const name = payee || 'Other';
    payeeTotals[name] = addCents(payeeTotals[name] || 0, amount);
  };

  const agents: PlanAgentResult[] = [];
  const warnings: PlanWarning[] = [];
  for (const agent of deal.agents) {
    const sideAmount = side.get(agent.id)!;
    const sideAfterBonuses = afterBonuses.get(agent.id)!;
    const capYear = agent.capYearStart ? capYearFor(deal.capDate, agent.capYearStart) : null;
    const lines: PlanLineResult[] = [];
    const hasSplit = agent.splitPercent > 0 || sideAfterBonuses > 0;
    // Without Cap Year Start the yearly totals are unknown; guessing the year could misplace a cap, so stop here.
    const ownCaps = Object.values(agent.capAmounts || {}).some((value) => value !== null && value !== undefined);
    const missingCapYear = hasSplit && !capYear && (planNeedsCapYear(agent.plan) || ownCaps);
    if (missingCapYear) {
      warnings.push({
        code: 'missing_cap_year_start',
        agentId: agent.id,
        message: `Enter Cap Year Start for ${agent.name} to calculate their ${agent.plan.name} plan.`,
      });
    }
    const runsPlan = hasSplit && !missingCapYear;
    const ctx: LineContext = {
      deal,
      agent,
      capYear,
      history,
      share: agent.splitPercent / 100,
      feeShare: feeSharePercent / 100,
      side: sideAmount,
      sideAfterBonuses,
      earlier: lines,
    };

    for (const line of runsPlan ? agent.plan.lines : []) {
      const ytd = yearToDate(line.key, agent, deal, capYear, history);
      let calculated: Calculated;
      if (line.type === 'capped_percent') calculated = cappedPercent(line, ctx, ytd.total);
      else if (line.type === 'per_deal_fee') calculated = perDealFee(line, ctx, ytd.total);
      else if (line.type === 'percent_of_net') calculated = percentOfNet(line, ctx);
      else calculated = formulaLine(line, ctx, ytd.total);

      const typed = agent.overrides?.[line.key];
      const edited = typed !== undefined && typed !== null && Number.isFinite(typed);
      const waived = !edited && Boolean(deal.waivedLines?.includes(line.key));
      const amount = edited ? roundHalfUpCents(typed) : waived ? 0 : calculated.amount;
      let { postCapFraction, explanation } = calculated;
      if (waived) {
        explanation = `${line.name}: waived on this deal, so $0.00 (the plan calculates ${money(calculated.amount)}).`;
        // A waived company dollar leaves the whole side past the cap, as a typed $0 would.
        if (line.type === 'capped_percent' && line.rate * Math.max(0, sideAfterBonuses) > 0) postCapFraction = 1;
      }
      if (edited) {
        explanation = `${line.name}: typed ${money(amount)} (EDITED; the plan calculates ${money(calculated.amount)}). ${explanation}`;
        if (line.type === 'capped_percent') {
          const full = line.rate * Math.max(0, sideAfterBonuses);
          postCapFraction = full > 0 ? Math.min(1, Math.max(0, 1 - amount / full)) : postCapFraction;
          explanation += ` Share past the cap from the typed amount: ${pct(postCapFraction ?? 0)}.`;
        }
      }
      if (ytd.starting) explanation += ` Year to date includes a starting balance of ${money(ytd.starting)}.`;
      lines.push({
        key: line.key,
        name: line.name,
        type: line.type,
        payee: line.payee,
        amount,
        calculated: calculated.amount,
        edited,
        ...(waived ? { waived } : {}),
        ...(postCapFraction !== undefined ? { postCapFraction } : {}),
        ytdBefore: ytd.total,
        ...(line.type === 'formula' && line.countsTowardCap ? { countsTowardCap: line.countsTowardCap } : {}),
        explanation,
      });
      addPayee(line.payee, amount);
    }

    const afterPlan = (agent.afterPlan || []).map((item) => ({ ...item, amount: roundHalfUpCents(item.amount) }));
    afterPlan.forEach((item) => addPayee(item.payee, item.amount));
    const netCash = addCents(sideAfterBonuses, ...lines.map((line) => -line.amount), ...afterPlan.map((item) => -item.amount));
    const explanation = [...notes.get(agent.id)!];
    if (missingCapYear) explanation.push(`${agent.plan.name} not calculated: enter Cap Year Start for ${agent.name}.`);
    else if (capYear) explanation.push(`Cap year ${capYear.start} to ${capYear.end} (Cap Date ${deal.capDate.slice(0, 10)}).`);
    lines.forEach((line) => explanation.push(line.explanation));
    afterPlan.forEach((item) => explanation.push(`${item.name}: ${money(item.amount)} from the agent's cash after the plan.`));
    explanation.push(`Net cash: ${money(netCash)}.`);
    agents.push({
      agentId: agent.id,
      name: agent.name,
      planId: agent.plan.id,
      ...(agent.plan.versionId ? { planVersionId: agent.plan.versionId } : {}),
      splitPercent: agent.splitPercent,
      side: sideAmount,
      sideAfterBonuses,
      capYear,
      lines,
      afterPlan,
      netCash,
      explanation,
    });
  }

  const offTheTop = (deal.offTheTop || []).map((item) => ({ ...item, amount: roundHalfUpCents(item.amount) }));
  const accountedFor = addCents(
    ...offTheTop.map((item) => item.amount),
    ...Object.values(payeeTotals),
    ...agents.map((agent) => agent.netCash),
  );
  return { dealId: deal.id, gci: deal.gci, feeSharePercent, offTheTop, agents, warnings, complete: warnings.length === 0, payeeTotals, accountedFor };
}

/** The plan lines a calculated deal adds to its agents' year-to-date totals (typed amounts as paid). */
export function planHistoryFrom(deal: PlanDealInput, result: PlanDealResult): PlanHistoryLine[] {
  return result.agents.flatMap((agent) =>
    agent.lines.map((line) => ({
      dealId: deal.id,
      agentId: agent.agentId,
      capDate: deal.capDate,
      savedAt: deal.savedAt ?? null,
      lineKey: line.key,
      amount: line.amount,
      ...(line.countsTowardCap ? { countsTowardCap: line.countsTowardCap } : {}),
    })),
  );
}

/**
 * Runs deals in cap order (Cap Date, then save time), each seeing the plan lines of the deals before it.
 * Returns results by deal id and the history the deals add.
 */
export function computePlanDealsInOrder(
  deals: PlanDealInput[],
  history: PlanHistoryLine[] = [],
): { results: Record<string, PlanDealResult>; history: PlanHistoryLine[] } {
  const ordered = [...deals].sort((a, b) => {
    const dayA = a.capDate.slice(0, 10);
    const dayB = b.capDate.slice(0, 10);
    if (dayA !== dayB) return dayA < dayB ? -1 : 1;
    if (!a.savedAt) return b.savedAt ? 1 : 0;
    if (!b.savedAt) return -1;
    return a.savedAt < b.savedAt ? -1 : a.savedAt > b.savedAt ? 1 : 0;
  });
  const results: Record<string, PlanDealResult> = {};
  let running = [...history];
  for (const deal of ordered) {
    const result = computePlanDeal(deal, running);
    results[deal.id] = result;
    running = [...running.filter((row) => row.dealId !== deal.id), ...planHistoryFrom(deal, result)];
  }
  return { results, history: running };
}

/** Reads the Cap Date from a transaction row: the client's Cap Date field, Closing Date by default. */
export function capDateOf(record: Record<string, unknown>, capDateField = 'closing_date'): string {
  const value = readTransactionField(record, capDateField);
  const day = typeof value === 'string' ? value.match(DAY) : null;
  if (!day) throw new Error(`The deal has no ${capDateField} to order it for caps.`);
  return day[0];
}
