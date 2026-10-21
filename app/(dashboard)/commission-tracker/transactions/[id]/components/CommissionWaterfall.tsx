// app/commission-tracker/transactions/[id]/components/CommissionWaterfall.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Eraser, LayoutGrid, MoreHorizontal, Table2 } from 'lucide-react';
import { toPercentPoints } from '@/lib/percent';
import { TrashIcon } from '@/components/ui/trash-icon';
import { AgentConfig, DynamicRule, CommissionEntityOption, KnownAgentInfo } from '../types';
import { CommissionWaterfallTable, WATERFALL_HEADING } from './CommissionWaterfallTable';
import { isPrimaryAgent } from '../commissionItemState';
import { HoverNote } from './HoverNote';
import { SplitPair } from './SplitPair';
import { EditPencil } from '@/components/ui/edit-pencil';
import { SectionIcon } from './SectionIcon';
import { CancelEditPrompt } from './CancelEditPrompt';
import { useEditOnDoublePress } from './useEditOnDoublePress';
import { useSectionEditKeys } from './useSectionEditKeys';
import { CommissionTemplatePanel, type TemplateSubmissionDraft } from './CommissionTemplatePanel';
import { CalculatingCommission } from './CalculatingCommission';
import type { AppliedTemplateRules } from './applyTemplateLogic';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { AgentAllocationNotes, AgentCapNote, TeamCapAmount, adjustedSplitView, teamCapGroups, type AgentAllocationLine } from './AgentAllocationNotes';
import { formatAgentCapLine, type AgentCapCell } from '@/lib/agent-cap-progress';
import { AgentSplitExcessNotice } from './AgentSplitExcessNotice';
import { useAccess } from '@/components/access-provider';
import { usePhonePortrait } from '@/lib/use-media-query';
import { swallowNextClick } from '@/lib/swallow-click';

interface CommissionWaterfallProps {
  /** Inputs are still loading; amounts would be provisional, so a placeholder replaces them. */
  calculating?: boolean;
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
  templateAgents: { id: string; name: string; isTeamLead?: boolean; clientId?: string; fields?: Record<string, string> }[];
  primaryAgentId?: string | null;
  onApplyTemplate?: (applied: AppliedTemplateRules, submission: TemplateSubmissionDraft) => void;
  onSubmissionDeleted?: () => void;
  onTeamCapSelection?: (ids: string[] | null) => void;
  onStoredSubmission?: (submission: TemplateSubmissionDraft | null) => void;
  pendingTemplateSubmission?: TemplateSubmissionDraft | null;
  onResetWaterfall?: () => void;
  /** Payouts for the where-the-commission-goes bar. Display only. */
  /** True when the deal qualifies for no template, so a reset leaves no agent splits and no payments. */
  resetClearsPayments?: boolean;
  submissionRevision?: number;
  allocations?: AgentAllocationLine[];
  onTeamCapAmountChange?: (agentId: string, teamCapId: string, amount: number | null) => void;
  onRemoveTeamCap?: (teamCapId: string) => void;
  agentCapCells?: Record<string, Record<string, AgentCapCell>>;
}

function AgentCapStrips({
  agentId,
  allocations,
  isEditing,
  onTeamCapAmountChange,
  onRemoveTeamCap,
}: {
  agentId: string;
  allocations: AgentAllocationLine[];
  isEditing: boolean;
  onTeamCapAmountChange?: (agentId: string, teamCapId: string, amount: number | null) => void;
  onRemoveTeamCap?: (teamCapId: string) => void;
}) {
  const groups = teamCapGroups(allocations);
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {groups.map((group) => {
        const capId = group.lines.find((line) => line.team_cap_id)?.team_cap_id || '';
        return (
          <div key={group.id} className="flex items-start justify-between gap-3 rounded-md bg-amber-50 px-2.5 py-1.5 dark:bg-amber-950/40">
            <span className="flex min-w-0 items-center gap-1.5">
              {isEditing && onRemoveTeamCap && capId && (
                <button
                  type="button"
                  onClick={() => onRemoveTeamCap(capId)}
                  className="shrink-0 rounded p-0.5 text-rose-500 transition hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer"
                  title={`Remove ${group.name}`}
                  aria-label={`Remove ${group.name}`}
                >
                  <TrashIcon />
                </button>
              )}
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">{group.name}</span>
            </span>
            <TeamCapAmount
              line={group.lines.find((item) => item.agent_id === agentId)}
              isEditing={isEditing}
              onAmountChange={onTeamCapAmountChange}
            />
          </div>
        );
      })}
    </div>
  );
}

export function CommissionWaterfall({
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
  primaryAgentId,
  onApplyTemplate,
  onSubmissionDeleted,
  onTeamCapSelection,
  onStoredSubmission,
  pendingTemplateSubmission = null,
  onResetWaterfall,
  resetClearsPayments = false,
  submissionRevision = 0,
  allocations = [],
  onTeamCapAmountChange,
  onRemoveTeamCap,
  agentCapCells = {},
  calculating = false,
}: CommissionWaterfallProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const agentCapNote = (agentId: string, agentName: string, entityName: string) => {
    const entityId = knownEntities.find((entity) => entity.name === entityName)?.id;
    const cell = entityId ? agentCapCells[agentId]?.[entityId] : undefined;
    if (!cell) return null;
    const rows = [...(dealResult.postSplitItems || []), ...(dealResult.postSplit2Items || [])];
    const current = rows.reduce((sum: number, item: { agentName?: string; entity?: string; amount?: number }) => {
      if (item.agentName !== agentName || (item.entity || '').trim() !== entityName) return sum;
      return sum + (Number(item.amount) || 0);
    }, 0);
    const line = formatAgentCapLine(cell, current);
    return <AgentCapNote label={line.label} detail={line.detail} share={line.share} />;
  };

  const baselineTotalCommission = dealResult.totalCommission || dealResult.grossCommission || 0;
  const [confirmReset, setConfirmReset] = useState(false);
  const commissionAfterOffTop = dealResult.commissionAfterOffTop ?? 0;
  const commissionAfterPreSplit = dealResult.commissionAfterPreSplit ?? commissionAfterOffTop;
  const agentSplitsExceedPool = (dealResult.agentSplitItems || []).some((item: { overAllocated?: boolean }) => item.overAllocated)
    || Number(dealResult.agentSplitExcess) > 0.009;
  const shownPostSplitRules = !isEditing && dealResult.displayPostSplitRulesByAgent
    ? dealResult.displayPostSplitRulesByAgent
    : postSplitRulesByAgent;
  const shownPostSplit2Rules = !isEditing && dealResult.displayPostSplit2RulesByAgent
    ? dealResult.displayPostSplit2RulesByAgent
    : postSplit2RulesByAgent;
  const agentNames = agents.map((a) => a.name);
  const [chosenAgentLayout, setAgentLayout] = useState<'table' | 'cards'>('table');
  // A phone held upright only has room for the cards; the saved choice applies again on wider screens.
  const phonePortrait = usePhonePortrait();
  const agentLayout = phonePortrait ? 'cards' : chosenAgentLayout;
  const canWrite = Boolean(useAccess().access?.permissions.commissionTrackerWrite);
  const editOnDoublePress = useEditOnDoublePress(!isEditing && canWrite, onStartEdit);

  useEffect(() => {
    const saved = window.localStorage.getItem('soleox-waterfall-agent-layout');
    if (saved === 'cards' || saved === 'table') setAgentLayout(saved);
  }, []);

  const chooseAgentLayout = (next: 'table' | 'cards') => {
    setAgentLayout(next);
    window.localStorage.setItem('soleox-waterfall-agent-layout', next);
  };

  const agentLayoutToggle = (
    <div role="group" aria-label="Agent splits layout" className="inline-flex h-9 shrink-0 items-stretch gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => chooseAgentLayout('table')}
        title="Table"
        aria-label="Table"
        className={`inline-flex h-full w-8 items-center justify-center rounded-md cursor-pointer transition ${agentLayout === 'table' ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
      >
        <Table2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => chooseAgentLayout('cards')}
        title="Cards"
        aria-label="Cards"
        className={`inline-flex h-full w-8 items-center justify-center rounded-md cursor-pointer transition ${agentLayout === 'cards' ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
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
    setNewOffTopType((current) => (current === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPreSplitType = () => {
    setNewPreSplitType((current) => (current === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplitType = () => {
    setNewPostSplitType((current) => (current === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
  };

  const toggleNewPostSplit2Type = () => {
    setNewPostSplit2Type((current) => (current === 'PERCENT' ? 'AMOUNT' : 'PERCENT'));
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

  const offTopEmpty = offTheTopRules.length === 0 && !isAddingOffTop;
  const preSplitEmpty = preSplitRules.length === 0 && !isAddingPreSplit;
  const bothDeductionsEmpty = offTopEmpty && preSplitEmpty && !isEditing;

  return (
    <section id="commission" onKeyDown={editKeys.onKeyDown} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden scroll-mt-[calc(var(--app-nav-offset,4rem)+var(--txn-header-height))] transition-colors">
      {/* Top Header */}
      <div
        className="bg-slate-50 dark:bg-slate-800 px-3 py-4 sm:px-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-x-3 gap-y-3"
      >
        <div className="flex shrink-0 items-center gap-3">
          <SectionIcon name="commission" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Commission Waterfall</h2>
        </div>

        {/* On a phone the buttons take their own row under the title. */}
        <div className="flex flex-wrap items-center justify-end gap-3 max-sm:w-full max-sm:justify-start">
          {canWrite && (
          <CommissionTemplatePanel
            key={transactionId || 'new'}
            embedded
            clientId={clientId}
            transactionId={transactionId}
            deal={deal}
            agents={templateAgents}
            dealAgents={agents.map((agent) => ({ id: agent.id, name: agent.name, isTeamLead: agent.isTeamLead }))}
            entities={knownEntities}
            totalCommission={baselineTotalCommission}
            onApplied={onApplyTemplate}
            onSubmissionDeleted={onSubmissionDeleted}
            onTeamCapSelection={onTeamCapSelection}
            onStoredSubmission={onStoredSubmission}
            pendingSubmission={pendingTemplateSubmission}
            submissionRevision={submissionRevision}
          />
          )}
          {!phonePortrait && agentLayoutToggle}
          {canWrite && !isEditing ? (
            <HoverNote label="Edit commission waterfall">
              <button
                type="button"
                onClick={onStartEdit}
                aria-label="Edit commission waterfall"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
              >
                <EditPencil className="h-5 w-5" />
              </button>
            </HoverNote>
          ) : canWrite ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              {hasChanges && (
                <button
                  type="button"
                  onClick={onApplyEdit}
                  disabled={agentSplitsExceedPool}
                  title={agentSplitsExceedPool ? "Agent splits can't exceed 100% of the remaining balance." : undefined}
                  className={`text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-bold transition ${agentSplitsExceedPool ? 'opacity-40 cursor-not-allowed' : 'hover:bg-brand-500 cursor-pointer'}`}
                >
                  Apply Changes
                </button>
              )}
            </div>
          ) : null}
          {canWrite && onResetWaterfall && (
            <WaterfallMoreMenu onReset={() => setConfirmReset(true)} />
          )}
        </div>
      </div>

      {calculating && <CalculatingCommission rows={4} />}
      <div className="p-3 sm:p-6 space-y-4" hidden={calculating} {...editOnDoublePress}>
        {/* With both empty and not editing, steps 1 and 2 share one row. Editing splits them again for their + buttons. */}
        {bothDeductionsEmpty ? (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm px-4 py-2">
            <div className="flex min-h-8 flex-wrap justify-between items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-2">
                <span className={WATERFALL_HEADING}>Off-the-Top &amp; Pre-Split Deductions</span>
                <span className="text-xs italic text-slate-400">None</span>
              </div>
              <div className={`ml-auto flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg ${agentLayout === 'cards' && !isEditing ? 'mr-2 sm:mr-3' : ''}`}>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Total Commission
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(baselineTotalCommission)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
          {/* Step 1: Off-The-Top Deductions. With nothing in it, the section is one row: its name, None, and the total. */}
          <div className={`border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm ${offTopEmpty ? 'px-3 py-2 sm:px-4' : 'p-3 sm:p-4 space-y-3'}`}>
            <div className={`flex flex-wrap justify-between items-center gap-x-3 gap-y-2 ${offTopEmpty ? 'min-h-8' : 'border-b border-slate-200 dark:border-slate-700 pb-3'}`}>
              <div className="flex items-center gap-2">
                <span className={WATERFALL_HEADING}>Off-the-Top Deductions</span>
                {offTopEmpty && <span className="text-xs italic text-slate-400">None</span>}
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleStartAddOffTop}
                    title="Add new off-the-top deduction"
                    aria-label="Add new off-the-top deduction"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                      <path d="M8 3.25v9.5M3.25 8h9.5" />
                    </svg>
                  </button>
                )}
              </div>
              <div className={`ml-auto flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg ${agentLayout === 'cards' && !isEditing ? 'mr-2 sm:mr-3' : ''}`}>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  Total Commission
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(baselineTotalCommission)}
                </span>
              </div>
            </div>

            {isEditing && isAddingOffTop && (
              <div data-inline-save className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                  Add Off-the-Top Deduction
                </span>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {knownEntities.length > 0 ? (
                    <ClearableSelect
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                    >
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </ClearableSelect>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity name (e.g. Soleox Realty)"
                      value={newOffTopEntity}
                      onChange={(e) => setNewOffTopEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                    />
                  )}
                  <SplitPair
                    isEditing
                    type={newOffTopType}
                    percentPoints={newOffTopType === 'PERCENT' ? toPercentPoints(newOffTopValue) : (baselineTotalCommission > 0 ? (newOffTopValue / baselineTotalCommission) * 100 : 0)}
                    dollarAmount={newOffTopType === 'AMOUNT' ? newOffTopValue : baselineTotalCommission * newOffTopValue}
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
                          <TrashIcon />
                        </button>
                      )}

                      {isEditing ? (
                        knownEntities.length > 0 ? (
                          <ClearableSelect
                            value={rule.entity}
                            onChange={(e) => onUpdateOffTopRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer max-w-[150px] sm:max-w-[190px]"
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
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] w-28"
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
                      percentPoints={rule.type === 'PERCENT' ? toPercentPoints(rule.value) : (baselineTotalCommission > 0 ? ((calculatedItem?.amount || 0) / baselineTotalCommission) * 100 : 0)}
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

          {/* Step 2: Pre-Split Deductions. One row when empty, like step 1. */}
          <div className={`border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-sm ${preSplitEmpty ? 'px-3 py-2 sm:px-4' : 'p-3 sm:p-4 space-y-3'}`}>
            <div className={`flex flex-wrap justify-between items-center gap-x-3 gap-y-2 ${preSplitEmpty ? 'min-h-8' : 'border-b border-slate-200 dark:border-slate-700 pb-3'}`}>
              <div className="flex items-center gap-2">
                <span className={WATERFALL_HEADING}>Pre-Split Deductions</span>
                {preSplitEmpty && <span className="text-xs italic text-slate-400">None</span>}
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleStartAddPreSplit}
                    title="Add new pre-split deduction"
                    aria-label="Add new pre-split deduction"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                      <path d="M8 3.25v9.5M3.25 8h9.5" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Right-aligned like Total Commission above it: in card view its amount ends with the agent amounts. */}
              <span className={`ml-auto text-xs text-slate-500 dark:text-slate-400 font-medium ${isEditing ? 'pr-[13px]' : agentLayout === 'cards' ? 'pr-[21px] sm:pr-[25px]' : 'pr-4'}`}>
                Remaining Balance <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterOffTop)}</strong>
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
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                    >
                      {knownEntities.map((ent) => (
                        <option key={ent.id} value={ent.name}>{ent.name}</option>
                      ))}
                    </ClearableSelect>
                  ) : (
                    <input
                      type="text"
                      placeholder="Entity name (e.g. TC Fee, Referral)"
                      value={newPreSplitEntity}
                      onChange={(e) => setNewPreSplitEntity(e.target.value)}
                      className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                    />
                  )}
                  <SplitPair
                    isEditing
                    type={newPreSplitType}
                    percentPoints={newPreSplitType === 'PERCENT' ? toPercentPoints(newPreSplitValue) : (commissionAfterOffTop > 0 ? (newPreSplitValue / commissionAfterOffTop) * 100 : 0)}
                    dollarAmount={newPreSplitType === 'AMOUNT' ? newPreSplitValue : commissionAfterOffTop * newPreSplitValue}
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
                          <TrashIcon />
                        </button>
                      )}

                      {isEditing ? (
                        knownEntities.length > 0 ? (
                          <ClearableSelect
                            value={rule.entity}
                            onChange={(e) => onUpdatePreSplitRuleEntity?.(rule.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer max-w-[150px] sm:max-w-[190px]"
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
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] w-28"
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
                      percentPoints={rule.type === 'PERCENT' ? toPercentPoints(rule.value) : (commissionAfterOffTop > 0 ? ((calculatedItem?.amount || 0) / commissionAfterOffTop) * 100 : 0)}
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
          </>
        )}

        {agentLayout === 'table' ? (
          <CommissionWaterfallTable
            isEditing={isEditing}
            agents={agents}
            primaryAgentId={primaryAgentId}
            dealResult={dealResult}
            knownEntities={knownEntities}
            knownAgents={knownAgents}
            postSplitRulesByAgent={shownPostSplitRules}
            postSplit2RulesByAgent={shownPostSplit2Rules}
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
            allocations={allocations}
            onTeamCapAmountChange={onTeamCapAmountChange}
            onRemoveTeamCap={onRemoveTeamCap}
            agentCapNote={agentCapNote}
          />
        ) : (
        <>
        {/* Step 3: Agent Splits Breakdown */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3 sm:p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-2 border-b border-slate-200 dark:border-slate-700 pb-3">
            <div className="flex items-center gap-2">
              <span className={WATERFALL_HEADING}>Agent Splits</span>
              {isEditing && (
                <button
                  type="button"
                  onClick={onOpenAddAgentModal}
                  title="Add new agent split"
                  aria-label="Add new agent split"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition cursor-pointer"
                >
                  <svg viewBox="0 0 16 16" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
                    <path d="M8 3.25v9.5M3.25 8h9.5" />
                  </svg>
                </button>
              )}
            </div>
            {/* Its amount ends where the agent cards' amounts end (card border, padding, and the amount inset). */}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium" style={{ paddingRight: isEditing ? 13 : 25 }}>
                Remaining Balance <strong className="text-slate-900 dark:text-white">{formatCurrency(commissionAfterPreSplit)}</strong>
              </span>
            </div>
          </div>
          <AgentSplitExcessNotice
            total={Number(dealResult.agentSplitTotal) || 0}
            remaining={commissionAfterPreSplit}
            excess={Number(dealResult.agentSplitExcess) || 0}
          />
          {(dealResult.agentSplitItems || []).some((item: { overAllocated?: boolean }) => item.overAllocated) && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              Agent splits can&apos;t exceed 100% of the remaining balance. Lower the highlighted split before applying.
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
                const agentIsPrimary = primaryAgentId ? isPrimaryAgent(agent, primaryAgentId) : index === 0;

                if (agentIsPrimary) {
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
                          <span className="text-[11px] bg-brand-500/20 text-brand-800 dark:text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded-full font-bold">
                            Primary
                          </span>
                          <HoverNote label="Primary Agent (tied to Transaction Overview • receives remaining balance after secondary agent splits)">
                            <span tabIndex={0} role="img" aria-label="Primary Agent explained" className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-help outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
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
                            </span>
                          </HoverNote>
                          {agent.isTeamLead && (
                            <span className="text-[11px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                              Lead
                            </span>
                          )}
                        </div>
                        <div className={isEditing ? undefined : 'pr-2.5'}>
                        <SplitPair
                          isEditing={false}
                          locked={isEditing}
                          matchColumns
                          type={agent.splitType}
                          percentPoints={(adjustedSplitView(computedSplitItem)?.percentPoints) ?? toPercentPoints(computedSplitItem?.percent || 0)}
                          dollarAmount={(adjustedSplitView(computedSplitItem)?.dollar) ?? (computedSplitItem?.amount || 0)}
                          onPercentChange={() => {}}
                          onAmountChange={() => {}}
                          preventMinus={preventMinus}
                        />
                        </div>
                      </div>
                      <AgentCapStrips agentId={agent.id} allocations={allocations} isEditing={isEditing} onTeamCapAmountChange={onTeamCapAmountChange} onRemoveTeamCap={onRemoveTeamCap} />
                    </div>
                  );
                }

                return (
                  <div
                    key={agent.id}
                    {...getDragRowProps(index, 'agentSplit', onReorderAgents)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5 relative"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {renderReorderControls(index, agents.length, onReorderAgents, 'agentSplit')}
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => onRemoveAgent(agent.name)}
                            className="text-xs text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition"
                            title={`Remove ${agent.name}`}
                          >
                            <TrashIcon />
                          </button>
                        )}

                        <span className="text-xs select-none">👤</span>

                        {isEditing && knownAgents.length > 0 ? (
                          <ClearableSelect
                            value={agent.name}
                            onChange={(e) => onSwitchAgent?.(agent.id, e.target.value)}
                            className="bg-transparent border-b border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] py-0.5 cursor-pointer max-w-[160px] sm:max-w-[220px]"
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
                          <span className="text-[11px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                            Lead
                          </span>
                        )}

                      </div>

                      {/* Read-only, the amount lines up with the team cap amounts inside their strips below. */}
                      <div className={isEditing ? undefined : 'pr-2.5'}>
                      <SplitPair
                        isEditing={isEditing}
                        matchColumns
                        type={agent.splitType}
                        percentPoints={(adjustedSplitView(computedSplitItem)?.percentPoints) ?? (agent.splitType === 'PERCENT' ? toPercentPoints(agent.splitVal) : toPercentPoints(computedSplitItem?.percent || 0))}
                        dollarAmount={(adjustedSplitView(computedSplitItem)?.dollar) ?? (agent.splitType === 'AMOUNT' ? agent.splitVal : (computedSplitItem?.amount || 0))}
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
                    <AgentCapStrips agentId={agent.id} allocations={allocations} isEditing={isEditing} onTeamCapAmountChange={onTeamCapAmountChange} onRemoveTeamCap={onRemoveTeamCap} />
                    <AgentAllocationNotes agentId={agent.id} allocations={allocations} />
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
              <span className={WATERFALL_HEADING}>Post-Split Deductions</span>
              <HoverNote label="Level 1: Common deductions from Agent Split • Level 2: Other deductions from Net after Level 1 Post-splits (e.g., 5% Brokerage stock options)">
                <span tabIndex={0} role="img" aria-label="Post-split levels explained" className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-help outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
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
                </span>
              </HoverNote>
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
              const agentRules1 = shownPostSplitRules[agentName] || [];
              const items1ForAgent = (dealResult.postSplitItems || []).filter((i: any) => i.agentName === agentName);
              const isAddingL1 = addingPostSplitForAgent === agentName;
              const netAfterL1 = dealResult.agentNetAfterLevel1?.[agentName] ?? agentGrossSplit;

              // Level 2 rules & items (Stock / Elective)
              const agentRules2 = shownPostSplit2Rules[agentName] || [];
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
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white">
                        👤 {agentName}
                      </span>
                      {agentObj?.isTeamLead && (
                        <span className="text-[11px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold">
                          Lead
                        </span>
                      )}
                      <span className="ml-auto whitespace-nowrap text-xs text-slate-500 dark:text-slate-400" title="Agent split">
                        <strong className={agentGrossSplit < -0.004 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}>{formatCurrency(agentGrossSplit)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* LEVEL 1: Level 1 Post-splits */}
                  <div className="bg-white dark:bg-slate-900/90 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <HoverNote label="Percent deductions are calculated from agent split">
                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-yellow-600/40 bg-yellow-400/25 px-2 py-0.5 tracking-normal text-yellow-900 dark:border-yellow-300/50 dark:bg-yellow-400/15 dark:text-yellow-200">
                              Level 1
                            </span>
                          </HoverNote>
                          Post-Splits
                        </span>
                      </div>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => isAddingL1 ? setAddingPostSplitForAgent(null) : handleStartAddPostSplit1(agentName)}
                          title="Add new Level 1 post-split"
                          aria-label="Add new Level 1 post-split"
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
                          New Level 1 Post-Split for {agentName}
                        </span>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          {knownEntities.length > 0 ? (
                            <ClearableSelect
                              value={newPostSplitEntity}
                              onChange={(e) => setNewPostSplitEntity(e.target.value)}
                              className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                            >
                              {knownEntities.map((ent) => (
                                <option key={ent.id} value={ent.name}>{ent.name}</option>
                              ))}
                            </ClearableSelect>
                          ) : (
                            <input
                              type="text"
                              placeholder="Entity name (e.g. Soleox Realty)"
                              value={newPostSplitEntity}
                              onChange={(e) => setNewPostSplitEntity(e.target.value)}
                              className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                            />
                          )}
                          <SplitPair
                            isEditing
                            type={newPostSplitType}
                            percentPoints={newPostSplitType === 'PERCENT' ? toPercentPoints(newPostSplitValue) : (agentGrossSplit > 0 ? (newPostSplitValue / agentGrossSplit) * 100 : 0)}
                            dollarAmount={newPostSplitType === 'AMOUNT' ? newPostSplitValue : agentGrossSplit * newPostSplitValue}
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

                    {agentRules1.length === 0 && items1ForAgent.length === 0 && !isAddingL1 && (
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
                                  <TrashIcon />
                                </button>
                              )}

                              {isEditing ? (
                                knownEntities.length > 0 ? (
                                  <ClearableSelect
                                    value={rule.entity}
                                    onChange={(e) => onUpdateAgentPostSplitEntity?.(agentName, rule.id, e.target.value)}
                                    className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer max-w-[140px] sm:max-w-[170px]"
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
                                    className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] w-24"
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
                              percentPoints={rule.type === 'PERCENT' ? toPercentPoints(rule.value) : (agentGrossSplit > 0 ? ((calculatedItem?.amount || 0) / agentGrossSplit) * 100 : 0)}
                              dollarAmount={calculatedItem?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                              deduction
                              underAmount={agentRules1.findLastIndex((item) => (item.entity || '').trim() === (rule.entity || '').trim()) === ruleIdx ? agentCapNote(agentObj?.id || '', agentName, rule.entity) : null}
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
                      {items1ForAgent.filter((item: { id?: string; entity?: string }) => !agentRules1.some((rule) => rule.id === item.id || (rule.entity || '').trim() === (item.entity || '').trim())).map((item: { id?: string; entity?: string; type?: 'PERCENT' | 'AMOUNT'; value?: number; amount?: number }) => (
                        <div key={item.id || item.entity} className="py-2 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={item.entity}>{item.entity || '—'}</span>
                          <SplitPair
                            isEditing={isEditing}
                            matchColumns
                            type={item.type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'}
                            percentPoints={item.type === 'AMOUNT' ? (agentGrossSplit > 0 ? ((Number(item.amount) || 0) / agentGrossSplit) * 100 : 0) : toPercentPoints(Number(item.value) || 0)}
                            dollarAmount={Number(item.amount) || 0}
                            deduction
                            underAmount={agentCapNote(agentObj?.id || '', agentName, item.entity || '')}
                            onPercentChange={(val) => {
                              if (item.type === 'AMOUNT' && item.id) onToggleAgentPostSplitType(agentName, item.id);
                              if (item.id) onUpdateAgentPostSplitValue(agentName, item.id, val);
                            }}
                            onAmountChange={(val) => {
                              if (item.type !== 'AMOUNT' && item.id) onToggleAgentPostSplitType(agentName, item.id);
                              if (item.id) onUpdateAgentPostSplitValue(agentName, item.id, val);
                            }}
                            preventMinus={preventMinus}
                          />
                        </div>
                      ))}
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
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <HoverNote label="Percent deductions are calculated from net after Level 1 post-splits.">
                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-400/60 bg-slate-300/50 px-2 py-0.5 tracking-normal text-slate-600 dark:border-slate-300/45 dark:bg-slate-400/20 dark:text-slate-200">
                              Level 2
                            </span>
                          </HoverNote>
                          Post-Splits
                        </span>
                      </div>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => isAddingL2 ? setAddingPostSplit2ForAgent(null) : handleStartAddPostSplit2(agentName)}
                          title="Add new Level 2 post-split"
                          aria-label="Add new Level 2 post-split"
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
                            New Level 2 Post-Split for {agentName}
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
                              className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                            >
                              {knownEntities.map((ent) => (
                                <option key={ent.id} value={ent.name}>{ent.name}</option>
                              ))}
                            </ClearableSelect>
                          ) : (
                            <input
                              type="text"
                              placeholder="Payee entity (e.g. Stock)"
                              value={newPostSplit2Entity}
                              onChange={(e) => setNewPostSplit2Entity(e.target.value)}
                              className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] font-medium sm:w-44"
                            />
                          )}
                          <SplitPair
                            isEditing
                            type={newPostSplit2Type}
                            percentPoints={newPostSplit2Type === 'PERCENT' ? toPercentPoints(newPostSplit2Value) : (netAfterL1 > 0 ? (newPostSplit2Value / netAfterL1) * 100 : 0)}
                            dollarAmount={newPostSplit2Type === 'AMOUNT' ? newPostSplit2Value : netAfterL1 * newPostSplit2Value}
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

                    {agentRules2.length === 0 && items2ForAgent.length === 0 && !isAddingL2 && (
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
                                  <TrashIcon />
                                </button>
                              )}

                              {isEditing ? (
                                knownEntities.length > 0 ? (
                                  <ClearableSelect
                                    value={rule.entity}
                                    onChange={(e) => onUpdateAgentPostSplit2Entity?.(agentName, rule.id, e.target.value)}
                                    className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] cursor-pointer max-w-[140px] sm:max-w-[170px]"
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
                                    className="bg-transparent border-b border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-0 focus:border-b-brand-500 focus:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] w-24"
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
                              percentPoints={rule.type === 'PERCENT' ? toPercentPoints(rule.value) : (netAfterL1 > 0 ? ((calculatedItem2?.amount || 0) / netAfterL1) * 100 : 0)}
                              dollarAmount={calculatedItem2?.amount || (rule.type === 'AMOUNT' ? rule.value : 0)}
                              deduction
                              underAmount={agentRules2.findLastIndex((item) => (item.entity || '').trim() === (rule.entity || '').trim()) === ruleIdx ? agentCapNote(agentObj?.id || '', agentName, rule.entity) : null}
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
                      {items2ForAgent.filter((item: { id?: string; entity?: string }) => !agentRules2.some((rule) => rule.id === item.id || (rule.entity || '').trim() === (item.entity || '').trim())).map((item: { id?: string; entity?: string; type?: 'PERCENT' | 'AMOUNT'; value?: number; amount?: number }) => (
                        <div key={item.id || item.entity} className="py-2 flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate" title={item.entity}>{item.entity || '—'}</span>
                          <SplitPair
                            isEditing={isEditing}
                            matchColumns
                            type={item.type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT'}
                            percentPoints={item.type === 'AMOUNT' ? (netAfterL1 > 0 ? ((Number(item.amount) || 0) / netAfterL1) * 100 : 0) : toPercentPoints(Number(item.value) || 0)}
                            dollarAmount={Number(item.amount) || 0}
                            deduction
                            underAmount={agentCapNote(agentObj?.id || '', agentName, item.entity || '')}
                            onPercentChange={(val) => {
                              if (item.type === 'AMOUNT' && item.id) onToggleAgentPostSplit2Type?.(agentName, item.id);
                              if (item.id) onUpdateAgentPostSplit2Value?.(agentName, item.id, val);
                            }}
                            onAmountChange={(val) => {
                              if (item.type !== 'AMOUNT' && item.id) onToggleAgentPostSplit2Type?.(agentName, item.id);
                              if (item.id) onUpdateAgentPostSplit2Value?.(agentName, item.id, val);
                            }}
                            preventMinus={preventMinus}
                          />
                        </div>
                      ))}
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
      <CancelEditPrompt
        open={editKeys.confirmCancel}
        sectionLabel="Commission Waterfall"
        onKeepEditing={editKeys.keepEditing}
        onDiscard={editKeys.discard}
      />
      {confirmReset && (
        <div
          className="app-modal fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4"
          onClick={() => setConfirmReset(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-amber-500/30 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-waterfall-title"
          >
            <div>
              <h3 id="reset-waterfall-title" className="text-base font-bold text-slate-900 dark:text-white">
                Reset the Waterfall?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {resetClearsPayments
                  ? 'Off-the-top deductions, pre-splits, agent splits, post-splits, and team caps are removed. This transaction does not qualify for a commission template, so saving it removes every commission line and payment.'
                  : 'Off-the-top deductions, pre-splits, agent splits, post-splits, and team caps are removed. The Primary Agent keeps 100% of the commission. The template submission stays.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetWaterfall?.();
                  setConfirmReset(false);
                }}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-amber-400 text-slate-950 transition hover:bg-amber-500 cursor-pointer"
              >
                Reset Waterfall
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Less common Waterfall actions, kept out of the header so a rare, destructive reset is one click further away. */
function WaterfallMoreMenu({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      swallowNextClick();
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="More waterfall actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition cursor-pointer ${open ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700/60 dark:hover:text-slate-200'}`}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-amber-800 transition hover:bg-amber-50 cursor-pointer dark:text-amber-200 dark:hover:bg-amber-950/50"
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Reset Waterfall
          </button>
        </div>
      )}
    </div>
  );
}
