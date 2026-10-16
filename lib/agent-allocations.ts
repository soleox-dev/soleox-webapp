import { dealMatchesDefaultView } from '@/lib/transaction-default-view';

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
  recipientAgentId: string | null;
};

const TEAM_CAP_KEY_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** Formula token for a cap name. "Robert Team Cap" becomes robert_team_cap. */
export function teamCapKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!key || /^[0-9]/.test(key)) return key ? `cap_${key}` : 'team_cap';
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

export function qualifyingTeamCaps(
  caps: TeamCapRule[],
  deal: Record<string, unknown> | null,
  fieldTypes: Record<string, string>,
): TeamCapRule[] {
  return caps.filter((cap) => cap.enabled && cap.splitPercentFieldKey && cap.recipientAgentId && qualifies(deal, cap.qualifyingFormula, fieldTypes));
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

function qualifies(deal: Record<string, unknown> | null, formula: string | null, fieldTypes: Record<string, string>): boolean {
  return dealMatchesDefaultView(deal || {}, formula || '', fieldTypes);
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

function alreadyCounted(
  history: DealAllocationContext['history'],
  agentId: string,
  periodStart: string | null,
  teamCapId: string,
): number {
  return roundCurrency(history.reduce((sum, row) => {
    if (row.agentId !== agentId || row.teamCapId !== teamCapId) return sum;
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

  const recorded = context.selectedTeamCapIds;
  const matchingCaps = qualifyingTeamCaps(context.teamCaps, context.deal, context.fieldTypes)
    .filter((cap) => !recorded || recorded.includes(cap.id));
  const payableCaps = matchingCaps.flatMap((cap) => {
    const recipientId = cap.recipientAgentId;
    if (!recipientId) return [];
    const onDeal = shares.some((share) => share.agentId === recipientId);
    if (!onDeal && !recorded) return [];
    return [{ cap, recipientId }];
  });
  if (payableCaps.length > 0) {
    const paid = new Map<string, number>();
    payableCaps.forEach(({ cap, recipientId }) => {
      const inputs: TeamCapAgentInput[] = shares.map((share) => {
        const fields = profiles.get(share.agentId)?.fields || {};
        const capAmount = parseNumber(fields[cap.capAmountFieldKey || '']);
        const resetDate = dealField({ ...fields }, cap.resetDateFieldKey || '') || null;
        const periodStart = capAmount == null ? null : anniversaryStart(resetDate, context.dealDate);
        return {
          agentId: share.agentId,
          isRecipient: share.agentId === recipientId,
          shareAmount: share.amount,
          teamPercent: parseTeamPercent(fields[cap.splitPercentFieldKey || '']),
          capAmount,
          resetDate,
          alreadyCounted: alreadyCounted(context.history, share.agentId, periodStart, cap.id),
          overrideAmount: overrideFor(context.overrides, share.agentId, 'team_cap', cap.id),
        };
      });
      applyTeamCap(inputs, context.dealDate).forEach((result, index) => {
        if (result.agentId === recipientId) return;
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
            tracked: false,
          });
        }
      });
    });
  }

  const volume = context.salesVolume;
  if (volume?.enabled && qualifies(context.deal, volume.qualifyingFormula, context.fieldTypes)) {
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
