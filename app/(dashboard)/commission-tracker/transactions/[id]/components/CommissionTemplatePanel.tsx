'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Zap } from 'lucide-react';
import { evaluateFormula, formulaValueToInput, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { normalizeAgentName } from '@/lib/id';
import { applyTemplateLogic, type AppliedTemplateRules, type TemplateLogicStep } from './applyTemplateLogic';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { NativeDateInput } from '@/components/ui/NativeDateInput';

interface TemplateOption {
  id: string;
  template_name: string;
}

interface TemplateParameter {
  id: string;
  parameter_name: string;
  parameter_key: string;
  data_type?: string | null;
  autofill_formula?: string | null;
  is_user_editable?: boolean | null;
  sort_order?: number | null;
  section?: string | null;
  dropdown_options?: string[] | null;
}

interface AgentOption {
  id: string;
  name: string;
  isTeamLead?: boolean;
}

interface ParameterDefault {
  parameter: TemplateParameter;
  raw: string;
}

function readDealValue(deal: Record<string, unknown> | null, key: string): unknown {
  if (!deal) return undefined;
  const direct = deal[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  let attributes = deal.custom_attributes;
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes);
    } catch {
      attributes = undefined;
    }
  }
  if (attributes && typeof attributes === 'object') {
    const custom = (attributes as Record<string, unknown>)[key];
    if (custom !== undefined && custom !== null && custom !== '') return custom;
  }
  return undefined;
}

function formatMoney(value: string): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function displayValue(dataType: string | null | undefined, raw: string): string {
  if (!raw) return 'Blank';
  if (dataType === 'CURRENCY') return formatMoney(raw);
  if (dataType === 'PERCENT') return raw.endsWith('%') ? raw : `${raw}%`;
  return raw;
}

type ParameterControlType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

const valueControl =
  'w-full bg-transparent border-0 p-0 h-5 text-xs leading-4 focus:outline-none focus:ring-0';

function controlClass(locked: boolean, select = false): string {
  if (select) return `${valueControl} overview-field-select cursor-pointer font-medium text-slate-900 dark:text-white`;
  if (locked) return `parameter-locked ${valueControl} cursor-default font-medium text-slate-400 dark:text-slate-500`;
  return `${valueControl} font-medium text-slate-900 dark:text-white`;
}

function LabeledParameter({
  id,
  label,
  locked,
  changed,
  showChevron,
  mirror,
  onReset,
  children,
}: {
  id: string;
  label: string;
  locked: boolean;
  changed: boolean;
  showChevron: boolean;
  mirror?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const labelTone = locked
    ? 'text-slate-400 dark:text-slate-500'
    : 'text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
  const shellBorder = locked
    ? 'border-b-slate-200 dark:border-b-slate-700'
    : 'border-b-slate-300 dark:border-b-slate-600 focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]';

  return (
    <div className={`group/field relative underline-field rounded-t-md pl-2.5 pr-2.5 pt-1 pb-0.5 border-b transition-colors ${locked ? 'is-locked' : ''} ${changed ? 'is-changed' : ''} ${shellBorder}`}>
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className={`min-w-0 truncate text-[10px] leading-3 font-medium ${labelTone}`}>
          {label}
        </label>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${label} to default`}
            title="Reset to default"
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-amber-600/80 transition hover:text-emerald-600 dark:text-amber-300/80 dark:hover:text-emerald-400 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex h-5 items-center">
        {children ?? (
          <span className={`truncate text-xs leading-4 font-medium ${locked ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
            {mirror}
          </span>
        )}
      </div>
      {showChevron && (
        <svg
          viewBox="0 0 10 6"
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
        >
          <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function canonicalParameterType(value?: string | null): ParameterControlType {
  if (value === 'AGENT') return 'AGENT_PICKER';
  if (value === 'YES_NO') return 'BOOLEAN';
  if (
    value === 'TEXT' ||
    value === 'NUMBER' ||
    value === 'CURRENCY' ||
    value === 'PERCENT' ||
    value === 'DATE' ||
    value === 'SELECT' ||
    value === 'AGENT_PICKER' ||
    value === 'BOOLEAN'
  ) {
    return value;
  }
  return 'CURRENCY';
}

function numericCore(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const core = trimmed.replace(/[$,]/g, '').replace(/%$/, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(core)) return null;
  return core;
}

function formatCommitted(kind: 'CURRENCY' | 'PERCENT' | 'NUMBER', core: string): string {
  if (!core) return '';
  const amount = Number(core);
  if (!Number.isFinite(amount)) return '';
  if (kind === 'CURRENCY') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  const clean = Number(Math.round(Number(amount + 'e8')) + 'e-8');
  return kind === 'PERCENT' ? `${clean}%` : String(clean);
}

function parameterValuesMatch(
  parameter: TemplateParameter,
  current: string,
  fallback: string,
  agents: AgentOption[],
): boolean {
  const control = canonicalParameterType(parameter.data_type);
  const left = current.trim();
  const right = fallback.trim();
  if (control === 'CURRENCY' || control === 'PERCENT' || control === 'NUMBER') {
    const leftCore = numericCore(left);
    const rightCore = numericCore(right);
    if (leftCore !== null && rightCore !== null) return Number(leftCore) === Number(rightCore);
    return left === right;
  }
  if (control === 'AGENT_PICKER') {
    const agentName = (value: string) => {
      const agent = agents.find((item) => (
        item.id === value ||
        item.name === value ||
        normalizeAgentName(item.name).toLowerCase() === normalizeAgentName(value).toLowerCase()
      ));
      return (agent?.name || value).trim().toLowerCase();
    };
    return agentName(left) === agentName(right);
  }
  if (control === 'DATE') return left.slice(0, 10) === right.slice(0, 10);
  return left === right;
}

function NumericParameterInput({
  id,
  kind,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  kind: 'CURRENCY' | 'PERCENT' | 'NUMBER';
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const core = numericCore(value);
  const shown = core === null ? value : formatCommitted(kind, core);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(core ?? value);

  useEffect(() => {
    if (!focused) setDraft(core ?? value);
  }, [focused, core, value]);

  return (
    <input
      id={id}
      inputMode="decimal"
      readOnly={readOnly}
      value={focused ? draft : shown}
      onFocus={() => {
        setDraft(core ?? value);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        if (readOnly) return;
        const nextCore = numericCore(draft);
        if (nextCore === null) {
          setDraft(core ?? value);
          return;
        }
        const next = formatCommitted(kind, nextCore);
        if (next !== value) onChange(next);
      }}
      onChange={(event) => {
        if (readOnly) return;
        let raw = event.target.value.replace(/[$,%\s]/g, '');
        if (kind === 'CURRENCY' && raw.includes('.')) {
          const [integer, decimals] = raw.split('.');
          if (decimals && decimals.length > 2) raw = `${integer}.${decimals.slice(0, 2)}`;
        }
        if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) setDraft(raw);
      }}
      className={`${controlClass(readOnly)} text-left`}
    />
  );
}

function ParameterControl({
  parameter,
  value,
  agents,
  onChange,
  onReset,
}: {
  parameter: TemplateParameter;
  value: string;
  agents: AgentOption[];
  onChange: (next: string) => void;
  onReset?: () => void;
}) {
  const control = canonicalParameterType(parameter.data_type);
  const locked = parameter.is_user_editable === false;
  const id = `template-parameter-${parameter.id}`;
  const isSelect = control === 'SELECT' || control === 'AGENT_PICKER' || control === 'BOOLEAN';
  let field: React.ReactNode = null;

  if (locked && isSelect) {
    field = null;
  } else if (control === 'SELECT') {
    const options = parameter.dropdown_options || [];
    const selectOptions = value && !options.includes(value) ? [value, ...options] : options;
    field = (
      <ClearableSelect id={id} value={value} disabled={locked} onChange={(event) => onChange(event.target.value)} className={controlClass(locked, true)}>
        {selectOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </ClearableSelect>
    );
  } else if (control === 'AGENT_PICKER') {
    const matched = agents.find((agent) => (
      agent.id === value ||
      agent.name === value ||
      normalizeAgentName(agent.name).toLowerCase() === normalizeAgentName(value).toLowerCase()
    ));
    const choices = matched || !value ? agents : [{ id: value, name: value }, ...agents];
    field = (
      <ClearableSelect
        id={id}
        value={matched?.id || (value ? value : '')}
        disabled={locked}
        onChange={(event) => {
          const agent = choices.find((item) => item.id === event.target.value);
          onChange(agent?.name || '');
        }}
        className={controlClass(false, true)}
      >
        {choices.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}{agent.isTeamLead ? ' (Team Lead)' : ''}
          </option>
        ))}
      </ClearableSelect>
    );
  } else if (control === 'BOOLEAN') {
    const yesNo = value === 'Yes' || value === 'No' ? value : '';
    field = (
      <ClearableSelect id={id} value={yesNo} disabled={locked} onChange={(event) => onChange(event.target.value)} className={controlClass(locked, true)}>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </ClearableSelect>
    );
  } else if (control === 'DATE') {
    const date = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
    field = (
      <NativeDateInput id={id} value={date} disabled={locked} onChange={(event) => onChange(event.target.value)} className={`${controlClass(locked)} dark:[color-scheme:dark]`} />
    );
  } else if (control === 'CURRENCY' || control === 'PERCENT' || control === 'NUMBER') {
    field = <NumericParameterInput id={id} kind={control} value={value} readOnly={locked} onChange={onChange} />;
  } else {
    field = (
      <input id={id} value={value} readOnly={locked} onChange={(event) => onChange(event.target.value)} className={controlClass(locked)} />
    );
  }

  return (
    <LabeledParameter id={id} label={parameter.parameter_name} locked={locked} changed={Boolean(onReset)} showChevron={isSelect && !locked} mirror={isSelect ? value : undefined} onReset={onReset}>
      {field}
    </LabeledParameter>
  );
}

function defaultFromFormula(
  formula: string,
  dataType: string | null | undefined,
  deal: Record<string, unknown> | null,
  agents: AgentOption[],
  resolved: Record<string, string>,
): { display: string; pending: boolean; raw: string } {
  const body = formula.trim().replace(/^=/, '').trim();
  if (!body || body === '""') return { display: 'Blank', pending: false, raw: '' };
  if ((body.startsWith('"') && body.endsWith('"') && body.length >= 2 && !body.slice(1, -1).includes('"'))) {
    const text = body.slice(1, -1);
    return { display: text || 'Blank', pending: false, raw: text };
  }
  if (/^(true|false)$/i.test(body)) {
    const text = body.toLowerCase() === 'true' ? 'Yes' : 'No';
    return { display: text, pending: false, raw: text };
  }
  const number = body.match(/^(\d+(?:\.\d+)?)(%)?$/);
  if (number) {
    const raw = number[1];
    return { display: displayValue(number[2] ? 'PERCENT' : dataType, raw), pending: false, raw };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(body)) {
    const key = body.toLowerCase();
    if (resolved[key] !== undefined) {
      const raw = resolved[key];
      return { display: displayValue(dataType, raw), pending: false, raw };
    }
    if (key === 'agent_id' || key === 'primary_agent') {
      const id = String(readDealValue(deal, 'agent_id') || readDealValue(deal, 'primary_agent') || '');
      const agent = agents.find((item) => item.id === id || item.name === id);
      const raw = agent?.name || id;
      return { display: raw || 'Blank', pending: false, raw };
    }
    const field = readDealValue(deal, key);
    const raw = field === undefined || field === null ? '' : String(field);
    return { display: displayValue(dataType, raw), pending: false, raw };
  }

  const valueFromDeal = (name: string): FormulaValue => {
    const key = name.toLowerCase();
    if (resolved[key] !== undefined) {
      const stored = resolved[key];
      if (!stored) return { type: 'blank' };
      if (stored === 'Yes') return { type: 'boolean', value: true };
      if (stored === 'No') return { type: 'boolean', value: false };
      if (stored.endsWith('%')) {
        const amount = Number(stored.slice(0, -1).replace(/,/g, ''));
        return Number.isFinite(amount) ? { type: 'percent', value: amount / 100 } : { type: 'text', value: stored };
      }
      const numeric = Number(String(stored).replace(/[$,]/g, ''));
      if (stored.trim() !== '' && Number.isFinite(numeric) && /^-?\$?[\d,]+(?:\.\d+)?$/.test(stored.trim())) {
        return { type: 'number', value: numeric };
      }
      return { type: 'text', value: stored };
    }
    if (key === 'agent_id' || key === 'primary_agent') {
      const id = String(readDealValue(deal, 'agent_id') || readDealValue(deal, 'primary_agent') || '');
      const agent = agents.find((item) => item.id === id || item.name === id);
      const nameText = agent?.name || id;
      return nameText ? { type: 'text', value: nameText } : { type: 'blank' };
    }
    const field = readDealValue(deal, key);
    if (field === undefined || field === null || field === '') return { type: 'blank' };
    if (typeof field === 'number') return { type: 'number', value: field };
    if (typeof field === 'boolean') return { type: 'boolean', value: field };
    const text = String(field).trim();
    const numeric = Number(text.replace(/[$,]/g, ''));
    if (text !== '' && Number.isFinite(numeric) && /^-?\$?[\d,]+(?:\.\d+)?%?$/.test(text)) {
      return text.endsWith('%') ? { type: 'percent', value: numeric / 100 } : { type: 'number', value: numeric };
    }
    return { type: 'text', value: String(field) };
  };

  const evaluated = evaluateFormula(body, valueFromDeal, agents);
  if (!evaluated || evaluated.type === 'error') return { display: 'Not calculated yet', pending: true, raw: '' };
  const raw = formulaValueToInput(evaluated, dataType);
  return { display: raw || 'Blank', pending: false, raw };
}

function resolveDefaults(
  parameters: TemplateParameter[],
  deal: Record<string, unknown> | null,
  agents: AgentOption[],
): ParameterDefault[] {
  const ordered = [...parameters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const resolved: Record<string, string> = {};
  return ordered.map((parameter) => {
    const result = defaultFromFormula(parameter.autofill_formula || '', parameter.data_type, deal, agents, resolved);
    if (!result.pending) resolved[parameter.parameter_key.toLowerCase()] = result.raw;
    return { parameter, raw: result.pending ? '' : result.raw };
  });
}

function parameterRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    record[key] = raw === undefined || raw === null ? '' : String(raw);
  }
  return record;
}

function savedParameterValue(saved: Record<string, string>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(saved, key)) return saved[key];
  const match = Object.keys(saved).find((item) => item.toLowerCase() === key.toLowerCase());
  return match === undefined ? undefined : saved[match];
}

function groupedParameterRows(rows: ParameterDefault[]): { name: string; rows: ParameterDefault[] }[] {
  const groups: { name: string; rows: ParameterDefault[] }[] = [];
  for (const row of rows) {
    const name = row.parameter.section?.trim() || 'No Section';
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.rows.push(row);
    else groups.push({ name, rows: [row] });
  }
  return groups.sort((a, b) => Number(a.name === 'No Section') - Number(b.name === 'No Section'));
}

export function CommissionTemplatePanel({
  clientId,
  transactionId,
  deal,
  agents,
  dealAgents = [],
  entities = [],
  totalCommission = 0,
  onApplied,
  embedded = false,
}: {
  clientId: string;
  transactionId: string;
  deal: Record<string, unknown> | null;
  agents: AgentOption[];
  dealAgents?: AgentOption[];
  entities?: { id: string; name: string }[];
  totalCommission?: number;
  onApplied?: (applied: AppliedTemplateRules) => void;
  embedded?: boolean;
}) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [committedTemplateId, setCommittedTemplateId] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submittedTemplateId, setSubmittedTemplateId] = useState('');
  const [submittedParameters, setSubmittedParameters] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftTemplateId, setDraftTemplateId] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingParameters, setIsLoadingParameters] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templateFieldRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLUListElement>(null);
  const [templateMenuBox, setTemplateMenuBox] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      setLoadError('');
      try {
        const response = await fetch(`/api/commission-templates?client_id=${encodeURIComponent(clientId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load templates.');
        if (!cancelled) setTemplates((data.templates || []) as TemplateOption[]);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load templates.');
      } finally {
        if (!cancelled) setIsLoadingTemplates(false);
      }
    };
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!transactionId) {
      setCommittedTemplateId('');
      setSubmissionId(null);
      setSubmittedTemplateId('');
      setSubmittedParameters({});
      return;
    }
    let cancelled = false;
    const loadSubmission = async () => {
      try {
        const response = await fetch(`/api/commission-template-submissions?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`);
        const data = await response.json();
        if (!response.ok || !data.success || cancelled) return;
        const submitted = (data.submissions || [])[0];
        setCommittedTemplateId(submitted?.template_id || '');
        setSubmissionId(submitted?.id || null);
        setSubmittedTemplateId(submitted?.template_id || '');
        setSubmittedParameters(parameterRecord(submitted?.submitted_parameters));
      } catch {
        if (!cancelled) {
          setCommittedTemplateId('');
          setSubmissionId(null);
          setSubmittedTemplateId('');
          setSubmittedParameters({});
        }
      }
    };
    void loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [clientId, transactionId]);

  useEffect(() => {
    if (!popupOpen || !draftTemplateId) {
      setParameters([]);
      return;
    }
    let cancelled = false;
    const loadParameters = async () => {
      setIsLoadingParameters(true);
      setLoadError('');
      try {
        const response = await fetch(`/api/commission-template-parameters?template_id=${encodeURIComponent(draftTemplateId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load parameters.');
        if (!cancelled) setParameters(data.parameters || []);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load parameters.');
      } finally {
        if (!cancelled) setIsLoadingParameters(false);
      }
    };
    void loadParameters();
    return () => {
      cancelled = true;
    };
  }, [popupOpen, draftTemplateId]);

  const rows = useMemo(() => resolveDefaults(parameters, deal, agents), [parameters, deal, agents]);
  const groups = useMemo(() => groupedParameterRows(rows), [rows]);
  const uniqueAgents = useMemo(() => {
    const seen = new Set<string>();
    const list: AgentOption[] = [];
    for (const agent of agents) {
      const norm = normalizeAgentName(agent.name || '').trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      list.push(agent);
    }
    return list;
  }, [agents]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const useSubmission = draftTemplateId === submittedTemplateId;
    const next: Record<string, string> = {};
    for (const row of rows) {
      const saved = useSubmission ? savedParameterValue(submittedParameters, row.parameter.parameter_key) : undefined;
      next[row.parameter.id] = saved !== undefined ? saved : row.raw;
    }
    setValues(next);
  }, [rows, draftTemplateId, submittedTemplateId, submittedParameters]);

  useEffect(() => {
    setActiveGroup('');
    setCollapsedSections({});
  }, [draftTemplateId]);

  const toggleSection = (name: string) => {
    setCollapsedSections((current) => ({ ...current, [name]: !current[name] }));
  };

  const closePopup = () => {
    setPopupOpen(false);
    setDraftTemplateId('');
  };

  const submitTemplate = async () => {
    if (!draftTemplateId || !transactionId || isSubmitting) return;
    setIsSubmitting(true);
    setLoadError('');
    try {
      const parameterValues: Record<string, string> = {};
      for (const parameter of parameters) {
        parameterValues[parameter.parameter_key] = values[parameter.id] ?? '';
      }

      const logicResponse = await fetch(`/api/commission-template-logic?template_id=${encodeURIComponent(draftTemplateId)}`);
      const logicData = await logicResponse.json();
      if (!logicResponse.ok || !logicData.success) throw new Error(logicData.error || 'Failed to load template logic.');

      const applied = applyTemplateLogic({
        steps: (logicData.logic_steps || []) as TemplateLogicStep[],
        parameters: parameterValues,
        deal,
        entities,
        rosterAgents: agents,
        dealAgents,
        totalCommission,
      });

      const response = await fetch('/api/commission-template-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission: {
            ...(submissionId ? { id: submissionId } : {}),
            client_id: clientId,
            transaction_id: transactionId,
            template_id: draftTemplateId,
            submitted_parameters: parameterValues,
            status: 'SUBMITTED',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to submit the template.');

      setSubmissionId(data.submission?.id || submissionId);
      setCommittedTemplateId(draftTemplateId);
      setSubmittedTemplateId(draftTemplateId);
      setSubmittedParameters(parameterValues);
      onApplied?.(applied);
      setPopupOpen(false);
      setDraftTemplateId('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to submit the template.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!templateMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node;
      if (templateFieldRef.current?.contains(target) || templateMenuRef.current?.contains(target)) return;
      setTemplateMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTemplateMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [templateMenuOpen]);

  useLayoutEffect(() => {
    if (!templateMenuOpen) return;
    const place = () => {
      const anchor = templateFieldRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setTemplateMenuBox({ top: anchor.bottom + 4, left: anchor.left, width: anchor.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [templateMenuOpen]);

  const shownTemplateId = popupOpen ? draftTemplateId : committedTemplateId;
  const shownTemplateName = templates.find((template) => template.id === shownTemplateId)?.template_name
    || (templates.length === 0 && !isLoadingTemplates ? 'No templates' : '');
  const singleTemplate = templates.length === 1 ? templates[0] : null;

  const openTemplate = (templateId: string) => {
    setDraftTemplateId(templateId);
    setPopupOpen(true);
    setTemplateMenuOpen(false);
  };

  const selectedTemplate = templates.find((template) => template.id === draftTemplateId);
  const showGroupNav = groups.length > 1;
  const visibleGroups = activeGroup ? groups.filter((group) => group.name === activeGroup) : groups;

  return (
    <div className={embedded ? `${singleTemplate ? 'shrink-0' : 'w-56 sm:w-64'} text-xs` : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl space-y-3 text-xs transition-colors'}>
      {!embedded && (
        <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
          Commission Template
        </span>
      )}
      <div ref={templateFieldRef} className="relative">
        {singleTemplate ? (
          <button
            type="button"
            onClick={() => openTemplate(singleTemplate.id)}
            className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">
              {committedTemplateId === singleTemplate.id ? singleTemplate.template_name : `Add ${singleTemplate.template_name}`}
            </span>
          </button>
        ) : (
        <button
          type="button"
          disabled={isLoadingTemplates || templates.length === 0}
          aria-haspopup="listbox"
          aria-expanded={templateMenuOpen}
          onClick={() => setTemplateMenuOpen((open) => !open)}
          className="group underline-field relative block w-full rounded-t-md pl-2.5 pr-8 pt-1 pb-0.5 border-b border-b-slate-300 dark:border-b-slate-600 text-left transition-colors cursor-pointer focus:outline-none focus-visible:border-b-emerald-500 focus-visible:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="block text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-visible:text-emerald-600 dark:group-focus-visible:text-emerald-400">
            Template
          </span>
          <span className="block h-5 truncate text-xs leading-4 font-medium text-slate-900 dark:text-white">
            {shownTemplateName}
          </span>
          <svg
            viewBox="0 0 10 6"
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
          >
            <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        )}
        {templateMenuOpen && templates.length > 1 && createPortal(
          <ul ref={templateMenuRef} role="listbox" aria-label="Template" style={{ top: templateMenuBox.top, left: templateMenuBox.left, width: templateMenuBox.width }} className="fixed z-50 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-800">
            {templates.map((template) => (
              <li key={template.id} role="option" aria-selected={template.id === shownTemplateId}>
                <button
                  type="button"
                  onClick={() => openTemplate(template.id)}
                  className={`block w-full cursor-pointer px-2.5 py-1.5 text-left font-medium text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700 ${template.id === shownTemplateId ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                >
                  {template.template_name}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      </div>
      {loadError && !popupOpen && <p className="text-[11px] text-rose-600 dark:text-rose-400">{loadError}</p>}

      {popupOpen && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-[1800px] rounded-xl p-5 shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedTemplate?.template_name || 'Commission template'}</h3>
            {loadError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{loadError}</p>}
            {showGroupNav && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button
                  type="button"
                  onClick={() => setActiveGroup('')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${activeGroup === '' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
                >
                  All
                </button>
                {groups.map((group) => (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => {
                      setActiveGroup(group.name);
                      setCollapsedSections((current) => ({ ...current, [group.name]: false }));
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${activeGroup === group.name ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            )}
            <div className="@container/params mt-3 overflow-y-auto min-h-0 flex-1">
              {isLoadingParameters ? (
                <p className="text-xs text-slate-500">Loading parameters...</p>
              ) : rows.length === 0 ? (
                <p className="text-xs text-slate-500">This template has no parameters.</p>
              ) : (
                <div className={visibleGroups.length > 1 ? '@min-[1280px]/params:columns-5 @min-[1280px]/params:gap-x-4' : ''}>
                  {visibleGroups.map((group) => {
                    const isUnsectioned = group.name === 'No Section';
                    const isCollapsed = collapsedSections[group.name] === true;
                    return (
                    <div key={group.name} className={`mb-3 break-inside-avoid rounded-lg border bg-white dark:bg-slate-800 ${isUnsectioned ? 'border-amber-300 dark:border-amber-500/40' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className={`px-3 py-2 flex items-center gap-2 ${isCollapsed ? '' : 'border-b border-slate-200 dark:border-slate-700'}`}>
                        <button
                          type="button"
                          onClick={() => toggleSection(group.name)}
                          title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                        >
                          <span className={`w-3 shrink-0 text-center text-sm font-bold leading-none ${isUnsectioned ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {isCollapsed ? '+' : '−'}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isUnsectioned ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {group.name}
                          </span>
                        </button>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                          {group.rows.length} {group.rows.length === 1 ? 'Parameter' : 'Parameters'}
                        </span>
                      </div>
                      {!isCollapsed && (
                        <div className="space-y-2 px-3 py-2">
                          {group.rows.map(({ parameter, raw }) => (
                            <ParameterControl
                              key={parameter.id}
                              parameter={parameter}
                              value={values[parameter.id] ?? ''}
                              agents={uniqueAgents}
                              onChange={(next) => setValues((current) => ({ ...current, [parameter.id]: next }))}
                              onReset={parameterValuesMatch(parameter, values[parameter.id] ?? '', raw, uniqueAgents)
                                ? undefined
                                : () => setValues((current) => ({ ...current, [parameter.id]: raw }))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-3">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, string> = {};
                  for (const row of rows) next[row.parameter.id] = row.raw;
                  setValues(next);
                }}
                disabled={!rows.some((row) => !parameterValuesMatch(row.parameter, values[row.parameter.id] ?? '', row.raw, uniqueAgents))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Reset all
              </button>
              <div className="flex gap-2">
              <button type="button" onClick={closePopup} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Close</button>
              <button
                type="button"
                onClick={() => void submitTemplate()}
                disabled={isSubmitting || isLoadingParameters || !draftTemplateId}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 transition hover:bg-emerald-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
