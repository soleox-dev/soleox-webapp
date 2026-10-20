'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Sigma } from 'lucide-react';
import { FormulaEditor, FormulaHint, type FormulaName } from '../FormulaEditor';
import { BooleanCheckbox } from '@/components/ui/BooleanCheckbox';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { underlineControl } from '@/components/ui/underline-field';

export interface LogicStepDraft {
  rule_name: string;
  rule_key: string;
  section: string;
  apply_condition: string;
  agent_key: string;
  entity_mode: 'fixed' | 'formula';
  payee_entity_id: string;
  payee_formula: string;
  custom_baseline: string;
  calculation_formula: string;
  split_type: 'PERCENT' | 'AMOUNT';
  result_type: CalculationResultType;
  show_in_popup: boolean;
  popup_section: string;
  show_only_when: boolean;
  show_when_formula: string;
}

export type CalculationResultType = 'CURRENCY' | 'NUMBER' | 'PERCENT';

export function canonicalResultType(value: string | null | undefined): CalculationResultType {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'NUMBER' || key === 'PERCENT') return key;
  return 'CURRENCY';
}

export function resultTypeLabel(value: string | null | undefined): string {
  if (canonicalResultType(value) === 'NUMBER') return 'Number';
  if (canonicalResultType(value) === 'PERCENT') return 'Percent';
  return 'Currency';
}

interface LogicStepFormProps {
  draft: LogicStepDraft;
  editing: boolean;
  saving: boolean;
  error: string | null;
  entities: { id: string; entity_name: string }[];
  formulaNames: FormulaName[];
  fieldGroups: { id: string; title: string; fields: FormulaName[] }[];
  ruleFields: FormulaName[];
  popupSections?: string[];
  onChange: (draft: LogicStepDraft) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
  canSave?: boolean;
}

export const LOGIC_SECTIONS = [
  'Off-the-top',
  'Pre-splits',
  'Agent Splits',
  'Level 1 Post-splits',
  'Level 2 Post-splits',
  'Calculation',
] as const;

export function canonicalLogicSection(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (key === 'offthetop') return 'Off-the-top';
  if (key === 'presplit' || key === 'presplits') return 'Pre-splits';
  if (key === 'agentsplit' || key === 'agentsplits') return 'Agent Splits';
  if (key === 'postsplit' || key === 'postsplits' || key === 'level1' || key === 'level1postsplit' || key === 'level1postsplits') return 'Level 1 Post-splits';
  if (key === 'postsplit2' || key === 'level2' || key === 'level2postsplit' || key === 'level2postsplits') return 'Level 2 Post-splits';
  if (key === 'calculation' || key === 'nosection') return 'Calculation';
  return LOGIC_SECTIONS.includes(value as (typeof LOGIC_SECTIONS)[number]) ? value : '';
}

export function logicSectionPostsSplit(section: string): boolean {
  return Boolean(section) && section !== 'Calculation';
}

export function logicSectionShowsAgent(section: string): boolean {
  return logicSectionPostsSplit(section) && section !== 'Off-the-top' && section !== 'Pre-splits';
}

export function logicSectionShowsEntity(section: string): boolean {
  return logicSectionPostsSplit(section) && section !== 'Agent Splits';
}

export function ruleKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key || 'rule';
}

const KEY_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function describeKeyConflict(key: string, names: { name: string; label?: string }[]): string | null {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return null;
  if (!KEY_PATTERN.test(normalized)) {
    return 'The key needs to start with a letter and use only letters, numbers, and underscores.';
  }
  const match = names.find((item) => item.name.trim().toLowerCase() === normalized);
  if (!match) return null;
  const label = match.label?.trim();
  return label ? `That key is already used by ${label}.` : 'That key is already used.';
}

const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
const fieldColumn = 'w-full max-w-[39rem]';
const sideLabel = 'pt-1 text-xs font-bold leading-4 text-slate-900 dark:text-white';
const formulaToggleClass = (on: boolean) =>
  `inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border cursor-pointer ${
    on
      ? 'border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-300'
      : 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
  }`;

function FormulaToggle({
  pressed,
  label,
  title,
  onClick,
}: {
  pressed: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={formulaToggleClass(pressed)}
    >
      <Sigma className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function LabeledRow({
  label,
  htmlFor,
  children,
  note,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
      <label htmlFor={htmlFor} className={sideLabel}>{label}</label>
      <div className="min-w-0 space-y-1">
        {children}
        {note}
      </div>
    </div>
  );
}

export const logicContextNames: FormulaName[] = [
  { name: 'baseline_after_off_the_top', label: 'Balance after off-the-top', kind: 'field' },
  { name: 'baseline_after_pre_splits', label: 'Balance after pre-splits', kind: 'field' },
  { name: 'baseline_after_agent_splits', label: "Agent's split", kind: 'field' },
  { name: 'baseline_after_l1_post_splits', label: "Agent's net after Level 1 post-splits", kind: 'field' },
  { name: 'baseline', label: 'Section baseline', kind: 'field' },
  { name: 'prior_amounts', label: 'Earlier amounts in this section', kind: 'field' },
];

export const ledgerFormulaNames: FormulaName[] = [
  { name: 'transaction_commission_items.final_amount', label: 'Commission line amount', kind: 'field' },
  { name: 'transaction_commission_items.agent_id', label: 'Commission line agent', kind: 'field' },
  { name: 'transaction_commission_items.payee_entity_id', label: 'Commission line entity id', kind: 'field' },
  { name: 'commission_entities.entity_name', label: 'Commission entity name', kind: 'field' },
  { name: 'commission_entities.id', label: 'Commission entity id', kind: 'field' },
  { name: 'transactions.closing_date', label: 'Other deal closing date', kind: 'field' },
  { name: 'transactions.transaction_status', label: 'Other deal status', kind: 'field' },
];

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

export function LogicStepForm({
  draft,
  editing,
  saving,
  error,
  entities,
  formulaNames,
  fieldGroups,
  ruleFields,
  popupSections = [],
  onChange,
  onCancel,
  onSubmit,
  canSave = true,
}: LogicStepFormProps) {
  const ruleKeyConflict = describeKeyConflict(draft.rule_key, [
    ...formulaNames,
    ...ruleFields,
    ...logicContextNames,
    { name: 'total_commission', label: 'Total commission' },
  ]);
  const [showFieldCards, setShowFieldCards] = useState(false);
  const [showCustomBaseline, setShowCustomBaseline] = useState(Boolean(draft.custom_baseline.trim()));
  const [showCondition, setShowCondition] = useState(Boolean(draft.apply_condition.trim()));
  const section = canonicalLogicSection(draft.section);
  const postsSplit = logicSectionPostsSplit(section);
  const showAgent = logicSectionShowsAgent(section);
  const showEntity = logicSectionShowsEntity(section);
  const sharedGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Rules', fields: ruleFields },
    { id: 'rule', title: 'This rule', fields: logicContextNames },
  ];
  const transactionChoices = fieldGroups.find((group) => group.id === 'transactions')?.fields || [];
  const parameterChoices = fieldGroups.find((group) => group.id === 'parameters')?.fields || [];
  const agentChoices = [
    { id: 'transactions', title: 'Transaction fields', fields: transactionChoices },
    { id: 'parameters', title: 'Template parameters', fields: parameterChoices },
    { id: 'rules', title: 'Rules', fields: ruleFields },
  ].filter((group) => group.fields.length > 0);
  const knownAgentKeys = new Set(agentChoices.flatMap((group) => group.fields.map((field) => field.name)));
  const amountNames = [...formulaNames, ...ruleFields, ...logicContextNames, ...ledgerFormulaNames];
  const amountGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Rules', fields: ruleFields },
    { id: 'ledger', title: 'Other deals', fields: ledgerFormulaNames },
    { id: 'rule', title: 'This rule', fields: logicContextNames },
  ];

  return (
    <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
      <form onSubmit={onSubmit} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${showFieldCards ? 'max-w-[min(75rem,calc(100vw-2rem))]' : 'max-w-2xl'}`}>
        <div className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Edit rule' : 'Add rule'}</h3>
            <button
              type="button"
              aria-pressed={showFieldCards}
              onClick={() => setShowFieldCards((open) => !open)}
              className={`shrink-0 px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer ${
                showFieldCards
                  ? 'border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {showFieldCards ? 'Hide Fields and Parameters' : 'Fields and Parameters'}
            </button>
          </div>
          {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-x-auto overflow-y-auto px-6 pb-4">
          <LabeledRow label="Rule Name" htmlFor="rule-name">
            <div className={underlineShell}>
              <input
                id="rule-name"
                required
                value={draft.rule_name}
                onChange={(event) => {
                  const rule_name = event.target.value;
                  const previousAuto = ruleKeyFromName(draft.rule_name);
                  const nextAuto = ruleKeyFromName(rule_name);
                  const rule_key = !draft.rule_key || draft.rule_key === previousAuto ? nextAuto : draft.rule_key;
                  onChange({ ...draft, rule_name, rule_key });
                }}
                className={underlineControl}
              />
            </div>
          </LabeledRow>
          <LabeledRow
            label="Key"
            htmlFor="rule-key"
            note={ruleKeyConflict ? (
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{ruleKeyConflict}</p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Other rules read this key to use the result this rule calculates.</p>
            )}
          >
            <div className={`${underlineShell} ${ruleKeyConflict ? '!border-b-rose-500 focus-within:!border-b-rose-500 focus-within:!shadow-none' : ''}`}>
              <input
                id="rule-key"
                required
                aria-invalid={Boolean(ruleKeyConflict)}
                value={draft.rule_key}
                onChange={(event) => onChange({ ...draft, rule_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300`}
              />
            </div>
          </LabeledRow>
          <LabeledRow
            label="Section"
            htmlFor="rule-section"
            note={<p className="text-[11px] text-slate-500 dark:text-slate-400">Choose Calculation when this rule only stores a value for another rule. It does not post a commission split.</p>}
          >
            <div className={underlineShell}>
              <ClearableSelect
                id="rule-section"
                value={draft.section}
                onChange={(event) => onChange({ ...draft, section: event.target.value })}
                className={`${underlineControl} overview-field-select cursor-pointer`}
              >
                {LOGIC_SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </ClearableSelect>
              <FieldChevron />
            </div>
          </LabeledRow>
          {showAgent && (
            <LabeledRow
              label="Agent"
              htmlFor="rule-agent"
              note={<p className="text-[11px] text-slate-500 dark:text-slate-400">The value of this key is the agent. Choose a transaction field, a template parameter, or another rule.</p>}
            >
              <div className={underlineShell}>
                <ClearableSelect
                  id="rule-agent"
                  aria-label="Agent"
                  value={draft.agent_key}
                  onChange={(event) => onChange({ ...draft, agent_key: event.target.value })}
                  className={`${underlineControl} overview-field-select cursor-pointer font-mono`}
                >
                  {draft.agent_key && !knownAgentKeys.has(draft.agent_key) && (
                    <option value={draft.agent_key}>{draft.agent_key}</option>
                  )}
                  {agentChoices.map((group) => (
                    <optgroup key={group.id} label={group.title}>
                      {group.fields.map((field) => (
                        <option key={`${group.id}-${field.name}`} value={field.name}>{field.label} ({field.name})</option>
                      ))}
                    </optgroup>
                  ))}
                </ClearableSelect>
                <FieldChevron />
              </div>
            </LabeledRow>
          )}

          {showEntity && (
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <label htmlFor="rule-entity" className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Entity</label>
                  <FormulaHint text={draft.entity_mode === 'formula'
                    ? 'Enter a formula to calculate the Entity. Otherwise, click on the formula button to turn it off and select an entity from the dropdown.'
                    : 'Select a fixed Entity from the dropdown. Otherwise, click on the formula button to enter a formula.'} />
                </div>
                <FormulaToggle
                  pressed={draft.entity_mode === 'formula'}
                  label="Entity formula"
                  title={draft.entity_mode === 'formula' ? 'Formula' : 'Fixed'}
                  onClick={() => onChange({ ...draft, entity_mode: draft.entity_mode === 'formula' ? 'fixed' : 'formula' })}
                />
              </div>
              <div className="min-w-0">
                {draft.entity_mode === 'formula' ? (
                  <FormulaEditor
                    hint="The formula result is the entity name."
                    value={draft.payee_formula}
                    onChange={(payee_formula) => onChange({ ...draft, payee_formula })}
                    names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                    fieldGroups={sharedGroups}
                    fieldsAside
                    fieldsOpen={showFieldCards}
                    showFieldsToggle={false}
                  />
                ) : (
                  <div className={underlineShell}>
                    <ClearableSelect
                      id="rule-entity"
                      aria-label="Entity"
                      value={draft.payee_entity_id}
                      onChange={(event) => onChange({ ...draft, payee_entity_id: event.target.value })}
                      className={`${underlineControl} overview-field-select cursor-pointer`}
                    >
                      {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entity_name}</option>)}
                    </ClearableSelect>
                    <FieldChevron />
                  </div>
                )}
              </div>
            </div>
          )}

          {!postsSplit && (
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Visibility</p>
                <button
                  type="button"
                  aria-pressed={draft.show_in_popup}
                  aria-label="Show in Commission Template Form"
                  title="Show in Commission Template Form"
                  onClick={() => onChange({
                    ...draft,
                    show_in_popup: !draft.show_in_popup,
                    popup_section: draft.show_in_popup ? '' : draft.popup_section,
                  })}
                  className={formulaToggleClass(draft.show_in_popup)}
                >
                  {draft.show_in_popup ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
              {draft.show_in_popup && (
                <div className="min-w-0 space-y-3">
                  <label className={`${underlineShell} min-w-0`}>
                    <span className={underlineLabel}>Commission Template Form Section</span>
                    <input
                      value={draft.popup_section}
                      onChange={(event) => onChange({ ...draft, popup_section: event.target.value })}
                      list="logic-popup-sections"
                      placeholder="Example: Broker cap"
                      className={underlineControl}
                    />
                    <datalist id="logic-popup-sections">
                      {popupSections.map((name) => <option key={name} value={name} />)}
                    </datalist>
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <BooleanCheckbox
                      id="show-only-when"
                      checked={draft.show_only_when}
                      onChange={(checked) => onChange({
                        ...draft,
                        show_only_when: checked,
                        show_when_formula: checked ? draft.show_when_formula : '',
                      })}
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Show <span className="font-bold">ONLY</span> under specific conditions
                    </span>
                  </label>
                  {draft.show_only_when && (
                    <FormulaEditor
                      label="Show when"
                      hint="This result is shown only when the formula is true. A section stays hidden when none of its results qualify."
                      value={draft.show_when_formula}
                      onChange={(show_when_formula) => onChange({ ...draft, show_when_formula })}
                      names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                      fieldGroups={sharedGroups}
                      fieldsAside
                      fieldsOpen={showFieldCards}
                      showFieldsToggle={false}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {postsSplit && (
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <p className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Condition</p>
                  <FormulaHint text="Optional. Leave this off to always apply this rule." />
                </div>
                <FormulaToggle
                  pressed={showCondition}
                  label="Condition formula"
                  title={showCondition ? 'Formula' : 'Always apply'}
                  onClick={() => {
                    const open = !showCondition;
                    setShowCondition(open);
                    if (!open) onChange({ ...draft, apply_condition: '' });
                  }}
                />
              </div>
              {showCondition && (
                <div className="min-w-0">
                  <FormulaEditor
                    hint="This rule will be applied only if the formula evaluates to true."
                    value={draft.apply_condition}
                    onChange={(apply_condition) => onChange({ ...draft, apply_condition })}
                    names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                    fieldGroups={sharedGroups}
                    fieldsAside
                    fieldsOpen={showFieldCards}
                    showFieldsToggle={false}
                  />
                </div>
              )}
            </div>
          )}

          <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Custom Baseline</p>
              <FormulaToggle
                pressed={showCustomBaseline}
                label="Custom baseline formula"
                title={showCustomBaseline ? 'Formula' : 'Section baseline'}
                onClick={() => {
                  const open = !showCustomBaseline;
                  setShowCustomBaseline(open);
                  if (!open) onChange({ ...draft, custom_baseline: '' });
                }}
              />
            </div>
            {showCustomBaseline && (
              <div className="min-w-0">
                <FormulaEditor
                  hint="Optional. The amount formula can refer to this result as baseline."
                  value={draft.custom_baseline}
                  onChange={(custom_baseline) => onChange({ ...draft, custom_baseline })}
                  names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                  fieldGroups={sharedGroups}
                  fieldsAside
                  fieldsOpen={showFieldCards}
                  showFieldsToggle={false}
                />
              </div>
            )}
          </div>

          {!postsSplit && (
            <LabeledRow
              label="Result Type"
              htmlFor="rule-result-type"
              note={<p className="text-[11px] text-slate-500 dark:text-slate-400">Currency shows money. Number shows a count. Percent shows a rate, so 0.05 displays as 5%.</p>}
            >
              <div className={underlineShell}>
                <ClearableSelect
                  id="rule-result-type"
                  value={draft.result_type}
                  onChange={(event) => onChange({ ...draft, result_type: canonicalResultType(event.target.value) })}
                  className={`${underlineControl} overview-field-select cursor-pointer`}
                >
                  <option value="CURRENCY">Currency</option>
                  <option value="NUMBER">Number</option>
                  <option value="PERCENT">Percent</option>
                </ClearableSelect>
                <FieldChevron />
              </div>
            </LabeledRow>
          )}

          <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2`}>
            <div className="flex h-6 items-center gap-1">
              <p className="whitespace-nowrap text-xs font-bold leading-4 text-slate-900 dark:text-white">Rule Calculation</p>
              <FormulaHint text={postsSplit ? 'How the dollar amount is calculated.' : 'How this result is calculated.'} />
            </div>
            <div className="min-w-0 space-y-2">
              {postsSplit && (
                <div>
                  <label className="flex h-6 items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <input
                      type="checkbox"
                      checked={draft.split_type === 'PERCENT'}
                      onChange={(event) => onChange({ ...draft, split_type: event.target.checked ? 'PERCENT' : 'AMOUNT' })}
                    />
                    <span>Show resulting waterfall split with percent</span>
                  </label>
                  <p className="mt-1 pl-[1.375rem] text-[11px] font-medium text-slate-500 dark:text-slate-400">The formula below always calculates a dollar amount. Checking this shows that amount as a percent of the section pool.</p>
                </div>
              )}
              <FormulaEditor
                label="Amount Formula"
                hint="The result of this formula will be the amount applied to this rule. Use baseline_after_off_the_top, baseline_after_pre_splits, baseline_after_agent_splits, or baseline_after_l1_post_splits. baseline is the section default, or the custom baseline when one is set."
                value={draft.calculation_formula}
                onChange={(calculation_formula) => onChange({ ...draft, calculation_formula })}
                names={amountNames}
                fieldGroups={amountGroups}
                fieldsAside
                fieldsOpen={showFieldCards}
                showFieldsToggle={false}
              />
            </div>
          </div>
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
          <button type="submit" disabled={saving || Boolean(ruleKeyConflict) || !canSave} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save rule'}</button>
        </div>
      </form>
    </div>
  );
}
