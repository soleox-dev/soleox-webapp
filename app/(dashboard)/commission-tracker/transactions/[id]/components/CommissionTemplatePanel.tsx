'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Lock, Plus, RefreshCw, RotateCcw, Trash2, X, Zap, type LucideIcon } from 'lucide-react';
import { evaluateFormula, formulaValueToInput, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import { normalizeAgentName } from '@/lib/id';
import { qualifyingTeamCaps, readTeamCapSelection, writeTeamCapSelection, type TeamCapRule } from '@/lib/agent-allocations';
import { templateBoltTone, type TemplateBoltTone } from '@/lib/transaction-default-view';
import { allocationForReplay, loadAllocationCatalog, loadAllocationHistory, loadAllocationOverrides, payoutSignature, replayedPaymentSignature, savedPayouts } from '@/lib/template-payment-drift';
import { applyTemplateLogic, clearCommissionModuleCache, formulaDataNeeds, loadCommissionLedger, loadFormulaLookups, loadTemplateBundle, peekCommissionLedger, peekFormulaLookups, peekTemplateBundle, templateFormulaSources, type AppliedCalculation, type AppliedTemplateRules, type TemplateLogicStep, type TemplateParameterRecord } from './applyTemplateLogic';
import { isConfiguredOrExistingField, type FormulaLedgerRow, type FormulaLookups } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';
import type { StoredCommissionItem } from '../commissionItemState';
import type { CommissionEntityOption, FieldSetting, KnownAgentInfo } from '../types';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { cachedSchema, cachedSubmissions, cachedTemplates, rememberSchema, rememberSubmissions, rememberTemplates, type CachedSubmission } from './templateStatusCache';
import { BooleanField, isBooleanChecked } from '@/components/ui/BooleanCheckbox';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { parameterValidationMessage } from '@/lib/parameter-validation';

interface TemplateOption {
  id: string;
  template_name: string;
  eligibility_formula?: string | null;
  is_active?: boolean | null;
}

interface SubmittedTemplateRow {
  templateId: string;
  parameters: Record<string, string>;
}

type SchemaCatalogField = NonNullable<ReturnType<typeof cachedSchema>>[number];

function schemaFieldTypes(catalog: SchemaCatalogField[]): Record<string, string> {
  return Object.fromEntries(catalog.flatMap((field) => {
    const key = String(field.field_key || '').trim();
    return key ? [[key, String(field.field_type || 'TEXT')]] : [];
  }));
}

function schemaOverviewFields(catalog: SchemaCatalogField[]): FieldSetting[] {
  return catalog.flatMap((field, index) => {
    const key = String(field.field_key || '').trim();
    if (!key) return [];
    return [{
      id: field.id || `schema_${index}`,
      label: field.field_label || key,
      key,
      type: field.field_type || 'TEXT',
      section: field.section_name || 'General',
      calculation_formula: field.calculation_formula?.trim() || undefined,
    }];
  });
}

/** What the panel shows for a transaction's submissions, newest first. */
function submissionView(submissions: CachedSubmission[]) {
  const submitted = submissions[0];
  return {
    ids: submissions.flatMap((row) => {
      const id = String(row?.id || '').trim();
      return id ? [id] : [];
    }),
    templateId: String(submitted?.template_id || ''),
    submissionId: submitted?.id ? String(submitted.id) : null,
    parameters: parameterRecord(submitted?.submitted_parameters),
    rows: submissions.flatMap((row): SubmittedTemplateRow[] => {
      const templateId = String(row?.template_id || '').trim();
      return templateId ? [{ templateId, parameters: parameterRecord(row?.submitted_parameters) }] : [];
    }),
  };
}

const TEMPLATE_STATUS_ICON: Record<TemplateBoltTone, { icon: LucideIcon; className: string }> = {
  submitted: { icon: Check, className: 'text-emerald-500' },
  ready: { icon: Plus, className: 'text-blue-500' },
  ineligible: { icon: X, className: 'text-rose-500' },
  drift: { icon: RefreshCw, className: 'text-violet-400' },
};

const templateButtonChrome = 'inline-flex h-9 max-w-80 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer';

type TemplateParameter = TemplateParameterRecord;

interface AgentOption {
  id: string;
  name: string;
  isTeamLead?: boolean;
  clientId?: string;
  fields?: Record<string, string>;
}

interface ParameterDefault {
  parameter: TemplateParameter;
  raw: string;
}

function calculationField(row: AppliedCalculation): { kind: 'text' | 'currency' | 'number' | 'percent' | 'date' | 'boolean'; value: string; checked: boolean; error: boolean } {
  if (row.error) return { kind: 'text', value: row.error, checked: false, error: true };
  const value = row.value;
  if (!value || value.type === 'blank') return { kind: 'text', value: '', checked: false, error: false };
  if (value.type === 'error') return { kind: 'text', value: 'Could not calculate', checked: false, error: true };
  if (value.type === 'boolean') return { kind: 'boolean', value: '', checked: value.value, error: false };
  if (value.type === 'text') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value.value)) return { kind: 'date', value: value.value.slice(0, 10), checked: false, error: false };
    return { kind: 'text', value: value.value, checked: false, error: false };
  }
  if (value.type === 'number' || value.type === 'percent') {
    const chosen = String(row.resultType || '').trim().toUpperCase();
    if (chosen === 'NUMBER') return { kind: 'number', value: String(value.value), checked: false, error: false };
    if (chosen === 'PERCENT') return { kind: 'percent', value: String(value.value * 100), checked: false, error: false };
    if (chosen === 'CURRENCY') return { kind: 'currency', value: String(value.value), checked: false, error: false };
    if (value.type === 'percent') return { kind: 'percent', value: String(value.value * 100), checked: false, error: false };
    return { kind: 'currency', value: String(value.value), checked: false, error: false };
  }
  return { kind: 'text', value: '', checked: false, error: false };
}

const calculationMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** A calculation as short text for the line under its section, such as "$16,000.00" or "11/01/2026". */
function calculationText(row: AppliedCalculation): { text: string; error: boolean } {
  const field = calculationField(row);
  if (field.error) return { text: field.value, error: true };
  if (field.kind === 'boolean') return { text: field.checked ? 'Yes' : 'No', error: false };
  if (field.kind === 'date') {
    const [year, month, day] = field.value.split('-');
    return { text: year && month && day ? `${month}/${day}/${year}` : field.value, error: false };
  }
  const amount = Number(field.value);
  if (field.kind === 'currency') return { text: Number.isFinite(amount) ? calculationMoney.format(amount) : field.value, error: false };
  if (field.kind === 'percent') return { text: Number.isFinite(amount) ? `${amount.toLocaleString('en-US', { maximumFractionDigits: 3 })}%` : field.value, error: false };
  if (field.kind === 'number') return { text: Number.isFinite(amount) ? amount.toLocaleString('en-US', { maximumFractionDigits: 4 }) : field.value, error: false };
  return { text: field.value || '—', error: false };
}

function CalculationField({ row }: { row: AppliedCalculation }) {
  const field = calculationField(row);
  const id = `template-calculation-${row.id}`;
  const valueClass = field.error ? 'logic-result-error' : 'logic-result';
  let control: React.ReactNode = null;
  if (field.kind === 'boolean') {
    return <BooleanField id={id} label={row.name} checked={field.checked} disabled />;
  }
  if (field.kind === 'date') {
    control = <NativeDateInput id={id} value={field.value} disabled className={`${controlClass(true)} ${valueClass} dark:[color-scheme:dark]`} />;
  } else if (field.kind === 'currency' || field.kind === 'percent' || field.kind === 'number') {
    control = <NumericParameterInput id={id} kind={field.kind === 'currency' ? 'CURRENCY' : field.kind === 'percent' ? 'PERCENT' : 'NUMBER'} value={field.value} readOnly onChange={() => undefined} className={valueClass} />;
  } else {
    control = <input id={id} value={field.value} readOnly className={`${controlClass(true)} ${valueClass}`} />;
  }
  return (
    <LabeledParameter id={id} label={row.name} locked changed={false} showChevron={false}>
      {control}
    </LabeledParameter>
  );
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

function controlClass(locked: boolean, select = false, invalid = false): string {
  const tone = invalid ? 'parameter-invalid text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white';
  if (select) return `${valueControl} overview-field-select cursor-pointer font-medium ${invalid ? 'parameter-invalid text-rose-600 dark:text-rose-400' : tone}`;
  if (locked) return `parameter-locked ${invalid ? 'parameter-invalid' : ''} ${valueControl} cursor-default font-medium ${invalid ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`;
  return `${valueControl} font-medium ${tone}`;
}

function LabeledParameter({
  id,
  label,
  locked,
  changed,
  invalid,
  message,
  showChevron,
  mirror,
  onReset,
  flashToken = 0,
  children,
}: {
  id: string;
  label: string;
  locked: boolean;
  changed: boolean;
  invalid?: boolean;
  message?: string;
  showChevron: boolean;
  mirror?: string;
  onReset?: () => void;
  flashToken?: number;
  children: React.ReactNode;
}) {
  const labelTone = invalid
    ? 'text-rose-600 dark:text-rose-400'
    : locked
    ? 'text-slate-400 dark:text-slate-500'
    : 'text-slate-500 dark:text-slate-400 group-focus-within/field:text-brand-600 dark:group-focus-within/field:text-brand-400';
  const shellBorder = invalid
    ? 'border-b-rose-400 dark:border-b-rose-500 focus-within:border-b-rose-600 focus-within:shadow-[0_1px_0_rgb(225_29_72/0.45),0_6px_12px_-6px_rgb(225_29_72/0.8)]'
    : locked
    ? 'border-b-slate-200 dark:border-b-slate-700'
    : 'border-b-slate-300 dark:border-b-slate-600 focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)]';

  return (
    <div key={flashToken || undefined} className={`group/field relative underline-field rounded-t-md pl-2.5 pr-2.5 pt-1 pb-0.5 border-b transition-colors ${locked ? 'is-locked' : ''} ${changed ? 'is-changed' : ''} ${flashToken ? 'is-recalculated' : ''} ${shellBorder}`}>
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} title={typeof label === 'string' ? label : undefined} className={`min-w-0 line-clamp-2 break-words text-[10px] leading-3 font-medium ${labelTone}`}>
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
          <span className={`parameter-recalc-value truncate text-xs leading-4 font-medium ${invalid ? 'text-rose-600 dark:text-rose-400' : locked ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
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
      {message && <p className="mt-0.5 text-[10px] leading-3 font-medium text-rose-600 dark:text-rose-400">{message}</p>}
    </div>
  );
}

/** Parameter types whose values can be long: agent names and free text. */
const WIDE_PARAMETER_TYPES = new Set<string>(['TEXT', 'AGENT_PICKER']);
/** About what fits in one narrow column of the template popup. */
const NARROW_FIELD_CHARS = 14;

/** Roughly how wide a label is at the popup's 10px label size: capitals and digits run wider than lowercase. */
function labelWidthPx(label: string): number {
  let width = 0;
  for (const char of label) width += /[A-Z0-9$%]/.test(char) ? 6.6 : /\s/.test(char) ? 2.8 : 5.3;
  return width;
}
/** The label room in one narrow column, after the field's padding and the reset button. */
const NARROW_LABEL_PX = 100;

/** True when a label does not fit on one line of a narrow column. */
function labelNeedsRoom(label: string): boolean {
  return labelWidthPx(label.trim()) > NARROW_LABEL_PX;
}

/**
 * True when a parameter takes two columns: its label does not fit on one line, or an agent or text value
 * shows more than a narrow column fits.
 */
function parameterNeedsRoom(parameter: { data_type?: string | null; parameter_name?: string | null }, value: string, agents: { id: string; name: string }[]): boolean {
  if (labelNeedsRoom(parameter.parameter_name || '')) return true;
  const type = canonicalParameterType(parameter.data_type);
  if (!WIDE_PARAMETER_TYPES.has(type)) return false;
  const shown = type === 'AGENT_PICKER'
    ? (agents.find((agent) => agent.id === value || agent.name === value)?.name ?? value)
    : value;
  return shown.trim().length > NARROW_FIELD_CHARS;
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

function parameterIssuesFor(
  parameters: TemplateParameter[],
  values: Record<string, string>,
  deal: Record<string, unknown> | null,
): Map<string, { message: string; section: string }> {
  const issues = new Map<string, { message: string; section: string }>();
  if (Object.keys(values).length === 0) return issues;
  const parametersByKey: Record<string, string> = {};
  const parameterTypes: Record<string, string> = {};
  for (const parameter of parameters) {
    parametersByKey[parameter.parameter_key] = values[parameter.id] ?? '';
    parameterTypes[parameter.parameter_key] = parameter.data_type || '';
  }
  for (const parameter of parameters) {
    if (!(parameter.id in values)) continue;
    const message = parameterValidationMessage({
      dataType: parameter.data_type,
      value: values[parameter.id] ?? '',
      rule: parameter.validation_rule,
      required: Boolean(parameter.is_required),
      parameters: parametersByKey,
      parameterTypes,
      deal,
    });
    if (!message) continue;
    issues.set(parameter.id, { message, section: parameter.section?.trim() || 'No Section' });
  }
  return issues;
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
  if (control === 'BOOLEAN') {
    const flag = (value: string) => {
      const key = value.trim().toLowerCase();
      if (key === 'true' || key === 'yes') return 'true';
      if (key === 'false' || key === 'no') return 'false';
      return key;
    };
    return flag(left) === flag(right);
  }
  return left === right;
}

function NumericParameterInput({
  id,
  kind,
  value,
  readOnly,
  invalid = false,
  onChange,
  className = '',
}: {
  id: string;
  kind: 'CURRENCY' | 'PERCENT' | 'NUMBER';
  value: string;
  readOnly: boolean;
  invalid?: boolean;
  onChange: (next: string) => void;
  className?: string;
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
      aria-invalid={invalid}
      value={focused ? draft : shown}
      onFocus={() => {
        // A locked field keeps its formatted value; only an editable one switches to the raw number for typing.
        if (readOnly) return;
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
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
        setDraft(raw);
        const nextCore = numericCore(raw);
        if (nextCore === null) return;
        const next = nextCore === '' ? '' : formatCommitted(kind, nextCore);
        if (next !== value) onChange(next);
      }}
      className={`${controlClass(readOnly, false, invalid)} text-left ${className}`}
    />
  );
}

function ParameterControl({
  parameter,
  value,
  agents,
  message,
  onChange,
  onReset,
  flashToken = 0,
}: {
  parameter: TemplateParameter;
  value: string;
  agents: AgentOption[];
  message?: string;
  onChange: (next: string) => void;
  onReset?: () => void;
  flashToken?: number;
}) {
  const control = canonicalParameterType(parameter.data_type);
  const locked = parameter.is_user_editable === false;
  const invalid = Boolean(message);
  const id = `template-parameter-${parameter.id}`;
  if (control === 'BOOLEAN') {
    return (
      <div>
        <BooleanField
          id={id}
          label={parameter.parameter_name}
          required={Boolean(parameter.is_required)}
          checked={isBooleanChecked(value)}
          disabled={locked}
          onChange={(checked) => onChange(checked ? 'TRUE' : 'FALSE')}
        />
        {message && <p className="mt-0.5 text-[10px] leading-3 font-medium text-rose-600 dark:text-rose-400">{message}</p>}
      </div>
    );
  }
  const isSelect = control === 'SELECT' || control === 'AGENT_PICKER';
  let field: React.ReactNode = null;

  if (locked && isSelect) {
    field = null;
  } else if (control === 'SELECT') {
    const options = parameter.dropdown_options || [];
    const selectOptions = value && !options.includes(value) ? [value, ...options] : options;
    field = (
      <ClearableSelect id={id} value={value} disabled={locked} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} className={controlClass(locked, true, invalid)}>
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
        aria-invalid={invalid}
        onChange={(event) => {
          const agent = choices.find((item) => item.id === event.target.value);
          onChange(agent?.name || '');
        }}
        className={controlClass(false, true, invalid)}
      >
        {choices.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}{agent.isTeamLead ? ' (Team Lead)' : ''}
          </option>
        ))}
      </ClearableSelect>
    );
  } else if (control === 'DATE') {
    const date = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
    field = (
      <NativeDateInput id={id} value={date} disabled={locked} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} className={`${controlClass(locked, false, invalid)} dark:[color-scheme:dark]`} />
    );
  } else if (control === 'CURRENCY' || control === 'PERCENT' || control === 'NUMBER') {
    field = <NumericParameterInput id={id} kind={control} value={value} readOnly={locked} invalid={invalid} onChange={onChange} />;
  } else {
    field = (
      <input id={id} value={value} readOnly={locked} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} className={controlClass(locked, false, invalid)} />
    );
  }

  return (
    <LabeledParameter id={id} label={parameter.parameter_name} locked={locked} changed={Boolean(onReset)} invalid={invalid} message={message} showChevron={isSelect && !locked} mirror={isSelect ? value : undefined} onReset={onReset} flashToken={flashToken}>
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
  lookups: FormulaLookups | undefined,
  booleanKeys: Set<string>,
): { display: string; pending: boolean; raw: string } {
  const body = formula.trim().replace(/^=/, '').trim();
  if (!body || body === '""') return { display: 'Blank', pending: false, raw: '' };
  if ((body.startsWith('"') && body.endsWith('"') && body.length >= 2 && !body.slice(1, -1).includes('"'))) {
    const text = body.slice(1, -1);
    return { display: text || 'Blank', pending: false, raw: text };
  }
  if (/^(true|false)$/i.test(body)) {
    const text = body.toLowerCase() === 'true' ? 'TRUE' : 'FALSE';
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
      if (booleanKeys.has(key)) {
        const flag = stored.trim().toLowerCase();
        if (flag === 'true' || flag === 'yes') return { type: 'boolean', value: true };
        if (flag === 'false' || flag === 'no') return { type: 'boolean', value: false };
      }
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
    if (field === undefined || field === null || field === '') {
      if (
        isConfiguredOrExistingField('transactions', key, [], lookups) ||
        (deal && (key in deal || (deal.custom_attributes && typeof deal.custom_attributes === 'object' && key in (deal.custom_attributes as Record<string, unknown>))))
      ) {
        return { type: 'blank' };
      }
      return { type: 'error' };
    }
    if (typeof field === 'number') return { type: 'number', value: field };
    if (typeof field === 'boolean') return { type: 'boolean', value: field };
    const text = String(field).trim();
    const numeric = Number(text.replace(/[$,]/g, ''));
    if (text !== '' && Number.isFinite(numeric) && /^-?\$?[\d,]+(?:\.\d+)?%?$/.test(text)) {
      return text.endsWith('%') ? { type: 'percent', value: numeric / 100 } : { type: 'number', value: numeric };
    }
    return { type: 'text', value: String(field) };
  };

  const evaluated = evaluateFormula(body, valueFromDeal, agents, [], lookups);
  if (!evaluated || evaluated.type === 'error') return { display: 'Not calculated yet', pending: true, raw: '' };
  const raw = formulaValueToInput(evaluated, dataType);
  return { display: raw || 'Blank', pending: false, raw };
}

function resolveDefaults(
  parameters: TemplateParameter[],
  deal: Record<string, unknown> | null,
  agents: AgentOption[],
  lookups?: FormulaLookups,
): ParameterDefault[] {
  const booleanKeys = new Set(
    parameters
      .filter((parameter) => canonicalParameterType(parameter.data_type) === 'BOOLEAN')
      .map((parameter) => parameter.parameter_key.toLowerCase()),
  );
  const ordered = [...parameters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const resolved: Record<string, string> = {};
  // A parameter can read one listed after it (TC 1 FEE $ reads TC 2), so passes repeat until nothing new
  // resolves. A formula that still cannot be calculated stays blank, as before.
  const done = new Map<string, string>();
  for (let pass = 0; pass < Math.max(ordered.length, 1); pass += 1) {
    let progress = false;
    for (const parameter of ordered) {
      if (done.has(parameter.id)) continue;
      const result = defaultFromFormula(parameter.autofill_formula || '', parameter.data_type, deal, agents, resolved, lookups, booleanKeys);
      if (result.pending) continue;
      resolved[parameter.parameter_key.toLowerCase()] = result.raw;
      done.set(parameter.id, result.raw);
      progress = true;
    }
    if (!progress) break;
  }
  return ordered.map((parameter) => ({ parameter, raw: done.get(parameter.id) ?? '' }));
}

function refreshLockedValues(
  parameters: TemplateParameter[],
  current: Record<string, string>,
  deal: Record<string, unknown> | null,
  agents: AgentOption[],
  lookups: FormulaLookups | undefined,
): Record<string, string> {
  const booleanKeys = new Set(
    parameters
      .filter((parameter) => canonicalParameterType(parameter.data_type) === 'BOOLEAN')
      .map((parameter) => parameter.parameter_key.toLowerCase()),
  );
  const ordered = [...parameters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const next = { ...current };
  for (let pass = 0; pass < Math.max(ordered.length, 1); pass += 1) {
    const resolved: Record<string, string> = {};
    for (const parameter of parameters) {
      resolved[parameter.parameter_key.toLowerCase()] = next[parameter.id] ?? '';
    }
    let changed = false;
    for (const parameter of ordered) {
      const formula = parameter.autofill_formula?.trim() || '';
      if (parameter.is_user_editable !== false || !formula) continue;
      const result = defaultFromFormula(formula, parameter.data_type, deal, agents, resolved, lookups, booleanKeys);
      const raw = result.pending ? '' : result.raw;
      if ((next[parameter.id] ?? '') !== raw) {
        next[parameter.id] = raw;
        changed = true;
      }
      resolved[parameter.parameter_key.toLowerCase()] = raw;
    }
    if (!changed) break;
  }
  return next;
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

export interface TemplateSubmissionDraft {
  id?: string | null;
  template_id: string;
  submitted_parameters: Record<string, string>;
  status: 'SUBMITTED';
  team_cap_ids?: string[];
  team_cap_recipients?: { id: string; name: string; isTeamLead: boolean }[];
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
  onSubmissionDeleted,
  onTeamCapSelection,
  onStoredSubmission,
  pendingSubmission = null,
  submissionRevision = 0,
  embedded = false,
}: {
  clientId: string;
  transactionId: string;
  deal: Record<string, unknown> | null;
  agents: AgentOption[];
  dealAgents?: AgentOption[];
  entities?: { id: string; name: string }[];
  totalCommission?: number;
  onApplied?: (applied: AppliedTemplateRules, submission: TemplateSubmissionDraft) => void;
  /** Saved submission was removed. The waterfall is left as it is. */
  onSubmissionDeleted?: () => void;
  /** Null means this submission did not record which team caps to apply. */
  onTeamCapSelection?: (ids: string[] | null) => void;
  /** The submission last loaded from the server. Null means this transaction has none. */
  onStoredSubmission?: (submission: TemplateSubmissionDraft | null) => void;
  /** An unsaved template submit. A load that finishes after it must not replace the submission on screen. */
  pendingSubmission?: TemplateSubmissionDraft | null;
  /** Bumped when an unsaved template submission is discarded, so the panel reloads the stored one. */
  submissionRevision?: number;
  embedded?: boolean;
}) {
  // The panel is keyed by transaction, so this state starts fresh for each one. It starts from
  // the session cache when it can, so the button knows the status at once, then refreshes below.
  const [initialTemplates] = useState(() => cachedTemplates<TemplateOption>(clientId));
  const [initialSchema] = useState(() => cachedSchema(clientId));
  const [initialSubmissions] = useState(() => {
    const cached = transactionId ? cachedSubmissions(clientId, transactionId) : undefined;
    return cached ? submissionView(cached) : null;
  });
  const [templates, setTemplates] = useState<TemplateOption[]>(initialTemplates ?? []);
  const [committedTemplateId, setCommittedTemplateId] = useState(initialSubmissions?.templateId ?? '');
  const [submissionId, setSubmissionId] = useState<string | null>(initialSubmissions?.submissionId ?? null);
  const [submissionIds, setSubmissionIds] = useState<string[]>(initialSubmissions?.ids ?? []);
  const [submittedTemplateId, setSubmittedTemplateId] = useState(initialSubmissions?.templateId ?? '');
  const [submittedParameters, setSubmittedParameters] = useState<Record<string, string>>(initialSubmissions?.parameters ?? {});
  const [submittedRows, setSubmittedRows] = useState<SubmittedTemplateRow[]>(initialSubmissions?.rows ?? []);
  const [submissionReady, setSubmissionReady] = useState(Boolean(initialSubmissions));
  const [fieldTypes, setFieldTypes] = useState<Record<string, string>>(() => (initialSchema ? schemaFieldTypes(initialSchema) : {}));
  const [overviewFields, setOverviewFields] = useState<FieldSetting[]>(() => (initialSchema ? schemaOverviewFields(initialSchema) : []));
  const [schemaReady, setSchemaReady] = useState(Boolean(initialSchema));
  const [paymentsWouldChange, setPaymentsWouldChange] = useState(false);
  const [paymentDriftReady, setPaymentDriftReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [draftTemplateId, setDraftTemplateId] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [teamCaps, setTeamCaps] = useState<TeamCapRule[]>([]);
  const [capsLoaded, setCapsLoaded] = useState(false);
  const [checkedCapIds, setCheckedCapIds] = useState<string[]>([]);
  const capChoiceSet = useRef(false);
  const onTeamCapSelectionRef = useRef(onTeamCapSelection);
  onTeamCapSelectionRef.current = onTeamCapSelection;
  const onStoredSubmissionRef = useRef(onStoredSubmission);
  onStoredSubmissionRef.current = onStoredSubmission;
  const pendingSubmissionRef = useRef(pendingSubmission);
  pendingSubmissionRef.current = pendingSubmission;
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [logicSteps, setLogicSteps] = useState<TemplateLogicStep[]>([]);
  const [ledger, setLedger] = useState<FormulaLedgerRow[] | null>(null);
  const [lookups, setLookups] = useState<FormulaLookups | null>(null);
  const [ledgerError, setLedgerError] = useState('');
  const [parametersOpen, setParametersOpen] = useState(true);
  const [logicOpen, setLogicOpen] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(!initialTemplates);
  const [isLoadingParameters, setIsLoadingParameters] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templateFieldRef = useRef<HTMLDivElement>(null);
  const localSubmitRef = useRef(false);
  const templateMenuRef = useRef<HTMLUListElement>(null);
  const [templateMenuBox, setTemplateMenuBox] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      if (!cachedTemplates(clientId)) setIsLoadingTemplates(true);
      setLoadError('');
      try {
        const response = await fetch(`/api/commission-templates?client_id=${encodeURIComponent(clientId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load templates.');
        const loaded = (data.templates || []) as TemplateOption[];
        rememberTemplates(clientId, loaded);
        if (!cancelled) setTemplates(loaded);
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
    let cancelled = false;
    const loadSchema = async () => {
      try {
        const response = await fetch('/api/schema/transactions', { headers: { 'x-client-id': clientId } });
        const data = await response.json();
        if (!response.ok || cancelled) return;
        const catalog = (data.catalog || data.fields || data.data || []) as SchemaCatalogField[];
        if (!Array.isArray(catalog)) return;
        rememberSchema(clientId, catalog);
        setFieldTypes(schemaFieldTypes(catalog));
        setOverviewFields(schemaOverviewFields(catalog));
      } catch {
        if (!cancelled) {
          setFieldTypes({});
          setOverviewFields([]);
        }
      } finally {
        if (!cancelled) setSchemaReady(true);
      }
    };
    void loadSchema();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!transactionId) {
      setCommittedTemplateId('');
      setSubmissionId(null);
      setSubmissionIds([]);
      setSubmittedTemplateId('');
      setSubmittedParameters({});
      setSubmittedRows([]);
      onTeamCapSelectionRef.current?.(null);
      onStoredSubmissionRef.current?.(null);
      setSubmissionReady(true);
      return;
    }
    let cancelled = false;
    localSubmitRef.current = false;
    setPaymentDriftReady(false);
    setPaymentsWouldChange(false);
    // Cached submissions keep the status on screen while they refresh.
    if (!cachedSubmissions(clientId, transactionId)) setSubmissionReady(false);
    const clearSubmission = () => {
      setCommittedTemplateId('');
      setSubmissionId(null);
      setSubmissionIds([]);
      setSubmittedTemplateId('');
      setSubmittedParameters({});
      setSubmittedRows([]);
      onTeamCapSelectionRef.current?.(null);
      onStoredSubmissionRef.current?.(null);
    };
    const loadSubmission = async () => {
      try {
        const response = await fetch(`/api/commission-template-submissions?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.success) {
          clearSubmission();
          return;
        }
        const submissions = (Array.isArray(data.submissions) ? data.submissions : []) as CachedSubmission[];
        rememberSubmissions(clientId, transactionId, submissions);
        const submitted = submissions[0];
        const view = submissionView(submissions);
        setSubmissionIds(view.ids);
        const savedParameters = view.parameters;
        onStoredSubmissionRef.current?.(submitted?.template_id ? {
          id: submitted.id || null,
          template_id: String(submitted.template_id),
          submitted_parameters: savedParameters,
          status: 'SUBMITTED',
          team_cap_ids: readTeamCapSelection(savedParameters) ?? undefined,
        } : null);
        if (pendingSubmissionRef.current?.template_id) return;
        setCommittedTemplateId(submitted?.template_id || '');
        setSubmissionId(submitted?.id || null);
        setSubmittedTemplateId(submitted?.template_id || '');
        setSubmittedParameters(savedParameters);
        onTeamCapSelectionRef.current?.(submitted ? readTeamCapSelection(savedParameters) : null);
        setSubmittedRows(view.rows);
      } catch {
        if (!cancelled) clearSubmission();
      } finally {
        if (!cancelled) setSubmissionReady(true);
      }
    };
    void loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [clientId, transactionId, submissionRevision]);

  useEffect(() => {
    if (!deal || !submissionReady || !schemaReady || isLoadingTemplates) return;
    if (localSubmitRef.current) {
      setPaymentsWouldChange(false);
      setPaymentDriftReady(true);
      return;
    }
    const base = templateBoltTone(
      deal,
      templates,
      submittedRows.map((row) => row.templateId),
      fieldTypes,
      false,
    );
    if (base?.tone !== 'submitted') {
      setPaymentsWouldChange(false);
      setPaymentDriftReady(true);
      return;
    }

    setPaymentDriftReady(false);
    let cancelled = false;
    const checkDrift = async () => {
      const fetchOptions = { headers: { 'x-client-id': clientId } };
      const bundles = await Promise.all(submittedRows.map(async (row) => {
        const loaded = await loadTemplateBundle(row.templateId);
        const parameterTypes = Object.fromEntries(
          loaded.parameters.map((parameter) => [parameter.parameter_key, parameter.data_type || '']),
        );
        return { templateId: row.templateId, steps: loaded.steps, parameterTypes };
      }));
      if (cancelled) return;

      const bundleById = new Map(bundles.map((bundle) => [bundle.templateId, bundle]));
      const needs = formulaDataNeeds(bundles.flatMap((bundle) => templateFormulaSources(bundle.steps, [])));
      const knownAgents: KnownAgentInfo[] = agents.map((agent) => ({
        id: agent.id,
        name: normalizeAgentName(agent.name),
        isTeamLead: Boolean(agent.isTeamLead),
        clientId: agent.clientId,
        fields: agent.fields,
      }));
      const entityOptions: CommissionEntityOption[] = entities.map((entity) => ({ id: entity.id, name: entity.name }));
      const itemsResponse = await fetch(`/api/transaction-commission-items?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`, fetchOptions);
      const itemsData = await itemsResponse.json();
      if (!itemsResponse.ok || itemsData.success === false) throw new Error(itemsData.error || 'Failed to load commission lines.');
      const items = (Array.isArray(itemsData.items) ? itemsData.items : []) as StoredCommissionItem[];
      const [ledgerRows, lookupRows] = await Promise.all([
        needs.needsLedger ? loadCommissionLedger(clientId, entityOptions) : Promise.resolve([]),
        needs.lookupTables.length > 0 ? loadFormulaLookups(clientId, needs.lookupTables) : Promise.resolve({ clientId, tables: {} }),
      ]);
      if (cancelled) return;

      const saved = payoutSignature(savedPayouts(items, knownAgents, entityOptions));
      const [catalog, history, overrides] = await Promise.all([
        loadAllocationCatalog(clientId),
        loadAllocationHistory(clientId, knownAgents.map((agent) => agent.id)),
        loadAllocationOverrides(clientId, transactionId),
      ]);
      if (cancelled) return;
      const allocation = allocationForReplay({
        catalog,
        history,
        overrides,
        deal,
        transactionId,
        agents: knownAgents,
        fieldTypes,
      });
      let changed = false;
      for (const row of submittedRows) {
        const bundle = bundleById.get(row.templateId);
        if (!bundle) continue;
        try {
          const replayed = replayedPaymentSignature({
            deal,
            steps: bundle.steps,
            parameters: row.parameters,
            parameterTypes: bundle.parameterTypes,
            items,
            agents: knownAgents,
            entities: entityOptions,
            overviewFields,
            ledger: ledgerRows,
            lookups: lookupRows,
            allocation,
          });
          if (replayed !== saved) changed = true;
        } catch {
          // A replay that cannot be calculated stays green.
        }
      }
      if (!cancelled) {
        setPaymentsWouldChange(changed);
        setPaymentDriftReady(true);
      }
    };

    void checkDrift().catch((error) => {
      console.error('template payment check failed', error);
      if (!cancelled) {
        setPaymentsWouldChange(false);
        setPaymentDriftReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deal, submissionReady, schemaReady, isLoadingTemplates, submittedRows, templates, fieldTypes, agents, entities, overviewFields, clientId, transactionId]);

  const ledgerEntitiesKey = entities.map((entity) => `${entity.id}\t${entity.name}`).join('\n');

  useEffect(() => {
    if (!clientId || !ledgerEntitiesKey) return;
    void loadCommissionLedger(clientId, entities).catch(() => {});
  }, [clientId, ledgerEntitiesKey, entities]);

  useEffect(() => {
    if (!clientId || !submittedTemplateId) return;
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await loadTemplateBundle(submittedTemplateId);
        if (cancelled) return;
        const needs = formulaDataNeeds(templateFormulaSources(bundle.steps, bundle.parameters));
        if (needs.lookupTables.length > 0) await loadFormulaLookups(clientId, needs.lookupTables);
      } catch {
        // Opening the popup reports a failed load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, submittedTemplateId]);

  useEffect(() => {
    if (!popupOpen || !draftTemplateId) {
      setParameters([]);
      setLogicSteps([]);
      setLedger(null);
      setLookups(null);
      setLedgerError('');
      return;
    }
    let cancelled = false;
    const loadParameters = async () => {
      setLoadError('');
      setLedgerError('');
      const cachedLedger = peekCommissionLedger(clientId, entities);
      const cachedBundle = peekTemplateBundle(draftTemplateId);
      setLedger(cachedLedger);
      setIsLoadingParameters(!cachedBundle);
      if (cachedBundle) {
        setParameters(cachedBundle.parameters);
        setLogicSteps(cachedBundle.steps);
        const cachedNeeds = formulaDataNeeds(templateFormulaSources(cachedBundle.steps, cachedBundle.parameters));
        const showCached = cachedBundle.steps.some((step) => step.show_in_popup);
        if (!showCached || !cachedNeeds.needsLedger) setLedger([]);
        const cachedLookups = cachedNeeds.lookupTables.length === 0
          ? { clientId, tables: {} }
          : peekFormulaLookups(clientId, cachedNeeds.lookupTables);
        setLookups(cachedLookups);
      } else {
        setLookups(null);
      }
      const ledgerPromise = loadCommissionLedger(clientId, entities, { refresh: true });
      try {
        const bundle = await loadTemplateBundle(draftTemplateId, { refresh: true });
        if (cancelled) return;
        const steps = bundle.steps;
        const parameterRows = bundle.parameters;
        setParameters(parameterRows);
        setLogicSteps(steps);
        setIsLoadingParameters(false);

        const needs = formulaDataNeeds(templateFormulaSources(steps, parameterRows));
        const showCalculations = steps.some((step) => step.show_in_popup);
        await Promise.all([
          (async () => {
            try {
              const nextLookups = needs.lookupTables.length === 0
                ? { clientId, tables: {} }
                : await loadFormulaLookups(clientId, needs.lookupTables, { refresh: true });
              if (!cancelled) setLookups(nextLookups);
            } catch (err) {
              if (!cancelled) setLedgerError(err instanceof Error ? err.message : 'Failed to calculate template results.');
            }
          })(),
          (async () => {
            if (!showCalculations || !needs.needsLedger) {
              if (!cancelled) setLedger([]);
              return;
            }
            try {
              const nextLedger = await ledgerPromise;
              if (!cancelled) setLedger(nextLedger);
            } catch (err) {
              if (!cancelled && !cachedLedger) setLedgerError(err instanceof Error ? err.message : 'Failed to calculate template results.');
            }
          })(),
        ]);
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
  }, [popupOpen, draftTemplateId, clientId, entities]);

  const rows = useMemo(() => resolveDefaults(parameters, deal, agents, lookups ?? { clientId, tables: {} }), [parameters, deal, agents, lookups, clientId]);
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
  const liveValues = useRef<Record<string, string>>({});
  const [recalcFlash, setRecalcFlash] = useState<Record<string, number>>({});
  const flashScrollId = useRef<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedLogicSections, setCollapsedLogicSections] = useState<Record<string, boolean>>({});
  const qualifyingCaps = useMemo(
    () => qualifyingTeamCaps(teamCaps, deal, fieldTypes),
    [teamCaps, deal, fieldTypes],
  );

  useEffect(() => {
    let cancelled = false;
    const loadCaps = async () => {
      try {
        const response = await fetch(`/api/agent-allocations?client_id=${encodeURIComponent(clientId)}`, {
          headers: { 'x-client-id': clientId },
        });
        const data = await response.json();
        if (!response.ok || data.success === false || cancelled) return;
        const caps = (Array.isArray(data.teamCaps) ? data.teamCaps : []).flatMap((row: Record<string, unknown>) => {
          const id = String(row.id || '').trim();
          if (!id) return [];
          return [{
            id,
            name: String(row.name || 'Team Cap'),
            key: row.key ? String(row.key) : null,
            enabled: Boolean(row.enabled),
            qualifyingFormula: row.qualifying_formula ? String(row.qualifying_formula) : null,
            splitPercentFieldKey: row.split_percent_field_key ? String(row.split_percent_field_key) : null,
            capAmountFieldKey: row.cap_amount_field_key ? String(row.cap_amount_field_key) : null,
            resetDateFieldKey: row.reset_date_field_key ? String(row.reset_date_field_key) : null,
            recipientAgentId: row.recipient_agent_id ? String(row.recipient_agent_id) : null,
          } satisfies TeamCapRule];
        });
        setTeamCaps(caps);
      } catch {
        if (!cancelled) setTeamCaps([]);
      } finally {
        if (!cancelled) setCapsLoaded(true);
      }
    };
    void loadCaps();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!popupOpen) {
      capChoiceSet.current = false;
      return;
    }
    if (!capsLoaded || !schemaReady || capChoiceSet.current) return;
    const qualifyingIds = qualifyingCaps.map((cap) => cap.id);
    const stored = draftTemplateId === submittedTemplateId ? readTeamCapSelection(submittedParameters) : null;
    setCheckedCapIds(stored == null ? qualifyingIds : stored.filter((id) => qualifyingIds.includes(id)));
    capChoiceSet.current = true;
  }, [popupOpen, capsLoaded, schemaReady, qualifyingCaps, draftTemplateId, submittedTemplateId, submittedParameters]);

  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    const useSubmission = draftTemplateId === submittedTemplateId;
    const next: Record<string, string> = {};
    for (const row of rows) {
      const saved = useSubmission ? savedParameterValue(submittedParameters, row.parameter.parameter_key) : undefined;
      next[row.parameter.id] = saved !== undefined ? saved : row.raw;
    }
    const refreshed = refreshLockedValues(parameters, next, deal, agents, lookups ?? { clientId, tables: {} });
    liveValues.current = refreshed;
    setValues(refreshed);
  }, [rows, parameters, deal, agents, lookups, clientId, draftTemplateId, submittedTemplateId, submittedParameters]);

  useEffect(() => {
    setCollapsedSections({});
    setCollapsedLogicSections({});
    setParametersOpen(true);
    setLogicOpen(true);
    setRecalcFlash({});
  }, [draftTemplateId]);

  // Sections whose fields are all empty when the template loads start collapsed, to cut noise.
  // This runs once per template, so a section never closes while someone is filling it in.
  const autoCollapsedFor = useRef('');
  useEffect(() => {
    if (isLoadingParameters || groups.length === 0 || autoCollapsedFor.current === draftTemplateId) return;
    if (!rows.every((row) => row.parameter.id in values)) return;
    autoCollapsedFor.current = draftTemplateId;
    const collapsed: Record<string, boolean> = {};
    for (const group of groups) {
      if (group.rows.every(({ parameter }) => !(values[parameter.id] ?? '').trim())) collapsed[group.name] = true;
    }
    setCollapsedSections(collapsed);
  }, [isLoadingParameters, groups, rows, values, draftTemplateId]);

  useEffect(() => {
    const id = flashScrollId.current;
    if (!id) return;
    flashScrollId.current = null;
    document.getElementById(`template-parameter-${id}`)?.closest('.underline-field')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [recalcFlash]);

  const shownCalculations = useMemo(() => {
    if (!logicSteps.some((step) => step.show_in_popup) || !ledger || !lookups) return [];
    const parameterValues: Record<string, string> = {};
    for (const parameter of parameters) {
      parameterValues[parameter.parameter_key] = values[parameter.id] ?? '';
    }
    return applyTemplateLogic({
      steps: logicSteps,
      parameters: parameterValues,
      parameterTypes: Object.fromEntries(parameters.map((parameter) => [parameter.parameter_key, parameter.data_type || ''])),
      deal,
      entities,
      rosterAgents: agents,
      dealAgents,
      totalCommission,
      ledger,
      lookups,
      continueOnError: true,
    }).calculations || [];
  }, [logicSteps, ledger, lookups, parameters, values, deal, entities, agents, dealAgents, totalCommission]);

  const logicGroups = useMemo(() => {
    const groups: { name: string; rows: AppliedCalculation[] }[] = [];
    for (const row of shownCalculations) {
      const name = row.section.trim() || 'No Section';
      const existing = groups.find((group) => group.name === name);
      if (existing) existing.rows.push(row);
      else groups.push({ name, rows: [row] });
    }
    return groups.sort((a, b) => Number(a.name === 'No Section') - Number(b.name === 'No Section'));
  }, [shownCalculations]);

  // Rules whose form section matches a parameter section read as one line of text under that section.
  // The rest stay in the Calculations block.
  const parameterSectionNames = useMemo(() => new Set(groups.map((group) => group.name)), [groups]);
  const inlineCalculations = useMemo(() => {
    const bySection = new Map<string, AppliedCalculation[]>();
    for (const group of logicGroups) {
      if (parameterSectionNames.has(group.name)) bySection.set(group.name, group.rows);
    }
    return bySection;
  }, [logicGroups, parameterSectionNames]);
  const blockLogicGroups = useMemo(() => logicGroups.filter((group) => !parameterSectionNames.has(group.name)), [logicGroups, parameterSectionNames]);
  const popupStepsOutsideSections = logicSteps.some((step) => step.show_in_popup && !parameterSectionNames.has(step.popup_section?.trim() || 'No Section'));

  const parameterIssues = useMemo(() => parameterIssuesFor(parameters, values, deal), [parameters, values, deal]);

  const publishParameterValue = (id: string, next: string) => {
    const draft = { ...liveValues.current, [id]: next };
    const recalculated = refreshLockedValues(parameters, draft, deal, agents, lookups ?? { clientId, tables: {} });
    const unchanged = parameters.every((parameter) => (recalculated[parameter.id] ?? '') === (liveValues.current[parameter.id] ?? ''));
    if (unchanged) return;
    const flashed = parameters.filter((parameter) => (
      parameter.id !== id
      && parameter.is_user_editable === false
      && (recalculated[parameter.id] ?? '') !== (liveValues.current[parameter.id] ?? '')
    ));
    liveValues.current = recalculated;
    setValues(recalculated);
    if (flashed.length === 0) return;
    flashScrollId.current = flashed[0].id;
    setRecalcFlash((current) => {
      const nextFlash = { ...current };
      for (const parameter of flashed) nextFlash[parameter.id] = (nextFlash[parameter.id] ?? 0) + 1;
      return nextFlash;
    });
    setParametersOpen(true);
    setCollapsedSections((current) => {
      const nextSections = { ...current };
      for (const parameter of flashed) nextSections[parameter.section?.trim() || 'No Section'] = false;
      return nextSections;
    });
  };

  const toggleSection = (name: string) => {
    setCollapsedSections((current) => ({ ...current, [name]: !current[name] }));
  };

  const toggleLogicSection = (name: string) => {
    setCollapsedLogicSections((current) => ({ ...current, [name]: !current[name] }));
  };

  const closePopup = () => {
    setPopupOpen(false);
    setDraftTemplateId('');
    setSubmitAttempted(false);
    setConfirmingDelete(false);
    setDeleteError('');
  };

  const deleteSubmission = async () => {
    if (submissionIds.length === 0 || isDeletingSubmission) return;
    setIsDeletingSubmission(true);
    setDeleteError('');
    try {
      for (const id of submissionIds) {
        const response = await fetch(`/api/commission-template-submissions?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'x-client-id': clientId },
        });
        const data = await response.json();
        if (!response.ok || data.success === false) {
          throw new Error(data.error || 'Could not delete the template submission.');
        }
      }
      localSubmitRef.current = false;
      clearCommissionModuleCache();
      onSubmissionDeleted?.();
      setPopupOpen(false);
      setDraftTemplateId('');
      setConfirmingDelete(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the template submission.');
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  const submitTemplate = async () => {
    if (!draftTemplateId || !transactionId || isSubmitting) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const issues = parameterIssuesFor(parameters, liveValues.current, deal);
    if (issues.size > 0) {
      setValues({ ...liveValues.current });
      setSubmitAttempted(true);
      setParametersOpen(true);
      setCollapsedSections((current) => {
        const next = { ...current };
        for (const issue of issues.values()) next[issue.section] = false;
        return next;
      });
      return;
    }
    setSubmitAttempted(false);
    setIsSubmitting(true);
    setLoadError('');
    try {
      const parameterValues: Record<string, string> = {};
      for (const parameter of parameters) {
        parameterValues[parameter.parameter_key] = liveValues.current[parameter.id] ?? '';
      }
      const teamCapIds = checkedCapIds.filter((id) => qualifyingCaps.some((cap) => cap.id === id));
      const seenRecipients = new Set<string>();
      const teamCapRecipients = qualifyingCaps.flatMap((cap) => {
        if (!teamCapIds.includes(cap.id) || !cap.recipientAgentId || seenRecipients.has(cap.recipientAgentId)) return [];
        const recipient = agents.find((agent) => agent.id === cap.recipientAgentId);
        if (!recipient) return [];
        seenRecipients.add(recipient.id);
        return [{ id: recipient.id, name: recipient.name, isTeamLead: Boolean(recipient.isTeamLead) }];
      });
      const submittedParametersWithCaps = writeTeamCapSelection(parameterValues, teamCapIds);

      const steps = (await loadTemplateBundle(draftTemplateId, { refresh: true })).steps;
      const needs = formulaDataNeeds(templateFormulaSources(steps, parameters));
      const [submitLedger, lookupsForSubmit] = await Promise.all([
        needs.needsLedger ? loadCommissionLedger(clientId, entities, { refresh: true }) : Promise.resolve([]),
        needs.lookupTables.length > 0 ? loadFormulaLookups(clientId, needs.lookupTables, { refresh: true }) : Promise.resolve({ clientId, tables: {} }),
      ]);
      const applied = applyTemplateLogic({
        steps,
        parameters: parameterValues,
        parameterTypes: Object.fromEntries(parameters.map((parameter) => [parameter.parameter_key, parameter.data_type || ''])),
        deal,
        entities,
        rosterAgents: agents,
        dealAgents,
        totalCommission,
        ledger: submitLedger,
        lookups: lookupsForSubmit,
      });

      clearCommissionModuleCache();
      localSubmitRef.current = true;
      setCommittedTemplateId(draftTemplateId);
      setSubmittedTemplateId(draftTemplateId);
      setSubmittedParameters(submittedParametersWithCaps);
      setSubmittedRows([{ templateId: draftTemplateId, parameters: submittedParametersWithCaps }]);
      setPaymentsWouldChange(false);
      setPaymentDriftReady(true);
      onTeamCapSelection?.(teamCapIds);
      onApplied?.(applied, {
        id: submissionId,
        template_id: draftTemplateId,
        submitted_parameters: submittedParametersWithCaps,
        status: 'SUBMITTED',
        team_cap_ids: teamCapIds,
        team_cap_recipients: teamCapRecipients,
      });
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
  const bolt = useMemo(() => {
    if (!deal || isLoadingTemplates || !submissionReady || !schemaReady) return undefined;
    return templateBoltTone(
      deal,
      templates,
      submittedRows.map((row) => row.templateId),
      fieldTypes,
      paymentsWouldChange,
    );
  }, [deal, isLoadingTemplates, submissionReady, schemaReady, templates, submittedRows, fieldTypes, paymentsWouldChange]);
  const locked = bolt === null;
  // Undefined means eligibility is not known yet. The button waits instead of guessing.
  const checking = bolt === undefined;
  // Submitted shows its check at once and changes to purple if the payment check finds a change.
  const tone = bolt ? bolt.tone : null;
  const templateButtonLabel = singleTemplate
    ? (locked || committedTemplateId === singleTemplate.id ? singleTemplate.template_name : `Add ${singleTemplate.template_name}`)
    : 'Commission Template';
  const templateButtonTitle = locked
    ? 'Not eligible for a commission template'
    : bolt && tone
      ? bolt.label
      : 'Checking template status';
  const StatusIcon = tone ? TEMPLATE_STATUS_ICON[tone].icon : null;

  const openTemplate = (templateId: string) => {
    clearCommissionModuleCache();
    setDraftTemplateId(templateId);
    setPopupOpen(true);
    setTemplateMenuOpen(false);
  };

  const selectedTemplate = templates.find((template) => template.id === draftTemplateId);

  return (
    <div className={embedded ? `${singleTemplate ? 'shrink-0' : 'w-56 sm:w-64'} text-xs` : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xs space-y-3 text-xs transition-colors'}>
      {!embedded && (
        <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
          Commission Template
        </span>
      )}
      <div ref={templateFieldRef} className="relative">
        {templates.length > 0 && (singleTemplate || locked) ? (
          <button
            type="button"
            disabled={locked || checking}
            title={checking ? 'Checking template eligibility' : templateButtonTitle}
            onClick={() => {
              if (!locked && !checking && singleTemplate) openTemplate(singleTemplate.id);
            }}
            className={templateButtonChrome}
          >
            <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{templateButtonLabel}</span>
            {tone && StatusIcon && (
              <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${TEMPLATE_STATUS_ICON[tone].className}`} strokeWidth={2.25} aria-hidden />
            )}
            {!locked && !tone && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" strokeWidth={2} aria-hidden />}
            {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />}
          </button>
        ) : (
        <button
          type="button"
          disabled={isLoadingTemplates || templates.length === 0}
          aria-haspopup="listbox"
          aria-expanded={templateMenuOpen}
          onClick={() => setTemplateMenuOpen((open) => !open)}
          className="group underline-field relative block w-full rounded-t-md pl-2.5 pr-8 pt-1 pb-0.5 border-b border-b-slate-300 dark:border-b-slate-600 text-left transition-colors cursor-pointer focus:outline-none focus-visible:border-b-brand-500 focus-visible:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="block text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-visible:text-brand-600 dark:group-focus-visible:text-brand-400">
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
          <ul ref={templateMenuRef} role="listbox" aria-label="Template" style={{ top: templateMenuBox.top, left: templateMenuBox.left, width: templateMenuBox.width, zIndex: 200 }} className="fixed max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-800">
            {templates.map((template) => (
              <li key={template.id} role="option" aria-selected={template.id === shownTemplateId}>
                <button
                  type="button"
                  onClick={() => openTemplate(template.id)}
                  className={`block w-full cursor-pointer px-2.5 py-1.5 text-left text-xs font-medium ${template.id === shownTemplateId ? 'bg-brand-500/15 text-brand-800 dark:text-brand-200' : 'text-slate-800 hover:bg-brand-500/15 hover:text-brand-800 dark:text-slate-100 dark:hover:text-brand-200'}`}
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
        <div
          className="app-modal fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-[1800px] rounded-xl p-5 shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedTemplate?.template_name || 'Commission template'}</h3>
            {loadError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{loadError}</p>}
            {qualifyingCaps.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">Team caps</span>
                {qualifyingCaps.map((cap) => (
                  <BooleanField
                    key={cap.id}
                    id={`team-cap-${cap.id}`}
                    label={cap.name.trim() || 'Team Cap'}
                    checked={checkedCapIds.includes(cap.id)}
                    onChange={(checked) => {
                      setCheckedCapIds((current) => checked
                        ? [...current, cap.id]
                        : current.filter((id) => id !== cap.id));
                    }}
                  />
                ))}
              </div>
            )}
            <div className="@container/params mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-100 p-4 dark:bg-slate-900">
              <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setParametersOpen((open) => !open)}
                  aria-expanded={parametersOpen}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer"
                >
                  <span className="w-3 shrink-0 text-center text-sm font-bold leading-none text-emerald-600 dark:text-emerald-400">{parametersOpen ? '−' : '+'}</span>
                  <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">Parameters</span>
                </button>
              {parametersOpen && (
                <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">
              {isLoadingParameters ? (
                <p className="text-xs text-slate-500">Loading parameters...</p>
              ) : rows.length === 0 ? (
                <p className="text-xs text-slate-500">This template has no parameters.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {groups.map((group) => {
                    const isUnsectioned = group.name === 'No Section';
                    // A section with any value in it stays open; only an empty one can collapse.
                    const canCollapse = group.rows.every(({ parameter }) => !(values[parameter.id] ?? '').trim());
                    const isCollapsed = canCollapse && collapsedSections[group.name] === true;
                    return (
                    <div key={group.name} className="min-w-0 py-2.5 @min-[720px]/params:grid @min-[720px]/params:grid-cols-[11rem_minmax(0,1fr)] @min-[720px]/params:gap-x-4 @min-[720px]/params:gap-y-1.5">
                      {/* Each section is one row: its name on the left, with a line on its right that runs to the bottom of the
                          section, and its fields and rule text to the right. Faint lines separate the sections. */}
                      <div className={`flex items-start gap-2 border-b pb-1.5 @min-[720px]/params:row-span-2 @min-[720px]/params:border-b-0 @min-[720px]/params:border-r @min-[720px]/params:pb-0 @min-[720px]/params:pr-3 @min-[720px]/params:pt-1 ${isUnsectioned ? 'border-amber-300 dark:border-amber-500/40' : 'border-brand-500/50 dark:border-brand-400/50'}`}>
                        <button
                          type="button"
                          onClick={canCollapse ? () => toggleSection(group.name) : undefined}
                          disabled={!canCollapse}
                          aria-expanded={canCollapse ? !isCollapsed : undefined}
                          title={canCollapse ? (isCollapsed ? 'Expand section' : 'Collapse section') : undefined}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1 text-left disabled:cursor-default ${canCollapse ? 'cursor-pointer transition hover:brightness-95 dark:hover:brightness-125' : ''} ${isUnsectioned ? 'bg-amber-500/10' : 'bg-brand-500/10 dark:bg-brand-500/15'}`}
                        >
                          <span className={`min-w-0 flex-1 truncate text-xs font-bold ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}>
                            {group.name}
                          </span>
                          {canCollapse && (
                            <ChevronDown
                              aria-hidden
                              strokeWidth={2.25}
                              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isCollapsed ? '-rotate-90' : ''} ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}
                            />
                          )}
                        </button>
                      </div>
                      {!isCollapsed && (
                        <div className="mt-1.5 grid gap-x-3 gap-y-1.5 px-1 [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))] @min-[720px]/params:mt-0 @min-[720px]/params:px-0">
                          {group.rows.map(({ parameter, raw }) => (
                            // Every field starts in one narrow column. It widens to two when its label doesn't fit on one line,
                            // or when an agent or text value doesn't fit.
                            <div key={parameter.id} className={parameterNeedsRoom(parameter, values[parameter.id] ?? '', uniqueAgents) ? 'col-span-2' : 'min-w-0'}>
                            <ParameterControl
                              parameter={parameter}
                              value={values[parameter.id] ?? ''}
                              agents={uniqueAgents}
                              message={parameterIssues.get(parameter.id)?.message}
                              flashToken={recalcFlash[parameter.id] ?? 0}
                              onChange={(next) => publishParameterValue(parameter.id, next)}
                              onReset={parameter.is_user_editable === false || parameterValuesMatch(parameter, values[parameter.id] ?? '', raw, uniqueAgents)
                                ? undefined
                                : () => publishParameterValue(parameter.id, raw)}
                            />
                            </div>
                          ))}
                        </div>
                      )}
                      {!isCollapsed && (inlineCalculations.get(group.name)?.length ?? 0) > 0 && (
                        <p className="mt-1.5 px-1 text-[11px] leading-5 text-slate-500 @min-[720px]/params:col-start-2 @min-[720px]/params:mt-0 @min-[720px]/params:px-0 dark:text-slate-400">
                          {inlineCalculations.get(group.name)!.map((row, index) => {
                            const { text, error } = calculationText(row);
                            return (
                              <React.Fragment key={row.id}>
                                {index > 0 && <span aria-hidden className="px-1.5 text-slate-300 dark:text-slate-600">—</span>}
                                <span className="whitespace-nowrap">{row.name}:</span>{' '}
                                <span className={`font-semibold tabular-nums ${error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>{text}</span>
                              </React.Fragment>
                            );
                          })}
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
                </div>
              )}
              </section>
              {(ledgerError || blockLogicGroups.length > 0 || (popupStepsOutsideSections && (!ledger || !lookups))) && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setLogicOpen((open) => !open)}
                    aria-expanded={logicOpen}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer"
                  >
                    <span className="w-3 shrink-0 text-center text-sm font-bold leading-none text-emerald-600 dark:text-emerald-400">{logicOpen ? '−' : '+'}</span>
                    <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">Calculations</span>
                    <span className="text-[10px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">(Read only)</span>
                  </button>
                  {logicOpen && (
                    <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">
                      {ledgerError ? (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{ledgerError}</p>
                      ) : !ledger || !lookups ? (
                        <p className="text-xs text-slate-500">Calculating...</p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                          {blockLogicGroups.map((group) => {
                            const isUnsectioned = group.name === 'No Section';
                            const canCollapse = group.rows.every((row) => {
                              const field = calculationField(row);
                              return field.kind !== 'boolean' && !field.value.trim();
                            });
                            const isCollapsed = canCollapse && collapsedLogicSections[group.name] === true;
                            return (
                              <div key={group.name} className="min-w-0 py-2.5 @min-[720px]/params:grid @min-[720px]/params:grid-cols-[11rem_minmax(0,1fr)] @min-[720px]/params:gap-x-4 @min-[720px]/params:gap-y-1.5">
                                {/* Each section is one row: its name on the left, with a line on its right that runs to the bottom of the
                          section, and its fields and rule text to the right. Faint lines separate the sections. */}
                      <div className={`flex items-start gap-2 border-b pb-1.5 @min-[720px]/params:row-span-2 @min-[720px]/params:border-b-0 @min-[720px]/params:border-r @min-[720px]/params:pb-0 @min-[720px]/params:pr-3 @min-[720px]/params:pt-1 ${isUnsectioned ? 'border-amber-300 dark:border-amber-500/40' : 'border-brand-500/50 dark:border-brand-400/50'}`}>
                                  <button
                                    type="button"
                                    onClick={canCollapse ? () => toggleLogicSection(group.name) : undefined}
                                    disabled={!canCollapse}
                                    aria-expanded={canCollapse ? !isCollapsed : undefined}
                                    title={canCollapse ? (isCollapsed ? 'Expand section' : 'Collapse section') : undefined}
                                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1 text-left disabled:cursor-default ${canCollapse ? 'cursor-pointer transition hover:brightness-95 dark:hover:brightness-125' : ''} ${isUnsectioned ? 'bg-amber-500/10' : 'bg-brand-500/10 dark:bg-brand-500/15'}`}
                                  >
                                    <span className={`min-w-0 flex-1 truncate text-xs font-bold ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}>
                                      {group.name}
                                    </span>
                                    {canCollapse && (
                                      <ChevronDown
                                        aria-hidden
                                        strokeWidth={2.25}
                                        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isCollapsed ? '-rotate-90' : ''} ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}
                                      />
                                    )}
                                  </button>
                                </div>
                                {!isCollapsed && (
                                  <div className="mt-1.5 grid gap-x-3 gap-y-1.5 px-1 [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))] @min-[720px]/params:mt-0 @min-[720px]/params:px-0">
                                    {group.rows.map((row) => {
                                      const field = calculationField(row);
                                      return (
                                        <div key={row.id} className={(field.kind === 'text' && field.value) || labelNeedsRoom(row.name) ? 'col-span-2' : 'min-w-0'}>
                                          <CalculationField row={row} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
              </div>
            </div>
            {submitAttempted && parameterIssues.size > 0 && (
              <p className="pt-3 text-xs font-medium text-rose-600 dark:text-rose-400">
                Fix the highlighted parameters before submitting.
              </p>
            )}
            {deleteError && (
              <p className="pt-3 text-xs font-medium text-rose-600 dark:text-rose-400">{deleteError}</p>
            )}
            <div className="flex items-center justify-between gap-2 pt-3">
              {confirmingDelete ? (
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Delete the saved submission? The waterfall stays as it is.
                </p>
              ) : (
              <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, string> = {};
                  for (const row of rows) next[row.parameter.id] = row.raw;
                  liveValues.current = next;
                  setValues(next);
                }}
                disabled={!rows.some((row) => !parameterValuesMatch(row.parameter, values[row.parameter.id] ?? '', row.raw, uniqueAgents))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Reset all
              </button>
              {submissionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={isSubmitting || isDeletingSubmission}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-300 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Delete submission
                </button>
              )}
              </div>
              )}
              <div className="flex shrink-0 gap-2">
              {confirmingDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={isDeletingSubmission}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSubmission()}
                    disabled={isDeletingSubmission}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-500 text-white transition hover:bg-rose-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isDeletingSubmission ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              ) : (
                <>
              <button type="button" onClick={closePopup} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Close</button>
              <button
                type="button"
                onClick={() => void submitTemplate()}
                disabled={isSubmitting || isLoadingParameters || !draftTemplateId}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white transition hover:bg-brand-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
                </>
              )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
