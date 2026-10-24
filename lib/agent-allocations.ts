import { dealMatchesDefaultView } from '@/lib/transaction-default-view';
import { formulaDataNeeds, type FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

export type TeamCapAgentInput = {
  agentId: string;
  /** This agent receives the cap, so their own share is not cut. */
  isRecipient: boolean;
  /** This agent's portion of the agent-split pool before the team-lead cut. */
  shareAmount: number;
  /** Percent of the share paid to the team cap. 20 pays the team lead 20 and the agent keeps 80. Null means this agent is outside the split. */
  teamPercent: number | null;
  /** Yearly cap. Null means they pay the full team percent and nothing is tracked. */
  capAmount: number | null;
  resetDate: string | null;
  /** Cap dollars already counted in this anniversary, excluding this deal. */
  alreadyCounted: number;
  overrideAmount: number | null;
};

export type TeamCapResult = {
  agentId: string;
  keptAmount: number;
  teamLeadAmount: number;
  allocationAmount: number | null;
  calculatedAmount: number | null;
  isOverride: boolean;
  periodStart: string | null;
};

export type VolumeAgentInput = {
  agentId: string;
  isPrimary: boolean;
  shareAmount: number;
  overrideAmount: number | null;
};

export type VolumeResult = {
  agentId: string;
  amount: number;
  calculatedAmount: number;
  isOverride: boolean;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function anniversaryStart(resetDate: string | null, dealDate: string | null): string | null {
  if (!resetDate || !dealDate) return null;
  const reset = dateParts(resetDate);
  const deal = dateParts(dealDate);
  if (!reset || !deal) return null;
  const dealOnOrAfterReset = deal.month > reset.month || (deal.month === reset.month && deal.day >= reset.day);
  const year = dealOnOrAfterReset ? deal.year : deal.year - 1;
  const month = String(reset.month).padStart(2, '0');
  const day = String(reset.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function applyTeamCap(agents: TeamCapAgentInput[], dealDate: string | null): TeamCapResult[] {
  return agents.map((agent) => agentResult(agent, dealDate));
}

function agentResult(agent: TeamCapAgentInput, dealDate: string | null): TeamCapResult {
  if (agent.isRecipient || agent.teamPercent == null || !Number.isFinite(agent.teamPercent)) {
    return {
      agentId: agent.agentId,
      keptAmount: roundCurrency(Math.max(0, agent.shareAmount)),
      teamLeadAmount: 0,
      allocationAmount: null,
      calculatedAmount: null,
      isOverride: false,
      periodStart: null,
    };
  }

  const teamPercent = Math.min(100, Math.max(0, agent.teamPercent));
  const owed = roundCurrency(Math.max(0, agent.shareAmount) * (teamPercent / 100));
  const hasCap = agent.capAmount != null && Number.isFinite(agent.capAmount);
  const remaining = hasCap ? roundCurrency(Math.max(0, Number(agent.capAmount) - agent.alreadyCounted)) : owed;
  const calculated = hasCap ? roundCurrency(Math.min(owed, remaining)) : null;
  const typed = agent.overrideAmount != null && Number.isFinite(agent.overrideAmount)
    ? roundCurrency(Math.max(0, agent.overrideAmount))
    : null;
  const counted = roundCurrency(Math.min(Math.max(0, agent.shareAmount), typed ?? calculated ?? owed));

  return {
    agentId: agent.agentId,
    keptAmount: roundCurrency(Math.max(0, agent.shareAmount) - counted),
    teamLeadAmount: counted,
    allocationAmount: hasCap || typed != null ? counted : null,
    calculatedAmount: calculated,
    isOverride: typed != null,
    periodStart: hasCap ? anniversaryStart(agent.resetDate, dealDate) : null,
  };
}

export function teamLeadReceipt(results: TeamCapResult[], leadId: string | null): number {
  const fromAgents = results.reduce((sum, result) => sum + result.teamLeadAmount, 0);
  return roundCurrency(fromAgents + (results.find((result) => result.agentId === leadId)?.keptAmount || 0));
}

export type TeamCapRule = {
  id: string;
  name: string;
  key: string | null;
  enabled: boolean;
  qualifyingFormula: string | null;
  splitPercentFieldKey: string | null;
  capAmountFieldKey: string | null;
  resetDateFieldKey: string | null;
  /**
   * Who this cap pays, in order: a deal uses the first rule whose condition is true (a blank condition is true),
   * and that rule's recipients split what the cap collects by share. A deal no rule matches pays nothing.
   */
  payoutRules: CapPayoutRule[];
  /** Another cap this one counts toward: payments into either count toward the same yearly cap. */
  progressCapId: string | null;
};

/** An agent a team cap pays and their share, in percent, of what the cap collects. Shares add up to 100. */
export type TeamCapRecipient = { agentId: string; share: number };

/**
 * One way a team cap pays out: on deals where `condition` is true (or blank), to these recipients. `name` is
 * optional and shown as typed; see payoutRuleLabel.
 */
export type CapPayoutRule = { name: string | null; condition: string | null; recipients: TeamCapRecipient[] };

/**
 * A team cap with the recipients of the payout rule this deal matches (dealTeamCaps), empty when none matches,
 * and that rule's label when the cap has more than one rule.
 */
export type DealTeamCap = TeamCapRule & { recipients: TeamCapRecipient[]; payoutRuleLabel: string | null };

/** A payout rule's name, or "Payout Rule N" by its place. A cap with one rule has nothing to tell apart: null. */
export function payoutRuleLabel(cap: { payoutRules: CapPayoutRule[] }, rule: CapPayoutRule | null): string | null {
  if (!rule || cap.payoutRules.length < 2) return null;
  return rule.name?.trim() || `Payout Rule ${cap.payoutRules.indexOf(rule) + 1}`;
}

/**
 * A stored cap's payout rules: `payout_rules` (migration 078), each { condition, recipients }. Before it, one rule
 * with no condition paying `recipients` (migration 075) or the single recipient_agent_id at 100%.
 */
export function capPayoutRulesFromRow(payoutRules: unknown, recipients: unknown, recipientAgentId: unknown): CapPayoutRule[] {
  if (Array.isArray(payoutRules)) {
    return payoutRules.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { name?: unknown; condition?: unknown; recipients?: unknown };
      const name = String(row.name ?? '').trim() || null;
      const condition = String(row.condition ?? '').trim() || null;
      return [{ name, condition, recipients: capRecipientsFromRow(Array.isArray(row.recipients) ? row.recipients : [], null) }];
    });
  }
  const single = capRecipientsFromRow(recipients, recipientAgentId);
  return single.length > 0 ? [{ name: null, condition: null, recipients: single }] : [];
}

/** Every agent any of the cap's payout rules pays. */
export function capAllRecipientIds(cap: { payoutRules: CapPayoutRule[] }): string[] {
  return [...new Set(cap.payoutRules.flatMap((rule) => rule.recipients.map((recipient) => recipient.agentId)))];
}

/** The payout rule a deal uses: the first whose condition is blank or true. A condition that cannot be calculated is not true. */
export function dealPayoutRule(
  cap: TeamCapRule,
  deal: Record<string, unknown> | null,
  fieldTypes: Record<string, string>,
  lookups?: FormulaLookups | null,
): CapPayoutRule | null {
  return cap.payoutRules.find((rule) => rule.recipients.length > 0 && (!rule.condition || qualifies(deal, rule.condition, fieldTypes, lookups))) ?? null;
}

/** The caps with the recipients each pays on this deal. */
export function dealTeamCaps(
  caps: TeamCapRule[],
  deal: Record<string, unknown> | null,
  fieldTypes: Record<string, string>,
  lookups?: FormulaLookups | null,
): DealTeamCap[] {
  return caps.map((cap) => {
    const rule = dealPayoutRule(cap, deal, fieldTypes, lookups);
    return { ...cap, recipients: rule?.recipients ?? [], payoutRuleLabel: payoutRuleLabel(cap, rule) };
  });
}

/**
 * A stored cap's recipients: the `recipients` list (migration 075), or else its one recipient_agent_id at 100%.
 * Each entry is { agent_id, share }.
 */
export function capRecipientsFromRow(recipients: unknown, recipientAgentId: unknown): TeamCapRecipient[] {
  if (Array.isArray(recipients)) {
    const seen = new Set<string>();
    return recipients.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { agent_id?: unknown; agentId?: unknown; share?: unknown };
      const agentId = String(row.agent_id ?? row.agentId ?? '').trim();
      const share = Number(row.share);
      if (!agentId || seen.has(agentId) || !Number.isFinite(share) || share <= 0) return [];
      seen.add(agentId);
      return [{ agentId, share }];
    });
  }
  const single = String(recipientAgentId ?? '').trim();
  return single ? [{ agentId: single, share: 100 }] : [];
}

export function capRecipientIds(cap: { recipients: TeamCapRecipient[] }): string[] {
  return cap.recipients.map((recipient) => recipient.agentId);
}

/**
 * What each recipient receives of a cap's total, by share. The cents rounding leaves over go to the first
 * recipient, so the amounts always add up to the total.
 */
export function splitCapTotal(total: number, recipients: TeamCapRecipient[]): Map<string, number> {
  const shares = recipients.reduce((sum, recipient) => sum + recipient.share, 0);
  if (recipients.length === 0 || shares <= 0) return new Map();
  const rest = recipients.slice(1).map((recipient) => [recipient.agentId, roundCurrency(total * (recipient.share / shares))] as const);
  const first = roundCurrency(total - rest.reduce((sum, [, amount]) => sum + amount, 0));
  return new Map([[recipients[0].agentId, first], ...rest]);
}

/** What one agent receives of a cap's total. Zero when the cap does not pay them. */
export function capReceipt(recipients: TeamCapRecipient[], agentId: string, total: number): number {
  return splitCapTotal(total, recipients).get(agentId) || 0;
}

/**
 * The caps whose payments count toward the same yearly cap as this one: the cap itself, the cap it counts toward,
 * and every cap that counts toward either.
 */
export function capProgressIds(caps: { id: string; progressCapId: string | null }[], capId: string): string[] {
  const rootOf = (id: string) => {
    const cap = caps.find((item) => item.id === id);
    const target = cap?.progressCapId?.trim();
    return target && target !== id && caps.some((item) => item.id === target) ? target : id;
  };
  const root = rootOf(capId);
  const ids = caps.filter((cap) => cap.id === root || rootOf(cap.id) === root).map((cap) => cap.id);
  return ids.includes(capId) ? ids : [capId, ...ids];
}

const TEAM_CAP_KEY_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** Formula token for a cap name. "Robert Team Cap" becomes robert_team_cap. */
export function teamCapKeyFromName(name: string, emptyKey = 'team_cap'): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!key || /^[0-9]/.test(key)) return key ? `cap_${key}` : emptyKey;
  return key;
}

export function normalizeTeamCapKey(value: string): string {
  return value.trim().toLowerCase();
}

export function teamCapKeyFormatError(key: string): string | null {
  const normalized = normalizeTeamCapKey(key);
  if (!normalized) return 'Enter a key for this cap.';
  if (!TEAM_CAP_KEY_PATTERN.test(normalized)) {
    return 'The key needs to start with a letter and use only letters, numbers, and underscores.';
  }
  return null;
}

/** The first cap whose key is missing, invalid, or repeated. */
export function describeTeamCapKeys(caps: { name: string; key: string }[]): { index: number; message: string } | null {
  const seen = new Map<string, number>();
  for (let index = 0; index < caps.length; index += 1) {
    const format = teamCapKeyFormatError(caps[index].key);
    if (format) return { index, message: format };
    const key = normalizeTeamCapKey(caps[index].key);
    const previous = seen.get(key);
    if (previous != null) {
      const label = caps[previous].name.trim() || 'Team Cap';
      return { index, message: `That key is already used by ${label}.` };
    }
    seen.set(key, index);
  }
  return null;
}

/** Stored on a template submission. Absent means that submission did not record a choice. */
export const TEAM_CAP_SELECTION_KEY = '__team_cap_ids';

export function readTeamCapSelection(parameters: Record<string, string> | null | undefined): string[] | null {
  if (!parameters || !Object.prototype.hasOwnProperty.call(parameters, TEAM_CAP_SELECTION_KEY)) return null;
  try {
    const parsed = JSON.parse(parameters[TEAM_CAP_SELECTION_KEY] || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeTeamCapSelection(parameters: Record<string, string>, ids: string[]): Record<string, string> {
  return { ...parameters, [TEAM_CAP_SELECTION_KEY]: JSON.stringify(ids) };
}

/**
 * The caps that apply to a deal. `lookups` holds the tables their formulas look up (agents for XLOOKUP); see
 * allocationLookupTables. A formula that cannot be calculated, such as one whose lookup table is missing, does
 * not qualify: a cap never moves money on a guess.
 */
/** The caps set up well enough to pay out (on, with a split field and a recipient), qualifying or not. */
export function configuredTeamCaps<T extends TeamCapRule>(caps: T[]): T[] {
  return caps.filter((cap) => cap.enabled && cap.splitPercentFieldKey && cap.payoutRules.some((rule) => rule.recipients.length > 0));
}

export function qualifyingTeamCaps<T extends TeamCapRule>(
  caps: T[],
  deal: Record<string, unknown> | null,
  fieldTypes: Record<string, string>,
  lookups?: FormulaLookups | null,
): T[] {
  return configuredTeamCaps(caps).filter((cap) => qualifies(deal, cap.qualifyingFormula, fieldTypes, lookups));
}

/**
 * Whether any of these agents pays into the cap on this deal: someone who is not a recipient of the payout rule the
 * deal matches and has a team percent above 0 in the cap's split field. Recipients and agents off the cap pay nothing,
 * so a cap that passes its formula on such a deal (a team lead's own deal) changes nothing.
 */
export function capHasContributor(cap: DealTeamCap, agents: { id: string; fields?: Record<string, string> }[]): boolean {
  const recipientIds = new Set(cap.recipients.map((recipient) => recipient.agentId));
  return agents.some((agent) => {
    if (recipientIds.has(agent.id)) return false;
    const percent = parseTeamPercent(agent.fields?.[cap.splitPercentFieldKey || '']);
    return percent != null && percent > 0;
  });
}

/** The lookup tables the team cap and sales volume formulas (qualifying and payout conditions) read, for loadFormulaLookups. */
export function allocationLookupTables(
  teamCaps: { qualifyingFormula?: string | null; payoutRules?: CapPayoutRule[] }[],
  salesVolume?: { qualifyingFormula?: string | null } | null,
): string[] {
  return formulaDataNeeds([
    ...teamCaps.flatMap((cap) => [cap.qualifyingFormula ?? '', ...(cap.payoutRules ?? []).map((rule) => rule.condition ?? '')]),
    salesVolume?.qualifyingFormula ?? '',
  ]).lookupTables;
}

export type DealAllocationContext = {
  teamCaps: TeamCapRule[];
  /** Caps checked on the template submission. Null means the submission has no stored choice. */
  selectedTeamCapIds?: string[] | null;
  salesVolume: {
    enabled: boolean;
    qualifyingFormula: string | null;
    anchor: 'sales_price' | 'sales_price_x_units';
    assignment: 'agent_share' | 'primary_agent';
  } | null;
  fieldTypes: Record<string, string>;
  /** Tables the qualifying formulas look up (allocationLookupTables). Without them such a formula does not qualify. */
  lookups?: FormulaLookups | null;
  profiles: { agentId: string; fields: Record<string, string> }[];
  history: { agentId: string; amount: number; periodStart: string | null; teamCapId: string | null }[];
  overrides: { agentId: string; kind: 'team_cap' | 'sales_volume'; amount: number; teamCapId: string | null }[];
  deal: Record<string, unknown> | null;
  dealDate: string | null;
  salesPrice: number;
  units: number;
};

export type DealShare = { agentId: string; amount: number; isPrimary: boolean };

export type DealAllocationLine = {
  id: string;
  agent_id: string;
  kind: 'team_cap' | 'sales_volume';
  amount: number;
  calculated_amount: number;
  is_override: boolean;
  period_start: string | null;
  team_cap_id: string | null;
  cap_name: string | null;
  /** False for a team-lead payment that is not tracked against a cap. */
  tracked: boolean;
  /** Yearly cap for this agent. Set only when the payment is tracked against a cap. */
  cap_amount?: number | null;
  /** Cap dollars already counted in this anniversary, excluding this transaction. */
  prior_amount?: number | null;
  /** Percent of this agent's split paid toward the cap. */
  team_percent?: number | null;
  /** The payout rule this deal matched, when the cap has more than one (payoutRuleLabel). */
  payout_rule?: string | null;
};

function dealField(deal: Record<string, unknown> | null, key: string): string {
  if (!deal || !key) return '';
  const direct = deal[key];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct);
  const attributes = deal.custom_attributes;
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    const custom = (attributes as Record<string, unknown>)[key];
    if (custom !== undefined && custom !== null && String(custom).trim() !== '') return String(custom);
  }
  return '';
}

function qualifies(
  deal: Record<string, unknown> | null,
  formula: string | null,
  fieldTypes: Record<string, string>,
  lookups?: FormulaLookups | null,
): boolean {
  return dealMatchesDefaultView(deal || {}, formula || '', fieldTypes, { lookups, strict: true });
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw || !String(raw).trim()) return null;
  const value = Number(String(raw).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** 20 and 0.2 both mean twenty percent paid to the team cap. */
function parseTeamPercent(raw: string | undefined): number | null {
  const value = parseNumber(raw);
  if (value == null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function overrideFor(
  overrides: DealAllocationContext['overrides'],
  agentId: string,
  kind: 'team_cap' | 'sales_volume',
  teamCapId: string | null = null,
): number | null {
  const match = overrides.find((row) => row.agentId === agentId && row.kind === kind && (kind !== 'team_cap' || row.teamCapId === teamCapId));
  return match ? match.amount : null;
}

/** Cap dollars this agent already paid this anniversary into any of `teamCapIds` (capProgressIds). */
function alreadyCounted(
  history: DealAllocationContext['history'],
  agentId: string,
  periodStart: string | null,
  teamCapIds: string[],
): number {
  return roundCurrency(history.reduce((sum, row) => {
    if (row.agentId !== agentId || !row.teamCapId || !teamCapIds.includes(row.teamCapId)) return sum;
    if (periodStart && row.periodStart !== periodStart) return sum;
    return sum + row.amount;
  }, 0));
}

export function planDealAllocations(
  context: DealAllocationContext,
  shares: DealShare[],
): { lines: DealAllocationLine[]; amounts: Record<string, number> | null } {
  const lines: DealAllocationLine[] = [];
  let amounts: Record<string, number> | null = null;
  const profiles = new Map(context.profiles.map((profile) => [profile.agentId, profile]));

  // The caps checked on the template submission apply, whether or not they pass their qualifying formula: a box
  // checked or unchecked by hand wins. Without a recorded choice, the caps that qualify apply.
  const recorded = context.selectedTeamCapIds;
  const caps = dealTeamCaps(context.teamCaps, context.deal, context.fieldTypes, context.lookups);
  const matchingCaps = recorded
    ? configuredTeamCaps(caps).filter((cap) => recorded.includes(cap.id))
    : qualifyingTeamCaps(caps, context.deal, context.fieldTypes, context.lookups);
  // A cap pays the recipients of the payout rule this deal matches, and nothing when none matches. Without a
  // recorded choice, it pays only when every one of those recipients is already on the agent splits.
  const payableCaps = matchingCaps.flatMap((cap) => {
    const recipientIds = capRecipientIds(cap);
    if (recipientIds.length === 0) return [];
    const onDeal = recipientIds.every((id) => shares.some((share) => share.agentId === id));
    if (!onDeal && !recorded) return [];
    return [{ cap, recipientIds }];
  });
  if (payableCaps.length > 0) {
    const paid = new Map<string, number>();
    payableCaps.forEach(({ cap, recipientIds }) => {
      const progressIds = capProgressIds(context.teamCaps, cap.id);
      const inputs: TeamCapAgentInput[] = shares.map((share) => {
        const fields = profiles.get(share.agentId)?.fields || {};
        const capAmount = parseNumber(fields[cap.capAmountFieldKey || '']);
        const resetDate = dealField({ ...fields }, cap.resetDateFieldKey || '') || null;
        const periodStart = capAmount == null ? null : anniversaryStart(resetDate, context.dealDate);
        return {
          agentId: share.agentId,
          isRecipient: recipientIds.includes(share.agentId),
          shareAmount: share.amount,
          teamPercent: parseTeamPercent(fields[cap.splitPercentFieldKey || '']),
          capAmount,
          resetDate,
          alreadyCounted: alreadyCounted(context.history, share.agentId, periodStart, progressIds),
          overrideAmount: overrideFor(context.overrides, share.agentId, 'team_cap', cap.id),
        };
      });
      applyTeamCap(inputs, context.dealDate).forEach((result, index) => {
        if (recipientIds.includes(result.agentId)) return;
        const input = inputs[index];
        const share = shares.find((item) => item.agentId === result.agentId);
        if (!share || !input) return;
        const room = roundCurrency(Math.max(0, share.amount - (paid.get(result.agentId) || 0)));
        const cut = roundCurrency(Math.min(result.teamLeadAmount, room));
        const contributes = input.teamPercent != null && input.teamPercent > 0;
        const hasCap = input.capAmount != null && Number.isFinite(input.capAmount);
        if (cut <= 0 && result.allocationAmount == null && !(contributes && hasCap)) return;
        paid.set(result.agentId, roundCurrency((paid.get(result.agentId) || 0) + cut));
        const capName = cap.name.trim() || 'Team Cap';
        if (result.allocationAmount != null || (contributes && hasCap)) {
          const counted = roundCurrency(Math.min(result.allocationAmount ?? 0, cut));
          if (counted <= 0 && !result.isOverride && !(contributes && hasCap)) return;
          lines.push({
            id: `${result.agentId}:${cap.id}:team_cap`,
            agent_id: result.agentId,
            kind: 'team_cap',
            amount: counted,
            calculated_amount: result.calculatedAmount ?? counted,
            is_override: result.isOverride,
            period_start: result.periodStart,
            team_cap_id: cap.id,
            cap_name: capName,
            ...(cap.payoutRuleLabel ? { payout_rule: cap.payoutRuleLabel } : {}),
            tracked: true,
            cap_amount: hasCap ? input.capAmount : null,
            prior_amount: hasCap ? input.alreadyCounted : null,
            team_percent: input.teamPercent,
          });
        } else if (cut > 0) {
          lines.push({
            id: `${result.agentId}:${cap.id}:team_lead`,
            agent_id: result.agentId,
            kind: 'team_cap',
            amount: cut,
            calculated_amount: cut,
            is_override: false,
            period_start: null,
            team_cap_id: cap.id,
            cap_name: capName,
            ...(cap.payoutRuleLabel ? { payout_rule: cap.payoutRuleLabel } : {}),
            tracked: false,
          });
        }
      });
    });
  }

  const volume = context.salesVolume;
  if (volume?.enabled && qualifies(context.deal, volume.qualifyingFormula, context.fieldTypes, context.lookups)) {
    const anchor = roundCurrency(Math.max(0, context.salesPrice) * (volume.anchor === 'sales_price_x_units' ? Math.max(0, context.units) : 1));
    const results = assignSalesVolume(anchor, volume.assignment, shares.map((share) => ({
      agentId: share.agentId,
      isPrimary: share.isPrimary,
      shareAmount: share.amount,
      overrideAmount: overrideFor(context.overrides, share.agentId, 'sales_volume'),
    })));
    results.forEach((result) => {
      if (result.amount <= 0 && !result.isOverride) return;
      lines.push({
        id: `${result.agentId}:sales_volume`,
        agent_id: result.agentId,
        kind: 'sales_volume',
        amount: result.amount,
        calculated_amount: result.calculatedAmount,
        is_override: result.isOverride,
        period_start: null,
        team_cap_id: null,
        cap_name: null,
        tracked: true,
      });
    });
  }

  return { lines, amounts };
}

export function assignSalesVolume(
  anchorAmount: number,
  assignment: 'agent_share' | 'primary_agent',
  agents: VolumeAgentInput[],
): VolumeResult[] {
  const anchor = roundCurrency(Math.max(0, anchorAmount));
  const producers = agents.filter((agent) => agent.shareAmount > 0);
  const shareTotal = producers.reduce((sum, agent) => sum + agent.shareAmount, 0);
  return agents.map((agent) => {
    let calculated = 0;
    if (assignment === 'primary_agent') calculated = agent.isPrimary ? anchor : 0;
    else if (shareTotal > 0) calculated = roundCurrency(anchor * (agent.shareAmount / shareTotal));
    const typed = agent.overrideAmount != null && Number.isFinite(agent.overrideAmount)
      ? roundCurrency(Math.max(0, agent.overrideAmount))
      : null;
    return {
      agentId: agent.agentId,
      calculatedAmount: calculated,
      amount: typed ?? calculated,
      isOverride: typed != null,
    };
  });
}
