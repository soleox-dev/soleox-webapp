'use client';

import React, { useState } from 'react';
import { FormulaEditor, type FormulaName } from '../FormulaEditor';
import { ClearableSelect } from '@/components/ui/ClearableSelect';

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
  show_in_popup: boolean;
  popup_section: string;
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

const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
const underlineControl =
  'w-full border-0 bg-transparent p-0 h-5 text-xs leading-4 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500';
const fieldColumn = 'w-full max-w-[39rem]';

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
}: LogicStepFormProps) {
  const [showFieldCards, setShowFieldCards] = useState(false);
  const [showCustomBaseline, setShowCustomBaseline] = useState(Boolean(draft.custom_baseline.trim()));
  const section = canonicalLogicSection(draft.section);
  const postsSplit = logicSectionPostsSplit(section);
  const showAgent = logicSectionShowsAgent(section);
  const showEntity = logicSectionShowsEntity(section);
  const sharedGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Logic rules', fields: ruleFields },
    { id: 'rule', title: 'This rule', fields: logicContextNames },
  ];
  const transactionChoices = fieldGroups.find((group) => group.id === 'transactions')?.fields || [];
  const parameterChoices = fieldGroups.find((group) => group.id === 'parameters')?.fields || [];
  const agentChoices = [
    { id: 'transactions', title: 'Transaction fields', fields: transactionChoices },
    { id: 'parameters', title: 'Template parameters', fields: parameterChoices },
    { id: 'rules', title: 'Logic rules', fields: ruleFields },
  ].filter((group) => group.fields.length > 0);
  const knownAgentKeys = new Set(agentChoices.flatMap((group) => group.fields.map((field) => field.name)));
  const amountNames = [...formulaNames, ...ruleFields, ...logicContextNames, ...ledgerFormulaNames];
  const amountGroups = [
    ...fieldGroups,
    { id: 'rules', title: 'Logic rules', fields: ruleFields },
    { id: 'ledger', title: 'Other deals', fields: ledgerFormulaNames },
    { id: 'rule', title: 'This rule', fields: logicContextNames },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
      <form onSubmit={onSubmit} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${showFieldCards ? 'max-w-[min(75rem,calc(100vw-2rem))]' : 'max-w-2xl'}`}>
        <div className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editing ? 'Edit logic rule' : 'Add logic rule'}</h3>
            <button
              type="button"
              aria-pressed={showFieldCards}
              onClick={() => setShowFieldCards((open) => !open)}
              className={`shrink-0 px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer ${
                showFieldCards
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {showFieldCards ? 'Hide Fields and Parameters' : 'Fields and Parameters'}
            </button>
          </div>
          {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-x-auto overflow-y-auto px-6 pb-4">
          <label className={`${underlineShell} ${fieldColumn}`}>
            <span className={underlineLabel}>Rule</span>
            <input
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
          </label>
          <div className={`${fieldColumn} space-y-1`}>
            <label className={underlineShell}>
              <span className={underlineLabel}>Key</span>
              <input
                required
                value={draft.rule_key}
                onChange={(event) => onChange({ ...draft, rule_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300`}
              />
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Other rules read this key to use the result this rule calculates.</p>
          </div>

          <label className={`${underlineShell} ${fieldColumn}`}>
            <span className={underlineLabel}>Section</span>
            <ClearableSelect
              value={draft.section}
              onChange={(event) => onChange({ ...draft, section: event.target.value })}
              className={`${underlineControl} overview-field-select cursor-pointer`}
            >
              {LOGIC_SECTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
            </ClearableSelect>
            <FieldChevron />
          </label>
          <p className={`${fieldColumn} text-[11px] text-slate-500 dark:text-slate-400`}>Choose Calculation when this rule only stores a value for another rule. It does not post a commission split.</p>
          {!postsSplit && (
            <>
              <label className={`${fieldColumn} flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-300`}>
                <input
                  type="checkbox"
                  checked={draft.show_in_popup}
                  onChange={(event) => onChange({
                    ...draft,
                    show_in_popup: event.target.checked,
                    popup_section: event.target.checked ? draft.popup_section : '',
                  })}
                  className="mt-0.5"
                />
                <span>
                  Show this result when the template is applied
                  <span className="mt-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">The value appears in the template popup so the user can see how later rules were calculated.</span>
                </span>
              </label>
              {draft.show_in_popup && (
                <label className={`${underlineShell} ${fieldColumn}`}>
                  <span className={underlineLabel}>Popup section</span>
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
              )}
            </>
          )}

          {postsSplit && (
            <div className="space-y-1">
              <div className={`${fieldColumn} space-y-1`}>
                <p className={underlineLabel}>Condition</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Leave blank to always apply this rule. Otherwise write the formula that must be true.</p>
              </div>
              <FormulaEditor
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

          {showAgent && (
            <div className={`${fieldColumn} space-y-1`}>
              <label className={underlineShell}>
                <span className={underlineLabel}>Agent</span>
                <ClearableSelect
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
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">The value of this key is the agent. Choose a transaction field, a template parameter, or another rule.</p>
            </div>
          )}

          {showEntity && (
            <div className="space-y-1">
              <div className={`${fieldColumn} flex items-center justify-between gap-3`}>
                <p className={underlineLabel}>Entity</p>
                <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, entity_mode: 'fixed' })}
                    className={`px-2 py-0.5 text-[11px] font-bold cursor-pointer ${draft.entity_mode === 'fixed' ? 'bg-emerald-500 text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    Fixed
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...draft, entity_mode: 'formula' })}
                    className={`px-2 py-0.5 text-[11px] font-bold cursor-pointer ${draft.entity_mode === 'formula' ? 'bg-emerald-500 text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    Formula
                  </button>
                </div>
              </div>
              {draft.entity_mode === 'formula' ? (
                <>
                  <p className={`${fieldColumn} text-[11px] text-slate-500 dark:text-slate-400`}>The formula result is the entity name.</p>
                  <FormulaEditor
                    value={draft.payee_formula}
                    onChange={(payee_formula) => onChange({ ...draft, payee_formula })}
                    names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                    fieldGroups={sharedGroups}
                    fieldsAside
                    fieldsOpen={showFieldCards}
                    showFieldsToggle={false}
                  />
                </>
              ) : (
                <label className={`${underlineShell} ${fieldColumn}`}>
                  <ClearableSelect
                    aria-label="Entity"
                    value={draft.payee_entity_id}
                    onChange={(event) => onChange({ ...draft, payee_entity_id: event.target.value })}
                    className={`${underlineControl} overview-field-select cursor-pointer`}
                  >
                    {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entity_name}</option>)}
                  </ClearableSelect>
                  <FieldChevron />
                </label>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className={`${fieldColumn} flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-300`}>
              <input
                type="checkbox"
                checked={showCustomBaseline}
                onChange={(event) => {
                  const open = event.target.checked;
                  setShowCustomBaseline(open);
                  if (!open) onChange({ ...draft, custom_baseline: '' });
                }}
                className="mt-0.5"
              />
              <span>
                Custom baseline
                <span className="mt-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Optional. Leave this off and use a named baseline in the formula.</span>
              </span>
            </label>
            {showCustomBaseline && (
              <>
                <p className={`${fieldColumn} text-[11px] text-slate-500 dark:text-slate-400`}>Formula for the amount this rule starts from. The amount formula can refer to that result as baseline.</p>
                <FormulaEditor
                  value={draft.custom_baseline}
                  onChange={(custom_baseline) => onChange({ ...draft, custom_baseline })}
                  names={[...formulaNames, ...ruleFields, ...logicContextNames]}
                  fieldGroups={sharedGroups}
                  fieldsAside
                  fieldsOpen={showFieldCards}
                  showFieldsToggle={false}
                />
              </>
            )}
          </div>

          <div className="space-y-1">
            <div className={`${fieldColumn} space-y-1`}>
              <p className={underlineLabel}>Formula</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">How the amount is calculated. Use baseline_after_off_the_top, baseline_after_pre_splits, baseline_after_agent_splits, or baseline_after_l1_post_splits. baseline is the section default, or the custom baseline when one is set.</p>
            </div>
            <FormulaEditor
              value={draft.calculation_formula}
              onChange={(calculation_formula) => onChange({ ...draft, calculation_formula })}
              names={amountNames}
              fieldGroups={amountGroups}
              fieldsAside
              fieldsOpen={showFieldCards}
              showFieldsToggle={false}
            />
          </div>

          {postsSplit && (
            <>
              <label className={`${underlineShell} ${fieldColumn}`}>
                <span className={underlineLabel}>Split type</span>
                <ClearableSelect
                  value={draft.split_type}
                  onChange={(event) => onChange({ ...draft, split_type: event.target.value === 'PERCENT' ? 'PERCENT' : 'AMOUNT' })}
                  className={`${underlineControl} overview-field-select cursor-pointer`}
                >
                  <option value="AMOUNT">Amount</option>
                  <option value="PERCENT">Percent</option>
                </ClearableSelect>
                <FieldChevron />
              </label>
              <p className={`${fieldColumn} text-[11px] text-slate-500 dark:text-slate-400`}>Percent converts the formula result into a share of this section&apos;s pool. Amount keeps it in dollars.</p>
            </>
          )}
        </div>
        <div className="shrink-0 flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save rule'}</button>
        </div>
      </form>
    </div>
  );
}
