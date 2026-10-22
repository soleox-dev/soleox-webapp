/**
 * Commission Plans from database rows (migration 065) to plan engine input. Pure: the caller fetches the rows.
 * - planInForce: the plan version in force on a deal's Cap Date.
 * - planAgentFromRow: an agents row and the client's plan settings to a PlanAgentInput.
 * - planHistoryFromItems: saved plan lines (transaction_commission_items with a plan_line_key) to year-to-date history.
 * - defaultFeeSharePercent: the Fee Share a deal gets when none is typed.
 */
import { readTransactionField } from './model';
import { capDateOf, commissionPlanSchema, type CommissionPlan, type PlanAgentInput, type PlanHistoryLine } from './plans';

export interface CommissionPlanRow {
  id: string;
  client_id: string | null;
  preset_key?: string | null;
  name: string;
  archived?: boolean | null;
}

export interface CommissionPlanVersionRow {
  id: string;
  plan_id: string;
  effective_from: string;
  lines: unknown;
}

export interface PlanSettingsRow {
  cap_date_field_key: string;
  cap_year_start_field_key: string | null;
  starting_balances_for_field_key: string | null;
  /** Plan line key -> agent field key. */
  starting_balance_field_keys: Record<string, string>;
  opt_in_field_keys: Record<string, string>;
  cap_amount_field_keys: Record<string, string>;
  /** Deal statuses that count toward year-to-date totals; null or empty means DEFAULT_COUNTING_STATUSES. */
  counting_statuses?: string[] | null;
}

/** What TATH's template counted: a cancelled or lost deal never fills a cap or a yearly limit. */
export const DEFAULT_COUNTING_STATUSES = ['Closed', 'Pending'];

/** An agents row: columns plus custom_attributes, read the way transaction fields are. */
export type PlanAgentRow = {
  id: string;
  agent_name: string;
  is_team_lead?: boolean | null;
  commission_plan_id?: string | null;
  custom_attributes?: Record<string, unknown> | string | null;
} & Record<string, unknown>;

/** A saved plan line: a transaction_commission_items row with a plan_line_key. */
export interface PlanItemRow {
  transaction_id: string;
  agent_id: string | null;
  plan_line_key: string | null;
  final_amount: number | string | null;
  archived?: boolean | null;
  custom_attributes?: Record<string, unknown> | null;
}

/** A transactions row: the Cap Date field and when the deal was first saved. */
export type PlanTransactionRow = { id: string; created_at?: string | null } & Record<string, unknown>;

const DAY = /^\d{4}-\d{2}-\d{2}/;

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function readDay(value: unknown): string | null {
  const match = typeof value === 'string' ? value.match(DAY) : null;
  return match ? match[0] : null;
}

function isYes(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  return ['yes', 'y', 'true', '1'].includes(value.trim().toLowerCase());
}

/**
 * The plan as it stands on the Cap Date: the latest version effective on or before it. Throws when the plan has
 * no version yet in force, so a deal is never calculated with lines from a later date.
 */
export function planInForce(plan: CommissionPlanRow, versions: CommissionPlanVersionRow[], capDate: string): CommissionPlan {
  const day = capDate.slice(0, 10);
  const version = versions
    .filter((row) => row.plan_id === plan.id && row.effective_from.slice(0, 10) <= day)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  if (!version) throw new Error(`${plan.name} has no version in force on ${day}.`);
  const parsed = commissionPlanSchema.parse({ id: plan.id, name: plan.name, lines: version.lines });
  return { ...parsed, versionId: version.id };
}

/**
 * An agent's plan input from their row. Cap Year Start, Starting Balances For, the starting balances, the
 * opt-ins and cap overrides come from the agent fields the client's plan settings name; a field left unset or
 * blank is simply absent (a missing Cap Year Start then makes the engine warn).
 */
export function planAgentFromRow(
  row: PlanAgentRow,
  input: {
    plan: CommissionPlan;
    settings: PlanSettingsRow;
    splitPercent: number;
    overrides?: Record<string, number>;
    afterPlan?: PlanAgentInput['afterPlan'];
  },
): PlanAgentInput {
  const { plan, settings } = input;
  const field = (key: string | null | undefined) => (key ? readTransactionField(row, key) : undefined);

  const capYearStart = readDay(field(settings.cap_year_start_field_key));
  const balancesFor = readDay(field(settings.starting_balances_for_field_key));
  const amounts: Record<string, number> = {};
  for (const [lineKey, fieldKey] of Object.entries(settings.starting_balance_field_keys || {})) {
    const value = readNumber(field(fieldKey));
    if (value !== null) amounts[lineKey] = value;
  }
  const optedIn = Object.entries(settings.opt_in_field_keys || {})
    .filter(([, fieldKey]) => isYes(field(fieldKey)))
    .map(([lineKey]) => lineKey);
  const capAmounts: Record<string, number> = {};
  for (const [lineKey, fieldKey] of Object.entries(settings.cap_amount_field_keys || {})) {
    const value = readNumber(field(fieldKey));
    if (value !== null) capAmounts[lineKey] = value;
  }

  return {
    id: row.id,
    name: row.agent_name,
    splitPercent: input.splitPercent,
    plan,
    roles: row.is_team_lead ? ['team_lead'] : [],
    capYearStart,
    // Starting balances belong to the cap year Starting Balances For falls in; without that date they count nowhere.
    startingBalances: balancesFor && Object.keys(amounts).length ? { capYearOf: balancesFor, amounts } : null,
    optedIn,
    ...(Object.keys(capAmounts).length ? { capAmounts } : {}),
    ...(input.overrides ? { overrides: input.overrides } : {}),
    ...(input.afterPlan ? { afterPlan: input.afterPlan } : {}),
  };
}

/**
 * Year-to-date history from saved plan lines. Each deal is placed by the client's Cap Date field and ordered
 * within a day by when the deal was first saved (transactions.created_at, which later edits do not move), so
 * same-day deals count in save order. Only deals whose status counts are included (Closed and Pending unless
 * the settings say otherwise). Saved amounts are final amounts, so a typed line counts as paid.
 */
export function planHistoryFromItems(
  items: PlanItemRow[],
  transactions: PlanTransactionRow[],
  settings: Pick<PlanSettingsRow, 'cap_date_field_key' | 'counting_statuses'>,
): PlanHistoryLine[] {
  const statuses = new Set((settings.counting_statuses?.length ? settings.counting_statuses : DEFAULT_COUNTING_STATUSES).map((status) => status.trim().toLowerCase()));
  const counts = (deal: PlanTransactionRow) => statuses.has(String(readTransactionField(deal, 'transaction_status') ?? '').trim().toLowerCase());
  const byId = new Map(transactions.filter(counts).map((row) => [row.id, row]));
  const history: PlanHistoryLine[] = [];
  for (const item of items) {
    if (item.archived || !item.plan_line_key || !item.agent_id) continue;
    const deal = byId.get(item.transaction_id);
    if (!deal) continue;
    let capDate: string;
    try {
      capDate = capDateOf(deal, settings.cap_date_field_key);
    } catch {
      // A deal without a Cap Date cannot be placed in any cap year.
      continue;
    }
    const countsTowardCap = item.custom_attributes?.counts_toward_cap;
    history.push({
      dealId: deal.id,
      agentId: item.agent_id,
      capDate,
      savedAt: deal.created_at ?? null,
      lineKey: item.plan_line_key,
      amount: readNumber(item.final_amount) ?? 0,
      ...(typeof countsTowardCap === 'string' && countsTowardCap ? { countsTowardCap } : {}),
    });
  }
  return history;
}

export interface FeeShareDeal {
  id: string;
  property_address?: string | null;
  closing_date?: string | null;
  transaction_side?: string | null;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && a!.trim().toLowerCase().replace(/\s+/g, ' ') === b!.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The Fee Share when none is typed: 50% when another deal has the same address and closing date on the other
 * side (a double end booked as one transaction), otherwise 100%; then reduced by the share of GCI paid to
 * entities marked as brokerage agents (an External eXp Agent's 20% referral leaves 80%).
 */
export function defaultFeeSharePercent(input: {
  deal: FeeShareDeal;
  otherDeals: FeeShareDeal[];
  gci: number;
  /** Paid on this deal to entities with is_brokerage_agent. */
  brokerageAgentAmount: number;
}): { percent: number; explanation: string } {
  const { deal } = input;
  const otherSide = input.otherDeals.find(
    (other) =>
      other.id !== deal.id &&
      sameText(other.property_address, deal.property_address) &&
      Boolean(readDay(other.closing_date)) &&
      readDay(other.closing_date) === readDay(deal.closing_date) &&
      !sameText(other.transaction_side, deal.transaction_side),
  );
  const base = otherSide ? 50 : 100;
  const share = input.gci > 0 ? Math.min(1, Math.max(0, input.brokerageAgentAmount / input.gci)) : 0;
  const percent = Number((base * (1 - share)).toFixed(6));
  const parts = [otherSide ? `50%: the other side of this address and closing date is deal ${otherSide.id}` : '100%'];
  if (share > 0) parts.push(`less ${Number((share * 100).toFixed(4))}% paid to a brokerage agent`);
  return { percent, explanation: `Fee Share ${percent}% (${parts.join(', ')}).` };
}
