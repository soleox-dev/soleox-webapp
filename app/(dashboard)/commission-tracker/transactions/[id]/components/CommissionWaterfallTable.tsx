import React, { useEffect, useState } from 'react';
import { AgentConfig, DynamicRule, CommissionEntityOption, KnownAgentInfo } from '../types';
import { SplitPair } from './SplitPair';

type SplitType = 'PERCENT' | 'AMOUNT';

interface CommissionWaterfallTableProps {
  isEditing: boolean;
  agents: AgentConfig[];
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

function reconcileEntityOrder(prev: string[], live: string[]): string[] {
  const liveSet = new Set(live);
  const prevSet = new Set(prev);
  const removed = prev.filter((entity) => !liveSet.has(entity));
  const added = live.filter((entity) => !prevSet.has(entity));
  if (removed.length === 0 && added.length === 0) return prev;
  if (removed.length === 1 && added.length === 1) {
    return prev.map((entity) => (entity === removed[0] ? added[0] : entity));
  }
  return [...prev.filter((entity) => liveSet.has(entity)), ...added];
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

function useStableEntityOrder(rulesByAgent: Record<string, DynamicRule[]>, names: string[], isEditing: boolean, pinned: string[]) {
  const namesKey = names.join('\u0000');
  const pinnedKey = pinned.join('\u0000');
  const [order, setOrder] = useState(() => entityOrder(rulesByAgent, names));

  useEffect(() => {
    const nameList = namesKey === '' ? [] : namesKey.split('\u0000');
    const pinnedList = pinnedKey === '' ? [] : pinnedKey.split('\u0000');
    const live = entityOrder(rulesByAgent, nameList);
    for (const entity of pinnedList) {
      if (entity && !live.includes(entity)) live.push(entity);
    }
    if (!isEditing) {
      const saved = entityOrder(rulesByAgent, nameList);
      setOrder((prev) => (sameOrder(prev, saved) ? prev : saved));
      return;
    }
    setOrder((prev) => reconcileEntityOrder(prev, live));
  }, [rulesByAgent, namesKey, pinnedKey, isEditing]);

  return [order, setOrder] as const;
}

export function CommissionWaterfallTable({
  isEditing,
  agents,
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
}: CommissionWaterfallTableProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const names = agents.map((agent) => agent.name);
  const [draftLevel1, setDraftLevel1] = useState<string[]>([]);
  const [draftLevel2, setDraftLevel2] = useState<string[]>([]);
  const [addingLevel1Row, setAddingLevel1Row] = useState(false);
  const [addingLevel2Row, setAddingLevel2Row] = useState(false);
  const [newLevel1Entity, setNewLevel1Entity] = useState('');
  const [newLevel2Entity, setNewLevel2Entity] = useState('');
  const [level1Order, setLevel1Order] = useStableEntityOrder(postSplitRulesByAgent, names, isEditing, draftLevel1);
  const [level2Order, setLevel2Order] = useStableEntityOrder(postSplit2RulesByAgent, names, isEditing, draftLevel2);

  useEffect(() => {
    if (isEditing) return;
    setDraftLevel1([]);
    setDraftLevel2([]);
    setAddingLevel1Row(false);
    setAddingLevel2Row(false);
    setNewLevel1Entity('');
    setNewLevel2Entity('');
  }, [isEditing]);

  const labelCell = 'sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-left align-middle border-b border-slate-200 dark:border-slate-700';
  const agentCell = 'px-2 py-2 text-center align-middle border-b border-slate-200 dark:border-slate-700 min-w-[14.5rem]';
  const sectionLabel = 'sticky left-0 z-10 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b border-slate-200 dark:border-slate-700';
  const trashButton = 'shrink-0 text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition';
  const addRowButton = 'normal-case tracking-normal text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold cursor-pointer whitespace-nowrap';
  const addRowButtonL2 = 'normal-case tracking-normal text-[10px] bg-violet-500/15 hover:bg-violet-500/25 text-violet-700 dark:text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded font-bold cursor-pointer whitespace-nowrap';

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
    const fieldClass = 'bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-1 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]';
    return (
      <div className="flex items-center gap-1.5">
        {knownEntities.length > 0 ? (
          <select value={entity} onChange={(event) => setEntity(event.target.value)} className={`${fieldClass} max-w-[9rem]`}>
            <option value="">Entity...</option>
            {available.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
        ) : (
          <input type="text" value={entity} placeholder="Entity" onChange={(event) => setEntity(event.target.value)} className={`${fieldClass} w-28`} />
        )}
        <button type="button" onClick={onConfirm} className={`text-[10px] font-bold cursor-pointer ${accent === 'violet' ? 'text-violet-700 dark:text-violet-300' : 'text-emerald-700 dark:text-emerald-400'}`}>Add</button>
        <button type="button" onClick={onCancel} className="text-[10px] text-slate-500 cursor-pointer">Cancel</button>
      </div>
    );
  };

  const emptyCell = (agentName: string, entity: string, onAdd: (agentName: string, entity: string) => void, tone: string) => (
    isEditing ? (
      <span className="ml-auto flex w-[6.5rem] justify-end pr-2">
        <button type="button" onClick={() => onAdd(agentName, entity)} className={`text-[10px] font-bold cursor-pointer ${tone}`}>+ Add</button>
      </span>
    ) : (
      <span className="ml-auto block w-[6.5rem] pr-2 text-right text-slate-300">—</span>
    )
  );

  const applyMove = (order: string[], setOrder: (next: string[]) => void, onApply: ((next: string[]) => void) | undefined, from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    onApply?.(next);
  };

  const reorderControls = (index: number, total: number, dragType: string, onMove: (from: number, to: number) => void) => {
    if (!isEditing || total <= 1) return null;
    return (
      <div className="flex items-center gap-0.5 shrink-0 select-none">
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', JSON.stringify({ dragType, index }));
            event.dataTransfer.effectAllowed = 'move';
          }}
          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-0.5"
          title="Drag to reorder"
        >
          ⠿
        </span>
        <div className="flex flex-col -space-y-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed transition text-[9px] leading-none"
            title="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer disabled:cursor-not-allowed transition text-[9px] leading-none"
            title="Move down"
          >
            ▼
          </button>
        </div>
      </div>
    );
  };

  const dragRowProps = (index: number, dragType: string, onMove: (from: number, to: number) => void) => {
    if (!isEditing) return {};
    return {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        try {
          const data = JSON.parse(event.dataTransfer.getData('text/plain'));
          if (data?.dragType === dragType && typeof data.index === 'number' && data.index !== index) {
            onMove(data.index, index);
          }
        } catch {
          // ignore drops that are not a row reorder
        }
      },
    };
  };

  const entityField = (entity: string, onChange: (next: string) => void) => {
    if (!isEditing) return <span>{entity}</span>;
    if (knownEntities.length > 0) {
      return (
        <select
          value={entity}
          onChange={(event) => onChange(event.target.value)}
          className="max-w-[10rem] bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer"
          title="Switch entity"
        >
          <option value={entity}>{entity}</option>
          {knownEntities.filter((item) => item.name !== entity).map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={entity}
        onChange={(event) => onChange(event.target.value)}
        className="w-24 bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]"
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

  const splitPair = (
    type: SplitType,
    percentPoints: number,
    dollarAmount: number,
    onToggle: () => void,
    onValue: (val: number) => void,
    options?: { deduction?: boolean; editable?: boolean; beforePercent?: React.ReactNode; invalid?: boolean },
  ) => (
    <div className="flex w-full justify-end">
      <SplitPair
        compact
        isEditing={options?.editable ?? isEditing}
        type={type}
        percentPoints={percentPoints}
        dollarAmount={dollarAmount}
        deduction={options?.deduction}
        beforePercent={options?.beforePercent}
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

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            3. Agent Splits
          </span>
          {isEditing && (
            <button
              type="button"
              onClick={onOpenAddAgentModal}
              className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded font-bold cursor-pointer"
            >
              + Add Agent
            </button>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Remaining Commission: <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterPreSplit)}</strong>
        </span>
      </div>
      {(dealResult.agentSplitItems || []).some((item: { overAllocated?: boolean }) => item.overAllocated) && (
        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          Agent splits can&apos;t exceed 100% of the remaining commission. Lower the highlighted split before applying.
        </p>
      )}

      {agents.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No agents assigned yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <tbody>
              <tr>
                <td className={`${sectionLabel} bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200`}>Agent Splits</td>
                {agents.map((agent, index) => (
                  <td key={agent.id} className={`${agentCell} bg-slate-50 dark:bg-slate-800/80`}>
                    <div className="ml-auto flex w-max max-w-full flex-col items-end gap-1 pr-2">
                      <div className="flex h-5 items-center justify-end gap-1">
                        {index === 0 && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase">Primary</span>
                        )}
                        {agent.isTeamLead && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase">Lead</span>
                        )}
                      </div>
                      <div className="flex h-5 items-center justify-end gap-1">
                        {isEditing && index > 0 && (
                          <button type="button" onClick={() => onRemoveAgent(agent.name)} className="text-xs text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition" title={`Remove ${agent.name}`} aria-label={`Remove ${agent.name}`}>🗑️</button>
                        )}
                        {isEditing && index > 0 && knownAgents.length > 0 ? (
                          <select
                            value={agent.name}
                            onChange={(event) => onSwitchAgent?.(agent.id, event.target.value)}
                            className="w-max max-w-none bg-transparent border-b border-slate-300 dark:border-slate-600 text-right text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer"
                          >
                            <option value={agent.name}>{agent.name}</option>
                            {knownAgents
                              .filter((item) => item.name !== agent.name && !agents.some((existing) => existing.name === item.name))
                              .map((item) => (
                                <option key={item.id} value={item.name}>{item.name}</option>
                              ))}
                          </select>
                        ) : (
                          <span className="whitespace-nowrap text-right font-bold text-slate-900 dark:text-white">{agent.name}</span>
                        )}
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className={`${labelCell} font-semibold text-slate-500 dark:text-slate-400`}>Split</td>
                {agents.map((agent, index) => {
                  const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; percent?: number; amount?: number; overAllocated?: boolean }) => item.agentId === agent.id || item.agentName === agent.name);
                  const dollar = index > 0 && agent.splitType === 'AMOUNT'
                    ? agent.splitVal
                    : (computed?.amount || 0);
                  const percentPoints = agent.splitType === 'PERCENT' ? agent.splitVal : ((computed?.percent || 0) * 100);
                  return (
                    <td key={agent.id} className={agentCell}>
                      {splitPair(
                        index === 0 ? 'PERCENT' : agent.splitType,
                        index === 0 ? ((computed?.percent || 0) * 100) : percentPoints,
                        dollar,
                        () => onToggleAgentSplitType(agent.id),
                        (val) => onSplitValueChange(agent.id, val),
                        { editable: isEditing && index > 0, invalid: Boolean(computed?.overAllocated) },
                      )}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <td className={`${sectionLabel} bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200`}>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="whitespace-nowrap">Level 1 Post-splits</span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingLevel1Row((open) => !open);
                          setNewLevel1Entity('');
                        }}
                        className={addRowButton}
                      >
                        + Add L1 Post-split
                      </button>
                    )}
                  </div>
                </td>
                {agents.map((agent) => (
                  <td key={agent.id} className={`${agentCell} bg-slate-50 dark:bg-slate-800/80`} />
                ))}
              </tr>
              {level1Order.map((entity, index) => (
                <tr key={`l1-${entity}`} {...dragRowProps(index, 'postSplit1', (from, to) => applyMove(level1Order, setLevel1Order, onReorderPostSplitEntities, from, to))}>
                  <td className={`${labelCell} font-semibold text-slate-800 dark:text-slate-200`}>
                    <div className="flex items-center gap-1">
                      {reorderControls(index, level1Order.length, 'postSplit1', (from, to) => applyMove(level1Order, setLevel1Order, onReorderPostSplitEntities, from, to))}
                      {isEditing && (
                        <button type="button" onClick={() => { deleteEntityRow(entity, postSplitRulesByAgent, onDeleteAgentPostSplitRule); setDraftLevel1((prev) => prev.filter((item) => item !== entity)); }} className={trashButton} title={`Remove ${entity}`} aria-label={`Remove ${entity}`}>🗑️</button>
                      )}
                      {entityField(entity, (next) => renameEntityRow(entity, next, postSplitRulesByAgent, onUpdateAgentPostSplitEntity))}
                    </div>
                  </td>
                  {agents.map((agent) => {
                    const rules = rulesForEntity(postSplitRulesByAgent[agent.name], entity);
                    const items = (dealResult.postSplitItems || []).filter((item: { agentName?: string }) => item.agentName === agent.name);
                    if (rules.length === 0) {
                      return (
                        <td key={agent.id} className={agentCell}>
                          {emptyCell(agent.name, entity, (agentName, rowEntity) => {
                            onAddLevel1Cell(agentName, rowEntity);
                            onReorderPostSplitEntities?.(level1Order.includes(rowEntity) ? level1Order : [...level1Order, rowEntity]);
                            setDraftLevel1((prev) => prev.filter((item) => item !== rowEntity));
                          }, 'text-emerald-700 dark:text-emerald-400')}
                        </td>
                      );
                    }
                    return (
                      <td key={agent.id} className={agentCell}>
                        <div className="flex flex-col items-stretch gap-1">
                          {rules.map((rule) => {
                            const calculated = items.find((item: { id?: string; amount?: number }) => item.id === rule.id);
                            const gross = (dealResult.agentSplitItems || []).find((item: { agentName?: string; amount?: number }) => item.agentName === agent.name)?.amount || 0;
                            return (
                              <div key={rule.id}>
                                {splitPair(
                                  rule.type,
                                  rule.type === 'PERCENT' ? rule.value : (gross > 0 ? ((calculated?.amount || 0) / gross) * 100 : 0),
                                  calculated?.amount || (rule.type === 'AMOUNT' ? rule.value : 0),
                                  () => onToggleAgentPostSplitType(agent.name, rule.id),
                                  (val) => onUpdateAgentPostSplitValue(agent.name, rule.id, val),
                                  {
                                    deduction: true,
                                    beforePercent: isEditing ? (
                                      <button type="button" onClick={() => onDeleteAgentPostSplitRule(agent.name, rule.id)} className={`${trashButton} shrink-0`} title="Delete rule" aria-label="Delete rule">🗑️</button>
                                    ) : null,
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
              {isEditing && addingLevel1Row && (
                <tr>
                  <td className={labelCell}>
                    {newRowForm(
                      newLevel1Entity,
                      setNewLevel1Entity,
                      level1Order,
                      () => confirmDraftRow(newLevel1Entity, level1Order, draftLevel1, setDraftLevel1, setLevel1Order, () => { setAddingLevel1Row(false); setNewLevel1Entity(''); }),
                      () => { setAddingLevel1Row(false); setNewLevel1Entity(''); },
                      'emerald',
                    )}
                  </td>
                  {agents.map((agent) => <td key={agent.id} className={agentCell} />)}
                </tr>
              )}
              <tr>
                <td className={`${labelCell} font-bold text-slate-700 dark:text-slate-200`}>Net After Level 1 Post-Splits</td>
                {agents.map((agent) => {
                  const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) => item.agentId === agent.id || item.agentName === agent.name);
                  const net = dealResult.agentNetAfterLevel1?.[agent.name] ?? computed?.amount ?? 0;
                  return <td key={agent.id} className={`${agentCell} font-bold text-slate-900 dark:text-white`}><span className="ml-auto block w-[6.5rem] pr-2 text-right">{formatCurrency(net)}</span></td>;
                })}
              </tr>

              <tr>
                <td className={`${sectionLabel} bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400`}>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="whitespace-nowrap">Level 2 Post-splits</span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingLevel2Row((open) => !open);
                          setNewLevel2Entity('');
                        }}
                        className={addRowButtonL2}
                      >
                        + Add L2 Post-split
                      </button>
                    )}
                  </div>
                </td>
                {agents.map((agent) => (
                  <td key={agent.id} className={`${agentCell} bg-violet-50 dark:bg-violet-950/30`} />
                ))}
              </tr>
              {level2Order.map((entity, index) => (
                <tr key={`l2-${entity}`} {...dragRowProps(index, 'postSplit2', (from, to) => applyMove(level2Order, setLevel2Order, onReorderPostSplit2Entities, from, to))}>
                  <td className={`${labelCell} font-semibold text-slate-800 dark:text-slate-200`}>
                    <div className="flex items-center gap-1">
                      {reorderControls(index, level2Order.length, 'postSplit2', (from, to) => applyMove(level2Order, setLevel2Order, onReorderPostSplit2Entities, from, to))}
                      {isEditing && (
                        <button type="button" onClick={() => { if (onDeleteAgentPostSplit2Rule) deleteEntityRow(entity, postSplit2RulesByAgent, onDeleteAgentPostSplit2Rule); setDraftLevel2((prev) => prev.filter((item) => item !== entity)); }} className={trashButton} title={`Remove ${entity}`} aria-label={`Remove ${entity}`}>🗑️</button>
                      )}
                      {entityField(entity, (next) => renameEntityRow(entity, next, postSplit2RulesByAgent, onUpdateAgentPostSplit2Entity))}
                    </div>
                  </td>
                  {agents.map((agent) => {
                    const rules = rulesForEntity(postSplit2RulesByAgent[agent.name], entity);
                    const items = (dealResult.postSplit2Items || []).filter((item: { agentName?: string }) => item.agentName === agent.name);
                    if (rules.length === 0) {
                      return (
                        <td key={agent.id} className={agentCell}>
                          {emptyCell(agent.name, entity, (agentName, rowEntity) => {
                            onAddLevel2Cell(agentName, rowEntity);
                            onReorderPostSplit2Entities?.(level2Order.includes(rowEntity) ? level2Order : [...level2Order, rowEntity]);
                            setDraftLevel2((prev) => prev.filter((item) => item !== rowEntity));
                          }, 'text-violet-700 dark:text-violet-300')}
                        </td>
                      );
                    }
                    return (
                      <td key={agent.id} className={agentCell}>
                        <div className="flex flex-col items-stretch gap-1">
                          {rules.map((rule) => {
                            const calculated = items.find((item: { id?: string; amount?: number }) => item.id === rule.id);
                            const gross = (dealResult.agentSplitItems || []).find((item: { agentName?: string; amount?: number }) => item.agentName === agent.name)?.amount || 0;
                            const netAfterL1 = dealResult.agentNetAfterLevel1?.[agent.name] ?? gross;
                            return (
                              <div key={rule.id}>
                                {splitPair(
                                  rule.type,
                                  rule.type === 'PERCENT' ? rule.value : (netAfterL1 > 0 ? ((calculated?.amount || 0) / netAfterL1) * 100 : 0),
                                  calculated?.amount || (rule.type === 'AMOUNT' ? rule.value : 0),
                                  () => onToggleAgentPostSplit2Type?.(agent.name, rule.id),
                                  (val) => onUpdateAgentPostSplit2Value?.(agent.name, rule.id, val),
                                  {
                                    deduction: true,
                                    beforePercent: isEditing ? (
                                      <button type="button" onClick={() => onDeleteAgentPostSplit2Rule?.(agent.name, rule.id)} className={`${trashButton} shrink-0`} title="Delete rule" aria-label="Delete rule">🗑️</button>
                                    ) : null,
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
              {isEditing && addingLevel2Row && (
                <tr>
                  <td className={labelCell}>
                    {newRowForm(
                      newLevel2Entity,
                      setNewLevel2Entity,
                      level2Order,
                      () => confirmDraftRow(newLevel2Entity, level2Order, draftLevel2, setDraftLevel2, setLevel2Order, () => { setAddingLevel2Row(false); setNewLevel2Entity(''); }),
                      () => { setAddingLevel2Row(false); setNewLevel2Entity(''); },
                      'violet',
                    )}
                  </td>
                  {agents.map((agent) => <td key={agent.id} className={agentCell} />)}
                </tr>
              )}
              <tr>
                <td className={`${labelCell} font-bold text-violet-700 dark:text-violet-400`}>Net After Level 2 Post-Splits</td>
                {agents.map((agent) => {
                  const computed = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) => item.agentId === agent.id || item.agentName === agent.name);
                  const netAfterL1 = dealResult.agentNetAfterLevel1?.[agent.name] ?? computed?.amount ?? 0;
                  const payout = dealResult.netPayouts?.[agent.name] ?? netAfterL1;
                  return <td key={agent.id} className={`${agentCell} font-bold text-violet-700 dark:text-violet-400`}><span className="ml-auto block w-[6.5rem] pr-2 text-right">{formatCurrency(payout)}</span></td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
