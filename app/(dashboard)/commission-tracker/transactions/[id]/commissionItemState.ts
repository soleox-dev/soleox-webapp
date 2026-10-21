import { AgentConfig, CommissionEntityOption, DynamicRule, KnownAgentInfo } from './types';

/** A commission line as stored in transaction_commission_items. */
export interface StoredCommissionItem {
  id: string;
  step_number?: number | string | null;
  rule_name?: string | null;
  section?: string | null;
  split_type?: string | null;
  split_value?: number | string | null;
  note?: string | null;
  payee_type?: string | null;
  payee_entity_id?: string | null;
  agent_id?: string | null;
  calculated_amount?: number | string | null;
  final_amount?: number | string | null;
}

export interface WaterfallState {
  agents: AgentConfig[];
  offTheTopRules: DynamicRule[];
  preSplitRules: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent: Record<string, DynamicRule[]>;
}

function sectionOf(item: { section?: string | null }): string {
  return String(item.section || '').trim().toUpperCase();
}

function stepOf(item: { step_number?: number | string | null }): number {
  const step = Number(item.step_number);
  return Number.isFinite(step) ? step : 0;
}

function splitAmount(item: StoredCommissionItem): number {
  if (item.split_value === null || item.split_value === undefined || item.split_value === '') return 0;
  const amount = Number(item.split_value);
  return Number.isFinite(amount) ? amount : 0;
}

function hasSplitValue(item: StoredCommissionItem): boolean {
  return item.split_value !== null && item.split_value !== undefined && item.split_value !== '';
}

function dollarAmount(item: StoredCommissionItem): number | null {
  const raw = item.final_amount ?? item.calculated_amount;
  if (raw === null || raw === undefined || raw === '') return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

/** Agent splits are AGENT_SPLIT rows. */
function isAgentAllocation(item: StoredCommissionItem): boolean {
  return sectionOf(item) === 'AGENT_SPLIT';
}

function allocationOf(item: StoredCommissionItem): { splitType: 'PERCENT' | 'AMOUNT'; splitVal: number } {
  const explicit = String(item.split_type || '').trim().toUpperCase();
  if (hasSplitValue(item) && (explicit === 'PERCENT' || explicit === 'AMOUNT')) {
    return {
      splitType: explicit === 'AMOUNT' ? 'AMOUNT' : 'PERCENT',
      splitVal: splitAmount(item),
    };
  }
  return { splitType: 'AMOUNT', splitVal: dollarAmount(item) ?? 0 };
}

function ruleParts(item: StoredCommissionItem): { type: 'PERCENT' | 'AMOUNT'; value: number } {
  const explicit = String(item.split_type || '').trim().toUpperCase();
  if (hasSplitValue(item) && (explicit === 'PERCENT' || explicit === 'AMOUNT')) {
    return { type: explicit === 'AMOUNT' ? 'AMOUNT' : 'PERCENT', value: splitAmount(item) };
  }
  const dollars = dollarAmount(item);
  if (dollars !== null) return { type: 'AMOUNT', value: dollars };
  return { type: 'PERCENT', value: 0 };
}

function byStep(left: StoredCommissionItem, right: StoredCommissionItem): number {
  return stepOf(left) - stepOf(right);
}

function entityLabel(item: StoredCommissionItem, entities: CommissionEntityOption[]): string {
  if (item.payee_entity_id) {
    const match = entities.find((entity) => entity.id === item.payee_entity_id);
    if (match?.name) return match.name;
  }
  return (item.rule_name || '').trim();
}

function toRule(item: StoredCommissionItem, entities: CommissionEntityOption[]): DynamicRule {
  const label = entityLabel(item, entities);
  const parts = ruleParts(item);
  return {
    id: item.id,
    name: label,
    entity: label,
    note: item.note || '',
    type: parts.type,
    value: parts.value,
  };
}

function nameFromSplitRule(ruleName: string | null | undefined): string {
  const text = (ruleName || '').trim();
  return text.endsWith(' Split') ? text.slice(0, -' Split'.length).trim() : text;
}

function agentFromDirectory(agentId: string | null | undefined, knownAgents: KnownAgentInfo[]): KnownAgentInfo | undefined {
  if (!agentId) return undefined;
  return knownAgents.find((agent) => agent.id === agentId);
}

function agentConfig(
  item: StoredCommissionItem,
  knownAgents: KnownAgentInfo[],
  splitType: 'PERCENT' | 'AMOUNT',
  splitVal: number,
): AgentConfig {
  const known = agentFromDirectory(item.agent_id, knownAgents);
  const fallbackName = nameFromSplitRule(item.rule_name);
  return {
    id: item.agent_id || known?.id || `AGT_${fallbackName || item.id}`,
    name: known?.name || fallbackName || 'Agent',
    isTeamLead: known?.isTeamLead ?? false,
    splitType,
    splitVal,
    brokerCapLimit: 0,
    brokerCapPaidYTD: 0,
    riskCapLimit: 0,
    riskPaidYTD: 0,
  };
}

function rulesFor(
  items: StoredCommissionItem[],
  section: string,
  entities: CommissionEntityOption[],
): DynamicRule[] {
  return items
    .filter((item) => sectionOf(item) === section && !isAgentAllocation(item))
    .sort(byStep)
    .map((item) => toRule(item, entities));
}

/**
 * The primary agent is the transaction's agent when that field is set.
 * Otherwise it is the AGENT_SPLIT row at step 1.
 * The agent list is not reordered to match either source.
 */
export function resolvePrimaryAgentId(
  transactionAgentId: string | null | undefined,
  items: Array<Pick<StoredCommissionItem, 'section' | 'step_number' | 'agent_id'>>,
  knownAgents: KnownAgentInfo[] = [],
): string | null {
  const raw = String(transactionAgentId || '').trim();
  if (raw) {
    const known = knownAgents.find((agent) => agent.id === raw || agent.name.toLowerCase() === raw.toLowerCase());
    return known?.id || raw;
  }
  const stepOne = items.find((item) => sectionOf(item) === 'AGENT_SPLIT' && stepOf(item) === 1 && item.agent_id);
  return stepOne?.agent_id ? String(stepOne.agent_id) : null;
}

export function isPrimaryAgent(
  agent: { id: string; name: string },
  primaryAgentId: string | null | undefined,
): boolean {
  const key = String(primaryAgentId || '').trim().toLowerCase();
  if (!key) return false;
  return agent.id.toLowerCase() === key || agent.name.toLowerCase() === key;
}

function placePrimary(agents: AgentConfig[], primaryAgentId: string | null): AgentConfig[] {
  if (!primaryAgentId) return agents;
  const index = agents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
  if (index <= 0) return agents;
  const next = agents.slice();
  const [primary] = next.splice(index, 1);
  return [primary, ...next];
}

/**
 * Builds the waterfall the screen edits from commission item rows.
 * Agent splits stay in step order, then the primary agent is moved to the front.
 * Agent names and team-lead come from the agents directory.
 * Entity labels come from commission entities through payee_entity_id.
 */
export function waterfallFromCommissionItems(
  items: StoredCommissionItem[],
  knownAgents: KnownAgentInfo[],
  knownEntities: CommissionEntityOption[],
  transactionAgentId?: string | null,
): WaterfallState {
  const rows = Array.isArray(items) ? items : [];
  const agentRows = rows.filter(isAgentAllocation).sort(byStep);
  const agents: AgentConfig[] = [];
  // Agents not in the directory yet (it loads after the stored waterfall) take a name from their split rule,
  // often just "Agent". Names key the post-split rules and the cards, so two such agents get "Agent", "Agent 2".
  const addAgent = (config: AgentConfig): AgentConfig => {
    let name = config.name;
    for (let n = 2; agents.some((agent) => agent.name === name); n += 1) name = `${config.name} ${n}`;
    const added = name === config.name ? config : { ...config, name };
    agents.push(added);
    return added;
  };
  agentRows.forEach((item) => {
    const allocation = allocationOf(item);
    const config = agentConfig(item, knownAgents, allocation.splitType, allocation.splitVal);
    if (agents.some((agent) => agent.id === config.id)) return;
    addAgent(config);
  });

  const groupPostSplits = (section: string): Record<string, DynamicRule[]> => {
    const grouped: Record<string, DynamicRule[]> = {};
    rows
      .filter((item) => sectionOf(item) === section)
      .sort(byStep)
      .forEach((item) => {
        let onDeal = item.agent_id ? agents.find((agent) => agent.id === item.agent_id) : undefined;
        if (!onDeal && item.agent_id) {
          onDeal = addAgent(agentConfig(item, knownAgents, 'PERCENT', 0));
        }
        const name = onDeal?.name || nameFromSplitRule(item.rule_name) || 'Agent';
        grouped[name] = [...(grouped[name] || []), toRule(item, knownEntities)];
      });
    return grouped;
  };

  return {
    agents: placePrimary(agents, resolvePrimaryAgentId(transactionAgentId, rows, knownAgents)),
    offTheTopRules: rulesFor(rows, 'OFF_THE_TOP', knownEntities),
    preSplitRules: rulesFor(rows, 'PRE_SPLIT', knownEntities),
    postSplitRulesByAgent: groupPostSplits('POST_SPLIT'),
    postSplit2RulesByAgent: groupPostSplits('POST_SPLIT_L2'),
  };
}
