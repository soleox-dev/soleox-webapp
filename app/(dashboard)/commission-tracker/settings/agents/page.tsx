'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatPercent } from '@/lib/fields';

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
  id: string;
  agent_name: string;
  agent_email: string;
  agent_status: string;
  group_id?: string;
  phone?: string;
  office_location?: string;
  license_type?: string;
  is_team_lead?: boolean;
  broker_cap_limit?: number;
  broker_cap_paid_ytd?: number;
  anniversary_date?: string;
  has_transactions?: boolean;
  [key: string]: any;
}

const DEFAULT_AGENT_FIELDS: FieldConfig[] = [
  { id: 'CFG_AG_ID', client_id: 'DEMO', target_table: 'agents', field_key: 'id', storage_type: 'CORE_COLUMN', section_name: 'Identity & Status', section_sort_order: 1, sort_order: 1, field_label: 'Agent ID', field_type: 'TEXT', is_required: true, is_system: true, is_enabled: true, max_length: 50 },
  { id: 'CFG_AG_NAME', client_id: 'DEMO', target_table: 'agents', field_key: 'agent_name', storage_type: 'CORE_COLUMN', section_name: 'Identity & Status', section_sort_order: 1, sort_order: 2, field_label: 'Agent Name', field_type: 'TEXT', is_required: true, is_system: true, is_enabled: true, max_length: 100 },
  { id: 'CFG_AG_STATUS', client_id: 'DEMO', target_table: 'agents', field_key: 'agent_status', storage_type: 'CORE_COLUMN', section_name: 'Identity & Status', section_sort_order: 1, sort_order: 3, field_label: 'Status', field_type: 'SELECT', is_required: true, is_system: true, is_enabled: true, dropdown_options: ['Active', 'Released'] },
  { id: 'CFG_AG_GROUP', client_id: 'DEMO', target_table: 'agents', field_key: 'group_id', storage_type: 'CORE_COLUMN', section_name: 'Identity & Status', section_sort_order: 1, sort_order: 4, field_label: 'Group / Team', field_type: 'SELECT', is_required: false, is_system: true, is_enabled: true, dropdown_options: ['Springfield Team', 'Miami Coastal', 'Enterprise'] },
  { id: 'CFG_AG_EMAIL', client_id: 'DEMO', target_table: 'agents', field_key: 'agent_email', storage_type: 'CORE_COLUMN', section_name: 'Identity & Status', section_sort_order: 1, sort_order: 5, field_label: 'Email Address', field_type: 'TEXT', is_required: true, is_system: true, is_enabled: true, max_length: 150 },
];

const GROUP_COLOR_STYLES: Record<string, string> = {
  'group a': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  'group b': 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  'group c': 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30',
  'group d': 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  'springfield team': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30',
  'miami coastal': 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
  'enterprise': 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/30',
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
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>(DEFAULT_AGENT_FIELDS);
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
      if (data.catalog && Array.isArray(data.catalog) && data.catalog.length > 0) {
        setFieldConfigs(data.catalog);
      } else {
        const savedConfigs = localStorage.getItem('soleox_field_cfg_agents');
        if (savedConfigs) {
          const parsed = JSON.parse(savedConfigs);
          if (Array.isArray(parsed) && parsed.length > 0) setFieldConfigs(parsed);
        }
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
    .filter((f) => f.is_enabled || f.field_key === 'id' || f.field_key === 'agent_id')
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

      if (aVal === undefined && a.commission_attributes?.[sortField] !== undefined) {
        aVal = a.commission_attributes[sortField];
      }
      if (bVal === undefined && b.commission_attributes?.[sortField] !== undefined) {
        bVal = b.commission_attributes[sortField];
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
      id: `[DEMO] AG000${Math.floor(100 + Math.random() * 900)}`,
      agent_status: 'Active',
      is_team_lead: false,
      broker_cap_limit: 8000,
      broker_cap_paid_ytd: 0,
      anniversary_date: '2026-01-01',
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
      id: formData.id || `[DEMO] AG000${Math.floor(100 + Math.random() * 900)}`,
      agent_name: formData.agent_name || '',
      agent_email: formData.agent_email || '',
      agent_status: formData.agent_status || 'Active',
      ...formData,
    };

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

  const toggleStatus = async (agent: AgentRecord) => {
    const nextStatus = agent.agent_status === 'Active' ? 'Released' : 'Active';
    const actionLabel = nextStatus === 'Active' ? 'activate' : 'release';

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
        `Cannot delete "${agent.agent_name}" because they have active or historical transactions attached. You can set their status to Released instead.`
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
                    className="p-3.5 whitespace-nowrap cursor-pointer hover:text-slate-900 dark:hover:text-white transition group"
                  >
                    <div className="flex items-center gap-1.5">
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
                        const st = String(rawVal || 'Active');
                        const stLower = st.toLowerCase();
                        let badgeStyle = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
                        if (stLower === 'released' || stLower === 'inactive' || stLower === 'terminated') {
                          badgeStyle = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30';
                        } else if (stLower === 'pending' || stLower === 'onboarding') {
                          badgeStyle = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
                        }
                        return (
                          <td key={cfg.field_key} className="p-3.5 text-center whitespace-nowrap">
                            <button
                              onClick={() => toggleStatus(ag)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider transition cursor-pointer ${badgeStyle}`}
                            >
                              {st}
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
                          <td key={cfg.field_key} className="p-3.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                Boolean(rawVal)
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {Boolean(rawVal) ? 'Yes' : 'No'}
                            </span>
                          </td>
                        );
                      }

                      // Currency Cell
                      if (cfg.field_type === 'CURRENCY') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 font-mono whitespace-nowrap">
                            {formatCurrency(Number(rawVal) || 0)}
                          </td>
                        );
                      }

                      // Percent Cell
                      if (cfg.field_type === 'PERCENT') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 font-mono whitespace-nowrap">
                            {formatPercent(rawVal)}
                          </td>
                        );
                      }

                      // Number Cell
                      if (cfg.field_type === 'NUMBER') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 font-mono whitespace-nowrap">
                            {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
                          </td>
                        );
                      }

                      // Date Cell
                      if (cfg.field_type === 'DATE') {
                        return (
                          <td key={cfg.field_key} className="p-3.5 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
                          onClick={() => handleOpenEdit(ag)}
                          className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded font-bold transition cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(ag)}
                          className="text-rose-500 hover:text-rose-600 font-bold p-1 rounded hover:bg-rose-500/10 cursor-pointer"
                          title="Delete agent"
                        >
                          🗑️
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
                          return (
                            <div key={cfg.field_key}>
                              <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                                {cfg.field_label} (System Key)
                              </label>
                              <input
                                type="text"
                                disabled
                                tabIndex={-1}
                                value={String(val || editingAgent?.id || 'Auto-generated')}
                                className="w-full bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-500 font-mono text-xs cursor-not-allowed"
                              />
                            </div>
                          );
                        }

                        // Boolean Input
                        if (cfg.field_type === 'BOOLEAN') {
                          return (
                            <div key={cfg.field_key} className="col-span-2 pt-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={isSubmitting}
                                  checked={Boolean(val)}
                                  onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.checked })}
                                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
                                />
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {cfg.field_label} {cfg.is_required && '*'}
                                </span>
                              </label>
                            </div>
                          );
                        }

                        // Select Dropdown
                        if (cfg.field_type === 'SELECT') {
                          return (
                            <div key={cfg.field_key}>
                              <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                                {cfg.field_label} {cfg.is_required && '*'}
                              </label>
                              <select
                                required={cfg.is_required}
                                disabled={isSubmitting}
                                value={String(val)}
                                onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                              >
                                {(cfg.dropdown_options || []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        // Number / Currency / Percent Input
                        if (cfg.field_type === 'NUMBER' || cfg.field_type === 'CURRENCY' || cfg.field_type === 'PERCENT') {
                          return (
                            <div key={cfg.field_key}>
                              <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                                {cfg.field_label} ({cfg.field_type === 'CURRENCY' ? '$' : cfg.field_type === 'PERCENT' ? '%' : '#'}) {cfg.is_required && '*'}
                              </label>
                              <input
                                type="number"
                                step="any"
                                required={cfg.is_required}
                                disabled={isSubmitting}
                                min={cfg.min_value}
                                max={cfg.max_value}
                                value={val !== undefined ? val : ''}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    [cfg.field_key]: e.target.value !== '' ? Number(e.target.value) : undefined,
                                  })
                                }
                                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                              />
                            </div>
                          );
                        }

                        // Date Input
                        if (cfg.field_type === 'DATE') {
                          return (
                            <div key={cfg.field_key}>
                              <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                                {cfg.field_label} {cfg.is_required && '*'}
                              </label>
                              <input
                                type="date"
                                required={cfg.is_required}
                                disabled={isSubmitting}
                                min={cfg.min_date}
                                value={String(val)}
                                onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                              />
                            </div>
                          );
                        }

                        // Standard Text Input (With auto-focus ref attached to Agent Name)
                        return (
                          <div key={cfg.field_key}>
                            <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                              {cfg.field_label} {cfg.is_required && '*'}
                            </label>
                            <input
                              ref={isAgentName ? agentNameInputRef : undefined}
                              type="text"
                              required={cfg.is_required}
                              disabled={isSubmitting}
                              maxLength={cfg.max_length}
                              value={String(val)}
                              onChange={(e) => setFormData({ ...formData, [cfg.field_key]: e.target.value })}
                              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                            />
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