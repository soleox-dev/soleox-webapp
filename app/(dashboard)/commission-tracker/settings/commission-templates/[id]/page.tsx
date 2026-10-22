'use client';

import { phoneSheet, phoneSheetFlush } from '@/lib/page-frame';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormulaEditor, FormulaExplain, FormulaHint, FormulaPreview, type FormulaName } from '../FormulaEditor';
import { BulkRuleRename } from './BulkRuleRename';
import { LogicStepForm, LOGIC_SECTIONS, canonicalLogicSection, canonicalResultType, logicSectionShowsAgent, logicSectionShowsEntity, logicContextNames, ledgerFormulaNames, resultTypeLabel, ruleKeyFromName, describeKeyConflict, type LogicStepDraft } from './LogicStepForm';
import { EditPencil } from '@/components/ui/edit-pencil';
import { TrashIcon } from '@/components/ui/trash-icon';
import { DragHandle, moveItem, useDragReorder } from '@/components/ui/reorder-controls';
import { normalizeFormula, validateFormula } from '../formula-validator';
import { interpretValidationRule } from '@/lib/parameter-validation';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { Copy, ListChecks, Rows3 } from 'lucide-react';
import { HoverNote } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/HoverNote';
import { copyKey } from '@/lib/id';
import { useRegisterSave } from '@/components/save-leave-guard';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RuleKeyRenameCounts } from '@/app/api/commission-template-logic/rename-key/route';
import { underlineControl } from '@/components/ui/underline-field';

type ParameterType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

interface CommissionTemplate {
  id: string;
  template_name: string;
  description?: string | null;
  eligibility_formula?: string | null;
  client_id?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  archived?: boolean | null;
  created_by?: string | null;
  /** Display names for rule sections; the rules keep their waterfall stage. */
  rule_section_labels?: Record<string, string> | null;
}

interface TemplateParameter {
  id: string;
  parameter_name: string;
  parameter_key: string;
  data_type?: string | null;
  autofill_formula?: string | null;
  validation_rule?: string | null;
  notes?: string | null;
  is_required?: boolean | null;
  is_user_editable?: boolean | null;
  divider_below?: boolean | null;
  sort_order?: number | null;
  section?: string | null;
  dropdown_options?: string[] | null;
}

interface LogicStep {
  id: string;
  step_number: number;
  rule_name: string;
  rule_key?: string | null;
  section?: string | null;
  payee_entity_id?: string | null;
  agent_key?: string | null;
  payee_formula?: string | null;
  apply_condition?: string | null;
  custom_baseline?: string | null;
  calculation_formula?: string | null;
  split_type?: string | null;
  result_type?: string | null;
  show_in_popup?: boolean | null;
  popup_section?: string | null;
  show_when_formula?: string | null;
  divider_below?: boolean | null;
  rule_kind?: string | null;
  from_agent_key?: string | null;
  paid_by_agent_keys?: string[] | null;
  paid_share_by?: string | null;
}

interface CommissionEntity {
  id: string;
  entity_name: string;
}

const PARAMETER_TYPES: { value: ParameterType; label: string }[] = [
  { value: 'TEXT', label: 'Text Input' },
  { value: 'CURRENCY', label: 'Currency ($)' },
  { value: 'PERCENT', label: 'Percent' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date Picker' },
  { value: 'SELECT', label: 'Select Dropdown' },
  { value: 'AGENT_PICKER', label: 'Agent Picker' },
  { value: 'BOOLEAN', label: 'Boolean Toggle' },
];

const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-2xs leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-brand-600 dark:group-focus-within/field:text-brand-400';
const fieldColumn = 'w-full max-w-[39rem]';
const sideLabel = 'pt-1 text-xs font-bold leading-4 text-slate-900 dark:text-white';

function ParameterRow({
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

const rowActionClass =
  'inline-flex h-7 w-7 items-center justify-center rounded transition cursor-pointer';

function eligibilityFormulaNames(fields: FormulaName[]): FormulaName[] {
  if (fields.some((field) => field.name === 'status')) return fields;
  return [...fields, { name: 'status', label: 'Status', kind: 'field' }];
}

function typeLabel(dataType?: string | null): string {
  return PARAMETER_TYPES.find((type) => type.value === canonicalParameterType(dataType))?.label || dataType || '—';
}

function FormulaLabel({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`View ${label}`}
      className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
    >
      {label}
    </button>
  );
}

function formulaField(
  compact: boolean,
  value: string,
  label: string,
  names: FormulaName[],
  onOpen: () => void,
  empty = '—',
) {
  if (compact) {
    return value.trim() ? <FormulaLabel label={label} onClick={onOpen} /> : empty;
  }
  return (
    <div className="flex items-start gap-2">
      <FormulaExplain value={value} names={names} />
      <FormulaPreview value={value} names={names} empty={empty} />
    </div>
  );
}

function canonicalParameterType(value?: string | null): ParameterType {
  if (value === 'AGENT') return 'AGENT_PICKER';
  if (value === 'YES_NO') return 'BOOLEAN';
  if (PARAMETER_TYPES.some((type) => type.value === value)) return value as ParameterType;
  return 'CURRENCY';
}

function withDropdownOption(options: string[], raw: string): string[] {
  const next = [...options];
  raw.split(/:::|\r?\n/).map((option) => option.trim()).filter(Boolean).forEach((option) => {
    if (!next.includes(option)) next.push(option);
  });
  return next;
}

function parameterKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key || 'parameter';
}

function parameterGroups(parameters: TemplateParameter[]): { name: string; items: TemplateParameter[] }[] {
  const ordered = [...parameters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const groups: { name: string; items: TemplateParameter[] }[] = [];
  for (const parameter of ordered) {
    const name = parameter.section?.trim() || 'No Section';
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.items.push(parameter);
    else groups.push({ name, items: [parameter] });
  }
  return groups.sort((a, b) => Number(a.name === 'No Section') - Number(b.name === 'No Section'));
}

function logicSectionName(step: { section?: string | null }): string {
  return canonicalLogicSection(step.section || '') || step.section?.trim() || 'No Section';
}

function logicSectionRank(name: string): number {
  const index = (LOGIC_SECTIONS as readonly string[]).indexOf(name);
  if (index >= 0) return index;
  return name === 'No Section' ? LOGIC_SECTIONS.length + 1 : LOGIC_SECTIONS.length;
}

function logicGroups(steps: LogicStep[]): { name: string; items: LogicStep[] }[] {
  const ordered = [...steps].sort((a, b) => a.step_number - b.step_number);
  const groups: { name: string; items: LogicStep[] }[] = [];
  for (const step of ordered) {
    const name = logicSectionName(step);
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.items.push(step);
    else groups.push({ name, items: [step] });
  }
  return groups.sort((a, b) => logicSectionRank(a.name) - logicSectionRank(b.name));
}

const emptyParameter = {
  parameter_name: '',
  parameter_key: '',
  data_type: 'CURRENCY' as ParameterType,
  is_required: false,
  is_user_editable: true,
  divider_below: false,
  autofill_formula: '',
  validation_rule: '',
  notes: '',
  section: '',
  dropdown_options: [] as string[],
};

const emptyLogic: LogicStepDraft = {
  rule_name: '',
  rule_key: '',
  section: '',
  apply_condition: '',
  agent_key: '',
  entity_mode: 'fixed',
  payee_entity_id: '',
  payee_formula: '',
  custom_baseline: '',
  calculation_formula: '',
  split_type: 'AMOUNT',
  result_type: 'CURRENCY',
  show_in_popup: false,
  popup_section: '',
  show_only_when: false,
  show_when_formula: '',
  divider_below: false,
  rule_kind: '',
  from_agent_key: '',
  paid_by_agent_keys: [],
  paid_share_by: 'split',
};

/** The Commission Template form section a calculation rule shows in, or "" when it is not shown there. */
function calculationFormSection(step: LogicStep): string {
  return step.show_in_popup ? step.popup_section?.trim() || '' : '';
}

/**
 * True when the next rule is a calculation in a different form section (Agent 1, then Agent 2): the rules
 * list draws a stronger line between them.
 */
function calculationFormSectionEnds(step: LogicStep, next: LogicStep | undefined): boolean {
  if (!next) return false;
  if (canonicalLogicSection(step.section || '') !== 'Calculation' || canonicalLogicSection(next.section || '') !== 'Calculation') return false;
  return calculationFormSection(step) !== calculationFormSection(next);
}

/** A calculation shown in the form with "Add horizontal divider below this rule" checked; By Section draws that line. */
function calculationDividerBelow(step: LogicStep): boolean {
  return canonicalLogicSection(step.section || '') === 'Calculation' && Boolean(step.show_in_popup) && Boolean(step.divider_below);
}

export default function CommissionTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();

  const [template, setTemplate] = useState<CommissionTemplate | null>(null);
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [logicSteps, setLogicSteps] = useState<LogicStep[]>([]);
  const [entities, setEntities] = useState<CommissionEntity[]>([]);
  const [transactionFields, setTransactionFields] = useState<FormulaName[]>([]);
  const [agentFields, setAgentFields] = useState<FormulaName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const parameterScrollRef = useRef<HTMLDivElement>(null);
  const logicScrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef<{ parameter: number; logic: number; window: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  // Renaming a parameter section: the section being renamed and the name typed so far.
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState('');
  const [sectionRenameError, setSectionRenameError] = useState<string | null>(null);
  const [renamingRuleSection, setRenamingRuleSection] = useState<string | null>(null);
  const [ruleSectionDraft, setRuleSectionDraft] = useState('');
  const [ruleRenameError, setRuleRenameError] = useState<string | null>(null);
  const [isSavingRuleLabel, setIsSavingRuleLabel] = useState(false);
  const [dropTarget, setDropTarget] = useState<null | { parameterId: string; placement: 'before' | 'after' } | { sectionName: string }>(null);
  const [logicDropTarget, setLogicDropTarget] = useState<null | { stepId: string; placement: 'before' | 'after' } | { sectionName: string }>(null);
  // Which list a drag handle is moving a row in. Rows show the green drop line only for that drag, never for other
  // things dragged over them (selected text), and any drag ending anywhere clears the line.
  const reorderDrag = useRef<'parameter' | 'rule' | null>(null);
  useEffect(() => {
    const clear = () => {
      reorderDrag.current = null;
      setDropTarget(null);
      setLogicDropTarget(null);
    };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);
  const [parametersCollapsed, setParametersCollapsed] = useState(true);
  const [logicCollapsed, setLogicCollapsed] = useState(true);
  const [compactRows, setCompactRows] = useState(false);
  // Rules list: one list in the order the engine runs them, or grouped by waterfall section.
  const [ruleView, setRuleView] = useState<'run' | 'section'>('run');
  // Select mode on the rules list: checkboxes for renaming several rules at once.
  const [selectingRules, setSelectingRules] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(() => new Set());
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkRenameSaving, setBulkRenameSaving] = useState(false);
  const [bulkRenameError, setBulkRenameError] = useState<string | null>(null);
  // The same select mode on the Parameters list.
  const [selectingParameters, setSelectingParameters] = useState(false);
  const [selectedParameterIds, setSelectedParameterIds] = useState<Set<string>>(() => new Set());
  const lastToggledParameterId = useRef<string | null>(null);
  const [bulkParameterRenameOpen, setBulkParameterRenameOpen] = useState(false);
  const [bulkParameterSaving, setBulkParameterSaving] = useState(false);
  const [bulkParameterError, setBulkParameterError] = useState<string | null>(null);
  const [parameterSearch, setParameterSearch] = useState('');
  const [logicSearch, setLogicSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showParameterFields, setShowParameterFields] = useState(false);
  const [parameterForm, setParameterForm] = useState<typeof emptyParameter | null>(null);
  const optionDrag = useDragReorder((from, to) =>
    setParameterForm((current) => current && { ...current, dropdown_options: moveItem(current.dropdown_options, from, to) }),
  );
  const [editingParameterId, setEditingParameterId] = useState<string | null>(null);
  const [recentParameterId, setRecentParameterId] = useState<string | null>(null);
  const [logicForm, setLogicForm] = useState<LogicStepDraft | null>(null);
  const [editingLogicId, setEditingLogicId] = useState<string | null>(null);
  const [recentLogicId, setRecentLogicId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { kind: 'template' | 'parameter' | 'logic'; id?: string; label: string }>(null);
  const [editTemplateOpen, setEditTemplateOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEligibility, setEditEligibility] = useState('');
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [sectionMenuBox, setSectionMenuBox] = useState({ top: 0, left: 0, width: 0 });
  const sectionFieldRef = useRef<HTMLDivElement>(null);
  const [newDropdownOption, setNewDropdownOption] = useState('');
  const [renamingOption, setRenamingOption] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const loadTemplate = async (options?: { keepPlace?: boolean }) => {
    if (!templateId) return;
    if (options?.keepPlace) {
      restoreScrollRef.current = {
        parameter: parameterScrollRef.current?.scrollTop ?? 0,
        logic: logicScrollRef.current?.scrollTop ?? 0,
        window: window.scrollY,
      };
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [templatesResponse, parametersResponse, logicResponse, entitiesResponse] = await Promise.all([
        fetch('/api/commission-templates'),
        fetch(`/api/commission-template-parameters?template_id=${encodeURIComponent(templateId)}`),
        fetch(`/api/commission-template-logic?template_id=${encodeURIComponent(templateId)}`),
        fetch('/api/commission-entities'),
      ]);
      const templatesData = await templatesResponse.json();
      const parametersData = await parametersResponse.json();
      const logicData = await logicResponse.json();
      const entitiesData = await entitiesResponse.json();

      if (!templatesResponse.ok || !templatesData.success) {
        throw new Error(templatesData.error || 'Failed to load the template.');
      }
      if (!parametersResponse.ok || !parametersData.success) {
        throw new Error(parametersData.error || 'Failed to load template parameters.');
      }
      if (!logicResponse.ok || !logicData.success) {
        throw new Error(logicData.error || 'Failed to load rules.');
      }

      const match = (templatesData.templates || []).find((item: CommissionTemplate) => item.id === templateId);
      if (!match) throw new Error('This commission template could not be found.');

      setTemplate(match);
      setParameters(Array.isArray(parametersData.parameters) ? parametersData.parameters : []);
      setLogicSteps(Array.isArray(logicData.logic_steps) ? logicData.logic_steps : []);
      setEntities(Array.isArray(entitiesData.entities) ? entitiesData.entities : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this template.');
    } finally {
      if (!options?.keepPlace) setIsLoading(false);
    }
  };

  useLayoutEffect(() => {
    const pending = restoreScrollRef.current;
    if (!pending) return;
    restoreScrollRef.current = null;
    if (parameterScrollRef.current) parameterScrollRef.current.scrollTop = pending.parameter;
    if (logicScrollRef.current) logicScrollRef.current.scrollTop = pending.logic;
    window.scrollTo(0, pending.window);
  }, [parameters, logicSteps]);

  useEffect(() => {
    void loadTemplate();
  }, [templateId]);

  useEffect(() => {
    setCompactRows(window.localStorage.getItem('soleox-template-row-density') === 'compact');
    try {
      if (window.localStorage.getItem('soleox-template-rule-view') === 'section') setRuleView('section');
    } catch {
      // Storage can be blocked; the list then opens in run order.
    }
  }, []);

  const chooseRuleView = (next: 'run' | 'section') => {
    setRuleView(next);
    try {
      window.localStorage.setItem('soleox-template-rule-view', next);
    } catch {
      // Not remembered when storage is blocked.
    }
  };

  const toggleCompactRows = () => {
    setCompactRows((current) => {
      const next = !current;
      window.localStorage.setItem('soleox-template-row-density', next ? 'compact' : 'comfortable');
      return next;
    });
  };

  useEffect(() => {
    const loadFields = async () => {
      const toNames = (
        catalog: { field_key?: string; field_label?: string; is_enabled?: boolean }[] | undefined,
        dbColumns: { field_key?: string; field_label?: string; is_enabled?: boolean }[] | undefined,
        prefix?: string
      ): FormulaName[] => {
        const hidden = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);
        const byKey = new Map<string, { field_key: string; field_label?: string }>();
        for (const field of dbColumns || []) {
          if (!field.field_key || hidden.has(field.field_key) || field.is_enabled === false) continue;
          byKey.set(field.field_key, { field_key: field.field_key, field_label: field.field_label });
        }
        for (const field of catalog || []) {
          if (!field.field_key || hidden.has(field.field_key)) continue;
          if (field.is_enabled === false) {
            byKey.delete(field.field_key);
            continue;
          }
          byKey.set(field.field_key, { field_key: field.field_key, field_label: field.field_label });
        }
        return [...byKey.values()].map((field) => ({
          name: prefix ? `${prefix}.${field.field_key}` : field.field_key,
          label: field.field_label || field.field_key,
          kind: 'field' as const,
        }));
      };

      try {
        const [transactionsResponse, agentsResponse] = await Promise.all([
          fetch('/api/schema/transactions'),
          fetch('/api/schema/agents'),
        ]);
        const transactionsData = await transactionsResponse.json();
        const agentsData = await agentsResponse.json();
        if (transactionsResponse.ok) setTransactionFields(toNames(transactionsData.catalog, transactionsData.db_columns));
        if (agentsResponse.ok) setAgentFields(toNames(agentsData.catalog, agentsData.db_columns, 'agents'));
      } catch (err) {
        console.error('Failed to load field customization names:', err);
      }
    };

    void loadFields();
  }, []);

  const leaveSaveOk = useRef(false);
  const saveParameter = async (event: React.FormEvent) => {
    event.preventDefault();
    leaveSaveOk.current = false;
    if (!parameterForm || !templateId || isSaving) return;
    const normalizedFormula = normalizeFormula(parameterForm.autofill_formula).text;
    const normalizedValidation = normalizeFormula(parameterForm.validation_rule).text;
    if (normalizedFormula !== parameterForm.autofill_formula || normalizedValidation !== parameterForm.validation_rule) {
      setParameterForm({ ...parameterForm, autofill_formula: normalizedFormula, validation_rule: normalizedValidation });
    }
    const formulaIssue = validateFormula(normalizedFormula, formulaNames.map((item) => item.name));
    if (formulaIssue) {
      setFormError(formulaIssue);
      return;
    }
    const validationIssue = interpretValidationRule(
      normalizedValidation,
      validationFormulaNames.map((item) => item.name),
    );
    if (validationIssue.ok === false) {
      setFormError(validationIssue.message);
      return;
    }
    const existing = parameters.find((parameter) => parameter.id === editingParameterId);
    const parameterKey = existing?.parameter_key || parameterForm.parameter_key.trim().toLowerCase();
    if (!existing) {
      const keyIssue = describeKeyConflict(parameterKey, parameterKeyOwners);
      if (keyIssue) {
        setFormError(keyIssue);
        return;
      }
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const response = await fetch('/api/commission-template-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter: {
            id: editingParameterId,
            template_id: templateId,
            client_id: 'DEMO',
            parameter_name: parameterForm.parameter_name.trim(),
            parameter_key: parameterKey,
            data_type: parameterForm.data_type,
            is_required: parameterForm.is_required,
            is_user_editable: parameterForm.is_user_editable,
            divider_below: parameterForm.divider_below,
            autofill_formula: normalizedFormula.trim() || null,
            validation_rule: normalizedValidation.trim() || null,
            notes: parameterForm.notes.trim() || null,
            section: parameterForm.section.trim() || null,
            dropdown_options: parameterForm.data_type === 'SELECT' ? parameterForm.dropdown_options : null,
            sort_order: existing?.sort_order ?? parameters.length + 1,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the parameter.');
      setParameterForm(null);
      setEditingParameterId(null);
      setFormError(null);
      await loadTemplate({ keepPlace: true });
      leaveSaveOk.current = true;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the parameter.');
    } finally {
      setIsSaving(false);
    }
  };

  const persistParameter = async (parameter: TemplateParameter) => {
    const response = await fetch('/api/commission-template-parameters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameter: {
          id: parameter.id,
          template_id: templateId,
          client_id: 'DEMO',
          parameter_name: parameter.parameter_name,
          parameter_key: parameter.parameter_key,
          data_type: parameter.data_type || 'CURRENCY',
          is_required: Boolean(parameter.is_required),
          is_user_editable: parameter.is_user_editable !== false,
          divider_below: Boolean(parameter.divider_below),
          autofill_formula: parameter.autofill_formula || null,
          validation_rule: parameter.validation_rule || null,
          notes: parameter.notes || null,
          section: parameter.section || null,
          dropdown_options: parameter.dropdown_options || null,
          sort_order: parameter.sort_order ?? 0,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the parameter order.');
  };

  const commitParameterLayout = async (updated: TemplateParameter[]) => {
    const previous = new Map(parameters.map((item) => [item.id, { sort_order: item.sort_order ?? 0, section: item.section?.trim() || '' }]));
    const changed = updated.filter((item) => {
      const prior = previous.get(item.id);
      return prior?.sort_order !== item.sort_order || (prior?.section || '') !== (item.section?.trim() || '');
    });
    setParameters((current) => current.map((item) => updated.find((next) => next.id === item.id) ?? item));
    if (changed.length === 0) return;
    setIsReordering(true);
    setError(null);
    try {
      await Promise.all(changed.map((item) => persistParameter(item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the parameter order.');
      await loadTemplate({ keepPlace: true });
    } finally {
      setIsReordering(false);
    }
  };

  // Renames a section by moving every parameter in it to the new name. Their order stays as it is.
  const renameSection = async (oldName: string, nextName: string) => {
    const name = nextName.trim();
    const fromUnsectioned = oldName === 'No Section';
    if (!name || name === oldName) {
      setRenamingSection(null);
      return;
    }
    const taken = parameters.some((item) => (item.section?.trim() || '') === name);
    if (taken) {
      setSectionRenameError(`A section named "${name}" already exists. Pick another name, or move the parameters there instead.`);
      return;
    }
    setSectionRenameError(null);
    setRenamingSection(null);
    await commitParameterLayout(parameters.map((item) => {
      const current = item.section?.trim() || '';
      const inSection = fromUnsectioned ? current === '' : current === oldName;
      return inSection ? { ...item, section: name } : item;
    }));
  };

  // A rule section's display name. The rules keep their section, which is their waterfall stage.
  const ruleSectionLabel = (section: string) => template?.rule_section_labels?.[section]?.trim() || section;

  const renameRuleSection = async (section: string, nextName: string) => {
    if (!template) return;
    const name = nextName.trim();
    const current = template.rule_section_labels || {};
    if (name === ruleSectionLabel(section)) {
      setRenamingRuleSection(null);
      return;
    }
    const otherSections = [...new Set(logicSteps.map((step) => canonicalLogicSection(step.section || '') || step.section?.trim() || 'No Section'))].filter((other) => other !== section);
    if (name && otherSections.some((other) => ruleSectionLabel(other).toLowerCase() === name.toLowerCase())) {
      setRuleRenameError(`Another section is already called "${name}".`);
      return;
    }
    // An empty name, or the stage's own name, goes back to showing the stage.
    const labels = { ...current };
    if (!name || name === section) delete labels[section];
    else labels[section] = name;
    setIsSavingRuleLabel(true);
    setRuleRenameError(null);
    try {
      const response = await fetch('/api/commission-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            id: template.id,
            client_id: template.client_id || 'DEMO',
            template_name: template.template_name,
            description: template.description || null,
            eligibility_formula: template.eligibility_formula || null,
            is_default: Boolean(template.is_default),
            is_active: template.is_active !== false,
            archived: Boolean(template.archived),
            created_by: template.created_by,
            rule_section_labels: labels,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The section name could not be saved.');
      setTemplate({ ...template, rule_section_labels: labels });
      setRenamingRuleSection(null);
    } catch (err) {
      setRuleRenameError(err instanceof Error ? err.message : 'The section name could not be saved.');
    } finally {
      setIsSavingRuleLabel(false);
    }
  };

  const dropParameter = async (sourceId: string, target: { parameterId: string; placement: 'before' | 'after' } | { sectionName: string }) => {
    if (isReordering || ('parameterId' in target && target.parameterId === sourceId)) return;
    const groups = parameterGroups(parameters).map((group) => ({ ...group, items: [...group.items] }));
    let moved: TemplateParameter | undefined;
    for (const group of groups) {
      const index = group.items.findIndex((item) => item.id === sourceId);
      if (index >= 0) {
        [moved] = group.items.splice(index, 1);
        break;
      }
    }
    if (!moved) return;

    const destinationName = 'sectionName' in target
      ? target.sectionName
      : groups.find((group) => group.items.some((item) => item.id === target.parameterId))?.name;
    const destination = groups.find((group) => group.name === destinationName);
    if (!destination) return;

    const section = destination.name === 'No Section' ? null : destination.name;
    const next = { ...moved, section };
    if ('sectionName' in target) {
      destination.items.push(next);
    } else {
      const index = destination.items.findIndex((item) => item.id === target.parameterId);
      destination.items.splice(target.placement === 'before' ? index : index + 1, 0, next);
    }

    const flat = groups.filter((group) => group.items.length > 0).flatMap((group) => group.items);
    setDropTarget(null);
    await commitParameterLayout(flat.map((item, index) => ({ ...item, sort_order: index + 1 })));
  };

  const persistLogicStep = async (step: LogicStep) => {
    const response = await fetch('/api/commission-template-logic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logic: {
          id: step.id,
          template_id: templateId,
          client_id: 'DEMO',
          step_number: step.step_number,
          rule_name: step.rule_name,
          rule_key: step.rule_key || null,
          section: step.section || null,
          apply_condition: step.apply_condition || null,
          agent_key: step.agent_key || null,
          payee_entity_id: step.payee_entity_id || null,
          payee_formula: step.payee_formula || null,
          custom_baseline: step.custom_baseline || null,
          calculation_formula: step.calculation_formula || null,
          split_type: step.split_type || null,
          result_type: canonicalLogicSection(step.section || '') === 'Calculation' && step.result_type
            ? canonicalResultType(step.result_type)
            : null,
          show_in_popup: Boolean(step.show_in_popup),
          popup_section: step.popup_section || null,
          show_when_formula: step.show_when_formula || null,
          divider_below: Boolean(step.divider_below),
          rule_kind: step.rule_kind || null,
          from_agent_key: step.from_agent_key || null,
          paid_by_agent_keys: step.paid_by_agent_keys || null,
          paid_share_by: step.paid_share_by || null,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the rule order.');
  };

  const commitLogicOrder = async (updated: LogicStep[]) => {
    const previous = new Map(logicSteps.map((step) => [step.id, { step_number: step.step_number, section: step.section || '' }]));
    const changed = updated.filter((step) => {
      const prior = previous.get(step.id);
      return prior?.step_number !== step.step_number || (prior?.section || '') !== (step.section || '');
    });
    setLogicSteps(updated);
    if (changed.length === 0) return;
    setIsReordering(true);
    setError(null);
    try {
      await Promise.all(changed.map((step) => persistLogicStep(step)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the rule order.');
      await loadTemplate({ keepPlace: true });
    } finally {
      setIsReordering(false);
    }
  };

  const dropLogic = async (sourceId: string, target: { stepId: string; placement: 'before' | 'after' } | { sectionName: string }) => {
    if (isReordering || ('stepId' in target && target.stepId === sourceId)) return;
    const groups = logicGroups(logicSteps).map((group) => ({ ...group, items: [...group.items] }));
    let moved: LogicStep | undefined;
    for (const group of groups) {
      const index = group.items.findIndex((step) => step.id === sourceId);
      if (index >= 0) {
        [moved] = group.items.splice(index, 1);
        break;
      }
    }
    if (!moved) return;

    const destinationName = 'sectionName' in target
      ? target.sectionName
      : logicSectionName(logicSteps.find((step) => step.id === target.stepId) || moved);
    let destination = groups.find((group) => group.name === destinationName);
    if (!destination) {
      destination = { name: destinationName, items: [] };
      groups.push(destination);
      groups.sort((a, b) => logicSectionRank(a.name) - logicSectionRank(b.name));
    }
    const sameSection = logicSectionName(moved) === destination.name;
    const nextSection = destination.name === 'No Section' ? null : destination.name;
    const nextMoved = { ...moved, section: nextSection };

    if (sameSection) {
      const slots = [...destination.items.map((step) => step.step_number), moved.step_number].sort((a, b) => a - b);
      if ('sectionName' in target) destination.items.push(nextMoved);
      else {
        const index = destination.items.findIndex((step) => step.id === target.stepId);
        destination.items.splice(target.placement === 'before' ? index : index + 1, 0, nextMoved);
      }
      const updated = new Map(destination.items.map((step, itemIndex) => [step.id, { ...step, step_number: slots[itemIndex] }]));
      setLogicDropTarget(null);
      await commitLogicOrder(logicSteps.map((step) => updated.get(step.id) ?? step));
      return;
    }

    const ordered = logicSteps.filter((step) => step.id !== sourceId).sort((a, b) => a.step_number - b.step_number);
    const insertAt = 'sectionName' in target
      ? (() => {
          let last = -1;
          ordered.forEach((step, index) => {
            if (logicSectionName(step) === destination.name) last = index;
          });
          return last + 1;
        })()
      : (() => {
          const index = ordered.findIndex((step) => step.id === target.stepId);
          return target.placement === 'before' ? index : index + 1;
        })();
    ordered.splice(insertAt, 0, nextMoved);
    setLogicDropTarget(null);
    await commitLogicOrder(ordered.map((step, itemIndex) => ({ ...step, step_number: itemIndex + 1 })));
  };

  // The last rule ticked or unticked by itself, where a Shift-click range starts.
  const lastToggledRuleId = useRef<string | null>(null);
  // Shift-click sets every rule shown between the last one clicked and this one, in the order the list shows them,
  // to this one's new state.
  const toggleRuleSelected = (id: string, shiftKey: boolean, shownIds: string[]) => {
    // Read before the state update runs: the ref moves to this rule below.
    const from = lastToggledRuleId.current ? shownIds.indexOf(lastToggledRuleId.current) : -1;
    const to = shownIds.indexOf(id);
    const range = shiftKey && from >= 0 && to >= 0
      ? shownIds.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [id];
    setSelectedRuleIds((current) => {
      const next = new Set(current);
      const select = !current.has(id);
      for (const rangeId of range) {
        if (select) next.add(rangeId);
        else next.delete(rangeId);
      }
      return next;
    });
    lastToggledRuleId.current = id;
  };

  // Only names are sent; keys, formulas and order stay. The selection stays too, for another change after this one.
  const applyBulkRename = async (names: { id: string; rule_name: string }[]) => {
    setBulkRenameSaving(true);
    setBulkRenameError(null);
    try {
      const response = await fetch('/api/commission-template-logic', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, names }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The rules could not be renamed.');
      const byId = new Map(names.map((row) => [row.id, row.rule_name]));
      setLogicSteps((current) => current.map((step) => (byId.has(step.id) ? { ...step, rule_name: byId.get(step.id)! } : step)));
      setBulkRenameOpen(false);
    } catch (err) {
      setBulkRenameError(err instanceof Error ? err.message : 'The rules could not be renamed.');
    } finally {
      setBulkRenameSaving(false);
    }
  };

  // Turns the divider below on or off for the selected rules that can show one: calculations shown in the form.
  const applyBulkDivider = async (dividerBelow: boolean) => {
    const ids = logicSteps
      .filter((step) => selectedRuleIds.has(step.id) && canonicalLogicSection(step.section || '') === 'Calculation' && step.show_in_popup)
      .map((step) => step.id);
    if (ids.length === 0) return;
    setBulkRenameSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/commission-template-logic', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, ids, divider_below: dividerBelow }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The dividers could not be changed.');
      const changed = new Set(ids);
      setLogicSteps((current) => current.map((step) => (changed.has(step.id) ? { ...step, divider_below: dividerBelow } : step)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The dividers could not be changed.');
    } finally {
      setBulkRenameSaving(false);
    }
  };

  // Shift-click sets every parameter shown between the last one clicked and this one to this one's new state.
  const toggleParameterSelected = (id: string, shiftKey: boolean, shownIds: string[]) => {
    const from = lastToggledParameterId.current ? shownIds.indexOf(lastToggledParameterId.current) : -1;
    const to = shownIds.indexOf(id);
    const range = shiftKey && from >= 0 && to >= 0
      ? shownIds.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [id];
    setSelectedParameterIds((current) => {
      const next = new Set(current);
      const select = !current.has(id);
      for (const rangeId of range) {
        if (select) next.add(rangeId);
        else next.delete(rangeId);
      }
      return next;
    });
    lastToggledParameterId.current = id;
  };

  // One PATCH for the selected parameters: new names, or their divider below on or off. The selection stays.
  const patchParameters = async (body: Record<string, unknown>, apply: (parameter: TemplateParameter) => TemplateParameter) => {
    setBulkParameterSaving(true);
    setBulkParameterError(null);
    setError(null);
    try {
      const response = await fetch('/api/commission-template-parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The parameters could not be changed.');
      setParameters((current) => current.map(apply));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The parameters could not be changed.';
      setBulkParameterError(message);
      if (!bulkParameterRenameOpen) setError(message);
      return false;
    } finally {
      setBulkParameterSaving(false);
    }
  };

  const applyBulkParameterRename = async (names: { id: string; name: string }[]) => {
    const byId = new Map(names.map((row) => [row.id, row.name]));
    const saved = await patchParameters(
      { names: names.map(({ id, name }) => ({ id, parameter_name: name })) },
      (parameter) => (byId.has(parameter.id) ? { ...parameter, parameter_name: byId.get(parameter.id)! } : parameter),
    );
    if (saved) setBulkParameterRenameOpen(false);
  };

  const applyBulkParameterDivider = async (dividerBelow: boolean) => {
    const ids = [...selectedParameterIds];
    if (ids.length === 0) return;
    const changed = new Set(ids);
    await patchParameters(
      { ids, divider_below: dividerBelow },
      (parameter) => (changed.has(parameter.id) ? { ...parameter, divider_below: dividerBelow } : parameter),
    );
  };

  // In run order a rule keeps its section and moves to the dropped place in the order the engine runs rules.
  const dropLogicInRunOrder = async (sourceId: string, target: { stepId: string; placement: 'before' | 'after' }) => {
    if (isReordering || target.stepId === sourceId) return;
    const ordered = [...logicSteps].sort((a, b) => a.step_number - b.step_number);
    const from = ordered.findIndex((step) => step.id === sourceId);
    if (from < 0) return;
    const [moved] = ordered.splice(from, 1);
    const index = ordered.findIndex((step) => step.id === target.stepId);
    if (index < 0) return;
    ordered.splice(target.placement === 'before' ? index : index + 1, 0, moved);
    await commitLogicOrder(ordered.map((step, itemIndex) => ({ ...step, step_number: itemIndex + 1 })));
  };

  const saveLogic = async (event: React.FormEvent) => {
    leaveSaveOk.current = false;
    event.preventDefault();
    if (!logicForm || !templateId || isSaving) return;
    const otherRuleKeys = logicSteps
      .filter((step) => step.id !== editingLogicId && step.rule_key?.trim())
      .map((step) => step.rule_key!.trim());
    const allowedNames = [...formulaNames.map((item) => item.name), ...logicContextNames.map((item) => item.name), ...ledgerFormulaNames.map((item) => item.name), ...otherRuleKeys];
    const selectedSection = canonicalLogicSection(logicForm.section);
    const entityFormula = logicSectionShowsEntity(selectedSection) && logicForm.entity_mode === 'formula';
    const formulas = [
      ...(selectedSection === 'Calculation'
        ? (logicForm.show_in_popup && logicForm.show_only_when ? [['Show When', logicForm.show_when_formula] as const] : [])
        : [['Condition', logicForm.apply_condition] as const]),
      ['Custom Baseline', logicForm.custom_baseline],
      ['Formula', logicForm.calculation_formula],
      ...(entityFormula ? [['Entity', logicForm.payee_formula] as const] : []),
    ] as const;
    for (const [label, raw] of formulas) {
      const normalized = normalizeFormula(raw).text;
      const issue = validateFormula(normalized, allowedNames);
      if (issue) {
        setFormError(`${label}: ${issue}`);
        return;
      }
    }
    if (!logicForm.calculation_formula.trim()) {
      setFormError('Enter the amount formula.');
      return;
    }
    if (
      selectedSection === 'Calculation'
      && logicForm.show_in_popup
      && logicForm.show_only_when
      && !normalizeFormula(logicForm.show_when_formula).text.trim()
    ) {
      setFormError('Enter a Show When formula, or uncheck "Show ONLY Under Specific Conditions".');
      return;
    }
    const section = canonicalLogicSection(logicForm.section);
    if (!section) {
      setFormError('Choose a section.');
      return;
    }
    const postsSplit = section !== 'Calculation';
    const ruleKey = logicForm.rule_key.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(ruleKey)) {
      setFormError('The key needs to start with a letter and use only letters, numbers, and underscores.');
      return;
    }
    const takenKey = [...formulaNames.map((item) => item.name), ...logicContextNames.map((item) => item.name), ...otherRuleKeys, 'total_commission']
      .some((name) => name.toLowerCase() === ruleKey);
    if (takenKey) {
      setFormError('That key is already used by a field, parameter, or another rule.');
      return;
    }
    if (section && logicSectionShowsAgent(section) && !logicForm.agent_key.trim()) {
      setFormError('Choose the agent for this rule.');
      return;
    }
    if (section === 'Agent Splits' && logicForm.rule_kind === 'BONUS' && !logicForm.from_agent_key.trim()) {
      setFormError('Choose the agent who pays the bonus.');
      return;
    }
    if (section === 'Agent Splits' && logicForm.rule_kind === 'BONUS' && logicForm.from_agent_key.trim() === logicForm.agent_key.trim()) {
      setFormError('A bonus moves money between two different agents.');
      return;
    }
    if (section && logicSectionShowsEntity(section) && logicForm.entity_mode === 'fixed' && !logicForm.payee_entity_id) {
      setFormError('Choose the entity for this rule.');
      return;
    }
    if (section && logicSectionShowsEntity(section) && logicForm.entity_mode === 'formula' && !logicForm.payee_formula.trim()) {
      setFormError('Enter the entity formula.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const existing = logicSteps.find((step) => step.id === editingLogicId);
      // A saved rule whose key changed: rename it first, which also rewrites every formula in this template
      // that reads it (migration 062). The form's own formulas get the same rewrite before they are saved.
      let form = logicForm;
      const previousKey = existing?.rule_key?.trim().toLowerCase() || '';
      if (existing && previousKey && previousKey !== ruleKey) {
        const callRename = async (apply: boolean): Promise<RuleKeyRenameCounts> => {
          const renameResponse = await fetch('/api/commission-template-logic/rename-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ruleId: existing.id, newKey: ruleKey, apply }),
          });
          const renameData = await renameResponse.json().catch(() => ({}));
          if (!renameResponse.ok || renameData.success === false) throw new Error(renameData.error || 'The rule key could not be renamed.');
          return renameData.counts as RuleKeyRenameCounts;
        };
        const counts = await callRename(false);
        const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
        const parts = [
          counts.rules ? plural(counts.rules, 'other rule', 'other rules') : '',
          counts.parameters ? plural(counts.parameters, 'parameter', 'parameters') : '',
          counts.templates ? 'the eligibility formula' : '',
        ].filter(Boolean);
        const confirmed = await confirmAction({
          title: 'Rename Rule Key?',
          message: parts.length
            ? `${counts.oldKey} becomes ${ruleKey}, and this template's formulas that use it are updated: ${parts.join(', ')}. To go back later, rename it again.`
            : `${counts.oldKey} becomes ${ruleKey}. No other formula in this template uses this key.`,
          confirmLabel: 'Rename Key',
          tone: 'primary',
        });
        if (!confirmed) return;
        await callRename(true);
        const pattern = new RegExp(`(?<![.\\w])${previousKey}(?!\\w)`, 'gi');
        const renameKey = (text: string) => text.replace(pattern, ruleKey);
        // The key is renamed now, even if saving the rest of the form fails below.
        setLogicSteps((current) => current.map((step) => (step.id === existing.id ? { ...step, rule_key: ruleKey } : step)));
        form = {
          ...form,
          apply_condition: renameKey(form.apply_condition),
          agent_key: form.agent_key.trim().toLowerCase() === previousKey ? ruleKey : form.agent_key,
          from_agent_key: form.from_agent_key.trim().toLowerCase() === previousKey ? ruleKey : form.from_agent_key,
          paid_by_agent_keys: form.paid_by_agent_keys.map((key) => (key.trim().toLowerCase() === previousKey ? ruleKey : key)),
          payee_formula: renameKey(form.payee_formula),
          custom_baseline: renameKey(form.custom_baseline),
          calculation_formula: renameKey(form.calculation_formula),
          show_when_formula: renameKey(form.show_when_formula),
        };
      }
      const response = await fetch('/api/commission-template-logic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logic: {
            id: editingLogicId,
            template_id: templateId,
            client_id: 'DEMO',
            step_number: existing?.step_number ?? logicSteps.length + 1,
            rule_name: form.rule_name.trim(),
            rule_key: ruleKey,
            section: section || null,
            apply_condition: postsSplit ? normalizeFormula(form.apply_condition).text.trim() || null : null,
            agent_key: postsSplit && logicSectionShowsAgent(section) ? form.agent_key.trim() || null : null,
            payee_entity_id: postsSplit && logicSectionShowsEntity(section) && form.entity_mode === 'fixed' ? form.payee_entity_id || null : null,
            payee_formula: postsSplit && logicSectionShowsEntity(section) && form.entity_mode === 'formula'
              ? normalizeFormula(form.payee_formula).text.trim() || null
              : null,
            custom_baseline: normalizeFormula(form.custom_baseline).text.trim() || null,
            calculation_formula: normalizeFormula(form.calculation_formula).text.trim() || null,
            split_type: postsSplit ? (form.split_type === 'PERCENT' ? 'PERCENT' : 'AMOUNT') : null,
            result_type: postsSplit ? null : canonicalResultType(form.result_type),
            show_in_popup: !postsSplit && form.show_in_popup,
            popup_section: !postsSplit && form.show_in_popup ? form.popup_section.trim() || null : null,
            show_when_formula: !postsSplit && form.show_in_popup && form.show_only_when
              ? normalizeFormula(form.show_when_formula).text.trim() || null
              : null,
            divider_below: !postsSplit && form.show_in_popup && form.divider_below,
            rule_kind: section === 'Agent Splits' && form.rule_kind === 'BONUS' ? 'BONUS' : null,
            from_agent_key: section === 'Agent Splits' && form.rule_kind === 'BONUS' ? form.from_agent_key.trim() || null : null,
            paid_by_agent_keys: (section === 'Off-the-top' || section === 'Pre-splits') && form.paid_by_agent_keys.length ? form.paid_by_agent_keys : null,
            paid_share_by: (section === 'Off-the-top' || section === 'Pre-splits') && form.paid_by_agent_keys.length > 1 ? form.paid_share_by : null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the logic step.');
      setLogicForm(null);
      setEditingLogicId(null);
      await loadTemplate({ keepPlace: true });
      leaveSaveOk.current = true;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the logic step.');
    } finally {
      setIsSaving(false);
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setIsSaving(true);
    setError(null);
    try {
      if (confirmDelete.kind === 'template') {
        const response = await fetch(`/api/commission-templates?id=${encodeURIComponent(templateId)}&client_id=DEMO`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to delete the template.');
        router.push('/commission-tracker/settings/commission-templates');
        return;
      }

      const url = confirmDelete.kind === 'parameter'
        ? `/api/commission-template-parameters?id=${encodeURIComponent(confirmDelete.id || '')}`
        : `/api/commission-template-logic?id=${encodeURIComponent(confirmDelete.id || '')}`;
      const response = await fetch(url, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to delete.');
      setConfirmDelete(null);
      await loadTemplate({ keepPlace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setIsSaving(false);
    }
  };

  // With asCopy, opens a new parameter filled in from this one: its name gets " Copy" and its key is the
  // original's with the first free number appended (credit_total_1), so the copy can be saved as is.
  const openEditParameter = (parameter: TemplateParameter, asCopy = false) => {
    setFormError(null);
    setShowParameterFields(false);
    setEditingParameterId(asCopy ? null : parameter.id);
    if (!asCopy) setRecentParameterId(parameter.id);
    setParameterForm({
      parameter_name: asCopy ? `${parameter.parameter_name} Copy` : parameter.parameter_name,
      parameter_key: asCopy ? copyKey(parameter.parameter_key, parameters.map((item) => item.parameter_key)) : parameter.parameter_key,
      data_type: canonicalParameterType(parameter.data_type),
      is_required: Boolean(parameter.is_required),
      is_user_editable: parameter.is_user_editable !== false,
      divider_below: Boolean(parameter.divider_below),
      autofill_formula: parameter.autofill_formula || '',
      validation_rule: parameter.validation_rule || '',
      notes: parameter.notes || '',
      section: parameter.section || '',
      dropdown_options: Array.isArray(parameter.dropdown_options) ? parameter.dropdown_options : [],
    });
    setNewDropdownOption('');
    setRenamingOption(null);
  };

  // With asCopy, opens a new rule filled in from this one, named "<name> Copy", its key the original's with the
  // first free number appended.
  const openEditLogic = (step: LogicStep, asCopy = false) => {
    setFormError(null);
    setEditingLogicId(asCopy ? null : step.id);
    if (!asCopy) setRecentLogicId(step.id);
    const storedFormula = step.payee_formula?.trim() || '';
    const legacyAgentKey = !step.agent_key?.trim() && /^[A-Za-z_][A-Za-z0-9_]*$/.test(storedFormula) ? storedFormula : '';
    const entityFormula = storedFormula && storedFormula !== legacyAgentKey ? storedFormula : '';
    const takenKeys = new Set(
      [...formulaNames.map((item) => item.name), ...logicContextNames.map((item) => item.name), 'total_commission',
        ...logicSteps.filter((item) => (asCopy || item.id !== step.id) && item.rule_key?.trim()).map((item) => item.rule_key!.trim())]
        .map((name) => name.toLowerCase()),
    );
    const freeRuleKey = (name: string) => {
      const base = ruleKeyFromName(name);
      if (!takenKeys.has(base)) return base;
      if (!takenKeys.has(`${base}_rule`)) return `${base}_rule`;
      let suffix = 2;
      while (takenKeys.has(`${base}_${suffix}`)) suffix += 1;
      return `${base}_${suffix}`;
    };
    const ruleName = asCopy ? `${step.rule_name} Copy` : step.rule_name;
    setLogicForm({
      rule_name: ruleName,
      rule_key: asCopy
        ? copyKey(step.rule_key?.trim() || freeRuleKey(step.rule_name), takenKeys)
        : step.rule_key?.trim() || freeRuleKey(step.rule_name),
      section: canonicalLogicSection(step.section || ''),
      apply_condition: step.apply_condition || '',
      agent_key: step.agent_key?.trim() || legacyAgentKey,
      entity_mode: entityFormula && !step.payee_entity_id ? 'formula' : 'fixed',
      payee_entity_id: step.payee_entity_id || '',
      payee_formula: entityFormula,
      custom_baseline: step.custom_baseline || '',
      calculation_formula: step.calculation_formula || '',
      split_type: String(step.split_type || '').trim().toUpperCase() === 'PERCENT' ? 'PERCENT' : 'AMOUNT',
      result_type: canonicalResultType(step.result_type),
      show_in_popup: Boolean(step.show_in_popup),
      popup_section: step.popup_section || '',
      show_only_when: Boolean(step.show_when_formula?.trim()),
      show_when_formula: step.show_when_formula || '',
      divider_below: Boolean(step.divider_below),
      rule_kind: String(step.rule_kind || '').toUpperCase() === 'BONUS' ? 'BONUS' : '',
      from_agent_key: step.from_agent_key?.trim() || '',
      paid_by_agent_keys: (step.paid_by_agent_keys || []).filter(Boolean),
      paid_share_by: step.paid_share_by === 'equal' ? 'equal' : 'split',
    });
  };

  const openEditTemplate = () => {
    if (!template) return;
    setEditName(template.template_name);
    setEditDescription(template.description || '');
    setEditEligibility(template.eligibility_formula || '');
    setError(null);
    setEditTemplateOpen(true);
  };

  const handleSaveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    leaveSaveOk.current = false;
    if (!template || !editName.trim() || isSaving) return;
    const normalizedEligibility = normalizeFormula(editEligibility).text.trim();
    const eligibilityIssue = validateFormula(normalizedEligibility, eligibilityFormulaNames(transactionFields).map((field) => field.name));
    if (eligibilityIssue) {
      setError(eligibilityIssue);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/commission-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            id: template.id,
            client_id: template.client_id || 'DEMO',
            template_name: editName.trim(),
            description: editDescription.trim() || null,
            eligibility_formula: normalizedEligibility || null,
            is_default: Boolean(template.is_default),
            is_active: template.is_active !== false,
            archived: Boolean(template.archived),
            created_by: template.created_by,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update the template.');
      }
      setTemplate({
        ...template,
        ...(data.template || {}),
        template_name: editName.trim(),
        description: editDescription.trim() || null,
        eligibility_formula: normalizedEligibility || null,
      });
      setEditTemplateOpen(false);
      leaveSaveOk.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the template.');
    } finally {
      setIsSaving(false);
    }
  };

  const entityName = (id?: string | null) => entities.find((entity) => entity.id === id)?.entity_name || '—';

  const filteredParameters = useMemo(() => {
    const query = parameterSearch.trim().toLowerCase();
    if (!query) return parameters;
    return parameters.filter((param) => {
      const typeStr = typeLabel(param.data_type).toLowerCase();
      const rawType = (param.data_type || '').toLowerCase();
      return (
        param.parameter_name.toLowerCase().includes(query) ||
        param.parameter_key.toLowerCase().includes(query) ||
        (param.section || '').toLowerCase().includes(query) ||
        typeStr.includes(query) ||
        rawType.includes(query) ||
        (param.notes || '').toLowerCase().includes(query) ||
        (param.autofill_formula || '').toLowerCase().includes(query) ||
        (param.validation_rule || '').toLowerCase().includes(query)
      );
    });
  }, [parameters, parameterSearch]);
  const shownParameterIds = useMemo(
    () => parameterGroups(filteredParameters).flatMap((group) => group.items.map((parameter) => parameter.id)),
    [filteredParameters],
  );

  const filteredLogicSteps = useMemo(() => {
    const query = logicSearch.trim().toLowerCase();
    if (!query) return logicSteps;
    return logicSteps.filter((step) => {
      const section = (canonicalLogicSection(step.section || '') || step.section || '').toLowerCase();
      const entity = entityName(step.payee_entity_id).toLowerCase();
      const splitType = String(step.split_type || '').toLowerCase();
      const resultType = canonicalLogicSection(step.section || '') === 'Calculation' ? resultTypeLabel(step.result_type).toLowerCase() : '';
      const stepNum = String(step.step_number);
      const isPopup = step.show_in_popup ? 'shown when applying' : '';
      return (
        step.rule_name.toLowerCase().includes(query) ||
        (step.rule_key || '').toLowerCase().includes(query) ||
        section.includes(query) ||
        (step.agent_key || '').toLowerCase().includes(query) ||
        entity.includes(query) ||
        (step.payee_formula || '').toLowerCase().includes(query) ||
        (step.apply_condition || '').toLowerCase().includes(query) ||
        (step.show_when_formula || '').toLowerCase().includes(query) ||
        (step.custom_baseline || '').toLowerCase().includes(query) ||
        (step.calculation_formula || '').toLowerCase().includes(query) ||
        resultType.includes(query) ||
        splitType.includes(query) ||
        stepNum === query ||
        `#${stepNum}` === query ||
        (step.popup_section || '').toLowerCase().includes(query) ||
        isPopup.includes(query)
      );
    });
  }, [logicSteps, logicSearch, entities]);
  // The rules as the list shows them: one run-order list, or grouped by section.
  const shownRuleGroups = useMemo(() => (ruleView === 'run'
    ? [{ name: '', items: [...filteredLogicSteps].sort((a, b) => a.step_number - b.step_number) }]
    : logicGroups(filteredLogicSteps)), [ruleView, filteredLogicSteps]);
  const shownRuleIds = useMemo(() => shownRuleGroups.flatMap((group) => group.items.map((step) => step.id)), [shownRuleGroups]);

  const parameterFields: FormulaName[] = parameters
    .filter((parameter) => parameter.id !== editingParameterId)
    .map((parameter) => ({
      name: parameter.parameter_key,
      label: parameter.parameter_name,
      kind: 'parameter' as const,
    }));

  const draftParameterKey = parameterForm?.parameter_key || '';
  const parameterKeyOwners = [
    ...parameters.filter((parameter) => parameter.id !== editingParameterId).map((parameter) => ({ name: parameter.parameter_key, label: parameter.parameter_name })),
    ...logicSteps.filter((step) => step.rule_key?.trim()).map((step) => ({ name: step.rule_key!.trim(), label: step.rule_name })),
    ...transactionFields,
    ...agentFields,
    ...logicContextNames,
    { name: 'total_commission', label: 'Total Commission' },
  ];
  const parameterKeyConflict = editingParameterId ? null : describeKeyConflict(draftParameterKey, parameterKeyOwners);
  const parameterWasOpen = useRef(false);
  const parameterBaseline = useRef('');
  const parameterDraft = parameterForm ? JSON.stringify(parameterForm) : '';
  if (Boolean(parameterForm) !== parameterWasOpen.current) {
    parameterWasOpen.current = Boolean(parameterForm);
    if (parameterForm) parameterBaseline.current = parameterDraft;
  }
  const parameterDirty = Boolean(parameterForm) && parameterDraft !== parameterBaseline.current;
  const logicWasOpen = useRef(false);
  const logicBaseline = useRef('');
  const logicDraft = logicForm ? JSON.stringify(logicForm) : '';
  if (Boolean(logicForm) !== logicWasOpen.current) {
    logicWasOpen.current = Boolean(logicForm);
    if (logicForm) logicBaseline.current = logicDraft;
  }
  const logicDirty = Boolean(logicForm) && logicDraft !== logicBaseline.current;
  const templateWasOpen = useRef(false);
  const templateBaseline = useRef('');
  const templateDraft = JSON.stringify({ editName, editDescription, editEligibility });
  if (editTemplateOpen !== templateWasOpen.current) {
    templateWasOpen.current = editTemplateOpen;
    if (editTemplateOpen) templateBaseline.current = templateDraft;
  }
  const templateDirty = editTemplateOpen && templateDraft !== templateBaseline.current;
  const formEvent = { preventDefault() {} } as React.FormEvent;
  useRegisterSave({
    id: 'template-parameter',
    active: parameterDirty && !parameterKeyConflict,
    saving: isSaving && Boolean(parameterForm),
    onSave: async () => {
      await saveParameter(formEvent);
      return leaveSaveOk.current;
    },
    onDiscard: () => {
      setParameterForm(null);
      setEditingParameterId(null);
      setFormError(null);
    },
  });
  const ruleKeyConflict = logicForm
    ? describeKeyConflict(logicForm.rule_key, [
        ...transactionFields,
        ...agentFields,
        ...parameterFields,
        ...logicSteps
          .filter((step) => step.id !== editingLogicId && step.rule_key?.trim())
          .map((step) => ({ name: step.rule_key!.trim(), label: step.rule_name })),
        ...logicContextNames,
        { name: 'total_commission', label: 'Total Commission' },
      ])
    : null;
  useRegisterSave({
    id: 'template-rule',
    active: logicDirty && !ruleKeyConflict,
    saving: isSaving && Boolean(logicForm),
    onSave: async () => {
      await saveLogic(formEvent);
      return leaveSaveOk.current;
    },
    onDiscard: () => {
      setLogicForm(null);
      setEditingLogicId(null);
      setFormError(null);
    },
  });
  useRegisterSave({
    id: 'template-details',
    active: templateDirty && Boolean(editName.trim()),
    saving: isSaving && editTemplateOpen,
    onSave: async () => {
      await handleSaveTemplate(formEvent);
      return leaveSaveOk.current;
    },
    onDiscard: () => setEditTemplateOpen(false),
  });
  const validationParameterFields: FormulaName[] = parameters.map((parameter) => ({
    name: parameter.parameter_key,
    label: parameter.id === editingParameterId && parameterForm ? parameterForm.parameter_name : parameter.parameter_name,
    kind: 'parameter' as const,
  }));
  if (draftParameterKey && !validationParameterFields.some((field) => field.name === draftParameterKey)) {
    validationParameterFields.unshift({
      name: draftParameterKey,
      label: parameterForm?.parameter_name || 'This parameter',
      kind: 'parameter',
    });
  }
  const validationFormulaNames: FormulaName[] = [
    ...transactionFields,
    ...agentFields,
    ...validationParameterFields,
  ];
  const validationFieldGroups = [
    { id: 'transactions', title: 'Transactions', fields: transactionFields },
    { id: 'agents', title: 'Agents', fields: agentFields },
    { id: 'parameters', title: 'Template Parameters', fields: validationParameterFields },
  ];

  const formulaNames: FormulaName[] = [
    ...transactionFields,
    ...agentFields,
    ...parameterFields,
  ];
  const logicFormulaNames: FormulaName[] = [
    ...formulaNames,
    ...logicContextNames,
    ...ledgerFormulaNames,
    ...logicSteps.filter((step) => step.rule_key?.trim()).map((step) => ({ name: step.rule_key!.trim(), label: step.rule_name, kind: 'field' as const })),
  ];

  const fieldGroups = [
    { id: 'transactions', title: 'Transactions', fields: transactionFields },
    { id: 'agents', title: 'Agents', fields: agentFields },
    { id: 'parameters', title: 'Template Parameters', fields: parameterFields },
  ];

  const sectionOptions = [...new Set(parameters.map((parameter) => parameter.section?.trim()).filter((section): section is string => Boolean(section)))];

  const openSectionMenu = () => {
    const rect = sectionFieldRef.current?.getBoundingClientRect();
    if (!rect || sectionOptions.length === 0) {
      setSectionMenuOpen(false);
      return;
    }
    setSectionMenuBox({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setSectionMenuOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 shadow-xs ${phoneSheet}`}>
        <div className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 max-sm:min-h-0 max-sm:grid-cols-1 max-sm:grid-rows-none max-sm:gap-y-1">
          <Link href="/commission-tracker/settings/commission-templates" className="col-start-1 row-start-1 self-start text-2xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
            ← All Templates
          </Link>
          {isLoading ? (
            <p className="col-start-1 row-start-2 text-xs text-slate-500">Loading template...</p>
          ) : template ? (
            <h2 className="col-start-1 row-start-2 text-lg font-bold leading-6 text-slate-900 dark:text-white">
              {template.template_name}
            </h2>
          ) : null}
          {template?.description && (
            <p className="col-start-1 row-start-3 self-end text-2xs leading-4 text-slate-500 dark:text-slate-400">{template.description}</p>
          )}
          {template && (
            <div className="col-start-2 row-start-1 row-span-3 self-center flex items-center gap-1 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-4 max-sm:mt-2">
              <button
                type="button"
                onClick={toggleCompactRows}
                aria-pressed={compactRows}
                title={compactRows ? 'Use comfortable rows' : 'Use compact rows'}
                className={`mr-1 inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition cursor-pointer ${
                  compactRows
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Rows3 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                Compact
              </button>
              <button
                type="button"
                onClick={openEditTemplate}
                className={`${rowActionClass} text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700`}
                title="Edit Template"
                aria-label="Edit Template"
              >
                <EditPencil className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete({ kind: 'template', label: template.template_name })}
                className={`${rowActionClass} text-lg leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`}
                title="Delete Template"
                aria-label="Delete Template"
              >
                <TrashIcon />
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {!isLoading && template && (
        <>
          <section className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-clip ${phoneSheetFlush}`}>
            <div className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${parametersCollapsed ? '' : 'border-b border-slate-200 dark:border-slate-700'}`}>
              <button
                type="button"
                onClick={() => setParametersCollapsed((collapsed) => !collapsed)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left cursor-pointer"
                aria-expanded={!parametersCollapsed}
              >
                <span className="mt-0.5 w-3 shrink-0 text-center text-sm font-bold leading-none text-emerald-600 dark:text-emerald-400">
                  {parametersCollapsed ? '+' : '−'}
                </span>
                <span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Parameters
                    <span className="text-2xs font-normal text-slate-500 dark:text-slate-400 normal-case ml-1.5">
                      ({parameterSearch.trim() ? `${filteredParameters.length} of ${parameters.length}` : parameters.length})
                    </span>
                  </h3>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                    Values the user fills in when this template is applied to a transaction.
                  </p>
                </span>
              </button>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <HoverNote label="Select parameters to rename at once">
                  <button
                    type="button"
                    aria-label="Select parameters to rename at once"
                    aria-pressed={selectingParameters}
                    onClick={() => {
                      setSelectingParameters((current) => !current);
                      setSelectedParameterIds(new Set());
                      lastToggledParameterId.current = null;
                      setBulkParameterRenameOpen(false);
                    }}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition cursor-pointer ${
                      selectingParameters
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  </button>
                </HoverNote>
                {selectingParameters && selectedParameterIds.size > 0 && (() => {
                  const selected = parameters.filter((parameter) => selectedParameterIds.has(parameter.id));
                  const withDivider = selected.filter((parameter) => parameter.divider_below).length;
                  const dividerButton = 'h-9 px-3 rounded-lg text-xs font-bold border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 transition inline-flex items-center whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700';
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkParameterError(null);
                          setBulkParameterRenameOpen(true);
                        }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-600 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                      >
                        Rename {selectedParameterIds.size}
                      </button>
                      {withDivider < selected.length && (
                        <HoverNote label={`Add the horizontal divider below ${selected.length - withDivider} ${selected.length - withDivider === 1 ? 'parameter' : 'parameters'}.`}>
                          <button type="button" disabled={bulkParameterSaving} onClick={() => void applyBulkParameterDivider(true)} className={dividerButton}>
                            Add Divider
                          </button>
                        </HoverNote>
                      )}
                      {withDivider > 0 && (
                        <HoverNote label={`Remove the horizontal divider below ${withDivider} ${withDivider === 1 ? 'parameter' : 'parameters'}.`}>
                          <button type="button" disabled={bulkParameterSaving} onClick={() => void applyBulkParameterDivider(false)} className={dividerButton}>
                            Remove Divider
                          </button>
                        </HoverNote>
                      )}
                    </>
                  );
                })()}
                <div className={`relative w-full sm:w-64 ${underlineShell}`}>
                  <input
                    type="text"
                    value={parameterSearch}
                    onChange={(event) => {
                      setParameterSearch(event.target.value);
                      if (parametersCollapsed && event.target.value.trim()) {
                        setParametersCollapsed(false);
                      }
                    }}
                    placeholder="Search parameters..."
                    className={`${underlineControl} pr-4`}
                  />
                  {parameterSearch && (
                    <button
                      type="button"
                      onClick={() => setParameterSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      title="Clear Search"
                      aria-label="Clear Search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setShowParameterFields(false);
                    setEditingParameterId(null);
                    setParameterForm({ ...emptyParameter });
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-500 text-white cursor-pointer whitespace-nowrap"
                >
                  Add Parameter
                </button>
              </div>
            </div>
            {parametersCollapsed ? null : parameters.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">No parameters yet.</p>
            ) : filteredParameters.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No parameters matching &ldquo;{parameterSearch}&rdquo;.
                <button
                  type="button"
                  onClick={() => setParameterSearch('')}
                  className="ml-2 font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div ref={parameterScrollRef} className="max-h-[calc(100dvh-11rem)] overflow-auto overscroll-none">
                <table className={`pin-col-2 w-full border-separate border-spacing-0 text-left text-xs [&_th]:border-b [&_td]:border-b [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-700 dark:[&_td]:border-slate-700 ${compactRows ? '[&_th]:!px-3 [&_th]:!py-1.5 [&_td:not([colspan])]:!px-3 [&_td:not([colspan])]:!py-1 [&_tbody_td]:!align-middle' : ''}`}>
                  <thead className="text-2xs [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-20 [&>tr>th]:bg-slate-200 dark:[&>tr>th]:bg-slate-700 text-slate-600 dark:text-slate-300 [&>tr>th:last-child]:z-30">
                    <tr>
                      <th className="px-4 py-3">
                        {selectingParameters ? (
                          <span className="flex items-center gap-2">
                            {/* Selects or clears every parameter the search shows. */}
                            <input
                              type="checkbox"
                              aria-label="Select all shown parameters"
                              checked={filteredParameters.length > 0 && filteredParameters.every((parameter) => selectedParameterIds.has(parameter.id))}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setSelectedParameterIds((current) => {
                                  const next = new Set(current);
                                  for (const parameter of filteredParameters) {
                                    if (checked) next.add(parameter.id);
                                    else next.delete(parameter.id);
                                  }
                                  return next;
                                });
                              }}
                              className="block h-3.5 w-3.5 accent-brand-600 cursor-pointer"
                            />
                            #
                          </span>
                        ) : '#'}
                      </th>
                      <th className="px-4 py-3">Parameter</th>
                      <th className="px-4 py-3">Key</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Required</th>
                      <th className="px-4 py-3">Autofill Formula</th>
                      <th className="px-4 py-3">Validation</th>
                      <th className="sticky right-0 top-0 z-30 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {parameterGroups(filteredParameters).map((group) => {
                      const isUnsectioned = group.name === 'No Section';
                      return (
                      <React.Fragment key={group.name}>
                        <tr
                          onDragOver={(event) => {
                            if (parameterSearch.trim() || reorderDrag.current !== 'parameter') return;
                            event.preventDefault();
                            setDropTarget({ sectionName: group.name });
                          }}
                          onDrop={(event) => {
                            if (parameterSearch.trim()) return;
                            event.preventDefault();
                            const sourceId = event.dataTransfer.getData('text/plain');
                            setDropTarget(null);
                            if (sourceId) void dropParameter(sourceId, { sectionName: group.name });
                          }}
                        >
                          <td colSpan={8} className={`!p-2 ${dropTarget && 'sectionName' in dropTarget && dropTarget.sectionName === group.name ? (isUnsectioned ? 'bg-amber-500/20' : 'bg-brand-500/15') : 'bg-white dark:bg-slate-800'}`}>
                            {/* The section as a pill, like the Transaction Overview, with Rename beside it. */}
                            <div className={`flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 ${isUnsectioned ? 'bg-amber-500/10' : 'bg-brand-500/10 dark:bg-brand-500/15'}`}>
                              {renamingSection === group.name ? (
                                <form
                                  className="flex min-w-0 flex-1 items-center gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void renameSection(group.name, sectionDraft);
                                  }}
                                >
                                  <input
                                    id={`rename-section-${group.name}`}
                                    autoFocus
                                    value={sectionDraft}
                                    onChange={(event) => {
                                      setSectionDraft(event.target.value);
                                      setSectionRenameError(null);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') {
                                        setRenamingSection(null);
                                        setSectionRenameError(null);
                                      }
                                    }}
                                    aria-label={`New name for ${group.name}`}
                                    placeholder={isUnsectioned ? 'Section name' : group.name}
                                    className="min-w-0 max-w-xs flex-1 rounded-md border border-brand-500/40 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-brand-500 dark:bg-slate-900 dark:text-white"
                                  />
                                  <button type="submit" className="rounded-full bg-brand-600 px-3 py-0.5 text-2xs font-bold text-white hover:bg-brand-500 cursor-pointer">Rename</button>
                                  <button
                                    type="button"
                                    onClick={() => { setRenamingSection(null); setSectionRenameError(null); }}
                                    className="rounded-full px-2 py-0.5 text-2xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  {sectionRenameError && <span className="truncate text-2xs font-semibold text-rose-600 dark:text-rose-400">{sectionRenameError}</span>}
                                </form>
                              ) : (
                                <>
                                  <span className={`text-xs font-bold ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}>
                                    {group.name}
                                  </span>
                                  {!parameterSearch.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingSection(group.name);
                                        setSectionDraft(isUnsectioned ? '' : group.name);
                                        setSectionRenameError(null);
                                      }}
                                      disabled={isReordering}
                                      aria-label={`Rename section ${group.name}`}
                                      title={isUnsectioned ? 'Name This Section' : 'Rename Section'}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-brand-700 disabled:opacity-40 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-brand-400"
                                    >
                                      <EditPencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <span className="ml-auto pr-1.5 text-2xs font-medium text-slate-500 dark:text-slate-400">
                                    {group.items.length} {group.items.length === 1 ? 'parameter' : 'parameters'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {group.items.map((parameter, itemIndex) => (
                      <tr
                        key={parameter.id}
                        aria-selected={selectingParameters ? selectedParameterIds.has(parameter.id) : undefined}
                        // In select mode a click anywhere on the row only selects it (Shift-click for a range).
                        onClickCapture={selectingParameters ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleParameterSelected(parameter.id, event.shiftKey, shownParameterIds);
                        } : undefined}
                        onMouseDown={selectingParameters ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                        className={`align-top ${selectingParameters ? 'cursor-pointer select-none' : ''} ${selectingParameters && selectedParameterIds.has(parameter.id) ? '[&>td]:!bg-brand-100 dark:[&>td]:!bg-[color-mix(in_srgb,var(--color-brand-500)_22%,var(--color-slate-800))]' : ''} ${parameter.divider_below ? '[&>td]:!border-b-brand-500 dark:[&>td]:!border-b-brand-400' : ''} ${parameter.id === recentParameterId ? '[&>td]:bg-emerald-50 dark:[&>td]:bg-emerald-500/10' : itemIndex % 2 === 1 && !(selectingParameters && selectedParameterIds.has(parameter.id)) ? 'md:[&>td]:bg-slate-50 dark:md:[&>td]:bg-[color-mix(in_srgb,var(--color-slate-900)_45%,var(--color-slate-800))]' : ''} ${dropTarget && 'parameterId' in dropTarget && dropTarget.parameterId === parameter.id ? (dropTarget.placement === 'before' ? '[&>td]:shadow-[inset_0_2px_0_0_#10b981]' : '[&>td]:shadow-[inset_0_-2px_0_0_#10b981]') : ''}`}
                        onDragOver={(event) => {
                          if (parameterSearch.trim() || reorderDrag.current !== 'parameter') return;
                          event.preventDefault();
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
                          setDropTarget({ parameterId: parameter.id, placement });
                        }}
                        onDrop={(event) => {
                          if (parameterSearch.trim()) return;
                          event.preventDefault();
                          const sourceId = event.dataTransfer.getData('text/plain');
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
                          setDropTarget(null);
                          if (sourceId) void dropParameter(sourceId, { parameterId: parameter.id, placement });
                        }}
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {selectingParameters ? (
                            <span className="flex items-center gap-2">
                              {/* The row's click selects; the box only shows it. */}
                              <input
                                type="checkbox"
                                aria-label={`Select ${parameter.parameter_name}`}
                                checked={selectedParameterIds.has(parameter.id)}
                                onChange={() => {}}
                                tabIndex={-1}
                                className="pointer-events-none block h-3.5 w-3.5 accent-brand-600"
                              />
                              {parameter.sort_order ?? '—'}
                            </span>
                          ) : parameter.sort_order ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{parameter.parameter_name}</p>
                          {!compactRows && parameter.is_user_editable === false && (
                            <p className="text-2xs font-bold text-slate-400 mt-1">Read-only on the transaction</p>
                          )}
                          {!compactRows && parameter.notes && <p className="text-2xs text-slate-500 mt-1">{parameter.notes}</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-300 whitespace-nowrap">{parameter.parameter_key}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{typeLabel(parameter.data_type)}</td>
                        <td className="px-4 py-3">{parameter.is_required ? 'Yes' : 'No'}</td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[18rem]'}`}>
                          {formulaField(compactRows, parameter.autofill_formula || '', 'Autofill', formulaNames, () => openEditParameter(parameter))}
                        </td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[18rem]'}`}>
                          {formulaField(compactRows, parameter.validation_rule || '', 'Validation', validationFormulaNames, () => openEditParameter(parameter))}
                        </td>
                        <td className="sticky right-0 z-10 bg-white dark:bg-slate-800 px-4 py-3 whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]">
                          <div className="inline-flex items-center justify-end gap-1">
                            <span
                              draggable={!isReordering && !parameterSearch.trim()}
                              onDragStart={(event) => {
                                if (parameterSearch.trim()) return;
                                reorderDrag.current = 'parameter';
                                event.dataTransfer.setData('text/plain', parameter.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setDropTarget(null)}
                              className={`${parameterSearch.trim() ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'} text-sm px-0.5 select-none`}
                              title={parameterSearch.trim() ? 'Clear search to reorder' : 'Drag to reorder or move to a section'}
                            >
                              ⠿
                            </span>
                            <button type="button" onClick={() => openEditParameter(parameter)} className={`${rowActionClass} text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Edit" aria-label="Edit">
                              <EditPencil className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" onClick={() => openEditParameter(parameter, true)} className={`${rowActionClass} text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Duplicate" aria-label="Duplicate">
                              <Copy className="h-[17px] w-[17px]" strokeWidth={1.75} />
                            </button>
                            <button type="button" onClick={() => setConfirmDelete({ kind: 'parameter', id: parameter.id, label: parameter.parameter_name })} className={`${rowActionClass} text-lg leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`} title="Delete" aria-label="Delete"><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                        ))}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-clip ${phoneSheetFlush}`}>
            <div className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${logicCollapsed ? '' : 'border-b border-slate-200 dark:border-slate-700'}`}>
              <button
                type="button"
                onClick={() => setLogicCollapsed((collapsed) => !collapsed)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left cursor-pointer"
                aria-expanded={!logicCollapsed}
              >
                <span className="mt-0.5 w-3 shrink-0 text-center text-sm font-bold leading-none text-emerald-600 dark:text-emerald-400">
                  {logicCollapsed ? '+' : '−'}
                </span>
                <span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Rules
                    <span className="text-2xs font-normal text-slate-500 dark:text-slate-400 normal-case ml-1.5">
                      ({logicSearch.trim() ? `${filteredLogicSteps.length} of ${logicSteps.length}` : logicSteps.length})
                    </span>
                  </h3>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                    Each rule decides when it applies, who gets paid, and how the amount is calculated.
                  </p>
                </span>
              </button>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <div role="group" aria-label="Rule Order" className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                  {([['run', 'Run Order', 'Every rule in the order it runs'], ['section', 'By Section', 'Rules grouped by waterfall section']] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => chooseRuleView(value)}
                      aria-pressed={ruleView === value}
                      title={hint}
                      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${ruleView === value
                        ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* The same bulk actions button as on Transactions and Agents. */}
                <HoverNote label="Select rules to rename at once">
                  <button
                    type="button"
                    aria-label="Select rules to rename at once"
                    aria-pressed={selectingRules}
                    onClick={() => {
                      setSelectingRules((current) => !current);
                      setSelectedRuleIds(new Set());
                      lastToggledRuleId.current = null;
                      setBulkRenameOpen(false);
                    }}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition cursor-pointer ${
                      selectingRules
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  </button>
                </HoverNote>
                {selectingRules && selectedRuleIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkRenameError(null);
                      setBulkRenameOpen(true);
                    }}
                    className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-600 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                  >
                    Rename {selectedRuleIds.size}
                  </button>
                )}
                {selectingRules && (() => {
                  // Only calculations shown in the form can have a divider below them.
                  const eligible = logicSteps.filter((step) => selectedRuleIds.has(step.id)
                    && canonicalLogicSection(step.section || '') === 'Calculation' && step.show_in_popup);
                  if (eligible.length === 0) return null;
                  const withDivider = eligible.filter((step) => step.divider_below).length;
                  const skipped = selectedRuleIds.size - eligible.length;
                  const note = skipped > 0 ? ` ${skipped} selected ${skipped === 1 ? 'rule is' : 'rules are'} not shown in the form and ${skipped === 1 ? 'is' : 'are'} left as is.` : '';
                  const dividerButton = 'h-9 px-3 rounded-lg text-xs font-bold border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 transition inline-flex items-center whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700';
                  return (
                    <>
                      {withDivider < eligible.length && (
                        <HoverNote label={`Add the horizontal divider below ${eligible.length - withDivider} ${eligible.length - withDivider === 1 ? 'rule' : 'rules'}.${note}`}>
                          <button type="button" disabled={bulkRenameSaving} onClick={() => void applyBulkDivider(true)} className={dividerButton}>
                            Add Divider
                          </button>
                        </HoverNote>
                      )}
                      {withDivider > 0 && (
                        <HoverNote label={`Remove the horizontal divider below ${withDivider} ${withDivider === 1 ? 'rule' : 'rules'}.${note}`}>
                          <button type="button" disabled={bulkRenameSaving} onClick={() => void applyBulkDivider(false)} className={dividerButton}>
                            Remove Divider
                          </button>
                        </HoverNote>
                      )}
                    </>
                  );
                })()}
                <div className={`relative w-full sm:w-64 ${underlineShell}`}>
                  <input
                    type="text"
                    value={logicSearch}
                    onChange={(event) => {
                      setLogicSearch(event.target.value);
                      if (logicCollapsed && event.target.value.trim()) {
                        setLogicCollapsed(false);
                      }
                    }}
                    placeholder="Search rules..."
                    className={`${underlineControl} pr-4`}
                  />
                  {logicSearch && (
                    <button
                      type="button"
                      onClick={() => setLogicSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      title="Clear Search"
                      aria-label="Clear Search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setEditingLogicId(null);
                    setLogicForm({ ...emptyLogic });
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-500 text-white cursor-pointer whitespace-nowrap"
                >
                  Add Rule
                </button>
              </div>
            </div>
            {logicCollapsed ? null : logicSteps.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">No rules yet.</p>
            ) : filteredLogicSteps.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No rules matching &ldquo;{logicSearch}&rdquo;.
                <button
                  type="button"
                  onClick={() => setLogicSearch('')}
                  className="ml-2 font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div ref={logicScrollRef} className="max-h-[calc(100dvh-11rem)] overflow-auto overscroll-none">
                <table className={`pin-col-2 w-full border-separate border-spacing-0 text-left text-xs [&_th]:border-b [&_td]:border-b [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-700 dark:[&_td]:border-slate-700 ${compactRows ? '[&_th]:!px-3 [&_th]:!py-1.5 [&_td:not([colspan])]:!px-3 [&_td:not([colspan])]:!py-1 [&_tbody_td]:!align-middle' : ''}`}>
                  <thead className="text-2xs [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-20 [&>tr>th]:bg-slate-200 dark:[&>tr>th]:bg-slate-700 text-slate-600 dark:text-slate-300 [&>tr>th:last-child]:z-30">
                    <tr>
                      <th className="px-4 py-3">
                        {selectingRules ? (
                          <span className="flex items-center gap-2">
                            {/* Selects or clears every rule the search shows. */}
                            <input
                              type="checkbox"
                              aria-label="Select all shown rules"
                              checked={filteredLogicSteps.length > 0 && filteredLogicSteps.every((step) => selectedRuleIds.has(step.id))}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setSelectedRuleIds((current) => {
                                  const next = new Set(current);
                                  for (const step of filteredLogicSteps) {
                                    if (checked) next.add(step.id);
                                    else next.delete(step.id);
                                  }
                                  return next;
                                });
                              }}
                              className="block h-3.5 w-3.5 accent-brand-600 cursor-pointer"
                            />
                            #
                          </span>
                        ) : '#'}
                      </th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Custom Baseline</th>
                      <th className="px-4 py-3">Calculation</th>
                      <th className="px-4 py-3">Result Type</th>
                      <th className="px-4 py-3">Split Type</th>
                      <th className="sticky right-0 top-0 z-30 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {shownRuleGroups.map((group) => {
                      const isUnsectioned = group.name === 'No Section';
                      return (
                      <React.Fragment key={group.name}>
                        {ruleView === 'section' && (
                        <tr
                          onDragOver={(event) => {
                            if (logicSearch.trim() || reorderDrag.current !== 'rule') return;
                            event.preventDefault();
                            setLogicDropTarget({ sectionName: group.name });
                          }}
                          onDrop={(event) => {
                            if (logicSearch.trim()) return;
                            event.preventDefault();
                            const sourceId = event.dataTransfer.getData('text/plain');
                            setLogicDropTarget(null);
                            if (sourceId) void dropLogic(sourceId, { sectionName: group.name });
                          }}
                        >
                          <td colSpan={11} className={`!p-2 ${logicDropTarget && 'sectionName' in logicDropTarget && logicDropTarget.sectionName === group.name ? (isUnsectioned ? 'bg-amber-500/20' : 'bg-brand-500/15') : 'bg-white dark:bg-slate-800'}`}>
                            <div className={`flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 ${isUnsectioned ? 'bg-amber-500/10' : 'bg-brand-500/10 dark:bg-brand-500/15'}`}>
                              {renamingRuleSection === group.name ? (
                                <form
                                  className="flex min-w-0 flex-1 items-center gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void renameRuleSection(group.name, ruleSectionDraft);
                                  }}
                                >
                                  <input
                                    id={`rename-rule-section-${group.name}`}
                                    autoFocus
                                    value={ruleSectionDraft}
                                    onChange={(event) => {
                                      setRuleSectionDraft(event.target.value);
                                      setRuleRenameError(null);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') {
                                        setRenamingRuleSection(null);
                                        setRuleRenameError(null);
                                      }
                                    }}
                                    aria-label={`New name for ${ruleSectionLabel(group.name)}`}
                                    placeholder={group.name}
                                    className="min-w-0 max-w-xs flex-1 rounded-md border border-brand-500/40 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-brand-500 dark:bg-slate-900 dark:text-white"
                                  />
                                  <button type="submit" disabled={isSavingRuleLabel} className="rounded-full bg-brand-600 px-3 py-0.5 text-2xs font-bold text-white hover:bg-brand-500 disabled:opacity-50 cursor-pointer">{isSavingRuleLabel ? 'Saving…' : 'Rename'}</button>
                                  <button
                                    type="button"
                                    onClick={() => { setRenamingRuleSection(null); setRuleRenameError(null); }}
                                    className="rounded-full px-2 py-0.5 text-2xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <span className="truncate text-2xs text-slate-500 dark:text-slate-400">
                                    {ruleRenameError
                                      ? <span className="font-semibold text-rose-600 dark:text-rose-400">{ruleRenameError}</span>
                                      : 'Only the name changes. The rules keep their waterfall stage. Leave it empty to show the stage name.'}
                                  </span>
                                </form>
                              ) : (
                                <>
                                  <span className={`text-xs font-bold ${isUnsectioned ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'}`}>
                                    {ruleSectionLabel(group.name)}
                                  </span>
                                  {ruleSectionLabel(group.name) !== group.name && (
                                    <span className="text-2xs text-slate-500 dark:text-slate-400" title="The waterfall stage these rules run in">{group.name}</span>
                                  )}
                                  {!logicSearch.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingRuleSection(group.name);
                                        setRuleSectionDraft(ruleSectionLabel(group.name));
                                        setRuleRenameError(null);
                                      }}
                                      aria-label={`Rename section ${ruleSectionLabel(group.name)}`}
                                      title="Rename Section"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-brand-700 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-brand-400"
                                    >
                                      <EditPencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <span className="ml-auto pr-1.5 text-2xs font-medium text-slate-500 dark:text-slate-400">
                                    {group.items.length} {group.items.length === 1 ? 'rule' : 'rules'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        )}
                        {group.items.map((step, itemIndex) => (
                      <tr
                        key={step.id}
                        aria-selected={selectingRules ? selectedRuleIds.has(step.id) : undefined}
                        // In select mode a click anywhere on the row only selects it (Shift-click for a range); its buttons,
                        // formulas and drag handle do nothing then.
                        onClickCapture={selectingRules ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleRuleSelected(step.id, event.shiftKey, shownRuleIds);
                        } : undefined}
                        onMouseDown={selectingRules ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                        draggable={selectingRules ? false : undefined}
                        className={`align-top ${selectingRules ? 'cursor-pointer select-none' : ''} ${selectingRules && selectedRuleIds.has(step.id) ? '[&>td]:!bg-brand-100 dark:[&>td]:!bg-[color-mix(in_srgb,var(--color-brand-500)_22%,var(--color-slate-800))]' : ''} ${ruleView !== 'section' ? '' : calculationFormSectionEnds(step, group.items[itemIndex + 1]) ? '[&>td]:border-b-2 [&>td]:!border-b-slate-400 dark:[&>td]:!border-b-slate-500' : calculationDividerBelow(step) ? '[&>td]:!border-b-brand-500 dark:[&>td]:!border-b-brand-400' : ''} ${step.id === recentLogicId ? '[&>td]:bg-emerald-50 dark:[&>td]:bg-emerald-500/10' : itemIndex % 2 === 1 && !(selectingRules && selectedRuleIds.has(step.id)) ? 'md:[&>td]:bg-slate-50 dark:md:[&>td]:bg-[color-mix(in_srgb,var(--color-slate-900)_45%,var(--color-slate-800))]' : ''} ${logicDropTarget && 'stepId' in logicDropTarget && logicDropTarget.stepId === step.id ? (logicDropTarget.placement === 'before' ? '[&>td]:shadow-[inset_0_2px_0_0_#10b981]' : '[&>td]:shadow-[inset_0_-2px_0_0_#10b981]') : ''}`}
                        onDragOver={(event) => {
                          if (logicSearch.trim() || reorderDrag.current !== 'rule') return;
                          event.preventDefault();
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
                          setLogicDropTarget({ stepId: step.id, placement });
                        }}
                        onDrop={(event) => {
                          if (logicSearch.trim()) return;
                          event.preventDefault();
                          const sourceId = event.dataTransfer.getData('text/plain');
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
                          setLogicDropTarget(null);
                          if (sourceId) void (ruleView === 'run' ? dropLogicInRunOrder : dropLogic)(sourceId, { stepId: step.id, placement });
                        }}
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {selectingRules ? (
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${step.rule_name}`}
                                checked={selectedRuleIds.has(step.id)}
                                onChange={() => {}}
                                tabIndex={-1}
                                // The row's click selects; the box only shows it. A click the box handled itself would
                                // flip it again after the row did, leaving it checked on an unselected row.
                                className="pointer-events-none block h-3.5 w-3.5 accent-brand-600"
                              />
                              {step.step_number}
                            </label>
                          ) : step.step_number}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{step.rule_name}</div>
                          {!compactRows && step.rule_key?.trim() && <div className="mt-0.5 font-mono text-2xs text-sky-700 dark:text-sky-300">{step.rule_key}</div>}
                          {!compactRows && step.show_in_popup && <div className="mt-1 text-2xs font-bold text-emerald-600 dark:text-emerald-400">Shown When Applying{step.popup_section?.trim() ? ` · ${step.popup_section.trim()}` : ''}</div>}
                        </td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[12rem]'} text-slate-600 dark:text-slate-300`}>
                          {canonicalLogicSection(step.section || '') === 'Calculation' ? '—' : step.apply_condition?.trim() ? (
                            formulaField(compactRows, step.apply_condition, 'Condition', logicFormulaNames, () => openEditLogic(step), '')
                          ) : 'Always'}
                        </td>
                        <td className="px-4 py-3">
                          {/* A calculation shown in the Commission Template form names the form section it shows in. In run
                              order the section is a chip, since there are no section headings. */}
                          {(() => {
                            const isCalculation = canonicalLogicSection(step.section || '') === 'Calculation';
                            const sectionText = isCalculation && step.show_in_popup && step.popup_section?.trim()
                              ? `${ruleSectionLabel('Calculation')}: ${step.popup_section.trim()}`
                              : ruleView === 'run'
                                ? ruleSectionLabel(logicSectionName(step))
                                : canonicalLogicSection(step.section || '') || step.section?.trim() || '—';
                            if (ruleView === 'section') return sectionText;
                            return (
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ${isCalculation
                                ? 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300'
                                : 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'}`}
                              >
                                {sectionText}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-300">
                          {logicSectionShowsAgent(canonicalLogicSection(step.section || '')) ? (step.agent_key?.trim() || '—') : '—'}
                        </td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[12rem]'} text-slate-600 dark:text-slate-300`}>
                          {logicSectionShowsEntity(canonicalLogicSection(step.section || '')) && step.payee_entity_id
                            ? entityName(step.payee_entity_id)
                            : logicSectionShowsEntity(canonicalLogicSection(step.section || '')) && step.payee_formula?.trim()
                              ? formulaField(compactRows, step.payee_formula, 'Entity', logicFormulaNames, () => openEditLogic(step), '')
                              : '—'}
                        </td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[12rem]'} text-slate-600 dark:text-slate-300`}>
                          {step.custom_baseline?.trim()
                            ? formulaField(compactRows, step.custom_baseline, 'Baseline', logicFormulaNames, () => openEditLogic(step), '')
                            : '—'}
                        </td>
                        <td className={`px-4 py-3 ${compactRows ? '' : 'min-w-[16rem] leading-relaxed'} text-slate-600 dark:text-slate-300`}>
                          {formulaField(compactRows, step.calculation_formula || '', 'Calculation', logicFormulaNames, () => openEditLogic(step), 'Blank')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {canonicalLogicSection(step.section || '') === 'Calculation' ? resultTypeLabel(step.result_type) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {String(step.split_type || '').trim().toUpperCase() === 'PERCENT' ? 'Percent' : String(step.split_type || '').trim().toUpperCase() === 'AMOUNT' ? 'Amount' : '—'}
                        </td>
                        <td className="sticky right-0 z-10 bg-white dark:bg-slate-800 px-4 py-3 whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]">
                          <div className="inline-flex items-center justify-end gap-1">
                            <span
                              draggable={!isReordering && !logicSearch.trim()}
                              onDragStart={(event) => {
                                if (logicSearch.trim()) return;
                                reorderDrag.current = 'rule';
                                event.dataTransfer.setData('text/plain', step.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setLogicDropTarget(null)}
                              className={`${logicSearch.trim() ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'} text-sm px-0.5 select-none`}
                              title={logicSearch.trim() ? 'Clear search to reorder' : 'Drag to reorder or move to a section'}
                            >
                              ⠿
                            </span>
                            <button type="button" onClick={() => openEditLogic(step)} className={`${rowActionClass} text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Edit" aria-label="Edit">
                              <EditPencil className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" onClick={() => openEditLogic(step, true)} className={`${rowActionClass} text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Duplicate" aria-label="Duplicate">
                              <Copy className="h-[17px] w-[17px]" strokeWidth={1.75} />
                            </button>
                            <button type="button" onClick={() => setConfirmDelete({ kind: 'logic', id: step.id, label: step.rule_name })} className={`${rowActionClass} text-lg leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`} title="Delete" aria-label="Delete"><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                        ))}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {parameterForm && (
        <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <form onSubmit={saveParameter} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${showParameterFields ? 'max-w-[min(75rem,calc(100vw-2rem))]' : 'max-w-2xl'}`}>
            <div className="shrink-0 px-6 pt-6 pb-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingParameterId ? 'Edit Parameter' : 'Add Parameter'}</h3>
                <button
                  type="button"
                  aria-pressed={showParameterFields}
                  onClick={() => setShowParameterFields((open) => !open)}
                  className={`shrink-0 px-2.5 py-1 text-2xs font-bold rounded-lg border cursor-pointer ${
                    showParameterFields
                      ? 'border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {showParameterFields ? 'Hide Fields and Parameters' : 'Fields and Parameters'}
                </button>
              </div>
              {formError && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-x-auto overflow-y-auto px-6 pb-4">
            <ParameterRow label="Name" htmlFor="parameter-name">
              <div className={underlineShell}>
                <input
                  id="parameter-name"
                  required
                  value={parameterForm.parameter_name}
                  onChange={(event) => {
                    const parameter_name = event.target.value;
                    if (editingParameterId) {
                      setParameterForm({ ...parameterForm, parameter_name });
                      return;
                    }
                    const previousAuto = parameterKeyFromName(parameterForm.parameter_name);
                    const nextAuto = parameterKeyFromName(parameter_name);
                    const parameter_key = !parameterForm.parameter_key || parameterForm.parameter_key === previousAuto ? nextAuto : parameterForm.parameter_key;
                    setParameterForm({ ...parameterForm, parameter_name, parameter_key });
                  }}
                  className={underlineControl}
                />
              </div>
            </ParameterRow>
            <ParameterRow label="Section" htmlFor="parameter-section">
              <div ref={sectionFieldRef} className={underlineShell}>
                <input
                  id="parameter-section"
                  value={parameterForm.section}
                  onChange={(event) => setParameterForm({ ...parameterForm, section: event.target.value })}
                  onFocus={() => openSectionMenu()}
                  onClick={() => openSectionMenu()}
                  onBlur={() => {
                    window.setTimeout(() => {
                      const menu = document.querySelector('[data-section-menu]');
                      if (menu?.matches(':hover') || menu?.contains(document.activeElement)) return;
                      setSectionMenuOpen(false);
                    }, 0);
                  }}
                  placeholder="Example: Off the top"
                  className={`${underlineControl} pr-4`}
                />
                <FieldChevron />
              </div>
            </ParameterRow>
            <ParameterRow
              label="Key"
              htmlFor="parameter-key"
              note={parameterKeyConflict ? (
                <p className="text-2xs font-medium text-rose-600 dark:text-rose-400">{parameterKeyConflict}</p>
              ) : editingParameterId ? null : (
                <p className="text-2xs text-slate-500 dark:text-slate-400">Formulas use this key. You can change it until the parameter is saved.</p>
              )}
            >
              <div className={`${underlineShell} ${parameterKeyConflict ? '!border-b-rose-500 focus-within:!border-b-rose-500 focus-within:!shadow-none' : ''}`}>
                <input
                  id="parameter-key"
                  required
                  readOnly={Boolean(editingParameterId)}
                  tabIndex={editingParameterId ? -1 : undefined}
                  aria-invalid={Boolean(parameterKeyConflict)}
                  value={parameterForm.parameter_key}
                  onChange={(event) => {
                    if (editingParameterId) return;
                    setParameterForm({ ...parameterForm, parameter_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
                  }}
                  className={`${underlineControl} font-mono !text-sky-700 dark:!text-sky-300 ${editingParameterId ? 'cursor-default' : ''}`}
                />
              </div>
            </ParameterRow>
            <ParameterRow label="Type" htmlFor="parameter-type">
              <div className={underlineShell}>
                <ClearableSelect id="parameter-type" value={parameterForm.data_type} onChange={(event) => setParameterForm({ ...parameterForm, data_type: event.target.value as ParameterType })} className={`${underlineControl} overview-field-select cursor-pointer`}>
                  {PARAMETER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </ClearableSelect>
                <FieldChevron />
              </div>
            </ParameterRow>
            {parameterForm.data_type === 'SELECT' && (
              <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
                <p className={sideLabel}>Options</p>
                <div className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {parameterForm.dropdown_options.length} {parameterForm.dropdown_options.length === 1 ? 'option' : 'options'}
                  </p>
                  {parameterForm.dropdown_options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setParameterForm({
                        ...parameterForm,
                        dropdown_options: [...parameterForm.dropdown_options].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
                      })}
                      className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold text-2xs border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                    >
                      Sort A to Z
                    </button>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <label className={`${underlineShell} min-w-0 flex-1`}>
                    <span className={underlineLabel}>Option</span>
                  <input
                    type="text"
                    value={newDropdownOption}
                    onChange={(event) => setNewDropdownOption(event.target.value)}
                    onPaste={(event) => {
                      const pastedText = event.clipboardData.getData('text');
                      if (!pastedText.includes('\n') && !pastedText.includes('\r') && !pastedText.includes(':::')) return;
                      event.preventDefault();
                      setParameterForm({ ...parameterForm, dropdown_options: withDropdownOption(parameterForm.dropdown_options, pastedText) });
                      setNewDropdownOption('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      if (!newDropdownOption.trim()) return;
                      setParameterForm({ ...parameterForm, dropdown_options: withDropdownOption(parameterForm.dropdown_options, newDropdownOption) });
                      setNewDropdownOption('');
                    }}
                    placeholder="Paste a column, or use Option A ::: Option B"
                    className={underlineControl}
                  />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newDropdownOption.trim()) return;
                      setParameterForm({ ...parameterForm, dropdown_options: withDropdownOption(parameterForm.dropdown_options, newDropdownOption) });
                      setNewDropdownOption('');
                    }}
                    className="mb-0.5 h-7 shrink-0 px-2.5 text-xs font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 rounded-md hover:bg-emerald-500/30 transition cursor-pointer"
                  >
                    + Add Option
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {parameterForm.dropdown_options.map((option, index) => (
                    <div
                      key={`${option}-${index}`}
                      {...optionDrag.rowProps(index)}
                      className={`flex items-center gap-1 pl-1 pr-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border text-xs font-semibold text-slate-800 dark:text-slate-200 transition ${
                        optionDrag.overIndex === index ? 'border-brand-500' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      } ${optionDrag.dragIndex === index ? 'opacity-40' : ''}`}
                    >
                      <DragHandle {...optionDrag.handleProps(index)} />
                      {renamingOption === option ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              const next = renameDraft.trim();
                              if (!next || (next !== option && parameterForm.dropdown_options.some((item) => item.toLowerCase() === next.toLowerCase()))) return;
                              setParameterForm({
                                ...parameterForm,
                                dropdown_options: parameterForm.dropdown_options.map((item) => item === option ? next : item),
                              });
                              setRenamingOption(null);
                            }
                            if (event.key === 'Escape') setRenamingOption(null);
                          }}
                          onBlur={() => setRenamingOption(null)}
                          className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        <span className="mr-auto min-w-0 font-medium truncate pr-2" title={option}>{option}</span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingOption(option);
                            setRenameDraft(option);
                          }}
                          className="text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                          title={`Rename "${option}"`}
                        >
                          <EditPencil />
                        </button>
                        <button
                          type="button"
                          onClick={() => setParameterForm({
                            ...parameterForm,
                            dropdown_options: parameterForm.dropdown_options.filter((item) => item !== option),
                          })}
                          className="text-rose-500 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded hover:bg-rose-500/10 cursor-pointer"
                          title="Remove Option"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )}
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
              <div className="flex h-6 items-center gap-1">
                <p className="whitespace-nowrap text-xs font-bold leading-4 text-slate-900 dark:text-white">Autofill Formula</p>
                <FormulaHint text="Optional. This formula will be evaluated when loading the commission template to determine the default value of this parameter." />
              </div>
              <div className="min-w-0">
                <FormulaEditor
                  value={parameterForm.autofill_formula}
                  onChange={(formula) => setParameterForm({ ...parameterForm, autofill_formula: formula })}
                  names={formulaNames}
                  fieldGroups={fieldGroups}
                  fieldsAside
                  fieldsOpen={showParameterFields}
                  showFieldsToggle={false}
                />
              </div>
            </div>
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
              <div className="flex h-6 items-center gap-1">
                <p className="text-xs font-bold leading-4 text-slate-900 dark:text-white">Validation</p>
                <FormulaHint text="Optional. This formula must be true before the template can be submitted." />
              </div>
              <div className="min-w-0">
                <FormulaEditor
                  label="Validation"
                  value={parameterForm.validation_rule}
                  onChange={(formula) => setParameterForm({ ...parameterForm, validation_rule: formula })}
                  names={validationFormulaNames}
                  fieldGroups={validationFieldGroups}
                  fieldsAside
                  fieldsOpen={showParameterFields}
                  showFieldsToggle={false}
                />
              </div>
            </div>
            <ParameterRow label="Notes" htmlFor="parameter-notes">
              <div className={underlineShell}>
                <input id="parameter-notes" value={parameterForm.notes} onChange={(event) => setParameterForm({ ...parameterForm, notes: event.target.value })} className={underlineControl} />
              </div>
            </ParameterRow>
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
              <p className="flex h-6 items-center text-xs font-bold leading-4 text-slate-900 dark:text-white">Required</p>
              <label className="flex h-6 items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <input type="checkbox" checked={parameterForm.is_required} onChange={(event) => setParameterForm({ ...parameterForm, is_required: event.target.checked })} />
                Before the template can be submitted
              </label>
            </div>
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
              <p className="flex h-6 items-center text-xs font-bold leading-4 text-slate-900 dark:text-white">Editable</p>
              <label className="flex h-6 items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <input type="checkbox" checked={parameterForm.is_user_editable} onChange={(event) => setParameterForm({ ...parameterForm, is_user_editable: event.target.checked })} />
                User can change this value on the transaction
              </label>
            </div>
            <div className={`${fieldColumn} grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-x-3`}>
              <p className="flex h-6 items-center text-xs font-bold leading-4 text-slate-900 dark:text-white">Divider</p>
              <label className="flex h-6 items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <input type="checkbox" checked={parameterForm.divider_below} onChange={(event) => setParameterForm({ ...parameterForm, divider_below: event.target.checked })} />
                Add Horizontal Divider Below This Parameter
              </label>
            </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button type="button" onClick={() => { setParameterForm(null); setEditingParameterId(null); setFormError(null); setShowParameterFields(false); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSaving || Boolean(parameterKeyConflict) || !parameterDirty} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Parameter'}</button>
            </div>
          </form>
          {sectionMenuOpen && sectionOptions.length > 0 && createPortal(
            <ul
              data-app-layer=""
              data-section-menu=""
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              className="fixed z-[90] max-h-60 overflow-y-auto rounded-lg border border-black/10 bg-white/95 py-1 text-sm text-slate-900 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#3a3a3c]/95 dark:text-white"
              style={{ top: sectionMenuBox.top, left: sectionMenuBox.left, width: sectionMenuBox.width }}
            >
              {sectionOptions.map((section) => {
                const selected = section === parameterForm.section.trim();
                return (
                  <li key={section}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setParameterForm({ ...parameterForm, section });
                        setSectionMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left cursor-pointer ${selected ? 'bg-[#007aff] text-white' : 'hover:bg-[#007aff] hover:text-white'}`}
                    >
                      <span className="inline-flex w-3.5 shrink-0 justify-center">
                        {selected && (
                          <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6.2 4.6 8.8 10 3.2" />
                          </svg>
                        )}
                      </span>
                      {section}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )}
        </div>
      )}

      {logicForm && (
        <LogicStepForm
          draft={logicForm}
          editing={Boolean(editingLogicId)}
          saving={isSaving}
          error={formError}
          entities={entities}
          formulaNames={formulaNames}
          fieldGroups={fieldGroups}
          ruleFields={logicSteps
            .filter((step) => step.id !== editingLogicId && step.rule_key?.trim())
            .map((step) => ({ name: step.rule_key!.trim(), label: step.rule_name, kind: 'field' as const }))}
          popupSections={[...new Set(logicSteps.map((step) => step.popup_section?.trim()).filter((section): section is string => Boolean(section)))]}
          onChange={setLogicForm}
          onCancel={() => { setLogicForm(null); setEditingLogicId(null); setFormError(null); }}
          onSubmit={(event) => void saveLogic(event)}
          canSave={logicDirty}
        />
      )}
      {confirmDialog}
      {bulkParameterRenameOpen && (
        <BulkRuleRename
          items={parameterGroups(parameters).flatMap((group) => group.items).filter((parameter) => selectedParameterIds.has(parameter.id)).map((parameter) => ({ id: parameter.id, name: parameter.parameter_name }))}
          noun="Parameter"
          saving={bulkParameterSaving}
          error={bulkParameterError}
          onApply={(names) => void applyBulkParameterRename(names)}
          onClose={() => setBulkParameterRenameOpen(false)}
        />
      )}
      {bulkRenameOpen && (
        <BulkRuleRename
          items={[...logicSteps].sort((a, b) => a.step_number - b.step_number).filter((step) => selectedRuleIds.has(step.id)).map((step) => ({ id: step.id, name: step.rule_name }))}
          noun="Rule"
          saving={bulkRenameSaving}
          error={bulkRenameError}
          onApply={(names) => void applyBulkRename(names.map(({ id, name }) => ({ id, rule_name: name })))}
          onClose={() => setBulkRenameOpen(false)}
        />
      )}

      {editTemplateOpen && template && createPortal(
        <div className="app-modal fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => { if (!isSaving) setEditTemplateOpen(false); }}>
          <form
            onSubmit={(event) => void handleSaveTemplate(event)}
            onClick={(event) => event.stopPropagation()}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-3xl rounded-xl p-6 shadow-2xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-template-title"
          >
            <h3 id="edit-template-title" className="text-lg font-bold text-slate-900 dark:text-white">Edit Commission Template</h3>
            <label className={underlineShell}>
              <span className={underlineLabel}>Template Name</span>
              <input
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className={underlineControl}
              />
            </label>
            <label className={underlineShell}>
              <span className={underlineLabel}>Description</span>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className={`${underlineControl} min-h-16 resize-none py-1`}
              />
            </label>
            <FormulaEditor
              label="Template Eligibility Formula"
              value={editEligibility}
              onChange={setEditEligibility}
              names={eligibilityFormulaNames(transactionFields)}
              fitContent
              hint="Leave this blank and the template does not qualify for submission. A transaction qualifies when this formula is true. status is another name for transaction_status."
            />
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTemplateOpen(false)}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !templateDirty || !editName.trim()}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-500 text-white cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {confirmDelete && createPortal(
        <div className="app-modal fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => { if (!isSaving) setConfirmDelete(null); }}>
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
          >
            <h3 id="confirm-delete-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {confirmDelete.kind === 'template'
                ? `Delete template "${confirmDelete.label}"?`
                : confirmDelete.kind === 'parameter'
                  ? `Delete parameter "${confirmDelete.label}"?`
                  : `Delete step "${confirmDelete.label}"?`}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {confirmDelete.kind === 'template'
                ? 'This removes the template, including its parameters and calculation steps.'
                : confirmDelete.kind === 'parameter'
                  ? 'This removes the parameter from the template.'
                  : 'This removes the calculation step from the template.'}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={isSaving} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void runDelete()} disabled={isSaving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white cursor-pointer disabled:opacity-50">{isSaving ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
