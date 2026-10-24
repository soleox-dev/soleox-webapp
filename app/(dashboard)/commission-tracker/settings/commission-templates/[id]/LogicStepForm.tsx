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
  divider_below: boolean;
  /** 'BONUS' on an Agent Splits rule: moves the amount from from_agent_key's agent to this rule's agent. */
  rule_kind: '' | 'BONUS';
  from_agent_key: string;
  /**
   * Off-the-top or Pre-splits: the agents who pay this credit from their own splits (empty: off the top).
   * An adjustment: the agents who pay it (empty: every agent).
   */
  paid_by_agent_keys: string[];
  paid_share_by: 'split' | 'equal' | 'custom' | 'typed';
  /** Post-splits: '' is a post-split for the rule's agent; a stage makes it an adjustment (stages.ts). */
  stage: '' | 'BEFORE_PLAN' | 'AFTER_PLAN';
  /** '' is the section's own level; otherwise "3", "4", … */
  level: string;
  /** For an adjustment divided by split share: whose amounts divide it. '' is the agents' splits. */
  share_basis: '' | 'split' | 'after_before_plan' | 'after_plan' | 'at_level';
  /** For custom percents or typed amounts: one formula per Paid By agent, in the same order. */
  paid_shares: string[];
}

/** The level a section stands for: Off-the-top 1, Pre-splits 2, Level 1 and Level 2 post-splits. */
export function sectionLevel(section: string): number {
  return section === 'Pre-splits' || section === 'Level 2 Post-splits' ? 2 : 1;
}

const SHARE_BASIS_LABELS: Record<string, string> = {
  split: "the Agents' Splits",
  after_before_plan: 'What They Have After Before Plan',
  after_plan: 'What They Have After the Plan',
  at_level: 'What They Have at This Level',
};

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
  'block truncate text-2xs leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-brand-600 dark:group-focus-within/field:text-brand-400';
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

/** A key whose value is an agent: a transaction field, a template parameter or a rule. */
function AgentKeySelect({
  id,
  label,
  value,
  groups,
  known,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  groups: { id: string; title: string; fields: FormulaName[] }[];
  known: Set<string>;
  onChange: (key: string) => void;
}) {
  return (
    <div className={underlineShell}>
      <ClearableSelect id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${underlineControl} overview-field-select cursor-pointer font-mono`}>
        <option value="">{label}</option>
        {value && !known.has(value) && <option value={value}>{value}</option>}
        {/* ClearableSelect reads only direct <option> children, so the groups are flattened. */}
        {groups.flatMap((group) => group.fields.map((field) => (
          <option key={`${group.id}-${field.name}`} value={field.name}>{field.label} ({field.name})</option>
        )))}
      </ClearableSelect>
      <FieldChevron />
    </div>
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
  { name: 'baseline_after_off_the_top', label: 'Balance After Off-the-Top', kind: 'field' },
  { name: 'baseline_after_pre_splits', label: 'Balance After Pre-Splits', kind: 'field' },
  { name: 'baseline_after_agent_splits', label: "Agent's Split", kind: 'field' },
  { name: 'baseline_after_l1_post_splits', label: "Agent's Net After Level 1 Post-Splits", kind: 'field' },
  { name: 'baseline', label: 'Section Baseline', kind: 'field' },
  { name: 'prior_amounts', label: 'Earlier Amounts in This Section', kind: 'field' },
];

export const ledgerFormulaNames: FormulaName[] = [
  { name: 'transaction_commission_items.final_amount', label: 'Commission Line Amount', kind: 'field' },
  { name: 'transaction_commission_items.agent_id', label: 'Commission Line Agent', kind: 'field' },
  { name: 'transaction_commission_items.payee_entity_id', label: 'Commission Line Entity ID', kind: 'field' },
  { name: 'commission_entities.entity_name', label: 'Commission Entity Name', kind: 'field' },
  { name: 'commission_entities.id', label: 'Commission Entity ID', kind: 'field' },
  { name: 'transactions.closing_date', label: 'Other Deal Closing Date', kind: 'field' },
  { name: 'transactions.transaction_status', label: 'Other Deal Status', kind: 'field' },
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
    { name: 'total_commission', label: 'Total Commission' },
  ]);
  const [showFieldCards, setShowFieldCards] = useState(false);
  const [showCustomBaseline, setShowCustomBaseline] = useState(Boolean(draft.custom_baseline.trim()));
  const [showCondition, setShowCondition] = useState(Boolean(draft.apply_condition.trim()));
  const section = canonicalLogicSection(draft.section);
  const postsSplit = logicSectionPostsSplit(section);
  // An adjustment names its payers under Paid By instead of one agent.
  const showAgent = logicSectionShowsAgent(section) && !draft.stage;
  const showEntity = logicSectionShowsEntity(section);
  const sharedGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Rules', fields: ruleFields },
    { id: 'rule', title: 'This Rule', fields: logicContextNames },
  ];
  const transactionChoices = fieldGroups.find((group) => group.id === 'transactions')?.fields || [];
  const parameterChoices = fieldGroups.find((group) => group.id === 'parameters')?.fields || [];
  const agentChoices = [
    { id: 'transactions', title: 'Transaction Fields', fields: transactionChoices },
    { id: 'parameters', title: 'Template Parameters', fields: parameterChoices },
    { id: 'rules', title: 'Rules', fields: ruleFields },
  ].filter((group) => group.fields.length > 0);
  const knownAgentKeys = new Set(agentChoices.flatMap((group) => group.fields.map((field) => field.name)));
  const amountNames = [...formulaNames, ...ruleFields, ...logicContextNames, ...ledgerFormulaNames];
  const amountGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Rules', fields: ruleFields },
    { id: 'ledger', title: 'Other Deals', fields: ledgerFormulaNames },
    { id: 'rule', title: 'This Rule', fields: logicContextNames },
  ];

  return (
    <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
      <form onSubmit={onSubmit} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${showFieldCards ? 'max-w-[min(75rem,calc(100vw-2rem))]' : 'max-w-2xl'}`}>
        <div className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Edit Rule' : 'Add Rule'}</h3>
            <button
              type="button"
              aria-pressed={showFieldCards}
              onClick={() => setShowFieldCards((open) => !open)}
              className={`shrink-0 px-2.5 py-1 text-2xs font-bold rounded-lg border cursor-pointer ${
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
                  // A new rule's key follows its name. A saved rule keeps its key; renaming it is a separate step
                  // that also updates the formulas using it.
                  const rule_key = !editing && (!draft.rule_key || draft.rule_key === previousAuto) ? nextAuto : draft.rule_key;
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
              <p className="text-2xs font-medium text-rose-600 dark:text-rose-400">{ruleKeyConflict}</p>
            ) : (
              <p className="text-2xs text-slate-500 dark:text-slate-400">Other rules read this key to use the result this rule calculates.</p>
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
            note={<p className="text-2xs text-slate-500 dark:text-slate-400">Choose Calculation when this rule only stores a value for another rule. It does not post a commission split.</p>}
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
          {section === 'Agent Splits' && (
            <LabeledRow
              label="Line Type"
              htmlFor="rule-kind"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">{draft.rule_kind === 'BONUS'
                ? 'Moves this amount from one agent\'s split to another\'s after every split is worked out. Commission Plans share fees by the split before bonuses.'
                : 'This rule\'s amount is the agent\'s split.'}</p>}
            >
              <div className={underlineShell}>
                <ClearableSelect
                  id="rule-kind"
                  aria-label="Line Type"
                  value={draft.rule_kind}
                  onChange={(event) => onChange({ ...draft, rule_kind: event.target.value === 'BONUS' ? 'BONUS' : '', from_agent_key: event.target.value === 'BONUS' ? draft.from_agent_key : '' })}
                  className={`${underlineControl} overview-field-select cursor-pointer`}
                >
                  <option value="">Agent Split</option>
                  <option value="BONUS">Bonus</option>
                </ClearableSelect>
                <FieldChevron />
              </div>
            </LabeledRow>
          )}
          {showAgent && (
            <LabeledRow
              label={section === 'Agent Splits' && draft.rule_kind === 'BONUS' ? 'To Agent' : 'Agent'}
              htmlFor="rule-agent"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">The value of this key is the agent. Choose a transaction field, a template parameter, or another rule.</p>}
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
          {section === 'Agent Splits' && draft.rule_kind === 'BONUS' && (
            <LabeledRow label="From Agent" htmlFor="rule-from-agent" note={<p className="text-2xs text-slate-500 dark:text-slate-400">The agent whose split pays the bonus, often the team lead.</p>}>
              <AgentKeySelect id="rule-from-agent" label="From Agent" value={draft.from_agent_key} groups={agentChoices} known={knownAgentKeys} onChange={(from_agent_key) => onChange({ ...draft, from_agent_key })} />
            </LabeledRow>
          )}

          {showEntity && (
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <label htmlFor="rule-entity" className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Entity</label>
                  <FormulaHint text={draft.entity_mode === 'formula'
                    ? 'Enter a formula to calculate the Entity. Otherwise, click on the formula button to turn it off and select an entity from the dropdown.'
                    : 'Select a fixed entity from the dropdown. Otherwise, click on the formula button to enter a formula.'} />
                </div>
                <FormulaToggle
                  pressed={draft.entity_mode === 'formula'}
                  label="Entity Formula"
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

          {(section === 'Off-the-top' || section === 'Pre-splits' || section === 'Level 1 Post-splits' || section === 'Level 2 Post-splits') && (
            <LabeledRow
              label="Level"
              htmlFor="rule-level"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">Every percent in a level is taken from the same amount; each level starts from what the levels above leave.</p>}
            >
              <div className={underlineShell}>
                <ClearableSelect
                  id="rule-level"
                  aria-label="Level"
                  value={draft.level || String(sectionLevel(section))}
                  onChange={(event) => onChange({ ...draft, level: Number(event.target.value) === sectionLevel(section) ? '' : event.target.value })}
                  className={`${underlineControl} overview-field-select cursor-pointer`}
                >
                  {[1, 2, 3, 4, 5].map((level) => <option key={level} value={String(level)}>Level {level}</option>)}
                </ClearableSelect>
                <FieldChevron />
              </div>
            </LabeledRow>
          )}

          {(section === 'Level 1 Post-splits' || section === 'Level 2 Post-splits') && (
            <LabeledRow
              label="Applies To"
              htmlFor="rule-stage"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">{draft.stage === 'BEFORE_PLAN'
                ? 'An adjustment: comes off the paying agents\' splits before their Commission Plan, so the plan charges on less.'
                : draft.stage === 'AFTER_PLAN'
                  ? 'An adjustment: comes off the paying agents\' net after their Commission Plan, such as a TC fee.'
                  : 'A post-split for one agent, chosen below.'}</p>}
            >
              <div className={underlineShell}>
                <ClearableSelect
                  id="rule-stage"
                  aria-label="Applies To"
                  value={draft.stage}
                  onChange={(event) => {
                    const stage = event.target.value === 'BEFORE_PLAN' || event.target.value === 'AFTER_PLAN' ? event.target.value : '';
                    onChange({ ...draft, stage, ...(stage ? { agent_key: '' } : { paid_by_agent_keys: [], paid_shares: [], share_basis: '' }) });
                  }}
                  className={`${underlineControl} overview-field-select cursor-pointer`}
                >
                  <option value="">One Agent&apos;s Post-Split</option>
                  <option value="BEFORE_PLAN">Adjustment Before the Plan</option>
                  <option value="AFTER_PLAN">Adjustment After the Plan</option>
                </ClearableSelect>
                <FieldChevron />
              </div>
            </LabeledRow>
          )}

          {(section === 'Level 1 Post-splits' || section === 'Level 2 Post-splits') && draft.stage && (
            <LabeledRow
              label="Paid By"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">{draft.paid_by_agent_keys.length ? 'Only these agents pay it.' : 'Every agent on the deal pays it.'}</p>}
            >
              <div className="space-y-2">
                {draft.paid_by_agent_keys.length > 0 && (
                  <div className="space-y-1.5">
                    {draft.paid_by_agent_keys.map((key, index) => (
                      <div key={key} className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-2xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {key}
                          <button type="button" onClick={() => onChange({ ...draft, paid_by_agent_keys: draft.paid_by_agent_keys.filter((item) => item !== key), paid_shares: draft.paid_shares.filter((_, i) => i !== index) })} className="cursor-pointer text-slate-400 hover:text-rose-500" aria-label={`Remove ${key}`} title={`Remove ${key}`}>×</button>
                        </span>
                        {(draft.paid_share_by === 'custom' || draft.paid_share_by === 'typed') && (
                          <input
                            aria-label={`${key} ${draft.paid_share_by === 'typed' ? 'Amount' : 'Share'}`}
                            value={draft.paid_shares[index] || ''}
                            onChange={(event) => {
                              const paid_shares = draft.paid_by_agent_keys.map((_, i) => (i === index ? event.target.value : draft.paid_shares[i] || ''));
                              onChange({ ...draft, paid_shares });
                            }}
                            placeholder={draft.paid_share_by === 'typed' ? 'Dollars, e.g. 300 or a1_credit' : 'Percent, e.g. 60'}
                            className={`${underlineControl} max-w-56 border-b border-slate-300 font-mono text-xs dark:border-slate-600`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <AgentKeySelect
                  id="rule-adjustment-paid-by"
                  label={draft.paid_by_agent_keys.length ? 'Add Another Agent' : 'Every Agent'}
                  value=""
                  groups={agentChoices}
                  known={knownAgentKeys}
                  onChange={(key) => key && !draft.paid_by_agent_keys.includes(key) && onChange({ ...draft, paid_by_agent_keys: [...draft.paid_by_agent_keys, key] })}
                />
                {draft.split_type === 'AMOUNT' && draft.paid_by_agent_keys.length !== 1 && (
                  <div className={underlineShell}>
                    <ClearableSelect
                      aria-label="Divided"
                      value={draft.paid_share_by}
                      onChange={(event) => {
                        const value = event.target.value;
                        const paid_share_by = value === 'equal' || value === 'custom' || value === 'typed' ? value : 'split';
                        onChange({ ...draft, paid_share_by, ...(paid_share_by === 'split' ? {} : { share_basis: '' }) });
                      }}
                      className={`${underlineControl} overview-field-select cursor-pointer`}
                    >
                      <option value="split">Divided by Split Share</option>
                      <option value="equal">Divided Equally</option>
                      <option value="custom" disabled={!draft.paid_by_agent_keys.length}>Divided by Custom Percents</option>
                      <option value="typed" disabled={!draft.paid_by_agent_keys.length}>Typed Amount per Agent</option>
                    </ClearableSelect>
                    <FieldChevron />
                  </div>
                )}
                {draft.split_type === 'AMOUNT' && draft.paid_share_by === 'split' && draft.paid_by_agent_keys.length !== 1 && (
                  <div className={underlineShell}>
                    <ClearableSelect
                      aria-label="Share Basis"
                      value={draft.share_basis || 'split'}
                      onChange={(event) => onChange({ ...draft, share_basis: event.target.value === 'split' ? '' : event.target.value as LogicStepDraft['share_basis'] })}
                      className={`${underlineControl} overview-field-select cursor-pointer`}
                    >
                      {(draft.stage === 'BEFORE_PLAN' ? ['split', 'at_level'] : ['split', 'after_before_plan', 'after_plan', 'at_level']).map((basis) => (
                        <option key={basis} value={basis}>By {SHARE_BASIS_LABELS[basis]}</option>
                      ))}
                    </ClearableSelect>
                    <FieldChevron />
                  </div>
                )}
                {draft.split_type === 'PERCENT' && (
                  <p className="text-2xs text-slate-500 dark:text-slate-400">A percent adjustment: each paying agent pays this percent of their own amount at this point. The formula must give a percent.</p>
                )}
              </div>
            </LabeledRow>
          )}

          {(section === 'Off-the-top' || section === 'Pre-splits') && (
            <LabeledRow
              label="Paid By"
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">{draft.paid_by_agent_keys.length
                ? 'Comes out of only these agents\' splits, before their Commission Plan lines, instead of off the top.'
                : 'Comes off the top, so every agent shares it by their split.'}</p>}
            >
              <div className="space-y-2">
                {draft.paid_by_agent_keys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.paid_by_agent_keys.map((key) => (
                      <span key={key} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-2xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {key}
                        <button type="button" onClick={() => onChange({ ...draft, paid_by_agent_keys: draft.paid_by_agent_keys.filter((item) => item !== key) })} className="cursor-pointer text-slate-400 hover:text-rose-500" aria-label={`Remove ${key}`} title={`Remove ${key}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <AgentKeySelect
                  id="rule-paid-by"
                  label={draft.paid_by_agent_keys.length ? 'Add Another Agent' : 'Everyone (Off the Top)'}
                  value=""
                  groups={agentChoices}
                  known={knownAgentKeys}
                  onChange={(key) => key && !draft.paid_by_agent_keys.includes(key) && onChange({ ...draft, paid_by_agent_keys: [...draft.paid_by_agent_keys, key] })}
                />
                {draft.paid_by_agent_keys.length > 1 && (
                  <div className={underlineShell}>
                    <ClearableSelect
                      aria-label="Share By"
                      value={draft.paid_share_by}
                      onChange={(event) => onChange({ ...draft, paid_share_by: event.target.value === 'equal' ? 'equal' : 'split' })}
                      className={`${underlineControl} overview-field-select cursor-pointer`}
                    >
                      <option value="split">Shared by Their Split %</option>
                      <option value="equal">Shared Equally</option>
                    </ClearableSelect>
                    <FieldChevron />
                  </div>
                )}
              </div>
            </LabeledRow>
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
                  <label className="flex cursor-pointer items-center gap-2">
                    <BooleanCheckbox
                      id="divider-below"
                      checked={draft.divider_below}
                      onChange={(checked) => onChange({ ...draft, divider_below: checked })}
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Add Horizontal Divider Below This Rule</span>
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
                      Show <span className="font-bold">ONLY</span> Under Specific Conditions
                    </span>
                  </label>
                  {draft.show_only_when && (
                    <FormulaEditor
                      label="Show When"
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
                  label="Condition Formula"
                  title={showCondition ? 'Formula' : 'Always Apply'}
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
                label="Custom Baseline Formula"
                title={showCustomBaseline ? 'Formula' : 'Section Baseline'}
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
              note={<p className="text-2xs text-slate-500 dark:text-slate-400">Currency shows money. Number shows a count. Percent shows a rate, so 0.05 displays as 5%.</p>}
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
                    <span>Show Resulting Waterfall Split with Percent</span>
                  </label>
                  <p className="mt-1 pl-[1.375rem] text-2xs font-medium text-slate-500 dark:text-slate-400">The formula below always calculates a dollar amount. Checking this shows that amount as a percent of the section pool.</p>
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
          <button type="submit" disabled={saving || Boolean(ruleKeyConflict) || !canSave} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save Rule'}</button>
        </div>
      </form>
    </div>
  );
}
