/**
 * Submitting a commission template: the waterfall its rules produce replaces the deal's agents, deductions and
 * post-splits. The template popup, the page and the out-of-date payments check all build it here.
 */
import { TEAM_CAP_SELECTION_KEY } from '@/lib/agent-allocations';
import { isPrimaryAgent } from './stored-lines';
import type { AppliedTemplateRules } from './template';
import type { AgentConfig, KnownAgentInfo, WaterfallState } from './model';

/** Saved submission parameters as strings. */
export function parameterRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    record[key] = raw === undefined || raw === null ? '' : String(raw);
  }
  return record;
}

/** The parameters the template's formulas read: the stored team cap choice is not one of them. */
export function formulaParameters(value: unknown): Record<string, string> {
  const { [TEAM_CAP_SELECTION_KEY]: omittedCapSelection, ...parameters } = parameterRecord(value);
  void omittedCapSelection;
  return parameters;
}

function namesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * The waterfall after a template is applied. Agents come in the template's agent split order (then any agent that
 * only has post-splits, then the deal's other agents); the primary agent moves to the front. With no agent split
 * in the template, the deal's first agent keeps their split. Team cap recipients the submission checked are added
 * with a 0% split when the template does not list them (pass null when the submission has no cap choice).
 */
export function waterfallAfterTemplate(
  applied: AppliedTemplateRules,
  previousAgents: AgentConfig[],
  knownAgents: KnownAgentInfo[],
  primaryAgentId: string | null,
  options: {
    keepPreviousAgents?: boolean;
    teamCapRecipients?: { id: string; name: string; isTeamLead?: boolean }[] | null;
  } = {},
): WaterfallState {
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
  // The out-of-date check keeps every saved agent; the popup replaces them.
  if (options.keepPreviousAgents) {
    previousAgents.forEach((agent) => {
      const key = agent.name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      agentNames.push(agent.name);
    });
  }

  const templateAgents: AgentConfig[] = agentNames.map((name) => {
    const known = knownAgents.find((agent) => namesMatch(agent.name, name));
    const previous = previousAgents.find((agent) => namesMatch(agent.name, name));
    const split = orderedSplits.find((item) => namesMatch(item.name, name));
    const keptPrimary = orderedSplits.length === 0 && primary && namesMatch(primary.name, name) ? primary : null;
    const bonusNet = (applied.bonuses || []).reduce(
      (sum, bonus) => sum + (namesMatch(bonus.to, name) ? bonus.amount : 0) - (namesMatch(bonus.from, name) ? bonus.amount : 0),
      0,
    );
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
      ...(Math.abs(bonusNet) >= 0.005 ? { bonusNet: Math.round(bonusNet * 100) / 100 } : {}),
    };
  });
  const primaryIndex = templateAgents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
  const orderedAgents = primaryIndex > 0
    ? [templateAgents[primaryIndex], ...templateAgents.filter((_, index) => index !== primaryIndex)]
    : templateAgents;
  const recipients = options.teamCapRecipients;
  const agents = recipients == null ? orderedAgents : [
    ...orderedAgents,
    ...recipients.flatMap((recipient) => {
      if (orderedAgents.some((agent) => agent.id === recipient.id)) return [];
      return [{
        id: recipient.id,
        name: recipient.name,
        isTeamLead: Boolean(recipient.isTeamLead),
        splitType: 'PERCENT' as const,
        splitVal: 0,
        brokerCapLimit: 0,
        brokerCapPaidYTD: 0,
        riskCapLimit: 0,
        riskPaidYTD: 0,
      }];
    }),
  ];

  return {
    agents,
    offTheTopRules: nextOff,
    preSplitRules: nextPre,
    postSplitRulesByAgent: nextPost,
    postSplit2RulesByAgent: nextPost2,
    // The submission's adjustments replace the deal's, as its rules replace the deal's rules.
    adjustments: applied.adjustments ?? [],
  };
}
