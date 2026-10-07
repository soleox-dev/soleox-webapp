import { applyTemplateLogic, type AppliedTemplateRules, type TemplateLogicStep } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/applyTemplateLogic';
import {
  isPrimaryAgent,
  resolvePrimaryAgentId,
  waterfallFromCommissionItems,
  type StoredCommissionItem,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/commissionItemState';
import { computeTransactionWaterfall } from '@/app/(dashboard)/commission-tracker/transactions/[id]/hooks/useTransactionWaterfall';
import {
  type AgentConfig,
  type CommissionEntityOption,
  type DynamicRule,
  type FieldSetting,
  type KnownAgentInfo,
  roundCurrency,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
import type { FormulaLedgerRow, FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

function namesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Payee name and rounded dollars. Zero amounts are omitted so an absent payee matches a $0 payee. */
export function payoutSignature(payouts: Record<string, number>): string {
  const totals = new Map<string, number>();
  for (const [name, amount] of Object.entries(payouts)) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    totals.set(key, roundCurrency((totals.get(key) || 0) + (Number(amount) || 0)));
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, amount]) => `${name}:${amount.toFixed(2)}`)
    .join('|');
}

function waterfallAfterTemplate(
  applied: AppliedTemplateRules,
  previousAgents: AgentConfig[],
  knownAgents: KnownAgentInfo[],
  primaryAgentId: string | null,
): {
  agents: AgentConfig[];
  offTheTopRules: DynamicRule[];
  preSplitRules: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent: Record<string, DynamicRule[]>;
} {
  const nextOff = applied.offTheTopRules ?? [];
  const nextPre = applied.preSplitRules ?? [];
  const nextPost = applied.postSplitRulesByAgent ?? {};
  const nextPost2 = applied.postSplit2RulesByAgent ?? {};
  const orderedSplits = applied.agentSplits ?? [];
  const primary = previousAgents[0]?.name?.trim() ? previousAgents[0] : null;
  const seen = new Set<string>();
  const agentNames = (orderedSplits.length > 0
    ? [...orderedSplits.map((split) => split.name), ...Object.keys(nextPost), ...Object.keys(nextPost2)]
    : [
        ...(primary ? [primary.name] : []),
        ...Object.keys(nextPost),
        ...Object.keys(nextPost2),
      ]
  ).filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const templateAgents: AgentConfig[] = agentNames.map((name) => {
    const known = knownAgents.find((agent) => namesMatch(agent.name, name));
    const previous = previousAgents.find((agent) => namesMatch(agent.name, name));
    const split = orderedSplits.find((item) => namesMatch(item.name, name));
    const keptPrimary = orderedSplits.length === 0 && primary && namesMatch(primary.name, name) ? primary : null;
    return {
      id: known?.id || previous?.id || `AGT_${name.trim()}`,
      name: known?.name || previous?.name || name.trim(),
      isTeamLead: known?.isTeamLead ?? previous?.isTeamLead ?? false,
      splitType: split?.splitType ?? keptPrimary?.splitType ?? 'PERCENT',
      splitVal: split?.splitVal ?? keptPrimary?.splitVal ?? 0,
      brokerCapLimit: 0,
      brokerCapPaidYTD: 0,
      riskCapLimit: 0,
      riskPaidYTD: 0,
    };
  });
  const primaryIndex = templateAgents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
  const agents = primaryIndex > 0
    ? [templateAgents[primaryIndex], ...templateAgents.filter((_, index) => index !== primaryIndex)]
    : templateAgents;

  return {
    agents,
    offTheTopRules: nextOff,
    preSplitRules: nextPre,
    postSplitRulesByAgent: nextPost,
    postSplit2RulesByAgent: nextPost2,
  };
}

/** Saved payment totals from stored commission-line dollars, without reapplying percent splits. */
export function savedPayouts(
  items: StoredCommissionItem[],
  agents: KnownAgentInfo[],
  entities: CommissionEntityOption[],
): Record<string, number> {
  const agentLabel = (id?: string | null) => agents.find((agent) => agent.id === id)?.name || '';
  const entityLabel = (item: StoredCommissionItem) => {
    if (item.payee_entity_id) {
      const match = entities.find((entity) => entity.id === item.payee_entity_id);
      if (match?.name) return match.name;
    }
    return String(item.rule_name || '').trim();
  };
  const splits = new Map<string, { name: string; split: number; level1: number; level2: number }>();
  const payouts: Record<string, number> = {};
  const add = (name: string, amount: number) => {
    const key = name.trim();
    if (!key) return;
    payouts[key] = roundCurrency((payouts[key] || 0) + amount);
  };
  const bucketFor = (name: string) => {
    const key = name.trim().toLowerCase();
    const existing = splits.get(key);
    if (existing) return existing;
    const created = { name: name.trim(), split: 0, level1: 0, level2: 0 };
    splits.set(key, created);
    return created;
  };

  for (const item of items) {
    const section = String(item.section || '').trim().toUpperCase();
    const amount = roundCurrency(Number(item.final_amount ?? item.calculated_amount ?? 0) || 0);
    if (section === 'AGENT_SPLIT') {
      const name = agentLabel(item.agent_id) || String(item.rule_name || '').replace(/ Split$/, '').trim();
      const bucket = bucketFor(name);
      bucket.split = roundCurrency(bucket.split + amount);
    } else if (section === 'POST_SPLIT' || section === 'POST_SPLIT_L2') {
      const agent = agentLabel(item.agent_id);
      if (agent) {
        const bucket = bucketFor(agent);
        if (section === 'POST_SPLIT') bucket.level1 = roundCurrency(bucket.level1 + amount);
        else bucket.level2 = roundCurrency(bucket.level2 + amount);
      }
      add(entityLabel(item), amount);
    } else if (section === 'OFF_THE_TOP' || section === 'PRE_SPLIT') {
      add(entityLabel(item), amount);
    }
  }

  for (const bucket of splits.values()) {
    const afterLevel1 = roundCurrency(Math.max(0, bucket.split - bucket.level1));
    add(bucket.name, roundCurrency(Math.max(0, afterLevel1 - bucket.level2)));
  }
  return payouts;
}

/**
 * Replays a submitted template with its stored parameters and returns the payment signature
 * submitting it again would write. Throws when the template cannot be calculated.
 */
export function replayedPaymentSignature({
  deal,
  steps,
  parameters,
  parameterTypes,
  items,
  agents,
  entities,
  overviewFields,
  ledger = [],
  lookups,
}: {
  deal: Record<string, unknown>;
  steps: TemplateLogicStep[];
  parameters: Record<string, string>;
  parameterTypes: Record<string, string | null | undefined>;
  items: StoredCommissionItem[];
  agents: KnownAgentInfo[];
  entities: CommissionEntityOption[];
  overviewFields: FieldSetting[];
  ledger?: FormulaLedgerRow[];
  lookups?: FormulaLookups;
}): string {
  const salesPrice = Math.abs(Number(deal.sales_price) || 0);
  const gciPerc = Number(deal.gci_perc) || 0;
  const clientType = String(deal.client_type || deal.deal_type || deal.transaction_side || '');
  const transactionAgentId = deal.agent_id ? String(deal.agent_id) : null;
  const saved = waterfallFromCommissionItems(items, agents, entities, transactionAgentId);
  const primaryAgentId = resolvePrimaryAgentId(transactionAgentId, items, agents);
  const shared = {
    salesPrice,
    gciPerc,
    primaryAgentId,
    overviewFields,
    selectedDeal: deal,
    overviewFormValues: deal,
    clientType,
  };
  const baseline = computeTransactionWaterfall({
    ...shared,
    offTheTopRules: [],
    preSplitRules: [],
    postSplitRulesByAgent: {},
    postSplit2RulesByAgent: {},
    agents: [],
  }).totalCommission;

  const applied = applyTemplateLogic({
    steps,
    parameters,
    parameterTypes,
    deal,
    entities,
    rosterAgents: agents,
    dealAgents: saved.agents,
    totalCommission: baseline,
    ledger,
    lookups,
  });
  const next = waterfallAfterTemplate(applied, saved.agents, agents, primaryAgentId);
  const result = computeTransactionWaterfall({ ...shared, ...next });
  return payoutSignature(result.netPayouts);
}
