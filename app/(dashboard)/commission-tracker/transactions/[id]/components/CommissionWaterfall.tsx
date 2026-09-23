// app/commission-tracker/transactions/[id]/components/CommissionWaterfall.tsx
import React, { useEffect, useState } from 'react';
import { AgentConfig, DynamicRule, CommissionEntityOption, KnownAgentInfo, formatPercentageClean } from '../types';
import { DecimalInput } from './DecimalInput';

interface CommissionWaterfallProps {
  isCollapsed: boolean;
  onToggleSection: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onApplyEdit: () => void;
  agents: AgentConfig[];
  onOpenAddAgentModal: () => void;
  onRemoveAgent: (name: string) => void;
  onSwitchAgent?: (agentId: string, newAgentName: string) => void;
  onToggleAgentSplitType: (id: string) => void;
  onSplitValueChange: (id: string, val: number) => void;
  dealResult: any;
  offTheTopRules: DynamicRule[];
  onAddOffTopRule?: (rule: DynamicRule) => void;
  onDeleteOffTopRule: (id: string) => void;
  onToggleOffTopRuleType: (id: string) => void;
  onUpdateOffTopRuleValue: (id: string, val: number) => void;
  onUpdateOffTopRuleEntity?: (id: string, entity: string) => void;
  onUpdateOffTopRuleNote?: (id: string, note: string) => void;
  onReorderOffTopRules?: (fromIndex: number, toIndex: number) => void;
  preSplitRules?: DynamicRule[];
  onAddPreSplitRule?: (rule: DynamicRule) => void;
  onDeletePreSplitRule?: (id: string) => void;
  onTogglePreSplitRuleType?: (id: string) => void;
  onUpdatePreSplitRuleValue?: (id: string, val: number) => void;
  onUpdatePreSplitRuleEntity?: (id: string, entity: string) => void;
  onUpdatePreSplitRuleNote?: (id: string, note: string) => void;
  onReorderPreSplitRules?: (fromIndex: number, toIndex: number) => void;
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  onAddAgentPostSplitRule?: (agentName: string, rule: DynamicRule) => void;
  onDeleteAgentPostSplitRule: (agentName: string, ruleId: string) => void;
  onToggleAgentPostSplitType: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplitValue: (agentName: string, ruleId: string, val: number) => void;
  onUpdateAgentPostSplitEntity?: (agentName: string, ruleId: string, entity: string) => void;
  onUpdateAgentPostSplitNote?: (agentName: string, ruleId: string, note: string) => void;
  onReorderAgentPostSplitRules?: (agentName: string, fromIndex: number, toIndex: number) => void;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  onAddAgentPostSplit2Rule?: (agentName: string, rule: DynamicRule) => void;
  onDeleteAgentPostSplit2Rule?: (agentName: string, ruleId: string) => void;
  onToggleAgentPostSplit2Type?: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplit2Value?: (agentName: string, ruleId: string, val: number) => void;
  onUpdateAgentPostSplit2Entity?: (agentName: string, ruleId: string, entity: string) => void;
  onUpdateAgentPostSplit2Note?: (agentName: string, ruleId: string, note: string) => void;
  onReorderAgentPostSplit2Rules?: (agentName: string, fromIndex: number, toIndex: number) => void;
  onReorderAgents?: (fromIndex: number, toIndex: number) => void;
  knownEntities?: CommissionEntityOption[];
  knownAgents?: KnownAgentInfo[];
  preventMinus: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  formatNumberWithCommas: (val: number | string) => string;
}

export function CommissionWaterfall({
  isCollapsed,
  onToggleSection,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onApplyEdit,
  agents,
  onOpenAddAgentModal,
  onRemoveAgent,
  onSwitchAgent,
  onToggleAgentSplitType,
  onSplitValueChange,
  dealResult,
  offTheTopRules,
  onAddOffTopRule,
  onDeleteOffTopRule,
  onToggleOffTopRuleType,
  onUpdateOffTopRuleValue,
  onUpdateOffTopRuleEntity,
  onUpdateOffTopRuleNote,
  onReorderOffTopRules,
  preSplitRules = [],
  onAddPreSplitRule,
  onDeletePreSplitRule,
  onTogglePreSplitRuleType,
  onUpdatePreSplitRuleValue,
  onUpdatePreSplitRuleEntity,
  onUpdatePreSplitRuleNote,
  onReorderPreSplitRules,
  postSplitRulesByAgent,
  onAddAgentPostSplitRule,
  onDeleteAgentPostSplitRule,
  onToggleAgentPostSplitType,
  onUpdateAgentPostSplitValue,
  onUpdateAgentPostSplitEntity,
  onUpdateAgentPostSplitNote,
  onReorderAgentPostSplitRules,
  postSplit2RulesByAgent = {},
  onAddAgentPostSplit2Rule,
  onDeleteAgentPostSplit2Rule,
  onToggleAgentPostSplit2Type,
  onUpdateAgentPostSplit2Value,
  onUpdateAgentPostSplit2Entity,
  onUpdateAgentPostSplit2Note,
  onReorderAgentPostSplit2Rules,
  onReorderAgents,
  knownEntities = [],
  knownAgents = [],
  preventMinus,
  formatNumberWithCommas,
}: CommissionWaterfallProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const baselineTotalCommission = dealResult.totalCommission || dealResult.grossCommission || 0;
  const commissionAfterOffTop = dealResult.commissionAfterOffTop ?? 0;
  const commissionAfterPreSplit = dealResult.commissionAfterPreSplit ?? commissionAfterOffTop;
  const agentNames = agents.map((a) => a.name);

  // 1. Off-the-Top Inline Form State
  const [isAddingOffTop, setIsAddingOffTop] = useState(false);
  const [newOffTopEntity, setNewOffTopEntity] = useState('');
  const [newOffTopNote, setNewOffTopNote] = useState('');
  const [newOffTopType, setNewOffTopType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [newOffTopValue, setNewOffTopValue] = useState<number>(0);

  // 2. Pre-Split Inline Form State
  const [isAddingPreSplit, setIsAddingPreSplit] = useState(false);
  const [newPreSplitEntity, setNewPreSplitEntity] = useState('');
  const [newPreSplitNote, setNewPreSplitNote] = useState('');
  const [newPreSplitType, setNewPreSplitType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [newPreSplitValue, setNewPreSplitValue] = useState<number>(0);

  // 3. Level 1 Post-Split Inline Form State
  const [addingPostSplitForAgent, setAddingPostSplitForAgent] = useState<string | null>(null);
  const [newPostSplitEntity, setNewPostSplitEntity] = useState('');
  const [newPostSplitNote, setNewPostSplitNote] = useState('');
  const [newPostSplitType, setNewPostSplitType] = useState<'PERCENT' | 'AMOUNT'>('AMOUNT');
  const [newPostSplitValue, setNewPostSplitValue] = useState<number>(0);

  // 4. Level 2 Post-Split Inline Form State
  const [addingPostSplit2ForAgent, setAddingPostSplit2ForAgent] = useState<string | null>(null);
  const [newPostSplit2Entity, setNewPostSplit2Entity] = useState('');
  const [newPostSplit2Note, setNewPostSplit2Note] = useState('');
  const [newPostSplit2Type, setNewPostSplit2Type] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [newPostSplit2Value, setNewPostSplit2Value] = useState<number>(0);

  useEffect(() => {
    if (!isEditing) {
      setIsAddingOffTop(false);
      setIsAddingPreSplit(false);
      setAddingPostSplitForAgent(null);
      setAddingPostSplit2ForAgent(null);
    }
  }, [isEditing]);

  const renderReadonlySplitValue = (type: 'PERCENT' | 'AMOUNT', value: number) => (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-7 h-7 inline-flex items-center justify-center rounded-md font-bold text-xs border shrink-0 ${
          type === 'PERCENT'
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700/80'
            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/80'
        }`}
      >
        {type === 'PERCENT' ? '%' : '$'}
      </span>
      <span
        className={`w-20 h-7 inline-flex items-center justify-end rounded-md px-2 text-xs font-semibold border ${
          type === 'PERCENT'
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80'
            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/80'
        }`}
      >
        {type === 'PERCENT' ? formatPercentageClean(value) : formatNumberWithCommas(Number(value || 0).toFixed(2))}
      </span>
    </div>
  );

  const handleStartAddOffTop = () => {
    setIsAddingOffTop(true);
    setNewOffTopEntity('');
    setNewOffTopNote('');
    setNewOffTopType('PERCENT');
    setNewOffTopValue(0);
  };

  const handleSaveOffTop = () => {
    const entity = newOffTopEntity.trim();
    if (!entity) return;
    const rule: DynamicRule = {
      id: `offtop_${Date.now()}`,
      name: entity,
      entity,
      note: newOffTopNote.trim() || undefined,
      type: newOffTopType,
      value: newOffTopValue,
    };
    if (onAddOffTopRule) onAddOffTopRule(rule);
    setNewOffTopEntity('');
    setNewOffTopNote('');
    setNewOffTopValue(0);
    setIsAddingOffTop(false);
  };

  const handleStartAddPreSplit = () => {
    setIsAddingPreSplit(true);
    setNewPreSplitEntity('');
    setNewPreSplitNote('');
    setNewPreSplitType('PERCENT');
    setNewPreSplitValue(0);
  };

  const handleSavePreSplit = () => {
    const entity = newPreSplitEntity.trim();
    if (!entity) return;
    const rule: DynamicRule = {
      id: `presplit_${Date.now()}`,
      name: entity,
      entity,
      note: newPreSplitNote.trim() || undefined,
      type: newPreSplitType,
      value: newPreSplitValue,
    };
    if (onAddPreSplitRule) onAddPreSplitRule(rule);
    setNewPreSplitEntity('');
    setNewPreSplitNote('');
    setNewPreSplitValue(0);
    setIsAddingPreSplit(false);
  };

  const handleStartAddPostSplit1 = (agentName: string) => {
    setAddingPostSplitForAgent(agentName);
    setNewPostSplitEntity('');
    setNewPostSplitNote('');
    setNewPostSplitType('AMOUNT');
    setNewPostSplitValue(0);
  };

  const handleSavePostSplit = (agentName: string) => {
    const entity = newPostSplitEntity.trim();
    if (!entity) return;
    const rule: DynamicRule = {
      id: `postsplit_${Date.now()}`,
      name: entity,
      entity,
      note: newPostSplitNote.trim() || undefined,
      type: newPostSplitType,
      value: newPostSplitValue,
    };
    if (onAddAgentPostSplitRule) onAddAgentPostSplitRule(agentName, rule);
    setNewPostSplitEntity('');
    setNewPostSplitNote('');
    setNewPostSplitValue(0);
    setAddingPostSplitForAgent(null);
  };

  const handleStartAddPostSplit2 = (agentName: string) => {
    setAddingPostSplit2ForAgent(agentName);
    setNewPostSplit2Entity('');
    setNewPostSplit2Note('');
    setNewPostSplit2Type('PERCENT');
    setNewPostSplit2Value(0);
  };

  const handleSavePostSplit2 = (agentName: string) => {
    const entity = newPostSplit2Entity.trim();
    if (!entity) return;
    const rule: DynamicRule = {
      id: `postsplit2_${Date.now()}`,
      name: entity,
      entity,
      note: newPostSplit2Note.trim() || undefined,
      type: newPostSplit2Type,
      value: newPostSplit2Value,
    };
    if (onAddAgentPostSplit2Rule) onAddAgentPostSplit2Rule(agentName, rule);
    setNewPostSplit2Entity('');
    setNewPostSplit2Note('');
    setNewPostSplit2Value(0);
    setAddingPostSplit2ForAgent(null);
  };

  const toggleNewOffTopType = () => {
    setNewOffTopValue((v) => (newOffTopType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(4)) : v));
    setNewOffTopType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPreSplitType = () => {
    setNewPreSplitValue((v) => (newPreSplitType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(4)) : v));
    setNewPreSplitType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplitType = () => {
    setNewPostSplitValue((v) => (newPostSplitType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(4)) : v));
    setNewPostSplitType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplit2Type = () => {
    setNewPostSplit2Value((v) => (newPostSplit2Type === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(4)) : v));
    setNewPostSplit2Type((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const renderSplitTypeButton = (type: 'PERCENT' | 'AMOUNT', onToggle: () => void, title = 'Toggle % / $') => (
    <button
      type="button"
      onClick={onToggle}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md font-bold text-xs cursor-pointer whitespace-nowrap transition border shrink-0 ${
        type === 'PERCENT'
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700/80 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
      }`}
      title={title}
    >
      {type === 'PERCENT' ? '%' : '$'}
    </button>
  );

  const renderReorderControls = (
    index: number,
    total: number,
    onMove?: (fromIdx: number, toIdx: number) => void,
    dragType?: string
  ) => {
    if (!isEditing || !onMove || total <= 1) return null;
    return (
      <div className="flex items-center gap-0.5 shrink-0 select-none mr-0.5">
        <span
          draggable
          onDragStart={(e) => {
            if (dragType) {
              e.dataTransfer.setData('text/plain', JSON.stringify({ dragType, index }));
              e.dataTransfer.effectAllowed = 'move';
            }
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

  const getDragRowProps = (
    index: number,
    dragType: string,
    onMove?: (fromIdx: number, toIdx: number) => void
  ) => {
    if (!isEditing || !onMove) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        try {
          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data && data.dragType === dragType && typeof data.index === 'number' && data.index !== index) {
            onMove(data.index, index);
          }
        } catch {
          // ignore
        }
      },
    };
  };

  return (
    <section id="commission" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
      {/* Top Header with Total Commission label */}
      <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-lg">⚙️</span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Commission Waterfall</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Total Commission:
            </span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(baselineTotalCommission)}
            </span>
          </div>

          {!isEditing ? (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>✏️</span> Edit Commission Waterfall
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApplyEdit}
                className="text-xs bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg font-bold transition hover:bg-emerald-400 shadow-md cursor-pointer"
              >
                Apply Changes
              </button>
            </div>
          )}

          <button
            onClick={onToggleSection}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none cursor-pointer"
            title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {/* Step 1: Off-The-Top Deductions */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  1. Off-The-Top Deductions
                </span>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleStartAddOffTop}
                    className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold cursor-pointer transition flex items-center gap-1"
                    title="Add Off-The-Top deduction"
                  >
                    <span>+ Add</span>
                  </button>
                )}
              </div>
            </div>

            {isEditing && isAddingOffTop && (
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                  Add Off-The-Top Deduction
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {knownEntities.length > 0 ? (
                    <select
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                    >
                      <option value="">Select Entity...</option>
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity Name (e.g. Soleox Realty)"
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    {renderSplitTypeButton(newOffTopType, toggleNewOffTopType)}
                    <DecimalInput
                      value={newOffTopValue}
                      onChange={setNewOffTopValue}
                      isPercent={newOffTopType === 'PERCENT'}
                      useCommas={newOffTopType === 'AMOUNT'}
                      onKeyDown={preventMinus}
                      colorCode
                      allowEmpty
                      placeholder="0.00"
                      className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={newOffTopNote}
                    onChange={(e) => setNewOffTopNote(e.target.value)}
                    className="flex-1 min-w-[130px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsAddingOffTop(false)}
                      className="text-xs px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveOffTop}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded font-semibold cursor-pointer shadow-sm whitespace-nowrap"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {offTheTopRules.length === 0 && !isAddingOffTop && (
              <p className="text-xs text-slate-400 italic py-1">No off-the-top deductions applied to this transaction.</p>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {offTheTopRules.map((rule, idx) => {
                const calculatedItem = (dealResult.offTheTopItems || []).find((i: any) => i.id === rule.id);
                return (
                  <div
                    key={rule.id}
                    {...getDragRowProps(idx, 'offTop', onReorderOffTopRules)}
                    className="py-2.5 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                      {renderReorderControls(idx, offTheTopRules.length, onReorderOffTopRules, 'offTop')}
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => onDeleteOffTopRule(rule.id)}
                          className="text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition p-0.5"
                          title="Delete rule"
                        >
                          🗑️
                        </button>
                      )}

                      {isEditing ? (
                        knownEntities.length > 0 ? (
                          <select
                            value={rule.entity}
                            onChange={(e) => onUpdateOffTopRuleEntity?.(rule.id, e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[150px] sm:max-w-[190px]"
                            title="Switch entity"
                          >
                            <option value={rule.entity}>{rule.entity}</option>
                            {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                              <option key={ent.id} value={ent.name}>{ent.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={rule.entity}
                            onChange={(e) => onUpdateOffTopRuleEntity?.(rule.id, e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-28"
                          />
                        )
                      ) : (
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px] truncate" title={rule.entity}>
                          {rule.entity || '—'}
                        </span>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          {renderSplitTypeButton(rule.type, () => onToggleOffTopRuleType(rule.id))}
                          <DecimalInput
                            value={rule.value}
                            onChange={(val) => onUpdateOffTopRuleValue(rule.id, val)}
                            isPercent={rule.type === 'PERCENT'}
                            useCommas={rule.type === 'AMOUNT'}
                            onKeyDown={preventMinus}
                            colorCode
                            className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                          />
                        </div>
                      ) : (
                        renderReadonlySplitValue(rule.type, rule.value)
                      )}

                      {isEditing ? (
                        <input
                          type="text"
                          value={rule.note || ''}
                          onChange={(e) => onUpdateOffTopRuleNote?.(rule.id, e.target.value)}
                          placeholder="+ Note"
                          className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 focus:border-emerald-500 focus:border-solid text-[11px] text-slate-500 dark:text-slate-400 placeholder-slate-400 focus:outline-none px-1 py-0.5 w-24 sm:w-36 transition"
                          title="Click to edit note"
                        />
                      ) : (
                        rule.note ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[9rem]" title={rule.note}>
                            {rule.note}
                          </span>
                        ) : null
                      )}
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      -{formatCurrency(calculatedItem?.amount || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: Pre-Split Deductions */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  2. Pre-Split Deductions
                </span>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleStartAddPreSplit}
                    className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold cursor-pointer transition flex items-center gap-1"
                    title="Add Pre-Split deduction"
                  >
                    <span>+ Add</span>
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Remaining Commission: <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterOffTop)}</strong>
              </span>
            </div>

            {isEditing && isAddingPreSplit && (
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                  Add Pre-Split Deduction
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {knownEntities.length > 0 ? (
                    <select
                      value={newPreSplitEntity}
                      onChange={(e) => setNewPreSplitEntity(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                    >
                      <option value="">Select Entity...</option>
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity Name (e.g. TC Fee, Referral)"
                      value={newPreSplitEntity}
                      onChange={(e) => setNewPreSplitEntity(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    {renderSplitTypeButton(newPreSplitType, toggleNewPreSplitType)}
                    <DecimalInput
                      value={newPreSplitValue}
                      onChange={setNewPreSplitValue}
                      isPercent={newPreSplitType === 'PERCENT'}
                      useCommas={newPreSplitType === 'AMOUNT'}
                      onKeyDown={preventMinus}
                      colorCode
                      allowEmpty
                      placeholder="0.00"
                      className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={newPreSplitNote}
                    onChange={(e) => setNewPreSplitNote(e.target.value)}
                    className="flex-1 min-w-[130px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsAddingPreSplit(false)}
                      className="text-xs px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePreSplit}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded font-semibold cursor-pointer shadow-sm whitespace-nowrap"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {preSplitRules.length === 0 && !isAddingPreSplit && (
              <p className="text-xs text-slate-400 italic py-1">No pre-split deductions applied to this transaction.</p>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {preSplitRules.map((rule, idx) => {
                const calculatedItem = (dealResult.preSplitItems || []).find((i: any) => i.id === rule.id);
                return (
                  <div
                    key={rule.id}
                    {...getDragRowProps(idx, 'preSplit', onReorderPreSplitRules)}
                    className="py-2.5 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                      {renderReorderControls(idx, preSplitRules.length, onReorderPreSplitRules, 'preSplit')}
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => onDeletePreSplitRule?.(rule.id)}
                          className="text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition p-0.5"
                          title="Delete rule"
                        >
                          🗑️
                        </button>
                      )}

                      {isEditing ? (
                        knownEntities.length > 0 ? (
                          <select
                            value={rule.entity}
                            onChange={(e) => onUpdatePreSplitRuleEntity?.(rule.id, e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[150px] sm:max-w-[190px]"
                            title="Switch entity"
                          >
                            <option value={rule.entity}>{rule.entity}</option>
                            {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                              <option key={ent.id} value={ent.name}>{ent.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={rule.entity}
                            onChange={(e) => onUpdatePreSplitRuleEntity?.(rule.id, e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-28"
                          />
                        )
                      ) : (
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px] truncate" title={rule.entity}>
                          {rule.entity || '—'}
                        </span>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          {renderSplitTypeButton(rule.type, () => onTogglePreSplitRuleType?.(rule.id))}
                          <DecimalInput
                            value={rule.value}
                            onChange={(val) => onUpdatePreSplitRuleValue?.(rule.id, val)}
                            isPercent={rule.type === 'PERCENT'}
                            useCommas={rule.type === 'AMOUNT'}
                            onKeyDown={preventMinus}
                            colorCode
                            className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                          />
                        </div>
                      ) : (
                        renderReadonlySplitValue(rule.type, rule.value)
                      )}

                      {isEditing ? (
                        <input
                          type="text"
                          value={rule.note || ''}
                          onChange={(e) => onUpdatePreSplitRuleNote?.(rule.id, e.target.value)}
                          placeholder="+ Note"
                          className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 focus:border-emerald-500 focus:border-solid text-[11px] text-slate-500 dark:text-slate-400 placeholder-slate-400 focus:outline-none px-1 py-0.5 w-24 sm:w-36 transition"
                          title="Click to edit note"
                        />
                      ) : (
                        rule.note ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[9rem]" title={rule.note}>
                            {rule.note}
                          </span>
                        ) : null
                      )}
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      -{formatCurrency(calculatedItem?.amount || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3: Agent Splits Breakdown */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  3. Agent Splits Breakdown
                </span>
                {isEditing && (
                  <button
                    type="button"
                    onClick={onOpenAddAgentModal}
                    className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded font-bold cursor-pointer transition flex items-center gap-1"
                    title="Add Agent Split"
                  >
                    <span>+ Add Agent</span>
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Remaining Commission: <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterPreSplit)}</strong>
              </span>
            </div>

            {agents.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                {isEditing
                  ? <>No agents assigned yet. Click &ldquo;+ Add Agent&rdquo; to assign a split.</>
                  : 'No agents assigned yet.'}
              </p>
            ) : (
              <div className="space-y-3">
                {agents.map((agent, index) => {
                  const computedSplitItem = (dealResult.agentSplitItems || []).find((s: any) => s.agentId === agent.id);

                  if (index === 0) {
                    // Primary Agent Card (non-editable in Waterfall, tied to Transaction Overview)
                    return (
                      <div
                        key={agent.id}
                        className="bg-slate-50 dark:bg-slate-900 border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5 relative"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              👤 {agent.name}
                            </span>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              PRIMARY
                            </span>
                            <span className="relative inline-flex group/painfo">
                              <button
                                type="button"
                                aria-label="Primary Agent explained"
                                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-default"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 w-72 -translate-x-1/2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 shadow-lg opacity-0 invisible group-hover/painfo:opacity-100 group-hover/painfo:visible transition-opacity duration-150"
                              >
                                Primary Agent (tied to Transaction Overview • receives remaining balance after secondary agent splits)
                              </span>
                            </span>
                            {agent.isTeamLead && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                                LEAD
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {((computedSplitItem?.percent || 0) * 100).toFixed(1)}% Split
                            </span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(computedSplitItem?.amount || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Secondary Agent Card
                  const secondaryIdx = index - 1;
                  const secondaryTotal = agents.length - 1;

                  return (
                    <div
                      key={agent.id}
                      {...getDragRowProps(secondaryIdx, 'agentSplit', (fromI, toI) => onReorderAgents?.(fromI + 1, toI + 1))}
                      className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5 relative"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {renderReorderControls(secondaryIdx, secondaryTotal, (fromI, toI) => onReorderAgents?.(fromI + 1, toI + 1), 'agentSplit')}
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => onRemoveAgent(agent.name)}
                              className="text-xs text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition"
                              title={`Remove ${agent.name}`}
                            >
                              🗑️
                            </button>
                          )}

                          <span className="text-xs select-none">👤</span>

                          {isEditing && knownAgents.length > 0 ? (
                            <select
                              value={agent.name}
                              onChange={(e) => onSwitchAgent?.(agent.id, e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 text-xs font-bold text-slate-900 dark:text-white focus:outline-none py-0.5 cursor-pointer max-w-[160px] sm:max-w-[220px]"
                              title="Switch agent"
                            >
                              <option value={agent.name}>{agent.name}</option>
                              {knownAgents
                                .filter((a) => a.name !== agent.name && !agents.some((ag) => ag.name === a.name))
                                .map((a) => (
                                  <option key={a.id} value={a.name}>
                                    {a.name} {a.isTeamLead ? '(LEAD)' : ''}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{agent.name}</span>
                          )}

                          {agent.isTeamLead && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              LEAD
                            </span>
                          )}

                          {isEditing ? (
                            <div className="flex items-center gap-1.5 ml-1">
                              {renderSplitTypeButton(agent.splitType, () => onToggleAgentSplitType(agent.id))}
                              <DecimalInput
                                value={agent.splitVal}
                                onChange={(val) => onSplitValueChange(agent.id, val)}
                                isPercent={agent.splitType === 'PERCENT'}
                                useCommas={agent.splitType === 'AMOUNT'}
                                onKeyDown={preventMinus}
                                colorCode
                                className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                              />
                            </div>
                          ) : (
                            <div className="ml-1">
                              {renderReadonlySplitValue(agent.splitType, agent.splitVal)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold min-w-[55px] text-right">
                            ({((computedSplitItem?.percent || 0) * 100).toFixed(1)}%)
                          </span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 min-w-[85px] text-right">
                            {formatCurrency(computedSplitItem?.amount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 4: Post-Split Deductions Per Agent (Level 1 & Level 2 / Stock) */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-4 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  4. Post-Split Deductions Per Agent
                </span>
                <span className="relative inline-flex group/psinfo">
                  <button
                    type="button"
                    aria-label="Post-split levels explained"
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-default"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 w-72 -translate-x-1/2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 shadow-lg opacity-0 invisible group-hover/psinfo:opacity-100 group-hover/psinfo:visible transition-opacity duration-150"
                  >
                    Level 1: Common deductions from Agent Split • Level 2: Other deductions from Net after Level 1 Post-splits (e.g., 5% Brokerage stock options)
                  </span>
                </span>
              </div>
            </div>

            {agentNames.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                Assign an agent to configure post-split deductions.
              </p>
            ) : (
              agentNames.map((agentName) => {
                const agentObj = agents.find((a) => a.name === agentName);
                const computedSplitItem = (dealResult.agentSplitItems || []).find(
                  (s: any) => s.agentName === agentName || s.agentId === agentObj?.id
                );
                const agentGrossSplit = computedSplitItem?.amount || 0;

                // Level 1 rules & items
                const agentRules1 = postSplitRulesByAgent[agentName] || [];
                const items1ForAgent = (dealResult.postSplitItems || []).filter((i: any) => i.agentName === agentName);
                const isAddingL1 = addingPostSplitForAgent === agentName;
                const netAfterL1 = dealResult.agentNetAfterLevel1?.[agentName] ?? agentGrossSplit;

                // Level 2 rules & items (Stock / Elective)
                const agentRules2 = postSplit2RulesByAgent[agentName] || [];
                const items2ForAgent = (dealResult.postSplit2Items || []).filter((i: any) => i.agentName === agentName);
                const isAddingL2 = addingPostSplit2ForAgent === agentName;

                // Final net payout
                const finalAgentPayout = dealResult.netPayouts?.[agentName] ?? netAfterL1;

                return (
                  <div
                    key={agentName}
                    className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4"
                  >
                    {/* Agent Sub-Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          👤 {agentName}
                        </span>
                        {agentObj?.isTeamLead && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold uppercase">
                            LEAD
                          </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          (Agent Split: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(agentGrossSplit)}</strong>)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Final Net Payout:</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                          {formatCurrency(finalAgentPayout)}
                        </span>
                      </div>
                    </div>

                    {/* LEVEL 1: Level 1 Post-splits */}
                    <div className="bg-white dark:bg-slate-900/90 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                            Level 1 Post-splits
                          </span>
                          <span className="text-[10px] text-slate-400">Calculated on Agent Split</span>
                        </div>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => isAddingL1 ? setAddingPostSplitForAgent(null) : handleStartAddPostSplit1(agentName)}
                            className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold cursor-pointer transition"
                          >
                            {isAddingL1 ? 'Cancel' : '+ Add L1 Post-split'}
                          </button>
                        )}
                      </div>

                      {isEditing && isAddingL1 && (
                        <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-500/30 space-y-2 my-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                            New Level 1 Post-split for {agentName}
                          </span>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {knownEntities.length > 0 ? (
                              <select
                                value={newPostSplitEntity}
                                onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                              >
                                <option value="">Select Entity...</option>
                                {knownEntities.map((ent) => (
                                  <option key={ent.id} value={ent.name}>{ent.name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="Entity Name (e.g. Soleox Realty)"
                                value={newPostSplitEntity}
                                onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                              />
                            )}
                            <div className="flex items-center gap-1.5">
                              {renderSplitTypeButton(newPostSplitType, toggleNewPostSplitType)}
                              <DecimalInput
                                value={newPostSplitValue}
                                onChange={setNewPostSplitValue}
                                isPercent={newPostSplitType === 'PERCENT'}
                                useCommas={newPostSplitType === 'AMOUNT'}
                                onKeyDown={preventMinus}
                                colorCode
                                allowEmpty
                                placeholder="0.00"
                                className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={newPostSplitNote}
                              onChange={(e) => setNewPostSplitNote(e.target.value)}
                              className="flex-1 min-w-[130px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setAddingPostSplitForAgent(null)}
                                className="text-xs px-2 py-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSavePostSplit(agentName)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded font-semibold cursor-pointer shadow-sm whitespace-nowrap"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {agentRules1.length === 0 && !isAddingL1 && (
                        <p className="text-xs text-slate-400 italic py-1">
                          No Level 1 Post-splits applied to {agentName}.
                        </p>
                      )}

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {agentRules1.map((rule, ruleIdx) => {
                          const calculatedItem = items1ForAgent.find((i: any) => i.id === rule.id);
                          return (
                            <div
                              key={rule.id}
                              {...getDragRowProps(ruleIdx, `postSplit1_${agentName}`, (fromI, toI) => onReorderAgentPostSplitRules?.(agentName, fromI, toI))}
                              className="py-2 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300"
                            >
                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                {renderReorderControls(ruleIdx, agentRules1.length, (fromI, toI) => onReorderAgentPostSplitRules?.(agentName, fromI, toI), `postSplit1_${agentName}`)}
                                {isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteAgentPostSplitRule(agentName, rule.id)}
                                    className="text-rose-500 hover:text-rose-600 cursor-pointer p-0.5"
                                    title="Delete rule"
                                  >
                                    🗑️
                                  </button>
                                )}

                                {isEditing ? (
                                  knownEntities.length > 0 ? (
                                    <select
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplitEntity?.(agentName, rule.id, e.target.value)}
                                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[140px] sm:max-w-[170px]"
                                      title="Switch entity"
                                    >
                                      <option value={rule.entity}>{rule.entity}</option>
                                      {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplitEntity?.(agentName, rule.id, e.target.value)}
                                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-24"
                                    />
                                  )
                                ) : (
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={rule.entity}>
                                    {rule.entity || '—'}
                                  </span>
                                )}

                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    {renderSplitTypeButton(rule.type, () => onToggleAgentPostSplitType(agentName, rule.id))}
                                    <DecimalInput
                                      value={rule.value}
                                      onChange={(val) => onUpdateAgentPostSplitValue(agentName, rule.id, val)}
                                      isPercent={rule.type === 'PERCENT'}
                                      useCommas={rule.type === 'AMOUNT'}
                                      onKeyDown={preventMinus}
                                      colorCode
                                      className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                                    />
                                  </div>
                                ) : (
                                  renderReadonlySplitValue(rule.type, rule.value)
                                )}

                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={rule.note || ''}
                                    onChange={(e) => onUpdateAgentPostSplitNote?.(agentName, rule.id, e.target.value)}
                                    placeholder="+ Note"
                                    className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 focus:border-emerald-500 focus:border-solid text-[11px] text-slate-500 dark:text-slate-400 placeholder-slate-400 focus:outline-none px-1 py-0.5 w-20 sm:w-28 transition"
                                    title="Click to edit note"
                                  />
                                ) : (
                                  rule.note ? (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[7rem]" title={rule.note}>
                                      {rule.note}
                                    </span>
                                  ) : null
                                )}
                              </div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                -{formatCurrency(calculatedItem?.amount || 0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Level 1 Subtotal */}
                      <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2 text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          Net After Level 1 Post-Splits:
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(netAfterL1)}
                        </span>
                      </div>
                    </div>

                    {/* LEVEL 2: Level 2 Post-splits */}
                    <div className="bg-white dark:bg-slate-900/90 rounded-lg p-3 border border-violet-500/30 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
                            Level 2 Post-splits
                          </span>
                          <span className="text-[10px] text-slate-400">Calculated from Net after Level 1 ({formatCurrency(netAfterL1)})</span>
                        </div>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => isAddingL2 ? setAddingPostSplit2ForAgent(null) : handleStartAddPostSplit2(agentName)}
                            className="text-[10px] bg-violet-500/15 hover:bg-violet-500/25 text-violet-700 dark:text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded font-bold cursor-pointer transition"
                          >
                            {isAddingL2 ? 'Cancel' : '+ Add L2 Post-split'}
                          </button>
                        )}
                      </div>

                      {isEditing && isAddingL2 && (
                        <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-500/30 space-y-2 my-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Add Level 2 Post-split (e.g. eXp 5% Stock Program)
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              Baseline: {formatCurrency(netAfterL1)}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {knownEntities.length > 0 ? (
                              <select
                                value={newPostSplit2Entity}
                                onChange={(e) => setNewPostSplit2Entity(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                              >
                                <option value="">Select Entity...</option>
                                {knownEntities.map((ent) => (
                                  <option key={ent.id} value={ent.name}>{ent.name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="Payee Entity (e.g. Stock)"
                                value={newPostSplit2Entity}
                                onChange={(e) => setNewPostSplit2Entity(e.target.value)}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium sm:w-44"
                              />
                            )}
                            <div className="flex items-center gap-1.5">
                              {renderSplitTypeButton(newPostSplit2Type, toggleNewPostSplit2Type)}
                              <DecimalInput
                                value={newPostSplit2Value}
                                onChange={setNewPostSplit2Value}
                                isPercent={newPostSplit2Type === 'PERCENT'}
                                useCommas={newPostSplit2Type === 'AMOUNT'}
                                onKeyDown={preventMinus}
                                colorCode
                                allowEmpty
                                placeholder="0.00"
                                className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                              />
                              <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                                {newPostSplit2Type === 'PERCENT' && newPostSplit2Value > 0
                                  ? `≈ ${formatCurrency(netAfterL1 * (newPostSplit2Value > 1 ? newPostSplit2Value / 100 : newPostSplit2Value))}`
                                  : ''}
                              </span>
                            </div>
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={newPostSplit2Note}
                              onChange={(e) => setNewPostSplit2Note(e.target.value)}
                              className="flex-1 min-w-[130px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setAddingPostSplit2ForAgent(null)}
                                className="text-xs px-2 py-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSavePostSplit2(agentName)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded font-semibold cursor-pointer shadow-sm whitespace-nowrap"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {agentRules2.length === 0 && !isAddingL2 && (
                        <p className="text-xs text-slate-400 italic py-1">
                          No Level 2 Post-splits applied to {agentName}.
                        </p>
                      )}

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {agentRules2.map((rule, ruleIdx) => {
                          const calculatedItem2 = items2ForAgent.find((i: any) => i.id === rule.id);
                          return (
                            <div
                              key={rule.id}
                              {...getDragRowProps(ruleIdx, `postSplit2_${agentName}`, (fromI, toI) => onReorderAgentPostSplit2Rules?.(agentName, fromI, toI))}
                              className="py-2 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300"
                            >
                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                {renderReorderControls(ruleIdx, agentRules2.length, (fromI, toI) => onReorderAgentPostSplit2Rules?.(agentName, fromI, toI), `postSplit2_${agentName}`)}
                                {isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteAgentPostSplit2Rule?.(agentName, rule.id)}
                                    className="text-rose-500 hover:text-rose-600 cursor-pointer p-0.5"
                                    title="Delete rule"
                                  >
                                    🗑️
                                  </button>
                                )}

                                {isEditing ? (
                                  knownEntities.length > 0 ? (
                                    <select
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplit2Entity?.(agentName, rule.id, e.target.value)}
                                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[140px] sm:max-w-[170px]"
                                      title="Switch entity"
                                    >
                                      <option value={rule.entity}>{rule.entity}</option>
                                      {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplit2Entity?.(agentName, rule.id, e.target.value)}
                                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-24"
                                    />
                                  )
                                ) : (
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={rule.entity}>
                                    {rule.entity || '—'}
                                  </span>
                                )}

                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    {renderSplitTypeButton(rule.type, () => onToggleAgentPostSplit2Type?.(agentName, rule.id))}
                                    <DecimalInput
                                      value={rule.value}
                                      onChange={(val) => onUpdateAgentPostSplit2Value?.(agentName, rule.id, val)}
                                      isPercent={rule.type === 'PERCENT'}
                                      useCommas={rule.type === 'AMOUNT'}
                                      onKeyDown={preventMinus}
                                      colorCode
                                      className="w-20 h-7 border rounded-md px-2 text-xs text-right font-semibold focus:outline-none transition shrink-0"
                                    />
                                  </div>
                                ) : (
                                  renderReadonlySplitValue(rule.type, rule.value)
                                )}

                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={rule.note || ''}
                                    onChange={(e) => onUpdateAgentPostSplit2Note?.(agentName, rule.id, e.target.value)}
                                    placeholder="+ Note"
                                    className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 focus:border-emerald-500 focus:border-solid text-[11px] text-slate-500 dark:text-slate-400 placeholder-slate-400 focus:outline-none px-1 py-0.5 w-20 sm:w-28 transition"
                                    title="Click to edit note"
                                  />
                                ) : (
                                  rule.note ? (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[7rem]" title={rule.note}>
                                      {rule.note}
                                    </span>
                                  ) : null
                                )}
                              </div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                -{formatCurrency(calculatedItem2?.amount || 0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Level 2 Subtotal */}
                      <div className="flex justify-between items-center border-t border-violet-200 dark:border-violet-800/60 pt-2 text-xs">
                        <span className="font-semibold text-violet-700 dark:text-violet-400">
                          Net After Level 2 Post-Splits:
                        </span>
                        <span className="font-bold text-violet-700 dark:text-violet-400">
                          {formatCurrency(finalAgentPayout)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
