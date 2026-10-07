'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PERCENT_POINT_DECIMALS, formatPercentPoints, formatTablePercent, fromPercentPoints, toPercentPoints } from '@/lib/percent';
import { isHiddenRecordId } from '@/lib/fields';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { BooleanCheckbox, BooleanField, isBooleanChecked } from '@/components/ui/BooleanCheckbox';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { EditPencil } from '@/components/ui/edit-pencil';
import { TrashIcon } from '@/components/ui/trash-icon';

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
  'group/field relative underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
const underlineControl =
  'w-full border-0 bg-transparent p-0 h-5 text-xs leading-4 font-medium text-slate-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed dark:text-white';

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

const GROUP_COLOR_STYLES: Record<string, string> = {
  'group a': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  'group b': 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'group c': 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30',
  'group d': 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  'orange county': 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

const DYNAMIC_GROUP_PALETTES = [
  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30',
  'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30',
  'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30',
  'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30',
];

function getGroupBadgeStyle(groupName: string): string {
  if (!groupName) return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700';
  const clean = groupName.trim().toLowerCase();
  if (GROUP_COLOR_STYLES[clean]) {
    return GROUP_COLOR_STYLES[clean];
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DYNAMIC_GROUP_PALETTES.length;
  return DYNAMIC_GROUP_PALETTES[idx];
}

export default function AgentsSettingsPage() {
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null);
  const [formData, setFormData] = useState<Partial<AgentRecord>>({});

  // Client-side viewing: Quick search & column sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('agent_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Ref to target Agent Name input for auto-focusing
  const agentNameInputRef = useRef<HTMLInputElement>(null);

  const loadLiveSchema = async () => {
    try {
      const res = await fetch('/api/schema/agents', {
        headers: { 'x-client-id': 'DEMO' },
      });
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
      const res = await fetch('/api/agents', {
        headers: { 'x-client-id': 'DEMO' },
      });
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

  const activeConfigs = fieldConfigs
    .filter((f) => f.is_enabled && !isHiddenRecordId('agents', f.field_key))
    .sort((a, b) => {
      if (a.section_sort_order !== b.section_sort_order) {
        return a.section_sort_order - b.section_sort_order;
      }
      return a.sort_order - b.sort_order;
    });

  const handleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortOrder('asc');
    }
  };

  const processedAgents = useMemo(() => {
    let result = [...agents];

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
  }, [agents, searchQuery, sortField, sortOrder]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agent_name || isSubmitting) return;

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
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save changes to the database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = fieldConfigs.find((cfg) => cfg.field_key === 'agent_status')?.dropdown_options?.filter(Boolean) ?? [];

  const toggleStatus = async (agent: AgentRecord) => {
    if (statusOptions.length < 2) return;
    const current = String(agent.agent_status || '');
    const currentIndex = statusOptions.findIndex((option) => option.toLowerCase() === current.toLowerCase());
    const nextStatus = statusOptions[(currentIndex + 1) % statusOptions.length];
    const actionLabel = `set the status to ${nextStatus}`;

    if (!confirm(`Are you sure you want to ${actionLabel} "${agent.agent_name}"?`)) {
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
      alert('Failed to update agent status.');
    }
  };

  const handleDelete = async (agent: AgentRecord) => {
    if (agent.has_transactions) {
      alert(
        `Cannot delete "${agent.agent_name}" because they have active or historical transactions attached. You can change their status instead.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete "${agent.agent_name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(agent.id)}&client_id=DEMO`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete agent');

      await loadLiveAgents();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete agent.');
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

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Agent Roster Management
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Database Table: <code className="font-mono text-emerald-600 dark:text-emerald-400">agents</code>
            {!isLoading && (
              <span className="ml-1 text-slate-400">
                • Showing {processedAgents.length} of {agents.length} Agents
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {/* Quick Search */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all fields..."
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>+ Add New Agent</span>
          </button>
        </div>
      </div>

      {/* Agents Roster Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase border-b border-slate-200 dark:border-slate-700 select-none">
              <tr>
                {activeConfigs.map((cfg) => (
                  <th
                    key={cfg.field_key}
                    onClick={() => handleSort(cfg.field_key)}
                    className={`p-3.5 whitespace-nowrap cursor-pointer hover:text-slate-900 dark:hover:text-white transition group ${cfg.field_type === 'BOOLEAN' || cfg.field_type === 'DATE' ? 'text-center' : ''} ${cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT' ? 'text-right' : ''}`}
                  >
                    <div className={`flex items-center gap-1.5 ${cfg.field_type === 'BOOLEAN' || cfg.field_type === 'DATE' ? 'justify-center' : ''} ${cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT' ? 'justify-end' : ''}`}>
                      <span>{cfg.field_label}</span>
                      <span className="text-slate-400 dark:text-slate-600 group-hover:opacity-100 transition">
                        {sortField === cfg.field_key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="p-3.5 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 font-medium text-slate-800 dark:text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={activeConfigs.length + 1} className="p-5 text-center text-slate-400">
                    Loading agent roster...
                  </td>
                </tr>
              ) : processedAgents.length === 0 ? (
                <tr>
                  <td colSpan={activeConfigs.length + 1} className="p-5 text-center text-slate-400 italic">
                    {searchQuery ? `No matching agents found for "${searchQuery}".` : 'No agents found.'}
                  </td>
                </tr>
              ) : (
                processedAgents.map((ag) => (
                  <tr key={ag.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                    {activeConfigs.map((cfg, idx) => {
                      const rawVal = ag[cfg.field_key] ?? (cfg.field_key === 'id' ? ag.id : undefined);

                      // Column: ID Column
                      if (cfg.field_key === 'id' || cfg.field_key === 'agent_id') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap font-bold">
                            <button
                              onClick={() => handleOpenEdit(ag)}
                              className="text-emerald-600 dark:text-emerald-400 hover:underline transition text-left cursor-pointer"
                            >
                              {String(rawVal || ag.id)}
                            </button>
                          </td>
                        );
                      }

                      // Column: Agent Name Column
                      if (cfg.field_key === 'agent_name' || cfg.field_key === 'full_name') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEdit(ag)}
                              className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition text-left cursor-pointer"
                            >
                              {String(rawVal || '—')}
                            </button>
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
                          <td key={cfg.field_key} className="p-3.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleStatus(ag)}
                              disabled={!canToggle}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider transition ${canToggle ? 'cursor-pointer' : 'cursor-default'} ${badgeStyle}`}
                            >
                              {st || '—'}
                            </button>
                          </td>
                        );
                      }

                      // Group / Team Pill Badge Column
                      if (cfg.field_key === 'group_id' || cfg.field_key === 'group') {
                        if (!rawVal) {
                          return (
                            <td key={cfg.field_key} className="p-3.5 whitespace-nowrap text-slate-400 italic">
                              —
                            </td>
                          );
                        }

                        const groupStr = String(rawVal);
                        const badgeStyle = getGroupBadgeStyle(groupStr);

                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider inline-block ${badgeStyle}`}
                            >
                              {groupStr}
                            </span>
                          </td>
                        );
                      }

                      // Boolean Cell
                      if (cfg.field_type === 'BOOLEAN') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 text-center align-middle whitespace-nowrap">
                            <BooleanCheckbox checked={isBooleanChecked(rawVal)} disabled />
                          </td>
                        );
                      }

                      // Currency Cell
                      if (cfg.field_type === 'CURRENCY') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap text-right tabular-nums">
                            {formatCurrency(Number(rawVal) || 0)}
                          </td>
                        );
                      }

                      // Percent Cell
                      if (cfg.field_type === 'PERCENT') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap text-right tabular-nums">
                            {formatTablePercent(rawVal)}
                          </td>
                        );
                      }

                      // Number Cell
                      if (cfg.field_type === 'NUMBER') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap">
                            {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
                          </td>
                        );
                      }

                      // Date Cell
                      if (cfg.field_type === 'DATE') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 text-center tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {rawVal ? String(rawVal) : '—'}
                          </td>
                        );
                      }

                      // Standard Text Cell
                      return (
                        <td key={cfg.field_key} className="p-3.5 whitespace-nowrap">
                          <span className="text-slate-700 dark:text-slate-300">
                            {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
                          </span>
                        </td>
                      );
                    })}

                    {/* Actions Column */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(ag)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                          title="Edit"
                          aria-label={`Edit ${ag.agent_name || 'agent'}`}
                        >
                          <EditPencil className="h-[18px] w-[18px]" />
                        </button>

                        <button
                          onClick={() => handleDelete(ag)}
                          className="text-rose-500 hover:text-rose-600 font-bold p-1 rounded hover:bg-rose-500/10 cursor-pointer"
                          title="Delete agent"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DYNAMIC MODAL: ADD / EDIT AGENT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-xl rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingAgent ? `Edit Profile: ${editingAgent.agent_name}` : 'Add New Agent'}
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
                    <h4 className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
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
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Agent</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}