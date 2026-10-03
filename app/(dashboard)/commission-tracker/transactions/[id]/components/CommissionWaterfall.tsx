// app/commission-tracker/transactions/[id]/components/CommissionWaterfall.tsx
import React, { useEffect, useState } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { AgentConfig, DynamicRule, CommissionEntityOption, KnownAgentInfo } from '../types';
import { CommissionWaterfallTable } from './CommissionWaterfallTable';
import { HoverNote } from './HoverNote';
import { SplitPair } from './SplitPair';
import { EditPencil } from '@/components/ui/edit-pencil';
import { SectionIcon } from './SectionIcon';
import { CancelEditPrompt } from './CancelEditPrompt';
import { useEditOnDoublePress } from './useEditOnDoublePress';
import { useSectionEditKeys } from './useSectionEditKeys';
import { CommissionTemplatePanel } from './CommissionTemplatePanel';
import type { AppliedTemplateRules } from './applyTemplateLogic';
import { ClearableSelect } from '@/components/ui/ClearableSelect';

interface CommissionWaterfallProps {
  isCollapsed: boolean;
  onToggleSection: () => void;
  isEditing: boolean;
  hasChanges: boolean;
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
  onReorderPostSplitEntities?: (entityOrder: string[]) => void;
  postSplit2RulesByAgent?: Record<string, DynamicRule[]>;
  onAddAgentPostSplit2Rule?: (agentName: string, rule: DynamicRule) => void;
  onDeleteAgentPostSplit2Rule?: (agentName: string, ruleId: string) => void;
  onToggleAgentPostSplit2Type?: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplit2Value?: (agentName: string, ruleId: string, val: number) => void;
  onUpdateAgentPostSplit2Entity?: (agentName: string, ruleId: string, entity: string) => void;
  onUpdateAgentPostSplit2Note?: (agentName: string, ruleId: string, note: string) => void;
  onReorderAgentPostSplit2Rules?: (agentName: string, fromIndex: number, toIndex: number) => void;
  onReorderPostSplit2Entities?: (entityOrder: string[]) => void;
  onReorderAgents?: (fromIndex: number, toIndex: number) => void;
  knownEntities?: CommissionEntityOption[];
  knownAgents?: KnownAgentInfo[];
  preventMinus: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  formatNumberWithCommas: (val: number | string) => string;
  clientId: string;
  transactionId: string;
  deal: Record<string, unknown> | null;
  templateAgents: { id: string; name: string; isTeamLead?: boolean }[];
  onApplyTemplate?: (applied: AppliedTemplateRules) => void;
}

export function CommissionWaterfall({
  isCollapsed,
  onToggleSection,
  isEditing,
  hasChanges,
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
  onReorderPostSplitEntities,
  postSplit2RulesByAgent = {},
  onAddAgentPostSplit2Rule,
  onDeleteAgentPostSplit2Rule,
  onToggleAgentPostSplit2Type,
  onUpdateAgentPostSplit2Value,
  onUpdateAgentPostSplit2Entity,
  onUpdateAgentPostSplit2Note,
  onReorderAgentPostSplit2Rules,
  onReorderPostSplit2Entities,
  onReorderAgents,
  knownEntities = [],
  knownAgents = [],
  preventMinus,
  clientId,
  transactionId,
  deal,
  templateAgents,
  onApplyTemplate,
}: CommissionWaterfallProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const baselineTotalCommission = dealResult.totalCommission || dealResult.grossCommission || 0;
  const commissionAfterOffTop = dealResult.commissionAfterOffTop ?? 0;
  const commissionAfterPreSplit = dealResult.commissionAfterPreSplit ?? commissionAfterOffTop;
  const agentSplitsExceedPool = (dealResult.agentSplitItems || []).some((item: { overAllocated?: boolean }) => item.overAllocated);
  const agentNames = agents.map((a) => a.name);
  const [agentLayout, setAgentLayout] = useState<'table' | 'cards'>('table');
  const editOnDoublePress = useEditOnDoublePress(!isEditing, onStartEdit);

  useEffect(() => {
    const saved = window.localStorage.getItem('soleox-waterfall-agent-layout');
    if (saved === 'cards' || saved === 'table') setAgentLayout(saved);
  }, []);

  const chooseAgentLayout = (next: 'table' | 'cards') => {
    setAgentLayout(next);
    window.localStorage.setItem('soleox-waterfall-agent-layout', next);
  };

  const agentLayoutToggle = (
    <div role="group" aria-label="Agent splits layout" className="inline-flex shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
      <button
        type="button"
        onClick={() => chooseAgentLayout('table')}
        title="Table"
        aria-label="Table"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer ${agentLayout === 'table' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 dark:text-slate-400'}`}
      >
        <Table2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => chooseAgentLayout('cards')}
        title="Cards"
        aria-label="Cards"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer ${agentLayout === 'cards' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 dark:text-slate-400'}`}
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );

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
  const [tableDraftDirty, setTableDraftDirty] = useState(false);

  const inlineDraftDirty =
    (isAddingOffTop && (newOffTopEntity.trim() !== '' || newOffTopNote.trim() !== '' || newOffTopValue !== 0)) ||
    (isAddingPreSplit && (newPreSplitEntity.trim() !== '' || newPreSplitNote.trim() !== '' || newPreSplitValue !== 0)) ||
    (Boolean(addingPostSplitForAgent) && (newPostSplitEntity.trim() !== '' || newPostSplitNote.trim() !== '' || newPostSplitValue !== 0)) ||
    (Boolean(addingPostSplit2ForAgent) && (newPostSplit2Entity.trim() !== '' || newPostSplit2Note.trim() !== '' || newPostSplit2Value !== 0));
  const editKeys = useSectionEditKeys(isEditing, onCancelEdit, hasChanges || inlineDraftDirty || tableDraftDirty);

  useEffect(() => {
    if (!isEditing) {
      setIsAddingOffTop(false);
      setIsAddingPreSplit(false);
      setAddingPostSplitForAgent(null);
      setAddingPostSplit2ForAgent(null);
      setTableDraftDirty(false);
    }
  }, [isEditing]);

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

  const handleAddPostSplitCell = (agentName: string, entity: string, level: 1 | 2) => {
    const name = entity.trim();
    const add = level === 1 ? onAddAgentPostSplitRule : onAddAgentPostSplit2Rule;
    if (!name || !add) return;
    add(agentName, {
      id: `postsplit${level === 1 ? '' : '2'}_${Date.now()}_${agentName.replace(/\s+/g, '')}`,
      name,
      entity: name,
      type: level === 1 ? 'AMOUNT' : 'PERCENT',
      value: 0,
    });
  };

  const toggleNewOffTopType = () => {
    setNewOffTopValue((v) => (newOffTopType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(5)) : v));
    setNewOffTopType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPreSplitType = () => {
    setNewPreSplitValue((v) => (newPreSplitType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(5)) : v));
    setNewPreSplitType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplitType = () => {
    setNewPostSplitValue((v) => (newPostSplitType === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(5)) : v));
    setNewPostSplitType((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplit2Type = () => {
    setNewPostSplit2Value((v) => (newPostSplit2Type === 'PERCENT' && v <= 1 && v > 0 ? Number((v * 100).toFixed(5)) : v));
    setNewPostSplit2Type((p) => (p === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

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
    <section id="commission" onKeyDown={editKeys.onKeyDown} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
      {/* Top Header */}
      <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex shrink-0 items-center gap-3">
          <SectionIcon name="commission" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Commission Waterfall</h2>
        </div>

        <div className="flex items-center gap-3">
          <CommissionTemplatePanel
            embedded
            clientId={clientId}
            transactionId={transactionId}
            deal={deal}
            agents={templateAgents}
            dealAgents={agents.map((agent) => ({ id: agent.id, name: agent.name, isTeamLead: agent.isTeamLead }))}
            entities={knownEntities}
            totalCommission={baselineTotalCommission}
            onApplied={onApplyTemplate}
          />
          {agentLayoutToggle}
          {!isEditing ? (
            <HoverNote label="Edit Commission Waterfall">
              <button
                type="button"
                onClick={onStartEdit}
                aria-label="Edit Commission Waterfall"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
              >
                <EditPencil className="h-5 w-5" />
              </button>
            </HoverNote>
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
                disabled={agentSplitsExceedPool}
                title={agentSplitsExceedPool ? "Agent splits can't exceed 100% of the remaining commission." : undefined}
                className={`text-xs bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg font-bold transition shadow-md ${agentSplitsExceedPool ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-400 cursor-pointer'}`}
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
        <div className="p-6 space-y-6" {...editOnDoublePress}>
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
                    title="Add New Off-the-top Deduction"
                    aria-label="Add New Off-the-top Deduction"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                      <path d="M8 3.25v9.5M3.25 8h9.5" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Total Commission:
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(baselineTotalCommission)}
                </span>
              </div>
            </div>

            {isEditing && isAddingOffTop && (
              <div data-inline-save className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                  Add Off-The-Top Deduction
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {knownEntities.length > 0 ? (
                    <ClearableSelect
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                    >
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </ClearableSelect>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity Name (e.g. Soleox Realty)"
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                    />
                  )}
                  <SplitPair
                    isEditing
                    type={newOffTopType}
                    percentPoints={newOffTopType === 'PERCENT' ? newOffTopValue : (baselineTotalCommission > 0 ? (newOffTopValue / baselineTotalCommission) * 100 : 0)}
                    dollarAmount={newOffTopType === 'AMOUNT' ? newOffTopValue : baselineTotalCommission * (newOffTopValue > 1 ? newOffTopValue / 100 : newOffTopValue)}
                    onPercentChange={(val) => {
                      if (newOffTopType !== 'PERCENT') toggleNewOffTopType();
                      setNewOffTopValue(val);
                    }}
                    onAmountChange={(val) => {
                      if (newOffTopType !== 'AMOUNT') toggleNewOffTopType();
                      setNewOffTopValue(val);
                    }}
                    preventMinus={preventMinus}
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
                          <ClearableSelect
                            value={rule.entity}
                            onChange={(e) => onUpdateOffTopRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer max-w-[150px] sm:max-w-[190px]"
                            title="Switch entity"
                          >
                            <option value={rule.entity}>{rule.entity}</option>
                            {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                              <option key={ent.id} value={ent.name}>{ent.name}</option>
                            ))}
                          </ClearableSelect>
                        ) : (
                          <input
                            type="text"
                            value={rule.entity}
                            onChange={(e) => onUpdateOffTopRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] w-28"
                          />
                        )
                      ) : (
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px] truncate" title={rule.entity}>
                          {rule.entity || '—'}
                        </span>
                      )}

                    </div>
                    <div className={isEditing ? undefined : 'pr-2'}>
                    <SplitPair
                      compact={!isEditing}
                      isEditing={isEditing}
                      type={rule.type}
                      percentPoints={rule.type === 'PERCENT' ? rule.value : (baselineTotalCommission > 0 ? ((calculatedItem?.amount || 0) / baselineTotalCommission) * 100 : 0)}
                      dollarAmount={calculatedItem?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                      deduction
                      onPercentChange={(val) => {
                        if (rule.type !== 'PERCENT') onToggleOffTopRuleType(rule.id);
                        onUpdateOffTopRuleValue(rule.id, val);
                      }}
                      onAmountChange={(val) => {
                        if (rule.type !== 'AMOUNT') onToggleOffTopRuleType(rule.id);
                        onUpdateOffTopRuleValue(rule.id, val);
                      }}
                      preventMinus={preventMinus}
                    />
                    </div>
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
                    title="Add New Pre-split Deduction"
                    aria-label="Add New Pre-split Deduction"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                      <path d="M8 3.25v9.5M3.25 8h9.5" />
                    </svg>
                  </button>
                )}
              </div>
              <span className={`text-xs text-slate-500 dark:text-slate-400 font-medium ${isEditing ? '' : 'pr-4'}`}>
                Remaining Commission: <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterOffTop)}</strong>
              </span>
            </div>

            {isEditing && isAddingPreSplit && (
              <div data-inline-save className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                  Add Pre-Split Deduction
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {knownEntities.length > 0 ? (
                    <ClearableSelect
                      value={newPreSplitEntity}
                      onChange={(e) => setNewPreSplitEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                    >
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </ClearableSelect>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity Name (e.g. TC Fee, Referral)"
                      value={newPreSplitEntity}
                      onChange={(e) => setNewPreSplitEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                    />
                  )}
                  <SplitPair
                    isEditing
                    type={newPreSplitType}
                    percentPoints={newPreSplitType === 'PERCENT' ? newPreSplitValue : (commissionAfterOffTop > 0 ? (newPreSplitValue / commissionAfterOffTop) * 100 : 0)}
                    dollarAmount={newPreSplitType === 'AMOUNT' ? newPreSplitValue : commissionAfterOffTop * (newPreSplitValue > 1 ? newPreSplitValue / 100 : newPreSplitValue)}
                    onPercentChange={(val) => {
                      if (newPreSplitType !== 'PERCENT') toggleNewPreSplitType();
                      setNewPreSplitValue(val);
                    }}
                    onAmountChange={(val) => {
                      if (newPreSplitType !== 'AMOUNT') toggleNewPreSplitType();
                      setNewPreSplitValue(val);
                    }}
                    preventMinus={preventMinus}
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
                          <ClearableSelect
                            value={rule.entity}
                            onChange={(e) => onUpdatePreSplitRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer max-w-[150px] sm:max-w-[190px]"
                            title="Switch entity"
                          >
                            <option value={rule.entity}>{rule.entity}</option>
                            {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                              <option key={ent.id} value={ent.name}>{ent.name}</option>
                            ))}
                          </ClearableSelect>
                        ) : (
                          <input
                            type="text"
                            value={rule.entity}
                            onChange={(e) => onUpdatePreSplitRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] w-28"
                          />
                        )
                      ) : (
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px] truncate" title={rule.entity}>
                          {rule.entity || '—'}
                        </span>
                      )}

                    </div>
                    <div className={isEditing ? undefined : 'pr-2'}>
                    <SplitPair
                      compact={!isEditing}
                      isEditing={isEditing}
                      type={rule.type}
                      percentPoints={rule.type === 'PERCENT' ? rule.value : (commissionAfterOffTop > 0 ? ((calculatedItem?.amount || 0) / commissionAfterOffTop) * 100 : 0)}
                      dollarAmount={calculatedItem?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                      deduction
                      onPercentChange={(val) => {
                        if (rule.type !== 'PERCENT') onTogglePreSplitRuleType?.(rule.id);
                        onUpdatePreSplitRuleValue?.(rule.id, val);
                      }}
                      onAmountChange={(val) => {
                        if (rule.type !== 'AMOUNT') onTogglePreSplitRuleType?.(rule.id);
                        onUpdatePreSplitRuleValue?.(rule.id, val);
                      }}
                      preventMinus={preventMinus}
                    />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {agentLayout === 'table' ? (
            <CommissionWaterfallTable
              isEditing={isEditing}
              agents={agents}
              dealResult={dealResult}
              knownEntities={knownEntities}
              knownAgents={knownAgents}
              postSplitRulesByAgent={postSplitRulesByAgent}
              postSplit2RulesByAgent={postSplit2RulesByAgent}
              commissionAfterPreSplit={commissionAfterPreSplit}
              preventMinus={preventMinus}
              onOpenAddAgentModal={onOpenAddAgentModal}
              onRemoveAgent={onRemoveAgent}
              onSwitchAgent={onSwitchAgent}
              onToggleAgentSplitType={onToggleAgentSplitType}
              onSplitValueChange={onSplitValueChange}
              onDeleteAgentPostSplitRule={onDeleteAgentPostSplitRule}
              onToggleAgentPostSplitType={onToggleAgentPostSplitType}
              onUpdateAgentPostSplitValue={onUpdateAgentPostSplitValue}
              onUpdateAgentPostSplitEntity={onUpdateAgentPostSplitEntity}
              onReorderPostSplitEntities={onReorderPostSplitEntities}
              onDeleteAgentPostSplit2Rule={onDeleteAgentPostSplit2Rule}
              onToggleAgentPostSplit2Type={onToggleAgentPostSplit2Type}
              onUpdateAgentPostSplit2Value={onUpdateAgentPostSplit2Value}
              onUpdateAgentPostSplit2Entity={onUpdateAgentPostSplit2Entity}
              onReorderPostSplit2Entities={onReorderPostSplit2Entities}
              onAddLevel1Cell={(agentName, entity) => handleAddPostSplitCell(agentName, entity, 1)}
              onAddLevel2Cell={(agentName, entity) => handleAddPostSplitCell(agentName, entity, 2)}
              onDraftDirty={setTableDraftDirty}
            />
          ) : (
          <>
          {/* Step 3: Agent Splits Breakdown */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  3. Agent Splits
                </span>
                {isEditing && (
                  <button
                    type="button"
                    onClick={onOpenAddAgentModal}
                    title="Add New Agent Split"
                    aria-label="Add New Agent Split"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                      <path d="M8 3.25v9.5M3.25 8h9.5" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs text-slate-500 dark:text-slate-400 font-medium ${isEditing ? '' : 'pr-[15px]'}`}>
                  Remaining Commission: <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterPreSplit)}</strong>
                </span>
              </div>
            </div>
            {agentSplitsExceedPool && (
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Agent splits can&apos;t exceed 100% of the remaining commission. Lower the highlighted split before applying.
              </p>
            )}

            {agents.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                No agents assigned yet.
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
                          <SplitPair
                            isEditing={false}
                            locked={isEditing}
                            matchColumns
                            type="PERCENT"
                            percentPoints={(computedSplitItem?.percent || 0) * 100}
                            dollarAmount={computedSplitItem?.amount || 0}
                            onPercentChange={() => {}}
                            onAmountChange={() => {}}
                            preventMinus={preventMinus}
                          />
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
                            <ClearableSelect
                              value={agent.name}
                              onChange={(e) => onSwitchAgent?.(agent.id, e.target.value)}
                              className="bg-transparent border-b border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] py-0.5 cursor-pointer max-w-[160px] sm:max-w-[220px]"
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
                            </ClearableSelect>
                          ) : (
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{agent.name}</span>
                          )}

                          {agent.isTeamLead && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                              LEAD
                            </span>
                          )}

                        </div>

                        <SplitPair
                          isEditing={isEditing}
                          matchColumns
                          type={agent.splitType}
                          percentPoints={agent.splitType === 'PERCENT' ? agent.splitVal : ((computedSplitItem?.percent || 0) * 100)}
                          dollarAmount={agent.splitType === 'AMOUNT' ? agent.splitVal : (computedSplitItem?.amount || 0)}
                          invalid={Boolean(computedSplitItem?.overAllocated)}
                          onPercentChange={(val) => {
                            if (agent.splitType !== 'PERCENT') onToggleAgentSplitType(agent.id);
                            onSplitValueChange(agent.id, val);
                          }}
                          onAmountChange={(val) => {
                            if (agent.splitType !== 'AMOUNT') onToggleAgentSplitType(agent.id);
                            onSplitValueChange(agent.id, val);
                          }}
                          preventMinus={preventMinus}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 4: Post-Split Deductions (Level 1 & Level 2 / Stock) */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 space-y-4 shadow-sm">
            <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  4. Post-Split Deductions
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
                    </div>

                    {/* LEVEL 1: Level 1 Post-splits */}
                    <div className="bg-white dark:bg-slate-900/90 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            <HoverNote label="Percent deductions are calculated from Agent Split">
                              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-yellow-600/40 bg-yellow-400/25 px-2 py-0.5 tracking-normal text-yellow-900 dark:border-yellow-300/50 dark:bg-yellow-400/15 dark:text-yellow-200">
                                Level 1
                              </span>
                            </HoverNote>
                            Post-splits
                          </span>
                        </div>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => isAddingL1 ? setAddingPostSplitForAgent(null) : handleStartAddPostSplit1(agentName)}
                            title="Add New Level 1 Post-split"
                            aria-label="Add New Level 1 Post-split"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                          >
                            <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                              <path d="M8 3.25v9.5M3.25 8h9.5" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {isEditing && isAddingL1 && (
                        <div data-inline-save className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-500/30 space-y-2 my-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                            New Level 1 Post-split for {agentName}
                          </span>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {knownEntities.length > 0 ? (
                              <ClearableSelect
                                value={newPostSplitEntity}
                                onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                              >
                                {knownEntities.map((ent) => (
                                  <option key={ent.id} value={ent.name}>{ent.name}</option>
                                ))}
                              </ClearableSelect>
                            ) : (
                              <input
                                type="text"
                                placeholder="Entity Name (e.g. Soleox Realty)"
                                value={newPostSplitEntity}
                                onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                              />
                            )}
                            <SplitPair
                              isEditing
                              type={newPostSplitType}
                              percentPoints={newPostSplitType === 'PERCENT' ? newPostSplitValue : (agentGrossSplit > 0 ? (newPostSplitValue / agentGrossSplit) * 100 : 0)}
                              dollarAmount={newPostSplitType === 'AMOUNT' ? newPostSplitValue : agentGrossSplit * (newPostSplitValue > 1 ? newPostSplitValue / 100 : newPostSplitValue)}
                              onPercentChange={(val) => {
                                if (newPostSplitType !== 'PERCENT') toggleNewPostSplitType();
                                setNewPostSplitValue(val);
                              }}
                              onAmountChange={(val) => {
                                if (newPostSplitType !== 'AMOUNT') toggleNewPostSplitType();
                                setNewPostSplitValue(val);
                              }}
                              preventMinus={preventMinus}
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
                                    <ClearableSelect
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplitEntity?.(agentName, rule.id, e.target.value)}
                                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer max-w-[140px] sm:max-w-[170px]"
                                      title="Switch entity"
                                    >
                                      <option value={rule.entity}>{rule.entity}</option>
                                      {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                                      ))}
                                    </ClearableSelect>
                                  ) : (
                                    <input
                                      type="text"
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplitEntity?.(agentName, rule.id, e.target.value)}
                                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] w-24"
                                    />
                                  )
                                ) : (
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={rule.entity}>
                                    {rule.entity || '—'}
                                  </span>
                                )}

                              </div>
                              <SplitPair
                                isEditing={isEditing}
                                matchColumns
                                type={rule.type}
                                percentPoints={rule.type === 'PERCENT' ? rule.value : (agentGrossSplit > 0 ? ((calculatedItem?.amount || 0) / agentGrossSplit) * 100 : 0)}
                                dollarAmount={calculatedItem?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                                deduction
                                onPercentChange={(val) => {
                                  if (rule.type !== 'PERCENT') onToggleAgentPostSplitType(agentName, rule.id);
                                  onUpdateAgentPostSplitValue(agentName, rule.id, val);
                                }}
                                onAmountChange={(val) => {
                                  if (rule.type !== 'AMOUNT') onToggleAgentPostSplitType(agentName, rule.id);
                                  onUpdateAgentPostSplitValue(agentName, rule.id, val);
                                }}
                                preventMinus={preventMinus}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Level 1 Subtotal */}
                      <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2 text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          Net After Level 1 Post-Splits
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(netAfterL1)}
                        </span>
                      </div>
                    </div>

                    {/* LEVEL 2: Level 2 Post-splits */}
                    <div className="bg-white dark:bg-slate-900/90 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            <HoverNote label="Percent deductions are calculated from Net after Level 1 Post-splits.">
                              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-400/60 bg-slate-300/50 px-2 py-0.5 tracking-normal text-slate-600 dark:border-slate-300/45 dark:bg-slate-400/20 dark:text-slate-200">
                                Level 2
                              </span>
                            </HoverNote>
                            Post-splits
                          </span>
                        </div>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => isAddingL2 ? setAddingPostSplit2ForAgent(null) : handleStartAddPostSplit2(agentName)}
                            title="Add New Level 2 Post-split"
                            aria-label="Add New Level 2 Post-split"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                          >
                            <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                              <path d="M8 3.25v9.5M3.25 8h9.5" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {isEditing && isAddingL2 && (
                        <div data-inline-save className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-500/30 space-y-2 my-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              New Level 2 Post-split for {agentName}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              Baseline: {formatCurrency(netAfterL1)}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {knownEntities.length > 0 ? (
                              <ClearableSelect
                                value={newPostSplit2Entity}
                                onChange={(e) => setNewPostSplit2Entity(e.target.value)}
                                className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                              >
                                {knownEntities.map((ent) => (
                                  <option key={ent.id} value={ent.name}>{ent.name}</option>
                                ))}
                              </ClearableSelect>
                            ) : (
                              <input
                                type="text"
                                placeholder="Payee Entity (e.g. Stock)"
                                value={newPostSplit2Entity}
                                onChange={(e) => setNewPostSplit2Entity(e.target.value)}
                                className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] font-medium sm:w-44"
                              />
                            )}
                            <SplitPair
                              isEditing
                              type={newPostSplit2Type}
                              percentPoints={newPostSplit2Type === 'PERCENT' ? newPostSplit2Value : (netAfterL1 > 0 ? (newPostSplit2Value / netAfterL1) * 100 : 0)}
                              dollarAmount={newPostSplit2Type === 'AMOUNT' ? newPostSplit2Value : netAfterL1 * (newPostSplit2Value > 1 ? newPostSplit2Value / 100 : newPostSplit2Value)}
                              onPercentChange={(val) => {
                                if (newPostSplit2Type !== 'PERCENT') toggleNewPostSplit2Type();
                                setNewPostSplit2Value(val);
                              }}
                              onAmountChange={(val) => {
                                if (newPostSplit2Type !== 'AMOUNT') toggleNewPostSplit2Type();
                                setNewPostSplit2Value(val);
                              }}
                              preventMinus={preventMinus}
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
                                    <ClearableSelect
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplit2Entity?.(agentName, rule.id, e.target.value)}
                                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] cursor-pointer max-w-[140px] sm:max-w-[170px]"
                                      title="Switch entity"
                                    >
                                      <option value={rule.entity}>{rule.entity}</option>
                                      {knownEntities.filter((e) => e.name !== rule.entity).map((ent) => (
                                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                                      ))}
                                    </ClearableSelect>
                                  ) : (
                                    <input
                                      type="text"
                                      value={rule.entity}
                                      onChange={(e) => onUpdateAgentPostSplit2Entity?.(agentName, rule.id, e.target.value)}
                                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-emerald-500 focus:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] w-24"
                                    />
                                  )
                                ) : (
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={rule.entity}>
                                    {rule.entity || '—'}
                                  </span>
                                )}

                              </div>
                              <SplitPair
                                isEditing={isEditing}
                                matchColumns
                                type={rule.type}
                                percentPoints={rule.type === 'PERCENT' ? rule.value : (netAfterL1 > 0 ? ((calculatedItem2?.amount || 0) / netAfterL1) * 100 : 0)}
                                dollarAmount={calculatedItem2?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                                deduction
                                onPercentChange={(val) => {
                                  if (rule.type !== 'PERCENT') onToggleAgentPostSplit2Type?.(agentName, rule.id);
                                  onUpdateAgentPostSplit2Value?.(agentName, rule.id, val);
                                }}
                                onAmountChange={(val) => {
                                  if (rule.type !== 'AMOUNT') onToggleAgentPostSplit2Type?.(agentName, rule.id);
                                  onUpdateAgentPostSplit2Value?.(agentName, rule.id, val);
                                }}
                                preventMinus={preventMinus}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Level 2 Subtotal */}
                      <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2 text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          Net Payout to {agentName}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(finalAgentPayout)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </>
          )}
        </div>
      )}
      <CancelEditPrompt
        open={editKeys.confirmCancel}
        sectionLabel="Commission Waterfall"
        onKeepEditing={editKeys.keepEditing}
        onDiscard={editKeys.discard}
      />
    </section>
  );
}
