'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { ListChecks, ListFilter, Plus, Rows3 } from 'lucide-react';
import { BulkUpdateDialog } from '@/app/(dashboard)/commission-tracker/transactions/components/BulkUpdateDialog';
import { HoverNote } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/HoverNote';
import { ConfirmDialog, useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PERCENT_POINT_DECIMALS, formatPercentPoints, formatTablePercent, fromPercentPoints, toPercentPoints } from '@/lib/percent';
import { isAgentBulkEditableField } from '@/lib/agent-bulk';
import { isHiddenRecordId } from '@/lib/fields';
import { pageFrame } from '@/lib/page-frame';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { BooleanField, BooleanMark, isBooleanChecked } from '@/components/ui/BooleanCheckbox';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { EditPencil } from '@/components/ui/edit-pencil';
import { TrashIcon } from '@/components/ui/trash-icon';
import { useAccess } from '@/components/access-provider';
import { useRegisterSave } from '@/components/save-leave-guard';
import { filterControl, filterShell, underlineControlPlain as underlineControl } from '@/components/ui/underline-field';

type FieldType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

export interface ConditionRule {
  id: string;
  field_key: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_EMPTY' | 'IS_EMPTY';
  value?: string | string[];
}

export interface VisibilityRuleGroup {
  operator: 'AND' | 'OR';
  conditions: ConditionRule[];
}

interface FieldConfig {
  id: string;
  client_id: string;
  target_table: 'transactions' | 'agents' | 'contacts';
  field_key: string;
  storage_type: 'CORE_COLUMN' | 'CUSTOM_JSON';
  section_name: string;
  section_sort_order: number;
  sort_order: number;
  field_label: string;
  field_type: FieldType;
  is_required: boolean;
  is_system: boolean;
  is_enabled: boolean;
  dropdown_options?: string[];
  visibility_rule?: VisibilityRuleGroup;
  min_value?: number;
  max_value?: number;
  min_date?: string;
  max_length?: number;
  regex_pattern?: string;
  regex_mode?: 'MATCHES' | 'EQUALS';
}

interface AgentRecord {
  id?: string;
  agent_name: string;
  agent_email: string;
  agent_status: string;
  group_id?: string;
  phone?: string;
  office_location?: string;
  license_type?: string;
  is_team_lead?: boolean;
  has_transactions?: boolean;
  [key: string]: any;
}

const underlineShell =
  'group/field relative underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';

function agentGroupValue(agent: AgentRecord): string {
  const direct = agent.group_id ?? agent.group;
  const custom = agent.custom_attributes?.group_id ?? agent.custom_attributes?.group;
  const value = direct ?? custom;
  return value == null ? '' : String(value);
}

function agentFieldValue(agent: AgentRecord, key: string): unknown {
  if (key === 'group_id' || key === 'group') {
    const group = agentGroupValue(agent);
    return group === '' ? undefined : group;
  }
  const direct = agent[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  if (key === 'id') return agent.id;
  if (key === 'agent_id') return agent.agent_id || agent.id;
  if (key === 'agent_name' || key === 'full_name') return agent.agent_name || agent.full_name || undefined;
  if (key === 'agent_status') return agent.agent_status || undefined;
  const custom = agent.custom_attributes?.[key];
  if (custom !== undefined && custom !== null && custom !== '') return custom;
  return direct;
}

function FieldChevron() {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
    >
      <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FieldCalendar({ label }: { label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Choose ${label}`}
      onClick={(event) => {
        const input = event.currentTarget.parentElement?.querySelector('input[type="date"]');
        if (!(input instanceof HTMLInputElement)) return;
        input.focus();
        if (typeof input.showPicker === 'function') input.showPicker();
      }}
      className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 cursor-pointer text-slate-600 dark:text-slate-300"
    >
      <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.25" />
        <path d="M2.25 6.75h11.5M5.25 2v2.5M10.75 2v2.5" />
      </svg>
    </button>
  );
}

function editableAmount(amount: number): string {
  return formatPercentPoints(amount);
}

function AgentAmountInput({
  kind,
  value,
  disabled,
  required,
  onChange,
}: {
  kind: 'CURRENCY' | 'PERCENT';
  value: unknown;
  disabled?: boolean;
  required?: boolean;
  onChange: (next: number | undefined) => void;
}) {
  const stored = value === '' || value === undefined || value === null ? null : Number(value);
  const finite = stored !== null && Number.isFinite(stored) ? stored : null;
  const points = finite === null ? null : kind === 'PERCENT' ? toPercentPoints(finite) : finite;
  const committed = points === null
    ? ''
    : kind === 'CURRENCY'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(points)
      : `${formatPercentPoints(points)}%`;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!focused) setDraft(points === null ? '' : editableAmount(points));
  }, [focused, points]);

  return (
    <input
      type="text"
      inputMode="decimal"
      required={required}
      disabled={disabled}
      value={focused ? draft : committed}
      onFocus={() => {
        setDraft(points === null ? '' : editableAmount(points));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        let raw = event.target.value.replace(/[$,%\s]/g, '');
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
        const fractionLimit = kind === 'PERCENT' ? PERCENT_POINT_DECIMALS : 2;
        if (raw.includes('.')) {
          const [integer, decimals] = raw.split('.');
          if (decimals && decimals.length > fractionLimit) raw = `${integer}.${decimals.slice(0, fractionLimit)}`;
        }
        setDraft(raw);
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
          onChange(undefined);
          return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        onChange(kind === 'PERCENT' ? fromPercentPoints(parsed) : parsed);
      }}
      className={underlineControl}
    />
  );
}

type GroupTone = { pill: string };

/** Soft group colors, chosen so no two read as the same hue. */
const GROUP_PALETTE: GroupTone[] = [
  { pill: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25' },
  { pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25' },
  { pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
  { pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25' },
  { pill: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25' },
  { pill: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25' },
  { pill: 'bg-lime-500/10 text-lime-700 dark:text-lime-300 border-lime-500/25' },
  { pill: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25' },
  { pill: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25' },
  { pill: 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/25' },
];
const UNKNOWN_GROUP_TONE: GroupTone = { pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25' };

function nameHash(clean: string): number {
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const isUnknownGroup = (clean: string) => clean.replace(/[^a-z]/g, '') === 'unknown';

/**
 * Colors for the client's current groups: each starts at its own hashed slot and moves to the next free one,
 * so no two groups share a color until there are more groups than colors. The same group list always gives the
 * same colors, and adding a group only moves a group it collides with.
 */
let assignedGroupTones = new Map<string, GroupTone>();
function assignGroupTones(groupNames: string[]) {
  const next = new Map<string, GroupTone>();
  const used = new Set<number>();
  const cleanNames = [...new Set(groupNames.map((name) => name.trim().toLowerCase()).filter((name) => name && !isUnknownGroup(name)))]
    .sort((a, b) => nameHash(a) - nameHash(b) || a.localeCompare(b));
  cleanNames.forEach((clean) => {
    let slot = nameHash(clean) % GROUP_PALETTE.length;
    if (used.size < GROUP_PALETTE.length) {
      while (used.has(slot)) slot = (slot + 1) % GROUP_PALETTE.length;
    }
    used.add(slot);
    next.set(clean, GROUP_PALETTE[slot]);
  });
  assignedGroupTones = next;
}

function groupTone(groupName: string): GroupTone {
  const clean = groupName.trim().toLowerCase();
  if (isUnknownGroup(clean)) return UNKNOWN_GROUP_TONE;
  return assignedGroupTones.get(clean) ?? GROUP_PALETTE[nameHash(clean) % GROUP_PALETTE.length];
}

function getGroupBadgeStyle(groupName: string): string {
  if (!groupName) return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700';
  return groupTone(groupName).pill;
}

export default function AgentsPage() {
  const { access } = useAccess();
  const canWriteTracker = Boolean(access?.permissions.commissionTrackerWrite);
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { confirm: confirmAction, notify, dialog: confirmDialog } = useConfirmDialog();
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null);
  const [formData, setFormData] = useState<Partial<AgentRecord>>({});

  // Client-side viewing: Quick search & column sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('ALL');

  // ?q= from the ⌘K search opens the list filtered to that agent.
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (!query) return;
    setSearchQuery(query);
  }, []);

  // Removing q is deferred and cancelled on cleanup, so a second effect pass (React dev mode runs
  // effects twice) still finds it and applies the search again over the restored list state.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('q')) return;
      params.delete('q');
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [showFilters, setShowFilters] = useState(false);
  const [compactRows, setCompactRows] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState('agent_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Ref to target Agent Name input for auto-focusing
  const agentNameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setCompactRows(window.localStorage.getItem('soleox-agents-row-density') === 'compact');
  }, []);

  const toggleCompactRows = () => {
    setCompactRows((current) => {
      const next = !current;
      window.localStorage.setItem('soleox-agents-row-density', next ? 'compact' : 'comfortable');
      return next;
    });
  };

  const loadLiveSchema = async () => {
    try {
      const headers = access?.clientId ? { 'x-client-id': access.clientId } : undefined;
      const res = await fetch('/api/schema/agents', { headers });
      const data = await res.json();
      if (data.catalog && Array.isArray(data.catalog)) {
        setFieldConfigs(data.catalog);
      } else {
        setFieldConfigs([]);
      }
    } catch (err) {
      console.error('Failed to load live agent schema:', err);
    }
  };

  const loadLiveAgents = async () => {
    setIsLoading(true);
    try {
      const headers = access?.clientId ? { 'x-client-id': access.clientId } : undefined;
      const res = await fetch('/api/agents', { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.agents)) {
        setAgents(data.agents);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLiveSchema();
    loadLiveAgents();
  }, []);

  // Prevent accidental tab closure when modal is open
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModalOpen) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isModalOpen]);

  // Auto-focus Agent Name input when modal opens
  useEffect(() => {
    if (isModalOpen) {
      const timer = setTimeout(() => {
        agentNameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const activeConfigs = useMemo(() => fieldConfigs
    .filter((f) => f.is_enabled && !isHiddenRecordId('agents', f.field_key))
    .sort((a, b) => {
      if (a.section_sort_order !== b.section_sort_order) {
        return a.section_sort_order - b.section_sort_order;
      }
      return a.sort_order - b.sort_order;
    }), [fieldConfigs]);

  const sectionHeaderGroups = useMemo(() => {
    if (activeConfigs.length === 0) return [];
    const groups: { name: string; span: number }[] = [];
    let currentSection = activeConfigs[0].section_name || 'Identity & Status';
    let currentSpan = 0;
    activeConfigs.forEach((field) => {
      const sectionName = field.section_name || 'Identity & Status';
      if (sectionName === currentSection) {
        currentSpan += 1;
      } else {
        groups.push({ name: currentSection, span: currentSpan });
        currentSection = sectionName;
        currentSpan = 1;
      }
    });
    if (currentSpan > 0) groups.push({ name: currentSection, span: currentSpan });
    return groups;
  }, [activeConfigs]);

  const groupOptions = useMemo(() => {
    const field = activeConfigs.find((cfg) => cfg.field_key === 'group_id')
      ?? activeConfigs.find((cfg) => cfg.field_key === 'group');
    const seen = new Set<string>();
    return (field?.dropdown_options ?? []).map((option) => String(option).trim()).filter((option) => {
      if (!option) return false;
      const key = option.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeConfigs]);

  // Give the client's groups their colors before anything renders a group badge or tab.
  useMemo(() => {
    assignGroupTones([...groupOptions, ...agents.map((agent) => agentGroupValue(agent))]);
  }, [agents, groupOptions]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    groupOptions.forEach((option) => counts.set(option, 0));
    agents.forEach((agent) => {
      const value = agentGroupValue(agent).trim().toLowerCase();
      const match = groupOptions.find((option) => option.toLowerCase() === value);
      if (match) counts.set(match, (counts.get(match) || 0) + 1);
    });
    return counts;
  }, [agents, groupOptions]);

  useEffect(() => {
    if (activeGroup !== 'ALL' && !groupOptions.some((option) => option.toLowerCase() === activeGroup.toLowerCase())) {
      setActiveGroup('ALL');
    }
  }, [activeGroup, groupOptions]);

  const handleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortOrder('asc');
    }
  };

  const handleFilterChange = (fieldKey: string, value: string) => {
    setColFilters((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const processedAgents = useMemo(() => {
    let result = [...agents];

    if (activeGroup !== 'ALL') {
      const target = activeGroup.trim().toLowerCase();
      result = result.filter((agent) => agentGroupValue(agent).trim().toLowerCase() === target);
    }

    // Global quick search across all agent fields (in-memory viewing)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((agent) => {
        return Object.entries(agent).some(([key, val]) => {
          if (val === undefined || val === null) return false;
          if (typeof val === 'object') {
            return Object.values(val).some((subVal) =>
              String(subVal ?? '').toLowerCase().includes(q)
            );
          }
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    const activeColumnFilters = Object.entries(colFilters).filter(([, value]) => value && value !== 'All');
    if (activeColumnFilters.length > 0) {
      result = result.filter((agent) => {
        for (const [key, filterVal] of activeColumnFilters) {
          const field = fieldConfigs.find((item) => item.field_key === key);
          const raw = agentFieldValue(agent, key);
          if (field?.field_type === 'BOOLEAN') {
            const checked = isBooleanChecked(raw);
            if (filterVal === 'Yes' && !checked) return false;
            if (filterVal === 'No' && checked) return false;
            continue;
          }
          const cell = String(raw ?? '').toLowerCase();
          const target = filterVal.toLowerCase();
          if (field?.field_type === 'PERCENT') {
            const shown = formatTablePercent(raw).toLowerCase();
            if (!cell.includes(target) && !shown.includes(target)) return false;
          } else if (!cell.includes(target)) {
            return false;
          }
        }
        return true;
      });
    }

    // Sort by selected column (in-memory viewing)
    result.sort((a, b) => {
      let aVal = a[sortField] ?? (sortField === 'id' ? a.id : sortField === 'agent_id' ? (a.agent_id || a.id) : undefined);
      let bVal = b[sortField] ?? (sortField === 'id' ? b.id : sortField === 'agent_id' ? (b.agent_id || b.id) : undefined);

      if (sortField === 'full_name' || sortField === 'agent_name') {
        aVal = a.agent_name || a.full_name || '';
        bVal = b.agent_name || b.full_name || '';
      } else if (sortField === 'agent_status') {
        aVal = a.agent_status || 'Active';
        bVal = b.agent_status || 'Active';
      } else if (sortField === 'group_id') {
        aVal = a.group_id || a.group || '';
        bVal = b.group_id || b.group || '';
      }

      if (aVal === undefined && a.custom_attributes?.[sortField] !== undefined) {
        aVal = a.custom_attributes[sortField];
      }
      if (bVal === undefined && b.custom_attributes?.[sortField] !== undefined) {
        bVal = b.custom_attributes[sortField];
      }

      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        return sortOrder === 'asc'
          ? (aVal === bVal ? 0 : aVal ? 1 : -1)
          : (aVal === bVal ? 0 : aVal ? -1 : 1);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const strA = String(aVal);
      const strB = String(bVal);
      return sortOrder === 'asc'
        ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
        : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
    });

    return result;
  }, [agents, searchQuery, activeGroup, colFilters, fieldConfigs, sortField, sortOrder]);

  const visibleIds = useMemo(
    () => processedAgents.map((agent) => String(agent.id || '')).filter(Boolean),
    [processedAgents],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (!bulkMode) return;
    const visible = new Set(visibleIds);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bulkMode, visibleIds]);

  useEffect(() => {
    const box = selectAllRef.current;
    if (!box) return;
    const count = visibleIds.filter((id) => selectedIds.has(id)).length;
    box.indeterminate = count > 0 && count < visibleIds.length;
  }, [visibleIds, selectedIds, bulkMode]);

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (visibleIds.every((id) => next.has(id))) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleIdsRef = useRef(visibleIds);
  visibleIdsRef.current = visibleIds;
  const dragSelectRef = useRef<{
    startId: string;
    originX: number;
    originY: number;
    clientX: number;
    clientY: number;
    dragging: boolean;
    base: Set<string>;
  } | null>(null);
  const suppressRowClickRef = useRef(false);

  const applyDragSelection = useCallback((startId: string, currentId: string, base: Set<string>) => {
    const ids = visibleIdsRef.current;
    const start = ids.indexOf(startId);
    const current = ids.indexOf(currentId);
    if (start < 0 || current < 0) return;
    const from = Math.min(start, current);
    const to = Math.max(start, current);
    const next = new Set(base);
    for (let index = from; index <= to; index += 1) next.add(ids[index]);
    setSelectedIds((existing) => {
      if (existing.size === next.size && [...next].every((id) => existing.has(id))) return existing;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!bulkMode) {
      dragSelectRef.current = null;
      return;
    }
    let frame = 0;
    const rowIdAt = (x: number, y: number) => {
      const scroller = tableScrollRef.current;
      let pointY = y;
      const head = scroller?.querySelector('thead');
      const headBottom = head?.getBoundingClientRect().bottom;
      if (headBottom !== undefined && pointY <= headBottom) pointY = headBottom + 8;
      const target = document.elementFromPoint(x, pointY);
      const row = target instanceof Element ? target.closest('tr[data-bulk-id]') : null;
      return row?.getAttribute('data-bulk-id') || '';
    };
    const extendSelection = () => {
      const drag = dragSelectRef.current;
      if (!drag?.dragging) return;
      const scroller = tableScrollRef.current;
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (drag.clientY < bounds.top + 36) scroller.scrollTop -= 18;
        else if (drag.clientY > bounds.bottom - 36) scroller.scrollTop += 18;
      }
      const id = rowIdAt(drag.clientX, drag.clientY);
      if (id) applyDragSelection(drag.startId, id, drag.base);
    };
    const onMove = (event: PointerEvent) => {
      const drag = dragSelectRef.current;
      if (!drag) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
      if (!drag.dragging && distance < 4) return;
      if (!drag.dragging) {
        drag.dragging = true;
        document.body.classList.add('select-none');
      }
      const id = rowIdAt(event.clientX, event.clientY);
      if (id) applyDragSelection(drag.startId, id, drag.base);
      if (!frame) frame = requestAnimationFrame(function loop() {
        extendSelection();
        frame = dragSelectRef.current?.dragging ? requestAnimationFrame(loop) : 0;
      });
    };
    const stop = () => {
      if (dragSelectRef.current?.dragging) suppressRowClickRef.current = true;
      dragSelectRef.current = null;
      document.body.classList.remove('select-none');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('select-none');
      if (frame) cancelAnimationFrame(frame);
    };
  }, [applyDragSelection, bulkMode]);

  const confirmBulkUpdate = async (fieldKey: string, value: string) => {
    setIsBulkUpdating(true);
    setBulkError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (access?.clientId) headers['x-client-id'] = access.clientId;
      const response = await fetch('/api/agents/bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({ clientId: access?.clientId, ids: [...selectedIds], fieldKey, value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not update those agents.');
      await loadLiveAgents();
      const updated = Number(payload.updated) || 0;
      const unchanged = Number(payload.unchanged) || 0;
      const skipped = Number(payload.skipped) || 0;
      const failed = Array.isArray(payload.errors) ? payload.errors.length : 0;
      const parts = [`Updated ${updated} ${updated === 1 ? 'agent' : 'agents'}.`];
      if (unchanged) parts.push(`${unchanged} already had that value.`);
      if (skipped) parts.push(`${skipped} were skipped.`);
      if (failed) parts.push(`${failed} could not be updated.`);
      setBulkNotice(parts.join(' '));
      setSelectedIds(new Set());
      setBulkDialogOpen(false);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Could not update those agents.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (isBulkDeleting || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (access?.clientId) headers['x-client-id'] = access.clientId;
      const response = await fetch('/api/agents/bulk', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ clientId: access?.clientId, ids: [...selectedIds] }),
      });
      const payload = await response.json().catch(() => ({}));
      const deletedIds = new Set<string>(Array.isArray(payload.deleted) ? payload.deleted.map((id: unknown) => String(id)) : []);
      if (deletedIds.size > 0) {
        setAgents((current) => current.filter((agent) => !deletedIds.has(String(agent.id))));
        setSelectedIds((current) => {
          const next = new Set(current);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      const problems = Array.isArray(payload.errors) ? payload.errors : [];
      const kept = problems.filter((item: { message?: string }) => String(item.message || '').includes('transaction')).length;
      const failed = problems.length - kept;
      if (!response.ok && deletedIds.size === 0) {
        throw new Error(payload.error || problems[0]?.message || 'Could not delete those agents.');
      }
      const noun = deletedIds.size === 1 ? 'agent' : 'agents';
      const notes = [`Deleted ${deletedIds.size} ${noun}.`];
      if (kept) notes.push(`${kept} ${kept === 1 ? 'agent stays' : 'agents stay'} because they are on a transaction.`);
      if (failed) notes.push(`${failed} could not be deleted.`);
      if (kept === 0 && failed === 0) {
        setBulkNotice(notes[0]);
        setPendingBulkDelete(false);
      } else {
        setBulkDeleteError(notes.slice(1).join(' ') || notes[0]);
        if (deletedIds.size > 0) setBulkNotice(notes.join(' '));
      }
    } catch (error) {
      setBulkDeleteError(error instanceof Error ? error.message : 'Could not delete those agents.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const sections = Array.from(new Set(activeConfigs.map((f) => f.section_name || 'Identity & Status')));

  const handleOpenAdd = () => {
    setEditingAgent(null);
    const initialData: Partial<AgentRecord> = {
      is_team_lead: false,
    };
    activeConfigs.forEach((cfg) => {
      if (cfg.dropdown_options && cfg.dropdown_options.length > 0) {
        initialData[cfg.field_key] = cfg.dropdown_options[0];
      }
    });
    setFormData(initialData);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (agent: AgentRecord) => {
    setEditingAgent(agent);
    setFormData(agent);
    setIsModalOpen(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.agent_name || isSubmitting) return false;

    setIsSubmitting(true);
    const isEditing = Boolean(editingAgent);
    const targetAgent: AgentRecord = {
      agent_name: formData.agent_name || '',
      agent_email: formData.agent_email || '',
      agent_status: formData.agent_status || '',
      ...formData,
    };
    if (!isEditing) {
      delete targetAgent.id;
      delete targetAgent.agent_id;
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: targetAgent,
          action: isEditing ? 'UPDATE' : 'CREATE',
        }),
      });

      if (!res.ok) throw new Error('Failed to save agent to database');

      setIsModalOpen(false);
      await loadLiveAgents();
      return true;
    } catch (err) {
      console.error('Save error:', err);
      void notify({ title: "Couldn't save changes", message: 'Failed to save changes to the database.' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const agentWasOpen = useRef(false);
  const agentBaseline = useRef('');
  const agentDraft = JSON.stringify(formData);
  if (isModalOpen !== agentWasOpen.current) {
    agentWasOpen.current = isModalOpen;
    if (isModalOpen) agentBaseline.current = agentDraft;
  }
  const agentDirty = isModalOpen && agentDraft !== agentBaseline.current;

  useRegisterSave({
    id: 'agent-form',
    active: agentDirty,
    saving: isSubmitting,
    onSave: () => handleSave(),
    onDiscard: () => setIsModalOpen(false),
  });

  const statusOptions = fieldConfigs.find((cfg) => cfg.field_key === 'agent_status')?.dropdown_options?.filter(Boolean) ?? [];

  const toggleStatus = async (agent: AgentRecord) => {
    if (statusOptions.length < 2) return;
    const current = String(agent.agent_status || '');
    const currentIndex = statusOptions.findIndex((option) => option.toLowerCase() === current.toLowerCase());
    const nextStatus = statusOptions[(currentIndex + 1) % statusOptions.length];

    const confirmed = await confirmAction({
      title: 'Change status?',
      message: `Set the status of "${agent.agent_name}" to ${nextStatus}?`,
      confirmLabel: `Set to ${nextStatus}`,
      tone: 'primary',
    });
    if (!confirmed) {
      return;
    }

    const updatedAgent = { ...agent, agent_status: nextStatus };

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: updatedAgent, action: 'UPDATE' }),
      });

      if (!res.ok) throw new Error('Failed to update agent status');

      await loadLiveAgents();
    } catch (err) {
      console.error('Status toggle failed:', err);
      void notify({ title: "Couldn't update status", message: 'Failed to update agent status.' });
    }
  };

  const handleDelete = async (agent: AgentRecord) => {
    if (agent.has_transactions) {
      void notify({
        title: "Can't delete this agent",
        message: `Cannot delete "${agent.agent_name}" because they have active or historical transactions attached. You can change their status instead.`,
      });
      return;
    }

    const confirmed = await confirmAction({
      title: `Delete "${agent.agent_name}"?`,
      message: `Are you sure you want to permanently delete "${agent.agent_name}"?`,
    });
    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(agent.id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete agent');

      await loadLiveAgents();
    } catch (err) {
      console.error('Delete failed:', err);
      void notify({ title: "Couldn't delete agent", message: 'Failed to delete agent.' });
    }
  };

  const formatCurrency = (val?: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  const isFieldVisible = (cfg: FieldConfig) => {
    if (!cfg.visibility_rule || !cfg.visibility_rule.conditions || !cfg.visibility_rule.conditions.length) return true;

    const { operator, conditions } = cfg.visibility_rule;
    const results = conditions.map((rule) => {
      const formVal = formData[rule.field_key];
      switch (rule.operator) {
        case 'EQUALS':
          return String(formVal) === String(rule.value);
        case 'NOT_EQUALS':
          return String(formVal) !== String(rule.value);
        case 'IN':
          return Array.isArray(rule.value) ? rule.value.includes(String(formVal)) : false;
        case 'NOT_EMPTY':
          return formVal !== undefined && formVal !== null && formVal !== '';
        case 'IS_EMPTY':
          return formVal === undefined || formVal === null || formVal === '';
        default:
          return true;
      }
    });

    return operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
  };

  const cellPad = `${compactRows ? 'px-3 py-0.5 leading-4' : 'px-4 py-3'}`;
  const badgeSize = compactRows ? 'inline-flex h-4 items-center px-1.5 leading-none' : 'inline-block px-2.5 py-0.5';
  const pinEdge = 'shadow-[8px_0_12px_-12px_rgba(15,23,42,0.55)]';
  const pinLeft = bulkMode ? 'left-8' : 'left-0';
  const pinHead = `sticky ${pinLeft} z-30 ${pinEdge}`;
  // Frozen cells are opaque, so they repeat the row band and hover in solid colors, mixed from the
  // theme so they follow the palette: slate-900 at 30% over slate-800, and slate-700 at 50% over slate-800.
  const pinCell = `sticky ${pinLeft} z-10 bg-white group-even:bg-slate-50 group-hover:bg-slate-100 dark:bg-slate-800 dark:group-even:bg-[color-mix(in_srgb,var(--color-slate-900)_30%,var(--color-slate-800))] dark:group-hover:bg-[color-mix(in_srgb,var(--color-slate-700)_50%,var(--color-slate-800))] ${pinEdge}`;
  const pinCheckHead = 'sticky left-0 z-30 box-border w-8 min-w-8 max-w-8 bg-slate-100 dark:bg-slate-900';
  const pinCheckSection = 'sticky left-0 z-30 box-border w-8 min-w-8 max-w-8 bg-slate-200 dark:bg-slate-950';
  const pinCheckCell = 'sticky left-0 z-30 box-border w-8 min-w-8 max-w-8 bg-white group-even:bg-slate-50 group-hover:bg-slate-100 dark:bg-slate-800 dark:group-even:bg-[color-mix(in_srgb,var(--color-slate-900)_30%,var(--color-slate-800))] dark:group-hover:bg-[color-mix(in_srgb,var(--color-slate-700)_50%,var(--color-slate-800))]';

  return (
    <main className={`${pageFrame} min-h-screen bg-slate-100 py-6 text-slate-900 transition-colors duration-200 space-y-6 dark:bg-slate-900 dark:text-slate-100 md:py-8`}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xs flex flex-wrap justify-between items-start sm:items-center gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand-600 dark:text-brand-400 mb-1">
            <span>Commission Tracker</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Agents</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Search and manage the agent roster
            {!isLoading && (
              <span className="text-slate-400">
                {' '}• Showing {processedAgents.length} of {agents.length}
              </span>
            )}
          </p>
        </div>

        {canWriteTracker && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="border border-slate-300 bg-white px-4 py-2.5 rounded-lg text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" strokeWidth={1.75} aria-hidden />
            <span>New agent</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden p-5 space-y-4 transition-colors">
        {bulkNotice && (
          <p className="text-xs text-slate-600 dark:text-slate-300">{bulkNotice}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            {[{ key: 'ALL', label: 'All', count: agents.length }, ...groupOptions.map((option) => ({
              key: option,
              label: option,
              count: groupCounts.get(option) || 0,
            }))].map((tab) => {
              const selected = activeGroup.toLowerCase() === tab.key.toLowerCase();
              // Every tab looks the same; the group's own color is a small dot, taken from its badge text color.
              const dotTone = tab.key === 'ALL'
                ? ''
                : groupTone(tab.key).pill.split(' ').filter((name) => name.includes('text-')).join(' ');
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveGroup(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    selected
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  {dotTone && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full bg-current ${dotTone}`} />}
                  {tab.label}
                  <span className={`tabular-nums ${selected ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
            {canWriteTracker && (
              <div className="flex flex-wrap items-center gap-2">
                <HoverNote label="Select agents to update or delete at once">
                  <button
                    type="button"
                    onClick={() => {
                      if (bulkMode) {
                        setBulkMode(false);
                        setSelectedIds(new Set());
                        setBulkDialogOpen(false);
                        setBulkError(null);
                        setPendingBulkDelete(false);
                        setBulkDeleteError(null);
                        return;
                      }
                      setBulkNotice(null);
                      setBulkMode(true);
                    }}
                    aria-label="Select agents to update or delete at once"
                    aria-pressed={bulkMode}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                      bulkMode
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  </button>
                </HoverNote>
                {bulkMode && selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkError(null);
                      setBulkDialogOpen(true);
                    }}
                    className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-600 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                  >
                    Update {selectedIds.size}
                  </button>
                )}
                {bulkMode && selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteError(null);
                      setPendingBulkDelete(true);
                    }}
                    className="h-9 px-3 rounded-lg text-xs font-bold border border-rose-500/40 bg-rose-600 text-white hover:bg-rose-500 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                  >
                    Delete {selectedIds.size}
                  </button>
                )}
              </div>
            )}
            {canWriteTracker && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />}
            <HoverNote label="Compact table view">
              <button
                type="button"
                onClick={toggleCompactRows}
                aria-label="Compact table view"
                aria-pressed={compactRows}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                  compactRows
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Rows3 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </HoverNote>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />
            <div className="flex items-center gap-2">
              <HoverNote label="Advanced filters">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  aria-label="Advanced filters"
                  aria-pressed={showFilters}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                    showFilters
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <ListFilter className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                </button>
              </HoverNote>
              <div className={`relative w-[20rem] max-w-full ${underlineShell}`}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search all fields..."
                  className={`${underlineControl} pr-4`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={tableScrollRef}
          onClickCapture={(event) => {
            if (!suppressRowClickRef.current) return;
            suppressRowClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          className={`overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700/80 rounded-lg scrollbar-thin ${compactRows ? 'max-h-[calc(100dvh-11rem)]' : 'max-h-[640px]'}`}
        >
          <table className="w-full text-left text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 select-none bg-slate-100 dark:bg-slate-900">
              <tr className="bg-slate-200 dark:bg-slate-950 text-[11px] font-bold text-brand-600 dark:text-brand-400">
                {bulkMode && <th className={`${pinCheckSection} border-b border-slate-300 dark:border-slate-800`} />}
                {sectionHeaderGroups.map((group, index) => {
                  const span = index === 0 ? group.span - 1 : group.span;
                  return (
                    <React.Fragment key={`${group.name}_${index}`}>
                      {index === 0 && (
                        <th className={`${pinHead} bg-slate-200 p-0 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 border-r border-slate-300/60 dark:border-slate-800/80`}>
                          <div className="absolute inset-0 flex items-center gap-1.5 px-4">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                            <span className="truncate">{group.name}</span>
                          </div>
                        </th>
                      )}
                      {span > 0 && (
                        <th
                          colSpan={span}
                          className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 border-r border-slate-300/60 dark:border-slate-800/80"
                        >
                          {index === 0 ? null : (
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                              <span>{group.name}</span>
                            </div>
                          )}
                        </th>
                      )}
                    </React.Fragment>
                  );
                })}
                {canWriteTracker && <th className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800" />}
              </tr>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold">
                {bulkMode && (
                  <th className={`${pinCheckHead} ${compactRows ? 'px-1 py-1.5' : 'px-1 py-3'} align-middle border-b border-slate-200 dark:border-slate-700 text-center`}>
                    <span className="inline-flex items-center justify-center">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select all agents in this view"
                        className="block h-3.5 w-3.5 accent-brand-600 cursor-pointer"
                      />
                    </span>
                  </th>
                )}
                {activeConfigs.map((cfg, index) => (
                  <th
                    key={cfg.field_key}
                    onClick={() => handleSort(cfg.field_key)}
                    className={`${index === 0 ? pinHead : ''} ${compactRows ? 'px-3 py-1.5' : 'px-4 py-3'} bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:text-slate-900 dark:hover:text-white transition group border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0 ${cfg.field_type === 'BOOLEAN' || cfg.field_type === 'DATE' ? 'text-center' : ''} ${cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT' ? 'text-right' : ''}`}
                  >
                    <div className={`flex items-center gap-1.5 ${cfg.field_type === 'BOOLEAN' || cfg.field_type === 'DATE' ? 'justify-center' : ''} ${cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT' ? 'justify-end' : ''}`}>
                      <span>{cfg.field_label}</span>
                      <span className="text-slate-400 dark:text-slate-600 group-hover:opacity-100 transition">
                        {sortField === cfg.field_key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                ))}
                {canWriteTracker && (
                  <th className={`${compactRows ? 'px-3 py-1.5' : 'px-4 py-3'} bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-center`}>
                    Actions
                  </th>
                )}
              </tr>
              {showFilters && (
                <tr className="bg-slate-100 dark:bg-slate-900">
                  {bulkMode && <th className={`${pinCheckHead} border-b border-slate-200 dark:border-slate-700`} />}
                  {activeConfigs.map((cfg, index) => (
                    <th key={`filter_${cfg.field_key}`} className={`${index === 0 ? pinHead : ''} px-2 py-1.5 min-w-[120px] bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0`}>
                      {cfg.field_type === 'SELECT' && Array.isArray(cfg.dropdown_options) ? (
                        <label className={filterShell}>
                          <ClearableSelect
                            allowBlank={false}
                            clearValue="All"
                            value={colFilters[cfg.field_key] || 'All'}
                            onChange={(e) => handleFilterChange(cfg.field_key, e.target.value)}
                            className={`${filterControl} cursor-pointer pr-5`}
                          >
                            <option value="All">All {cfg.field_label}</option>
                            {cfg.dropdown_options.filter(Boolean).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </ClearableSelect>
                        </label>
                      ) : cfg.field_type === 'BOOLEAN' ? (
                        <label className={filterShell}>
                          <ClearableSelect
                            allowBlank={false}
                            clearValue="All"
                            value={colFilters[cfg.field_key] || 'All'}
                            onChange={(e) => handleFilterChange(cfg.field_key, e.target.value)}
                            className={`${filterControl} cursor-pointer pr-5`}
                          >
                            <option value="All">All {cfg.field_label}</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </ClearableSelect>
                        </label>
                      ) : (
                        <label className={filterShell}>
                          <input
                            type={cfg.field_type === 'DATE' ? 'date' : 'text'}
                            placeholder={`Filter ${cfg.field_label}...`}
                            value={colFilters[cfg.field_key] || ''}
                            onChange={(e) => handleFilterChange(cfg.field_key, e.target.value)}
                            className={`${filterControl} ${cfg.field_type === 'DATE' ? 'dark:[color-scheme:dark]' : ''}`}
                          />
                        </label>
                      )}
                    </th>
                  ))}
                  {canWriteTracker && <th className="px-2 py-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700" />}
                </tr>
              )}
            </thead>
            <tbody className="font-normal text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={activeConfigs.length + (canWriteTracker ? 1 : 0) + (bulkMode ? 1 : 0)} className="p-5 text-center text-slate-400">
                    Loading agent roster...
                  </td>
                </tr>
              ) : processedAgents.length === 0 ? (
                <tr>
                  <td colSpan={activeConfigs.length + (canWriteTracker ? 1 : 0) + (bulkMode ? 1 : 0)} className="p-5 text-center text-slate-400 italic">
                    {searchQuery || activeGroup !== 'ALL' || Object.values(colFilters).some((value) => value && value !== 'All')
                      ? 'No matching agents found for the current filters.'
                      : 'No agents found.'}
                  </td>
                </tr>
              ) : (
                processedAgents.map((ag) => (
                  <tr
                    key={ag.id}
                    data-bulk-id={bulkMode ? String(ag.id || '') : undefined}
                    onPointerDown={(event) => {
                      if (!bulkMode || event.button !== 0) return;
                      const target = event.target as HTMLElement | null;
                      if (target?.closest('a, button')) return;
                      if (!target?.closest('input')) event.preventDefault();
                      dragSelectRef.current = {
                        startId: String(ag.id || ''),
                        originX: event.clientX,
                        originY: event.clientY,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        dragging: false,
                        base: new Set(selectedIds),
                      };
                    }}
                    onClick={(event) => {
                      if (suppressRowClickRef.current) {
                        suppressRowClickRef.current = false;
                        return;
                      }
                      const target = event.target as HTMLElement | null;
                      if (target?.closest('a, button, input, select, textarea, label')) return;
                      if (bulkMode) toggleRowSelection(String(ag.id || ''));
                    }}
                    className={`group even:bg-slate-50 dark:even:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${bulkMode ? 'cursor-pointer' : ''}`}
                  >
                    {bulkMode && (
                      <td className={`${pinCheckCell} ${compactRows ? 'px-1 py-0.5' : 'px-1 py-3'} text-center align-middle`}>
                        <span className="inline-flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(String(ag.id || ''))}
                            onChange={() => toggleRowSelection(String(ag.id || ''))}
                            aria-label={`Select ${ag.agent_name || ag.id}`}
                            className="block h-3.5 w-3.5 accent-brand-600 cursor-pointer"
                          />
                        </span>
                      </td>
                    )}
                    {activeConfigs.map((cfg, idx) => {
                      const rawVal = ag[cfg.field_key] ?? (cfg.field_key === 'id' ? ag.id : undefined);
                      const lead = idx === 0 ? pinCell : '';

                      // Column: ID Column
                      if (cfg.field_key === 'id' || cfg.field_key === 'agent_id') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap font-mono text-[12px]`}>
                            {canWriteTracker ? (
                            <button
                              onClick={() => handleOpenEdit(ag)}
                              className="text-brand-700 dark:text-brand-400 hover:underline transition text-left cursor-pointer"
                            >
                              {String(rawVal || ag.id)}
                            </button>
                            ) : (
                            <span className="text-slate-800 dark:text-slate-100">{String(rawVal || ag.id)}</span>
                            )}
                          </td>
                        );
                      }

                      // Column: Agent Name Column
                      if (cfg.field_key === 'agent_name' || cfg.field_key === 'full_name') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap`}>
                            {canWriteTracker ? (
                            <button
                              onClick={() => handleOpenEdit(ag)}
                              className="font-medium text-slate-900 dark:text-white hover:text-brand-700 dark:hover:text-brand-400 hover:underline transition text-left cursor-pointer"
                            >
                              {String(rawVal || '—')}
                            </button>
                            ) : (
                            <span className="font-medium text-slate-900 dark:text-white">{String(rawVal || '—')}</span>
                            )}
                          </td>
                        );
                      }

                      // Status Badge Column
                      if (cfg.field_key === 'agent_status') {
                        const st = rawVal ? String(rawVal) : '';
                        const stLower = st.toLowerCase();
                        let badgeStyle = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
                        if (stLower === 'released' || stLower === 'inactive' || stLower === 'terminated') {
                          badgeStyle = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30';
                        } else if (stLower === 'pending' || stLower === 'onboarding') {
                          badgeStyle = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
                        } else if (!st) {
                          badgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700';
                        }
                        const canToggle = statusOptions.length >= 2;
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} text-center whitespace-nowrap`}>
                            {canWriteTracker ? (
                            <button
                              type="button"
                              onClick={() => toggleStatus(ag)}
                              disabled={!canToggle}
                              className={`${badgeSize} rounded-full text-[11px] font-semibold border transition ${canToggle ? 'cursor-pointer' : 'cursor-default'} ${badgeStyle}`}
                            >
                              {st || '—'}
                            </button>
                            ) : (
                            <span className={`${badgeSize} rounded-full text-[11px] font-semibold border ${badgeStyle}`}>
                              {st || '—'}
                            </span>
                            )}
                          </td>
                        );
                      }

                      // Group / Team Pill Badge Column
                      if (cfg.field_key === 'group_id' || cfg.field_key === 'group') {
                        if (!rawVal) {
                          return (
                            <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap text-slate-400 italic`}>
                              —
                            </td>
                          );
                        }

                        const groupStr = String(rawVal);
                        const badgeStyle = getGroupBadgeStyle(groupStr);

                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap`}>
                            <span
                              className={`${badgeSize} rounded-full text-[11px] font-semibold border ${badgeStyle}`}
                            >
                              {groupStr}
                            </span>
                          </td>
                        );
                      }

                      // Boolean Cell
                      if (cfg.field_type === 'BOOLEAN') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} text-center align-middle whitespace-nowrap`}>
                            <BooleanMark checked={isBooleanChecked(rawVal)} compact={compactRows} />
                          </td>
                        );
                      }

                      // Currency Cell
                      if (cfg.field_type === 'CURRENCY') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap text-right tabular-nums`}>
                            {formatCurrency(Number(rawVal) || 0)}
                          </td>
                        );
                      }

                      // Percent Cell
                      if (cfg.field_type === 'PERCENT') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap text-right tabular-nums`}>
                            {formatTablePercent(rawVal)}
                          </td>
                        );
                      }

                      // Number Cell
                      if (cfg.field_type === 'NUMBER') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap`}>
                            {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
                          </td>
                        );
                      }

                      // Date Cell
                      if (cfg.field_type === 'DATE') {
                        return (
                          <td key={cfg.field_key} className={`${lead} ${cellPad} text-center tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap`}>
                            {rawVal ? String(rawVal) : '—'}
                          </td>
                        );
                      }

                      // Standard Text Cell
                      return (
                        <td key={cfg.field_key} className={`${lead} ${cellPad} whitespace-nowrap`}>
                          <span className="text-slate-700 dark:text-slate-300">
                            {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
                          </span>
                        </td>
                      );
                    })}

                    {/* Actions Column */}
                    {canWriteTracker && (
                    <td className={`${cellPad} text-center whitespace-nowrap`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(ag)}
                          className={`inline-flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${compactRows ? 'h-4 w-4' : 'h-7 w-7'}`}
                          title="Edit"
                          aria-label={`Edit ${ag.agent_name || 'agent'}`}
                        >
                          <EditPencil className={compactRows ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(ag)}
                          className={`inline-flex items-center justify-center rounded text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer ${compactRows ? 'h-4 w-4' : 'h-7 w-7'}`}
                          title="Delete agent"
                          aria-label={`Delete ${ag.agent_name || 'agent'}`}
                        >
                          <TrashIcon className={compactRows ? 'h-3.5 w-3.5' : undefined} />
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DYNAMIC MODAL: ADD / EDIT AGENT */}
      {isModalOpen && (
        <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-xl rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingAgent ? `Edit profile: ${editingAgent.agent_name}` : 'Add new agent'}
              </h3>
              <button
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                tabIndex={-1}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {sections.map((secName) => {
                const secConfigs = activeConfigs.filter(
                  (c) => (c.section_name || 'Identity & Status') === secName
                );

                if (secConfigs.length === 0) return null;

                return (
                  <div key={secName} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 first:border-t-0 first:pt-0">
                    <h4 className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
                      {secName}
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      {secConfigs.map((cfg) => {
                        if (!isFieldVisible(cfg)) return null;

                        const val = formData[cfg.field_key] ?? '';
                        const isAgentName = cfg.field_key === 'agent_name' || cfg.field_key === 'full_name';

                        // System Primary ID Field
                        if (cfg.field_key === 'id' || cfg.field_key === 'agent_id') {
                          const idValue = String(val || editingAgent?.id || '');
                          return (
                            <div key={cfg.field_key} className="group/field relative underline-field is-locked rounded-t-md border-b border-b-slate-200 pl-2.5 pr-14 pt-1 pb-0.5 dark:border-b-slate-700">
                              <label className="block truncate text-[10px] leading-3 font-medium text-slate-400 dark:text-slate-500">
                                {cfg.field_label} (System Key)
                              </label>
                              <div className="flex h-5 items-center">
                                <input
                                  type="text"
                                  readOnly
                                  tabIndex={-1}
                                  value={idValue || 'Auto-generated'}
                                  className={`${underlineControl} cursor-default text-slate-400 dark:text-slate-500`}
                                />
                              </div>
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                LOCKED
                              </span>
                            </div>
                          );
                        }

                        // Boolean Input
                        if (cfg.field_type === 'BOOLEAN') {
                          return (
                            <div key={cfg.field_key} className="flex min-h-9 items-end self-end pb-0.5 pl-2.5">
                              <BooleanField
                                label={cfg.field_label}
                                required={cfg.is_required}
                                checked={isBooleanChecked(val)}
                                disabled={isSubmitting}
                                onChange={(checked) => setFormData({ ...formData, [cfg.field_key]: checked })}
                              />
                            </div>
                          );
                        }

                        // Select Dropdown
                        if (cfg.field_type === 'SELECT') {
                          return (
                            <div key={cfg.field_key} className={underlineShell}>
                              <label className={underlineLabel}>
                                {cfg.field_label}
                                {cfg.is_required && <span className="text-rose-500"> *</span>}
                              </label>
                              <div className="flex h-5 items-center">
                                <ClearableSelect
                                  required={cfg.is_required}
                                  disabled={isSubmitting}
                                  value={String(val)}
                                  onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                                  className={`${underlineControl} overview-field-select cursor-pointer`}
                                >
                                  {Array.from(new Set(cfg.dropdown_options || [])).map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </ClearableSelect>
                              </div>
                              <FieldChevron />
                            </div>
                          );
                        }

                        // Number / Currency / Percent Input
                        if (cfg.field_type === 'NUMBER' || cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT') {
                          return (
                            <div key={cfg.field_key} className={underlineShell}>
                              <label className={underlineLabel}>
                                {cfg.field_label}
                                {cfg.is_required && <span className="text-rose-500"> *</span>}
                              </label>
                              <div className="flex h-5 items-center">
                                {cfg.field_type === 'NUMBER' ? (
                                  <input
                                    type="number"
                                    step="any"
                                    required={cfg.is_required}
                                    disabled={isSubmitting}
                                    min={cfg.min_value}
                                    max={cfg.max_value}
                                    value={val !== undefined && val !== null ? val : ''}
                                    onChange={(e) =>
                                      setFormData({
                                        ...formData,
                                        [cfg.field_key]: e.target.value !== '' ? Number(e.target.value) : undefined,
                                      })
                                    }
                                    className={underlineControl}
                                  />
                                ) : (
                                  <AgentAmountInput
                                    kind={cfg.field_type}
                                    value={val}
                                    required={cfg.is_required}
                                    disabled={isSubmitting}
                                    onChange={(next) => setFormData({ ...formData, [cfg.field_key]: next })}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Date Input
                        if (cfg.field_type === 'DATE') {
                          return (
                            <div key={cfg.field_key} className={underlineShell}>
                              <label className={underlineLabel}>
                                {cfg.field_label}
                                {cfg.is_required && <span className="text-rose-500"> *</span>}
                              </label>
                              <div className="flex h-5 items-center">
                                <NativeDateInput
                                  required={cfg.is_required}
                                  disabled={isSubmitting}
                                  min={cfg.min_date}
                                  value={String(val)}
                                  onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                                  className={`${underlineControl} overview-date dark:[color-scheme:dark]`}
                                />
                              </div>
                              {!isSubmitting && <FieldCalendar label={cfg.field_label} />}
                            </div>
                          );
                        }

                        return (
                          <div key={cfg.field_key} className={underlineShell}>
                            <label className={underlineLabel}>
                              {cfg.field_label}
                              {cfg.is_required && <span className="text-rose-500"> *</span>}
                            </label>
                            <div className="flex h-5 items-center">
                              <input
                                ref={isAgentName ? agentNameInputRef : undefined}
                                type="text"
                                required={cfg.is_required}
                                disabled={isSubmitting}
                                maxLength={cfg.max_length}
                                value={String(val)}
                                onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                                className={underlineControl}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !agentDirty}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save agent</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmDialog}
      {pendingBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'agent' : 'agents'}?`}
          message={selectedIds.size === 1
            ? 'This removes the agent. An agent who is on a transaction stays on the roster.'
            : `This removes these ${selectedIds.size} agents. An agent who is on a transaction stays on the roster.`}
          error={bulkDeleteError}
          isPending={isBulkDeleting}
          onCancel={() => {
            if (!isBulkDeleting) setPendingBulkDelete(false);
          }}
          onConfirm={() => void confirmBulkDelete()}
        />
      )}
      {bulkDialogOpen && (
        <BulkUpdateDialog
          fields={fieldConfigs.filter((field) => isAgentBulkEditableField(field)).map((field) => ({
            field_key: field.field_key,
            field_label: field.field_label,
            field_type: field.field_type,
            storage_type: field.storage_type,
            is_enabled: field.is_enabled,
            is_required: field.is_required,
            dropdown_options: field.dropdown_options,
          }))}
          agents={agents.filter((agent) => agent.id).map((agent) => ({ id: String(agent.id), agent_name: agent.agent_name }))}
          selectedDeals={agents.filter((agent) => selectedIds.has(String(agent.id)))}
          selectedCount={selectedIds.size}
          isPending={isBulkUpdating}
          error={bulkError}
          recordNoun="agent"
          onCancel={() => {
            if (!isBulkUpdating) setBulkDialogOpen(false);
          }}
          onConfirm={(fieldKey, value) => void confirmBulkUpdate(fieldKey, value)}
        />
      )}
    </main>
  );
}