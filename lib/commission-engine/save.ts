/**
 * What saving a deal writes from its waterfall: the commission lines, the payments, the team cap and sales volume
 * rows, and why Save is blocked.
 */
import type { DealAllocationLine, TeamCapRule } from '@/lib/agent-allocations';
import { isPrimaryAgent } from './stored-lines';
import { roundCurrency, roundPercentRate, type AgentConfig, type CommissionEntityOption, type KnownAgentInfo } from './model';
import type { WaterfallResult } from './waterfall';

type Directory = { knownAgents: KnownAgentInfo[]; knownEntities: CommissionEntityOption[] };

function cleanRuleValue(item: { type?: string; value?: number | null }): { splitType: string; value: number | null } {
  const splitType = item.type || 'PERCENT';
  const value = item.value !== undefined && item.value !== null
    ? (splitType === 'PERCENT' ? roundPercentRate(Number(item.value)) : roundCurrency(Number(item.value)))
    : null;
  return { splitType, value };
}

/** transaction_commission_items rows for the save payload. Agents taking no part in the deal (idleAgentIds) are left out. */
export function commissionLinesForSave(result: WaterfallResult, { knownAgents, knownEntities }: Directory) {
  const idle = new Set(result.idleAgentIds || []);
  const isIdle = (item: { agentId?: string | null }) => Boolean(item.agentId && idle.has(item.agentId));
  const entityFor = (item: { entity?: string }) => knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
  const agentFor = (item: { agentId?: string; agentName?: string }) => knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
  return [
    ...result.offTheTopItems.map((item: any, idx: number) => {
      const { splitType, value } = cleanRuleValue(item);
      return {
        step_number: idx + 1,
        rule_name: item.entity || item.ruleName || 'Off-the-Top Deduction',
        section: 'OFF_THE_TOP',
        split_type: splitType,
        split_value: value,
        note: item.note || null,
        payee_type: 'ENTITY',
        payee_entity_id: entityFor(item)?.id || null,
        agent_id: null,
        final_amount: item.amount,
      };
    }),
    ...(result.preSplitItems || []).map((item: any, idx: number) => {
      const { splitType, value } = cleanRuleValue(item);
      return {
        step_number: 10 + idx + 1,
        rule_name: item.entity || item.ruleName || 'Pre-Split Deduction',
        section: 'PRE_SPLIT',
        split_type: splitType,
        split_value: value,
        note: item.note || null,
        payee_type: 'ENTITY',
        payee_entity_id: entityFor(item)?.id || null,
        agent_id: null,
        final_amount: item.amount,
      };
    }),
    ...result.agentSplitItems.filter((item: any) => !isIdle(item)).map((item: any, idx: number) => {
      const splitType = item.splitType || 'PERCENT';
      let cleanSplitVal: number | null = null;
      if (splitType === 'PERCENT') {
        const raw = item.percent !== undefined && item.percent !== null
          ? item.percent
          : (item.splitVal !== undefined && item.splitVal !== null ? item.splitVal : null);
        cleanSplitVal = raw !== null ? roundPercentRate(Number(raw)) : null;
      } else {
        cleanSplitVal = item.splitVal !== undefined && item.splitVal !== null
          ? roundCurrency(Number(item.splitVal))
          : (item.amount !== undefined ? roundCurrency(Number(item.amount)) : null);
      }
      return {
        step_number: idx + 1,
        rule_name: `${item.agentName} Split`,
        section: 'AGENT_SPLIT',
        split_type: splitType,
        split_value: cleanSplitVal,
        note: null,
        payee_type: 'AGENT',
        payee_entity_id: null,
        agent_id: agentFor(item)?.id || item.agentId || null,
        final_amount: item.amount,
        // A split typed by hand keeps winning over the template's formula after reload.
        custom_attributes: item.manualSplit ? { manual_split: true } : {},
      };
    }),
    ...result.postSplitItems.filter((item: any) => !isIdle(item)).map((item: any, idx: number) => {
      const { splitType, value } = cleanRuleValue(item);
      return {
        step_number: 30 + idx + 1,
        rule_name: item.entity || item.ruleName || 'Post-Split Deduction',
        section: 'POST_SPLIT',
        split_type: splitType,
        split_value: value,
        note: item.note || null,
        payee_type: item.entity === 'Broker' || item.entity === 'Brokerage' ? 'BROKERAGE' : 'ENTITY',
        payee_entity_id: entityFor(item)?.id || null,
        agent_id: agentFor(item)?.id || item.agentId || null,
        final_amount: item.amount,
      };
    }),
    ...(result.postSplit2Items || []).filter((item: any) => !isIdle(item)).map((item: any, idx: number) => {
      const { splitType, value } = cleanRuleValue(item);
      return {
        step_number: 50 + idx + 1,
        rule_name: item.entity || item.ruleName || 'Post-Split L2 Deduction',
        section: 'POST_SPLIT_L2',
        split_type: splitType,
        split_value: value,
        note: item.note || null,
        payee_type: 'ENTITY',
        payee_entity_id: entityFor(item)?.id || null,
        agent_id: agentFor(item)?.id || item.agentId || null,
        final_amount: item.amount,
      };
    }),
  ];
}

/** Payments for the save payload: each agent's net, then each entity's total. */
export function paymentsForSave(
  result: WaterfallResult,
  {
    knownAgents,
    knownEntities,
    agents,
    primaryAgentId,
    primaryAgentFallback,
    paymentDate,
  }: Directory & {
    /** The deal's agents as the waterfall lists them. */
    agents: AgentConfig[];
    primaryAgentId: string | null;
    /** The Primary Agent field, named in the payment notes when the agent is not on the waterfall. */
    primaryAgentFallback: string;
    paymentDate: string;
  },
) {
  const idle = new Set(result.idleAgentIds || []);
  const agentPayouts = Object.entries(result.netPayouts).filter(([e]) => agents.some((a) => a.name === e && !idle.has(a.id))) as [string, number][];
  const entityPayouts = Object.entries(result.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];
  const primaryAgentName = agents.find((agent) => isPrimaryAgent(agent, primaryAgentId))?.name || primaryAgentFallback || 'Primary Agent';
  return [
    ...agentPayouts.map(([agentName, amount]) => {
      const matchedAgent = knownAgents.find((a) => a.name === agentName || a.id === agentName);
      return {
        payee_type: 'AGENT',
        agent_id: matchedAgent?.id || null,
        payee_entity_id: null,
        amount_paid: amount,
        payment_method: 'ACH',
        payment_status: 'Ready to Pay',
        disbursement_type: 'AGENT_NET',
        notes: `${matchedAgent?.name || agentName} (Agent) - Primary: ${primaryAgentName}`,
        payment_date: paymentDate,
      };
    }),
    ...entityPayouts.map(([entityName, amount]) => {
      const matchedEntity = knownEntities.find((e) => e.name === entityName || e.id === entityName);
      return {
        payee_type: entityName.toLowerCase().includes('broker') ? 'BROKERAGE' : 'ENTITY',
        agent_id: null,
        payee_entity_id: matchedEntity?.id || null,
        amount_paid: amount,
        payment_method: 'Escrow Wire',
        payment_status: 'Pending Escrow Wire',
        disbursement_type: 'THIRD_PARTY_DISBURSEMENT',
        notes: `${matchedEntity?.name || entityName} (Entity) - Primary: ${primaryAgentName}`,
        payment_date: paymentDate,
      };
    }),
  ];
}

export type AllocationSaveRow = {
  agentId: string;
  kind: string;
  amount: number;
  calculatedAmount: number;
  isOverride: boolean;
  periodStart: string | null;
  teamCapId: string | null;
};

/** Team cap and sales volume rows to store (PUT /api/transaction-team-caps and /api/transaction-agent-allocations). */
export function allocationRowsForSave(lines: DealAllocationLine[]): AllocationSaveRow[] {
  return (lines || [])
    .filter((line) => line.tracked !== false)
    .map((line) => ({
      agentId: line.agent_id,
      kind: line.kind,
      amount: line.amount,
      calculatedAmount: line.calculated_amount,
      isOverride: line.is_override,
      periodStart: line.period_start,
      teamCapId: line.team_cap_id || null,
    }));
}

export type CapRecipientShortfall = { recipientId: string; name: string; receives: number; has: number };

/**
 * An agent who receives team cap money must have at least that much in Agent Splits: if two agents each pay $500
 * into a team cap, its recipient needs $1,000 or more. Money paid into a cap by the recipient themself is not counted.
 */
export function capRecipientShortfalls(
  result: Pick<WaterfallResult, 'allocationLines' | 'agentSplitItems'>,
  teamCaps: TeamCapRule[],
  knownAgents: KnownAgentInfo[],
): CapRecipientShortfall[] {
  const owed = new Map<string, number>();
  for (const line of result.allocationLines || []) {
    if (line.kind !== 'team_cap') continue;
    const recipientId = teamCaps.find((cap) => cap.id === line.team_cap_id)?.recipientAgentId;
    if (!recipientId || recipientId === line.agent_id) continue;
    owed.set(recipientId, roundCurrency((owed.get(recipientId) || 0) + (Number(line.amount) || 0)));
  }
  return [...owed].flatMap(([recipientId, receives]) => {
    const split = (result.agentSplitItems || []).find((item: { agentId?: string }) => item?.agentId === recipientId);
    const has = roundCurrency(Number(split?.amount) || 0);
    if (receives - has <= 0.009) return [];
    const name = split?.agentName || knownAgents.find((agent) => agent.id === recipientId)?.name || 'A team cap recipient';
    return [{ recipientId, name: String(name), receives, has }];
  });
}

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "<Agent>'s agent split is $X, less than the $Y team caps move to them." for each recipient short. */
export function capShortfallMessage(shortfalls: CapRecipientShortfall[]): string {
  return shortfalls
    .map(({ name, receives, has }) => `${name}'s agent split is $${money(has)}, less than the $${money(receives)} team caps move to them.`)
    .join(' ');
}

export type SaveBlockers = {
  agentSplitsExceedCommission: boolean;
  paymentsShortOfCommission: boolean;
  capRecipientShortfalls: CapRecipientShortfall[];
  blocked: boolean;
  reason: string;
};

/**
 * Why Save is locked. The whole commission has to be paid out only when a commission template applies to the deal
 * (templateQualifies is not false): a deal that qualifies for none, such as a cancelled one, needs no payments.
 */
export function saveBlockers(
  result: Pick<WaterfallResult, 'agentSplitExcess' | 'totalCommission' | 'netPayouts'>,
  templateQualifies: boolean | null,
  shortfalls: CapRecipientShortfall[],
): SaveBlockers {
  const agentSplitsExceedCommission = (Number(result.agentSplitExcess) || 0) > 0.009;
  const commissionTotal = roundCurrency(Number(result.totalCommission) || 0);
  const totalPayments = roundCurrency(Object.values(result.netPayouts || {}).reduce((sum: number, amount) => sum + (Number(amount) || 0), 0));
  const paymentsShortOfCommission = templateQualifies !== false
    && commissionTotal > 0.009 && roundCurrency(commissionTotal - totalPayments) > 0.009;
  const shortfallMessage = capShortfallMessage(shortfalls);
  return {
    agentSplitsExceedCommission,
    paymentsShortOfCommission,
    capRecipientShortfalls: shortfalls,
    blocked: agentSplitsExceedCommission || paymentsShortOfCommission || shortfalls.length > 0,
    reason: [
      agentSplitsExceedCommission ? 'Agent splits are more than the remaining balance.' : '',
      paymentsShortOfCommission ? 'The entire commission has to be allocated among agents and entities.' : '',
      shortfallMessage,
    ].filter(Boolean).join(' '),
  };
}
