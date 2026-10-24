import { agentLineStage, AGENT_STAGES, type AgentStage, type DynamicRule } from '@/lib/commission-engine';

/** Which of the two post-split maps a rule lives in: the first holds Level 1, the second Level 2 and beyond. */
export type PostSplitMap = 'L1' | 'L2';

/** A group of post-split rows on the waterfall: one stage at one level, in engine order (stages.ts). */
export interface PostSplitGroup {
  key: string;
  stage: AgentStage;
  level: number;
  /** New rows added here go into this map; null when the group takes no typed rows (plan lines). */
  draftMap: PostSplitMap | null;
}

const STAGE_LABELS: Record<AgentStage, string> = {
  BEFORE_PLAN: 'Before Plan',
  PLAN: 'Commission Plan',
  AFTER_PLAN: 'After Plan',
};

/** The rules of both maps for one agent, matched by name the way the engine does. */
function agentRules(map: Record<string, DynamicRule[]>, name: string): DynamicRule[] {
  return map[name] || Object.entries(map).find(([key]) => key.trim().toLowerCase() === name.trim().toLowerCase())?.[1] || [];
}

/** Whether the agent has plan lines on this deal: their other lines then run before or after the plan. */
export function agentOnPlan(name: string, level1: Record<string, DynamicRule[]>, level2: Record<string, DynamicRule[]>): boolean {
  return [...agentRules(level1, name), ...agentRules(level2, name)].some((rule) => rule.planLineKey);
}

/** The stage and level a rule shows in, as the engine runs it. */
export function ruleGroup(rule: DynamicRule, map: PostSplitMap, onPlan: boolean): { stage: AgentStage; level: number } {
  return { stage: agentLineStage(rule, onPlan), level: rule.level ?? (map === 'L1' ? 1 : 2) };
}

export const groupKey = (stage: AgentStage, level: number) => `${stage}:${level}`;

/**
 * The waterfall's post-split groups, in engine order. A deal with no agent on a plan keeps today's two groups (Level 1
 * and Level 2 post-splits) even when empty, so rows can be added; on a plan deal the plan's groups show when they have
 * lines, and After Plan Level 1 is always there for typed lines.
 */
export function postSplitGroups(
  names: string[],
  level1: Record<string, DynamicRule[]>,
  level2: Record<string, DynamicRule[]>,
): { groups: PostSplitGroup[]; anyOnPlan: boolean } {
  const anyOnPlan = names.some((name) => agentOnPlan(name, level1, level2));
  const found = new Map<string, { stage: AgentStage; level: number }>();
  for (const name of names) {
    const onPlan = agentOnPlan(name, level1, level2);
    for (const [map, rules] of [['L1', agentRules(level1, name)], ['L2', agentRules(level2, name)]] as const) {
      for (const rule of rules) {
        const group = ruleGroup(rule, map, onPlan);
        found.set(groupKey(group.stage, group.level), group);
      }
    }
  }
  // Where typed rows go: Level 1 and Level 2 post-splits, which run after the plan on a plan deal.
  const typedStage: AgentStage = anyOnPlan ? 'AFTER_PLAN' : 'BEFORE_PLAN';
  const ensure = (level: number) => found.set(groupKey(typedStage, level), { stage: typedStage, level });
  ensure(1);
  if (!anyOnPlan) ensure(2);
  const order = (stage: AgentStage) => AGENT_STAGES.indexOf(stage);
  return {
    anyOnPlan,
    groups: [...found.values()]
      .sort((left, right) => order(left.stage) - order(right.stage) || left.level - right.level)
      .map(({ stage, level }) => ({
        key: groupKey(stage, level),
        stage,
        level,
        draftMap: stage === typedStage && level <= 2 ? (level === 1 ? 'L1' : 'L2') : null,
      })),
  };
}

/** The group's heading: today's "Post-Splits" without plans, the stage's name with them. */
export function groupTitle(group: PostSplitGroup, anyOnPlan: boolean): string {
  return anyOnPlan ? STAGE_LABELS[group.stage] : 'Post-Splits';
}

/** What a percent in this group is taken from, for the level pill's hover note. */
export function groupBaseNote(group: PostSplitGroup, anyOnPlan: boolean): string {
  if (group.level > 1) return `Percent deductions are calculated from what is left after Level ${group.level - 1}${anyOnPlan ? ` of ${STAGE_LABELS[group.stage]}` : ' post-splits'}.`;
  if (!anyOnPlan || group.stage === 'BEFORE_PLAN') return 'Percent deductions are calculated from agent split';
  return group.stage === 'PLAN'
    ? 'Percent deductions are calculated from the split after Before Plan lines.'
    : "Percent deductions are calculated from the agent's net after the Commission Plan.";
}

/** The subtotal under a group: "Net After Level 1 Post-Splits", or "Net After Commission Plan Level 1". */
export function groupNetLabel(group: PostSplitGroup, anyOnPlan: boolean): string {
  return anyOnPlan ? `Net After ${STAGE_LABELS[group.stage]} Level ${group.level}` : `Net After Level ${group.level} Post-Splits`;
}

type StageRuns = Record<string, { split: number; stages: { stage: AgentStage; start: number; run: { levels: { level: number; net: number }[]; items: { id: string; base: number }[] } }[]; net: number }>;

/** An agent's net after a group, from the engine's stage runs (dealResult.agentStages). */
export function agentNetAfterGroup(stageRuns: StageRuns | undefined, agentName: string, group: PostSplitGroup): number | null {
  const run = stageRuns?.[agentName];
  if (!run) return null;
  const stageIndex = AGENT_STAGES.indexOf(group.stage);
  // The last level at or before this group's, in this stage; or the net the stage started from.
  const stage = run.stages.find((item) => item.stage === group.stage);
  const level = stage?.run.levels.filter((item) => item.level <= group.level).pop();
  if (level) return level.net;
  if (stage) return stage.start;
  // The stage has no lines for this agent: the net after the stages before it.
  const before = run.stages.filter((item) => AGENT_STAGES.indexOf(item.stage) < stageIndex).pop();
  return before ? before.run.levels[before.run.levels.length - 1]?.net ?? before.start : run.split;
}

/** What a line's percent was taken from, from the engine's stage runs. */
export function lineBase(stageRuns: StageRuns | undefined, agentName: string, lineId: string): number | null {
  for (const stage of stageRuns?.[agentName]?.stages ?? []) {
    const item = stage.run.items.find((line) => line.id === lineId);
    if (item) return item.base;
  }
  return null;
}
