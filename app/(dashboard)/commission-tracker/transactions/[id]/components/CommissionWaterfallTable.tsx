import React, { useEffect, useState } from 'react';
import { AgentConfig, DynamicRule, CommissionEntityOption, KnownAgentInfo } from '../types';
import { isPrimaryAgent } from '@/lib/commission-engine/stored-lines';
import { HoverNote } from './HoverNote';
import { SplitPair } from './SplitPair';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { RotateCcw } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { REVEAL_DELETE_CLASS } from './useRevealDelete';
import { agentNetAfterGroup, agentOnPlan, groupBaseNote, groupKey, groupNetLabel, groupTitle, lineBase, postSplitGroups, ruleGroup, type PostSplitGroup, type PostSplitMap } from './postSplitGroups';
import type { AgentStage } from '@/lib/commission-engine';
import { toPercentPoints } from '@/lib/percent';
import { orderPostSplitNames } from '@/lib/post-split-order';
import { AgentAllocationNotes, TeamCapAmount, TeamCapReceived, adjustedSplitView, teamCapGroups, teamCapReceived, teamCapReceivedNote, type AgentAllocationLine } from './AgentAllocationNotes';
import type { TeamCapRecipient } from '@/lib/agent-allocations';
import { AgentSplitExcessNotice } from './AgentSplitExcessNotice';

/** A waterfall stage's heading: larger than the rows, with a short money-green bar in front. */
export const WATERFALL_HEADING = "inline-flex items-center gap-2.5 text-base font-bold text-slate-900 before:h-5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-brand-500 before:content-[''] dark:text-white dark:before:bg-brand-400";

type SplitType = 'PERCENT' | 'AMOUNT';

interface CommissionWaterfallTableProps {
  isEditing: boolean;
  agents: AgentConfig[];
  primaryAgentId?: string | null;
  dealResult: any;
  knownEntities: CommissionEntityOption[];
  knownAgents: KnownAgentInfo[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent: Record<string, DynamicRule[]>;
  commissionAfterPreSplit: number;
  preventMinus: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenAddAgentModal: () => void;
  onRemoveAgent: (name: string) => void;
  onSwitchAgent?: (agentId: string, newAgentName: string) => void;
  onToggleAgentSplitType: (id: string) => void;
  onSplitValueChange: (id: string, val: number) => void;
  onDeleteAgentPostSplitRule: (agentName: string, ruleId: string) => void;
  /** Charges a waived Commission Plan line again on this deal (the delete above waives one). */
  onWaivePlanLine?: (lineKey: string, waived: boolean) => void;
  onToggleAgentPostSplitType: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplitValue: (agentName: string, ruleId: string, val: number) => void;
  onUpdateAgentPostSplitEntity?: (agentName: string, ruleId: string, entity: string) => void;
  onReorderPostSplitEntities?: (entityOrder: string[]) => void;
  onDeleteAgentPostSplit2Rule?: (agentName: string, ruleId: string) => void;
  onToggleAgentPostSplit2Type?: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplit2Value?: (agentName: string, ruleId: string, val: number) => void;
  onUpdateAgentPostSplit2Entity?: (agentName: string, ruleId: string, entity: string) => void;
  onReorderPostSplit2Entities?: (entityOrder: string[]) => void;
  onAddLevel1Cell: (agentName: string, entity: string) => void;
  onAddLevel2Cell: (agentName: string, entity: string) => void;
  onDraftDirty?: (dirty: boolean) => void;
  allocations?: AgentAllocationLine[];
  /** Each team cap's id and the agent it pays, so the cap rows can show what that agent receives. */
  teamCapRecipients?: Record<string, TeamCapRecipient[]>;
  onTeamCapAmountChange?: (agentId: string, teamCapId: string, amount: number | null) => void;
  onRemoveTeamCap?: (teamCapId: string) => void;
  agentCapNote?: (agentId: string, agentName: string, entity: string) => React.ReactNode;
}

const PLAN_CHIPS = {
  plan: {
    text: 'Plan',
    note: "Calculated by the agent's Commission Plan, not the template.",
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/40',
  },
  edited: {
    text: 'Edited',
    note: 'Typed on this deal; it replaces what the Commission Plan calculates, and later plan lines follow it.',
    tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  },
  waived: {
    text: 'Waived',
    note: 'Waived on this deal: the plan line is $0 for every agent and adds nothing to year-to-date totals.',
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/40',
  },
} as const;

/** Marks a Commission Plan line: Plan where it shows the plan's amount, Edited when typed over, Waived when waived. */
export function PlanChip({ kind }: { kind: keyof typeof PLAN_CHIPS }) {
  const chip = PLAN_CHIPS[kind];
  return (
    <HoverNote label={chip.note}>
      <span tabIndex={0} className={`shrink-0 text-2xs border px-1.5 py-0.5 rounded-full font-semibold cursor-help outline-none ${chip.tone}`}>{chip.text}</span>
    </HoverNote>
  );
}

/** The chip for a plan line's own amount: Waived or Edited, or none when it is the plan's amount. */
export function planStateKind(rule: DynamicRule): 'waived' | 'edited' | null {
  if (!rule.planLineKey) return null;
  if (rule.planWaived) return 'waived';
  return rule.planTyped ? 'edited' : null;
}

function entityOrder(rulesByAgent: Record<string, DynamicRule[]>, names: string[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    for (const rule of rulesByAgent[name] || []) {
      const entity = (rule.entity || rule.name || '').trim();
      if (!entity || seen.has(entity)) continue;
      seen.add(entity);
      order.push(entity);
    }
  }
  return order;
}

function rulesForEntity(rules: DynamicRule[] | undefined, entity: string): DynamicRule[] {
  return (rules || []).filter((rule) => (rule.entity || rule.name || '').trim() === entity);
}

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((entity, index) => entity === right[index]);
}

export function orderRulesByEntities(rulesByAgent: Record<string, DynamicRule[]>, nextOrder: string[]): Record<string, DynamicRule[]> {
  const next: Record<string, DynamicRule[]> = {};
  for (const [agentName, rules] of Object.entries(rulesByAgent)) {
    const buckets = new Map<string, DynamicRule[]>();
    const extras: DynamicRule[] = [];
    for (const rule of rules || []) {
      const entity = (rule.entity || rule.name || '').trim();
      if (!nextOrder.includes(entity)) {
        extras.push(rule);
        continue;
      }
      const list = buckets.get(entity) ?? [];
      list.push(rule);
      buckets.set(entity, list);
    }
    const ordered: DynamicRule[] = [];
    for (const entity of nextOrder) {
      const group = buckets.get(entity);
      if (group) ordered.push(...group);
    }
    next[agentName] = [...ordered, ...extras];
  }
  return next;
}

function useStableEntityOrder(
  rulesByAgent: Record<string, DynamicRule[]>,
  names: string[],
  pinned: string[],
  preferred: string[],
) {
  const namesKey = names.join('\u0000');
  const pinnedKey = pinned.join('\u0000');
  const preferredKey = preferred.join('\u0000');
  const [order, setOrder] = useState(() => orderPostSplitNames(entityOrder(rulesByAgent, names), preferred));

  useEffect(() => {
    const nameList = namesKey === '' ? [] : namesKey.split('\u0000');
    const pinnedList = pinnedKey === '' ? [] : pinnedKey.split('\u0000');
    const preferredList = preferredKey === '' ? [] : preferredKey.split('\u0000');
    const live = entityOrder(rulesByAgent, nameList);
    for (const entity of pinnedList) {
      if (entity && !live.includes(entity)) live.push(entity);
    }
    const sorted = orderPostSplitNames(live, preferredList);
    setOrder((prev) => (sameOrder(prev, sorted) ? prev : sorted));
  }, [rulesByAgent, namesKey, pinnedKey, preferredKey]);

  return [order, setOrder] as const;
}

export function CommissionWaterfallTable({
  isEditing,
  agents,
  primaryAgentId,
  dealResult,
  knownEntities,
  knownAgents,
  postSplitRulesByAgent,
  postSplit2RulesByAgent,
  commissionAfterPreSplit,
  preventMinus,
  onOpenAddAgentModal,
  onRemoveAgent,
  onSwitchAgent,
  onToggleAgentSplitType,
  onSplitValueChange,
  onDeleteAgentPostSplitRule,
  onWaivePlanLine,
  onToggleAgentPostSplitType,
  onUpdateAgentPostSplitValue,
  onUpdateAgentPostSplitEntity,
  onReorderPostSplitEntities,
  onDeleteAgentPostSplit2Rule,
  onToggleAgentPostSplit2Type,
  onUpdateAgentPostSplit2Value,
  onUpdateAgentPostSplit2Entity,
  onReorderPostSplit2Entities,
  onAddLevel1Cell,
  onAddLevel2Cell,
  onDraftDirty,
  allocations = [],
  teamCapRecipients = {},
  onTeamCapAmountChange,
  onRemoveTeamCap,
  agentCapNote,
}: CommissionWaterfallTableProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const names = agents.map((agent) => agent.name);
  const clientPostSplitOrder = [...knownEntities]
    .filter((entity) => entity.waterfallSortOrder != null && Number.isFinite(entity.waterfallSortOrder))
    .sort((left, right) => (left.waterfallSortOrder ?? 0) - (right.waterfallSortOrder ?? 0) || left.name.localeCompare(right.name))
    .map((entity) => entity.name);
  const [draftLevel1, setDraftLevel1] = useState<string[]>([]);
  const [draftLevel2, setDraftLevel2] = useState<string[]>([]);
  const [addingLevel1Row, setAddingLevel1Row] = useState(false);
  const [addingLevel2Row, setAddingLevel2Row] = useState(false);
  const [newLevel1Entity, setNewLevel1Entity] = useState('');
  const [newLevel2Entity, setNewLevel2Entity] = useState('');
  const [level1Order, setLevel1Order] = useStableEntityOrder(postSplitRulesByAgent, names, draftLevel1, clientPostSplitOrder);
  const [level2Order, setLevel2Order] = useStableEntityOrder(postSplit2RulesByAgent, names, draftLevel2, clientPostSplitOrder);

  useEffect(() => {
    if (isEditing) return;
    setDraftLevel1([]);
    setDraftLevel2([]);
    setAddingLevel1Row(false);
    setAddingLevel2Row(false);
    setNewLevel1Entity('');
    setNewLevel2Entity('');
  }, [isEditing]);

  useEffect(() => {
    onDraftDirty?.(
      draftLevel1.length > 0 ||
      draftLevel2.length > 0 ||
      newLevel1Entity.trim() !== '' ||
      newLevel2Entity.trim() !== ''
    );
  }, [draftLevel1, draftLevel2, newLevel1Entity, newLevel2Entity, onDraftDirty]);

  // `group/cell`: a cell's delete button shows while the pointer is on that cell (see trashButton).
  const labelCell = 'group/cell sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-left align-middle border-b border-slate-200 dark:border-slate-700';
  const agentCell = 'group/cell px-2 py-2 text-center align-middle border-b border-slate-200 dark:border-slate-700 min-w-[14.5rem]';
  const sectionLabel = 'sticky left-0 z-10 px-3 py-2 text-left text-xs font-bold whitespace-nowrap border-b border-slate-200 dark:border-slate-700';
  const levelPill = 'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold tracking-normal';
  const level1Pill = `${levelPill} border-yellow-600/40 bg-yellow-400/25 text-yellow-900 dark:border-yellow-300/50 dark:bg-yellow-400/15 dark:text-yellow-200`;
  const level2Pill = `${levelPill} border-slate-400/60 bg-slate-300/50 text-slate-600 dark:border-slate-300/45 dark:bg-slate-400/20 dark:text-slate-200`;
  // Grey until hovered: there is one per cell, and red is kept for problems.
  const capGroups = teamCapGroups(allocations);
  const capRecipients = (group: { lines: AgentAllocationLine[] }) => {
    const capId = group.lines.find((line) => line.team_cap_id)?.team_cap_id || '';
    return capId ? teamCapRecipients[capId] || [] : [];
  };
  const isCapRecipient = (group: { lines: AgentAllocationLine[] }, agentId: string) =>
    capRecipients(group).some((recipient) => recipient.agentId === agentId);
  /** What a cap's recipient receives: their share of every other agent's payment into that cap. */
  const capReceived = (group: { lines: AgentAllocationLine[] }, recipientId: string) =>
    teamCapReceived(group.lines, capRecipients(group), recipientId);
  /** An agent's share before team caps: the Agent Split, plus what they pay into caps, less what caps pay them. */
  const splitBeforeCaps = (agent: AgentConfig) => {
    const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) => item.agentId === agent.id || item.agentName === agent.name);
    const split = Number(computed?.amount) || 0;
    const paid = capGroups.reduce((sum, group) => sum + group.lines.reduce((inner, line) => (line.agent_id === agent.id ? inner + (Number(line.amount) || 0) : inner), 0), 0);
    const received = capGroups.reduce((sum, group) => (isCapRecipient(group, agent.id) ? sum + capReceived(group, agent.id) : sum), 0);
    return Math.round((split + paid - received) * 100) / 100;
  };
  /**
   * The agent's line in a team cap, unless the agent only has money that team caps pay them (no split of their own)
   * and pays nothing into this cap: there is nothing of theirs for it to take, so the cell shows a dash.
   */
  const paysIntoCap = (group: { lines: AgentAllocationLine[] }, agent: AgentConfig) => {
    const line = group.lines.find((item) => item.agent_id === agent.id);
    if (!line) return undefined;
    const pays = Math.abs(Number(line.amount) || 0) >= 0.005;
    return pays || Math.abs(splitBeforeCaps(agent)) >= 0.005 ? line : undefined;
  };
  const formatPercentShare = (share: number) => (share * 100).toLocaleString('en-US', { maximumFractionDigits: 3 });
  // A delete button shows only on its own cell (the entity's name or that amount): on hover, or after a long press on
  // a touch screen. So a table of post-splits is not a column of trash cans.
  const trashButton = `${REVEAL_DELETE_CLASS} shrink-0 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition`;

  const confirmDraftRow = (
    entity: string,
    order: string[],
    drafts: string[],
    setDrafts: (next: string[]) => void,
    setOrder: (next: string[]) => void,
    close: () => void,
  ) => {
    const name = entity.trim();
    if (!name || order.includes(name) || drafts.includes(name)) return;
    setDrafts([...drafts, name]);
    setOrder(order.includes(name) ? order : [...order, name]);
    close();
  };

  const newRowForm = (
    entity: string,
    setEntity: (value: string) => void,
    taken: string[],
    onConfirm: () => void,
    onCancel: () => void,
    accent: 'emerald' | 'violet',
  ) => {
    const available = knownEntities.filter((item) => !taken.includes(item.name));
    const fieldClass = 'bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-1 text-2xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)]';
    return (
      <div className="flex items-center gap-1.5">
        {knownEntities.length > 0 ? (
          <ClearableSelect value={entity} onChange={(event) => setEntity(event.target.value)} className={`${fieldClass} max-w-[9rem]`}>
            {available.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </ClearableSelect>
        ) : (
          <input type="text" value={entity} placeholder="Entity" onChange={(event) => setEntity(event.target.value)} className={`${fieldClass} w-28`} />
        )}
        <button type="button" onClick={onConfirm} className={`text-2xs font-bold cursor-pointer ${accent === 'violet' ? 'text-violet-700 dark:text-violet-300' : 'text-emerald-700 dark:text-emerald-400'}`}>Add</button>
        <button type="button" onClick={onCancel} className="text-2xs text-slate-500 cursor-pointer">Cancel</button>
      </div>
    );
  };

  const plusButton = (label: string, onClick: () => void, tone: 'emerald' | 'violet') => (
    <HoverNote label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 dark:text-slate-500 transition cursor-pointer ${
          tone === 'violet'
            ? 'hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-300'
            : 'hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400'
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
          <path d="M8 3.25v9.5M3.25 8h9.5" />
        </svg>
      </button>
    </HoverNote>
  );

  const emptyCell = (agentName: string, entity: string, onAdd: (agentName: string, entity: string) => void, tone: 'emerald' | 'violet') => (
    isEditing ? (
      <span className="ml-auto flex w-[6.5rem] justify-end pr-2">
        {plusButton(`Add ${entity} for ${agentName}`, () => onAdd(agentName, entity), tone)}
      </span>
    ) : (
      <span className="ml-auto block w-[6.5rem] pr-2 text-right text-slate-300">—</span>
    )
  );

  const entityField = (entity: string, onChange: (next: string) => void) => {
    if (!isEditing) return <span>{entity}</span>;
    if (knownEntities.length > 0) {
      return (
        <ClearableSelect
          value={entity}
          onChange={(event) => onChange(event.target.value)}
          className="max-w-[10rem] bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer"
          title="Switch entity"
        >
          <option value={entity}>{entity}</option>
          {knownEntities.filter((item) => item.name !== entity).map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </ClearableSelect>
      );
    }
    return (
      <input
        type="text"
        value={entity}
        onChange={(event) => onChange(event.target.value)}
        className="w-24 bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)]"
      />
    );
  };

  const renameEntityRow = (
    entity: string,
    next: string,
    rulesByAgent: Record<string, DynamicRule[]>,
    onUpdate?: (agentName: string, ruleId: string, entity: string) => void,
  ) => {
    if (!next || next === entity) return;
    for (const name of names) {
      for (const rule of rulesForEntity(rulesByAgent[name], entity)) onUpdate?.(name, rule.id, next);
    }
  };

  const deleteEntityRow = (
    entity: string,
    rulesByAgent: Record<string, DynamicRule[]>,
    onDelete: (agentName: string, ruleId: string) => void,
  ) => {
    for (const name of names) {
      for (const rule of rulesForEntity(rulesByAgent[name], entity)) onDelete(name, rule.id);
    }
  };

  const calculatedLines = (items: Array<{ id?: string; entity?: string; type?: string; value?: number; amount?: number }>, entity: string) => (
    items.filter((item) => (item.entity || '').trim() === entity)
  );

  const splitPair = (
    type: SplitType,
    percentPoints: number,
    dollarAmount: number,
    onToggle: () => void,
    onValue: (val: number) => void,
    options?: { deduction?: boolean; editable?: boolean; locked?: boolean; beforePercent?: React.ReactNode; underAmount?: React.ReactNode; invalid?: boolean },
  ) => (
    <div className="flex w-full justify-end">
      <SplitPair
        compact
        isEditing={options?.editable ?? isEditing}
        locked={options?.locked}
        type={type}
        percentPoints={percentPoints}
        dollarAmount={dollarAmount}
        deduction={options?.deduction}
        beforePercent={options?.beforePercent}
        underAmount={options?.underAmount}
        invalid={options?.invalid}
        onPercentChange={(val) => {
          if (type !== 'PERCENT') onToggle();
          onValue(val);
        }}
        onAmountChange={(val) => {
          if (type !== 'AMOUNT') onToggle();
          onValue(val);
        }}
        preventMinus={preventMinus}
      />
    </div>
  );

  // Post-splits by stage and level, in engine order (postSplitGroups.ts): a plan deal shows Before Plan, the plan's
  // levels and After Plan; a deal without plans its Level 1 and Level 2 post-splits as before.
  const groupList = postSplitGroups(names, postSplitRulesByAgent, postSplit2RulesByAgent);
  const onPlanByAgent = new Map(names.map((name) => [name, agentOnPlan(name, postSplitRulesByAgent, postSplit2RulesByAgent)]));
  const noop = () => undefined;
  const handlersFor = (map: PostSplitMap) => (map === 'L1'
    ? {
      remove: onDeleteAgentPostSplitRule,
      toggle: onToggleAgentPostSplitType,
      value: onUpdateAgentPostSplitValue,
      rename: onUpdateAgentPostSplitEntity,
      addCell: onAddLevel1Cell,
      reorder: onReorderPostSplitEntities,
      order: level1Order,
      dropDraft: (entity: string) => setDraftLevel1((prev) => prev.filter((item) => item !== entity)),
    }
    : {
      remove: onDeleteAgentPostSplit2Rule ?? noop,
      toggle: onToggleAgentPostSplit2Type ?? noop,
      value: onUpdateAgentPostSplit2Value ?? noop,
      rename: onUpdateAgentPostSplit2Entity,
      addCell: onAddLevel2Cell,
      reorder: onReorderPostSplit2Entities,
      order: level2Order,
      dropDraft: (entity: string) => setDraftLevel2((prev) => prev.filter((item) => item !== entity)),
    });
  /** One agent's rules for an entity that show in this group, with the map each lives in. */
  const rulesInGroup = (agentName: string, entity: string, group: PostSplitGroup) => {
    const onPlan = onPlanByAgent.get(agentName) ?? false;
    return [
      ...rulesForEntity(postSplitRulesByAgent[agentName], entity).map((rule) => ({ rule, map: 'L1' as const })),
      ...rulesForEntity(postSplit2RulesByAgent[agentName], entity).map((rule) => ({ rule, map: 'L2' as const })),
    ].filter(({ rule, map }) => {
      const where = ruleGroup(rule, map, onPlan);
      return groupKey(where.stage, where.level) === group.key;
    });
  };
  type LineItem = { id?: string; entity?: string; type?: string; value?: number; amount?: number; level?: number; planLineKey?: string; beforePlan?: boolean; stage?: AgentStage; agentName?: string };
  const allItems = (): LineItem[] => [...(dealResult.postSplitItems || []), ...(dealResult.postSplit2Items || [])];
  const lineItem = (agentName: string, id: string) => allItems().find((item) => item.agentName === agentName && item.id === id);
  /** Calculated lines with no rule on the deal (a replayed template line), in this group. */
  const calculatedInGroup = (agentName: string, entity: string, group: PostSplitGroup) => {
    const onPlan = onPlanByAgent.get(agentName) ?? false;
    return allItems()
      .filter((item) => item.agentName === agentName && (item.entity || '').trim() === entity)
      .map((item) => ({ item, map: (item.level ?? 1) === 1 ? 'L1' as const : 'L2' as const }))
      .filter(({ item, map }) => {
        const where = ruleGroup({ id: item.id || '', entity: item.entity || '', type: item.type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT', value: Number(item.value) || 0, planLineKey: item.planLineKey, beforePlan: item.beforePlan, stage: item.stage, level: item.level }, map, onPlan);
        return groupKey(where.stage, where.level) === group.key;
      });
  };
  /** The entities with a row in this group: those with a line in it for any agent, and its new rows. */
  const groupEntities = (group: PostSplitGroup) => {
    const drafts = group.draftMap === 'L1' ? draftLevel1 : group.draftMap === 'L2' ? draftLevel2 : [];
    const all = [...new Set([...level1Order, ...level2Order, ...allItems().map((item) => (item.entity || '').trim()).filter(Boolean)])];
    return all.filter((entity) => drafts.includes(entity)
      || names.some((name) => rulesInGroup(name, entity, group).length > 0 || calculatedInGroup(name, entity, group).length > 0));
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm">
      {/* One agent is the usual deal: one amount column. Its content stays 672px wide, so a line's name and amount
          are not a screen apart; the card keeps its full width, lined up with the sections above. */}
      <div className={`space-y-3 ${agents.length === 1 ? 'max-w-2xl' : ''}`}>
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className={WATERFALL_HEADING}>Agent Splits &amp; Post-Split Deductions</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs text-slate-500 dark:text-slate-400 font-medium ${isEditing ? '' : 'pr-4'}`}>
            Net to Split <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterPreSplit)}</strong>
          </span>
        </div>
      </div>
      <AgentSplitExcessNotice
        total={Number(dealResult.agentSplitTotal) || 0}
        remaining={commissionAfterPreSplit}
        excess={Number(dealResult.agentSplitExcess) || 0}
      />
      {(dealResult.agentSplitItems || []).some((item: { overAllocated?: boolean }) => item.overAllocated) && (
        <p className="text-2xs font-semibold text-rose-600 dark:text-rose-400">
          Agent splits can&apos;t exceed 100% of the remaining balance. Lower the highlighted split before applying.
        </p>
      )}

      {agents.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-slate-400 italic">
          No agents assigned yet.
          {isEditing && plusButton('Add new agent split', onOpenAddAgentModal, 'emerald')}
        </p>
      ) : (
        <div className="overflow-x-auto overscroll-x-none">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <tbody>
              <tr>
                <td className={`${sectionLabel} bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200`}>
                  <div className="flex items-center gap-2">
                    <span>Agent Splits</span>
                    {isEditing && plusButton('Add new agent split', onOpenAddAgentModal, 'emerald')}
                  </div>
                </td>
                {agents.map((agent, index) => {
                  const agentIsPrimary = primaryAgentId ? isPrimaryAgent(agent, primaryAgentId) : index === 0;
                  return (
                  <td key={agent.id} className={`${agentCell} bg-slate-50 dark:bg-slate-800/80`}>
                    <div className="ml-auto flex w-max max-w-full flex-col items-end gap-1 pr-2">
                      <div className="flex h-5 items-center justify-end gap-1">
                        {agentIsPrimary && (
                          <span className="text-2xs bg-brand-500/20 text-brand-800 dark:text-brand-300 border border-brand-500/30 px-1.5 py-0.5 rounded-full font-bold">Primary</span>
                        )}
                        {agent.isTeamLead && (
                          <span className="text-2xs bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">Lead</span>
                        )}
                        {agent.manualSplit && (
                          <HoverNote label="Typed by hand. It replaces the template's formula for this agent until the template is submitted again.">
                            <span tabIndex={0} className="text-2xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full font-bold cursor-help outline-none">EDITED</span>
                          </HoverNote>
                        )}
                      </div>
                      <div className="flex h-5 items-center justify-end gap-1">
                        {isEditing && !agentIsPrimary && (
                          <button type="button" onClick={() => onRemoveAgent(agent.name)} className="text-xs text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition" title={`Remove ${agent.name}`} aria-label={`Remove ${agent.name}`}><TrashIcon /></button>
                        )}
                        {isEditing && !agentIsPrimary && knownAgents.length > 0 ? (
                          <ClearableSelect
                            value={agent.name}
                            onChange={(event) => onSwitchAgent?.(agent.id, event.target.value)}
                            className="w-max max-w-none bg-transparent border-b border-slate-300 dark:border-slate-600 text-right text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer"
                          >
                            <option value={agent.name}>{agent.name}</option>
                            {knownAgents
                              .filter((item) => item.name !== agent.name && !agents.some((existing) => existing.name === item.name))
                              .map((item) => (
                                <option key={item.id} value={item.name}>{item.name}</option>
                              ))}
                          </ClearableSelect>
                        ) : (
                          <span className="whitespace-nowrap text-right font-bold text-slate-900 dark:text-white">{agent.name}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  );
                })}
              </tr>
              {/* With team caps, the agents' shares are shown before the caps first, then each cap moving money
                  between agents, then the Agent Split that remains. These figures are only for reading the waterfall. */}
              {capGroups.length > 0 && (
                <tr>
                  <td className={`${labelCell} font-semibold text-slate-700 dark:text-slate-200`}>Split Before Caps</td>
                  {agents.map((agent) => {
                    const before = splitBeforeCaps(agent);
                    const pool = Number(dealResult.commissionAfterPreSplit) || 0;
                    return (
                      <td key={agent.id} className={agentCell}>
                        <span className="flex items-center justify-end gap-3 pr-2 text-xs">
                          <span className="text-slate-500 dark:text-slate-400">({pool > 0 ? formatPercentShare(before / pool) : '0'}%)</span>
                          <span className="w-[5.5rem] text-right font-bold text-slate-700 dark:text-slate-200">{formatCurrency(before)}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              )}
              {capGroups.map((group) => {
                const capId = group.lines.find((line) => line.team_cap_id)?.team_cap_id || '';
                return (
                <tr key={group.id}>
                  <td className="group/cell sticky left-0 z-10 border-b border-slate-200 bg-[color-mix(in_srgb,var(--color-slate-100)_55%,white)] px-3 py-2 text-left align-middle shadow-[inset_3px_0_0_var(--color-slate-300)] dark:border-slate-700 dark:bg-[color-mix(in_srgb,var(--color-slate-800)_55%,var(--color-slate-900))] dark:shadow-[inset_3px_0_0_var(--color-slate-600)]">
                    <div className="flex items-center gap-1">
                      {isEditing && onRemoveTeamCap && capId && (
                        <button type="button" onClick={() => onRemoveTeamCap(capId)} className={trashButton} title={`Remove ${group.name}`} aria-label={`Remove ${group.name}`}><TrashIcon /></button>
                      )}
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-2xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">Team Cap</span>
                      <span title={group.name} className="min-w-0 max-w-40 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{group.name}</span>
                    </div>
                  </td>
                  {agents.map((agent) => (
                    <td key={agent.id} className="min-w-[14.5rem] border-b border-slate-200 bg-slate-100/55 px-2 py-2 text-center align-middle dark:border-slate-700 dark:bg-slate-800/55">
                      <div className="flex w-full justify-end">
                        {!group.lines.some((item) => item.agent_id === agent.id) && isCapRecipient(group, agent.id) ? (
                          <TeamCapReceived amount={capReceived(group, agent.id)} note={teamCapReceivedNote(group.lines, capRecipients(group), agent.id)} />
                        ) : (
                          <TeamCapAmount
                            line={paysIntoCap(group, agent)}
                            isEditing={isEditing}
                            onAmountChange={onTeamCapAmountChange}
                          />
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
                );
              })}
              <tr>
                <td className={`${labelCell} font-semibold text-slate-700 dark:text-slate-200`}>{capGroups.length > 0 ? 'Agent Split' : null}</td>
                {agents.map((agent, index) => {
                  const agentIsPrimary = primaryAgentId ? isPrimaryAgent(agent, primaryAgentId) : index === 0;
                  const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; percent?: number; amount?: number; overAllocated?: boolean; capAdjusted?: boolean; displayPercent?: number }) => item.agentId === agent.id || item.agentName === agent.name);
                  const adjusted = adjustedSplitView(computed);
                  const dollar = adjusted
                    ? adjusted.dollar
                    : (!agentIsPrimary && agent.splitType === 'AMOUNT' ? agent.splitVal : (computed?.amount || 0));
                  const percentPoints = adjusted
                    ? adjusted.percentPoints
                    : (agent.splitType === 'PERCENT' ? toPercentPoints(agent.splitVal) : toPercentPoints(computed?.percent || 0));
                  return (
                    <td key={agent.id} className={agentCell}>
                      {splitPair(
                        agent.splitType,
                        adjusted ? adjusted.percentPoints : (agentIsPrimary && agent.splitType === 'PERCENT' ? toPercentPoints(computed?.percent || 0) : percentPoints),
                        dollar,
                        () => onToggleAgentSplitType(agent.id),
                        (val) => onSplitValueChange(agent.id, val),
                        { editable: isEditing && !agentIsPrimary, locked: isEditing && agentIsPrimary, invalid: Boolean(computed?.overAllocated) },
                      )}
                      <AgentAllocationNotes agentId={agent.id} allocations={allocations} />
                    </td>
                  );
                })}
              </tr>

              {groupList.groups.map((group, groupIndex) => {
                const isLast = groupIndex === groupList.groups.length - 1;
                const draftMap = group.draftMap;
                const adding = draftMap === 'L1' ? addingLevel1Row : draftMap === 'L2' ? addingLevel2Row : false;
                const rows = groupEntities(group);
                const pill = group.level === 1 ? level1Pill : level2Pill;
                return (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td className={`${sectionLabel} bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200`}>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <HoverNote label={groupBaseNote(group, groupList.anyOnPlan)}>
                              <span className={pill}>Level {group.level}</span>
                            </HoverNote>
                            {groupTitle(group, groupList.anyOnPlan)}
                          </span>
                          {isEditing && draftMap && plusButton(`Add new ${groupTitle(group, groupList.anyOnPlan)} Level ${group.level} line`, () => {
                            if (draftMap === 'L1') {
                              setAddingLevel1Row((open) => !open);
                              setNewLevel1Entity('');
                            } else {
                              setAddingLevel2Row((open) => !open);
                              setNewLevel2Entity('');
                            }
                          }, 'emerald')}
                        </div>
                      </td>
                      {agents.map((agent) => (
                        <td key={agent.id} className={`${agentCell} bg-slate-50 dark:bg-slate-800/80`} />
                      ))}
                    </tr>
                    {rows.map((entity) => (
                      <tr key={`${group.key}-${entity}`}>
                        <td className={`${labelCell} font-semibold text-slate-800 dark:text-slate-200`}>
                          <div className="flex items-center gap-1">
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  for (const name of names) for (const { rule, map } of rulesInGroup(name, entity, group)) handlersFor(map).remove(name, rule.id);
                                  if (draftMap === 'L1') setDraftLevel1((prev) => prev.filter((item) => item !== entity));
                                  if (draftMap === 'L2') setDraftLevel2((prev) => prev.filter((item) => item !== entity));
                                }}
                                className={trashButton}
                                title={`Remove ${entity}`}
                                aria-label={`Remove ${entity}`}
                              ><TrashIcon /></button>
                            )}
                            {entityField(entity, (next) => {
                              if (!next || next === entity) return;
                              for (const name of names) for (const { rule, map } of rulesInGroup(name, entity, group)) handlersFor(map).rename?.(name, rule.id, next);
                            })}
                            {names.some((name) => rulesInGroup(name, entity, group).some(({ rule }) => rule.planLineKey)) && <PlanChip kind="plan" />}
                          </div>
                        </td>
                        {agents.map((agent) => {
                          const rules = rulesInGroup(agent.name, entity, group);
                          const split = (dealResult.agentSplitItems || []).find((item: { agentName?: string; amount?: number }) => item.agentName === agent.name)?.amount || 0;
                          const percentOf = (lineId: string | undefined, amount: number) => {
                            const base = (lineId ? lineBase(dealResult.agentStages, agent.name, lineId) : null) ?? split;
                            return base > 0 ? (amount / base) * 100 : 0;
                          };
                          if (rules.length === 0) {
                            const calculated = calculatedInGroup(agent.name, entity, group);
                            if (calculated.length > 0) {
                              return (
                                <td key={agent.id} className={agentCell}>
                                  <div className="flex flex-col items-stretch gap-1">
                                    {calculated.map(({ item, map }, index) => {
                                      const type: SplitType = item.type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
                                      const amount = Number(item.amount) || 0;
                                      const handlers = handlersFor(map);
                                      return (
                                        <div key={item.id || entity}>
                                          {splitPair(
                                            type,
                                            type === 'PERCENT' ? toPercentPoints(Number(item.value) || 0) : percentOf(item.id, amount),
                                            amount,
                                            () => { if (item.id) handlers.toggle(agent.name, item.id); },
                                            (val) => { if (item.id) handlers.value(agent.name, item.id, val); },
                                            { deduction: true, underAmount: index === calculated.length - 1 ? agentCapNote?.(agent.id, agent.name, entity) : null },
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td key={agent.id} className={agentCell}>
                                {draftMap ? emptyCell(agent.name, entity, (agentName, rowEntity) => {
                                  const handlers = handlersFor(draftMap);
                                  handlers.addCell(agentName, rowEntity);
                                  handlers.reorder?.(handlers.order.includes(rowEntity) ? handlers.order : [...handlers.order, rowEntity]);
                                  handlers.dropDraft(rowEntity);
                                }, 'emerald') : <span className="ml-auto block w-[6.5rem] pr-2 text-right text-slate-300">—</span>}
                              </td>
                            );
                          }
                          return (
                            <td key={agent.id} className={agentCell}>
                              <div className="flex flex-col items-stretch gap-1">
                                {rules.map(({ rule, map }, index) => {
                                  const calculated = lineItem(agent.name, rule.id);
                                  const amount = calculated?.amount ?? (rule.type === 'AMOUNT' ? rule.value : 0);
                                  const handlers = handlersFor(map);
                                  return (
                                    <div key={rule.id}>
                                      {splitPair(
                                        rule.type,
                                        rule.type === 'PERCENT' ? toPercentPoints(rule.value) : percentOf(rule.id, amount),
                                        amount,
                                        () => handlers.toggle(agent.name, rule.id),
                                        (val) => handlers.value(agent.name, rule.id, val),
                                        {
                                          deduction: true,
                                          underAmount: planStateKind(rule) || index === rules.length - 1 ? (
                                            <>
                                              {planStateKind(rule) && <PlanChip kind={planStateKind(rule)!} />}
                                              {index === rules.length - 1 ? agentCapNote?.(agent.id, agent.name, entity) : null}
                                            </>
                                          ) : null,
                                          beforePercent: !isEditing ? null : rule.planWaived && rule.planLineKey && onWaivePlanLine ? (
                                            <button type="button" onClick={() => onWaivePlanLine(rule.planLineKey!, false)} className="shrink-0 text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400 p-0.5 rounded hover:bg-brand-500/10 cursor-pointer transition" title="Charge this plan line again on this deal" aria-label="Restore plan line"><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /></button>
                                          ) : (
                                            <button type="button" onClick={() => handlers.remove(agent.name, rule.id)} className={`${trashButton} shrink-0`} title={rule.planLineKey ? 'Waive this plan line on this deal, for every agent' : 'Delete rule'} aria-label="Delete rule"><TrashIcon /></button>
                                          ),
                                        },
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {isEditing && adding && draftMap && (
                      <tr>
                        <td className={labelCell}>
                          {draftMap === 'L1'
                            ? newRowForm(
                              newLevel1Entity,
                              setNewLevel1Entity,
                              level1Order,
                              () => confirmDraftRow(newLevel1Entity, level1Order, draftLevel1, setDraftLevel1, setLevel1Order, () => { setAddingLevel1Row(false); setNewLevel1Entity(''); }),
                              () => { setAddingLevel1Row(false); setNewLevel1Entity(''); },
                              'emerald',
                            )
                            : newRowForm(
                              newLevel2Entity,
                              setNewLevel2Entity,
                              level2Order,
                              () => confirmDraftRow(newLevel2Entity, level2Order, draftLevel2, setDraftLevel2, setLevel2Order, () => { setAddingLevel2Row(false); setNewLevel2Entity(''); }),
                              () => { setAddingLevel2Row(false); setNewLevel2Entity(''); },
                              'emerald',
                            )}
                        </td>
                        {agents.map((agent) => <td key={agent.id} className={agentCell} />)}
                      </tr>
                    )}
                    {!isLast && (
                      <tr>
                        <td className={`${labelCell} font-bold text-slate-700 dark:text-slate-200`}>{groupNetLabel(group, groupList.anyOnPlan)}</td>
                        {agents.map((agent) => {
                          const split = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) => item.agentId === agent.id || item.agentName === agent.name)?.amount ?? 0;
                          const net = agentNetAfterGroup(dealResult.agentStages, agent.name, group) ?? split;
                          return <td key={agent.id} className={`${agentCell} font-bold text-slate-900 dark:text-white`}><span className="ml-auto block w-[6.5rem] pr-2 text-right">{formatCurrency(net)}</span></td>;
                        })}
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              <tr>
                {/* The bottom line, the loudest figure in the waterfall: what each agent receives, larger and in green on
                    a faint green band, set off by a firmer rule above. */}
                <td className={`${labelCell.replace('bg-white dark:bg-slate-900', '').replace('py-2', '')} border-t border-t-slate-300 bg-[color-mix(in_srgb,var(--color-emerald-500)_6%,white)] py-3 text-sm font-bold text-slate-900 dark:border-t-slate-600 dark:bg-[color-mix(in_srgb,var(--color-emerald-500)_8%,var(--color-slate-900))] dark:text-white`}>Net Payout to Agents</td>
                {agents.map((agent) => {
                  const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) => item.agentId === agent.id || item.agentName === agent.name);
                  const netAfterL1 = dealResult.agentNetAfterLevel1?.[agent.name] ?? computed?.amount ?? 0;
                  const payout = dealResult.netPayouts?.[agent.name] ?? netAfterL1;
                  return <td key={agent.id} className={`${agentCell.replace('py-2', '')} border-t border-t-slate-300 bg-emerald-500/6 py-3 text-base font-bold text-emerald-600 dark:border-t-slate-600 dark:bg-emerald-500/8 dark:text-emerald-400`}><span className="ml-auto block min-w-[6.5rem] whitespace-nowrap pr-2 text-right">{formatCurrency(payout)}</span></td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
