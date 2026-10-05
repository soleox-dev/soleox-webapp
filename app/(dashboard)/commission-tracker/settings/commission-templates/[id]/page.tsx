'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormulaEditor, FormulaExplain, FormulaPreview, type FormulaName } from '../FormulaEditor';
import { LogicStepForm, canonicalLogicSection, logicSectionShowsAgent, logicSectionShowsEntity, logicContextNames, ledgerFormulaNames, ruleKeyFromName, type LogicStepDraft } from './LogicStepForm';
import { EditPencil } from '@/components/ui/edit-pencil';
import { ReorderControls } from '@/components/ui/reorder-controls';
import { normalizeFormula, validateFormula } from '../formula-validator';
import { ClearableSelect } from '@/components/ui/ClearableSelect';

type ParameterType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

interface CommissionTemplate {
  id: string;
  template_name: string;
  description?: string | null;
  client_id?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  archived?: boolean | null;
  created_by?: string | null;
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
  show_in_popup?: boolean | null;
  popup_section?: string | null;
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
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
const underlineControl =
  'w-full border-0 bg-transparent p-0 h-5 text-xs leading-4 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500';

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

function typeLabel(dataType?: string | null): string {
  return PARAMETER_TYPES.find((type) => type.value === canonicalParameterType(dataType))?.label || dataType || '—';
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

const emptyParameter = {
  parameter_name: '',
  data_type: 'CURRENCY' as ParameterType,
  is_required: false,
  is_user_editable: true,
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
  show_in_popup: false,
  popup_section: '',
};

export default function CommissionTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;

  const [template, setTemplate] = useState<CommissionTemplate | null>(null);
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [logicSteps, setLogicSteps] = useState<LogicStep[]>([]);
  const [entities, setEntities] = useState<CommissionEntity[]>([]);
  const [transactionFields, setTransactionFields] = useState<FormulaName[]>([]);
  const [agentFields, setAgentFields] = useState<FormulaName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [dropTarget, setDropTarget] = useState<null | { parameterId: string; placement: 'before' | 'after' } | { sectionName: string }>(null);
  const [logicDropTarget, setLogicDropTarget] = useState<null | { stepId: string; placement: 'before' | 'after' }>(null);
  const [parametersCollapsed, setParametersCollapsed] = useState(false);
  const [logicCollapsed, setLogicCollapsed] = useState(false);
  const [parameterSearch, setParameterSearch] = useState('');
  const [logicSearch, setLogicSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [parameterForm, setParameterForm] = useState<typeof emptyParameter | null>(null);
  const [editingParameterId, setEditingParameterId] = useState<string | null>(null);
  const [logicForm, setLogicForm] = useState<LogicStepDraft | null>(null);
  const [editingLogicId, setEditingLogicId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { kind: 'template' | 'parameter' | 'logic'; id?: string; label: string }>(null);
  const [editTemplateOpen, setEditTemplateOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [sectionMenuBox, setSectionMenuBox] = useState({ top: 0, left: 0, width: 0 });
  const sectionFieldRef = useRef<HTMLDivElement>(null);
  const [newDropdownOption, setNewDropdownOption] = useState('');
  const [renamingOption, setRenamingOption] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const loadTemplate = async () => {
    if (!templateId) return;
    setIsLoading(true);
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
        throw new Error(logicData.error || 'Failed to load template logic.');
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplate();
  }, [templateId]);

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

  const saveParameter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!parameterForm || !templateId || isSaving) return;
    const normalizedFormula = normalizeFormula(parameterForm.autofill_formula).text;
    if (normalizedFormula !== parameterForm.autofill_formula) {
      setParameterForm({ ...parameterForm, autofill_formula: normalizedFormula });
    }
    const formulaIssue = validateFormula(normalizedFormula, formulaNames.map((item) => item.name));
    if (formulaIssue) {
      setFormError(formulaIssue);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const existing = parameters.find((parameter) => parameter.id === editingParameterId);
      const response = await fetch('/api/commission-template-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter: {
            id: editingParameterId,
            template_id: templateId,
            client_id: 'DEMO',
            parameter_name: parameterForm.parameter_name.trim(),
            parameter_key: existing?.parameter_key || parameterKeyFromName(parameterForm.parameter_name),
            data_type: parameterForm.data_type,
            is_required: parameterForm.is_required,
            is_user_editable: parameterForm.is_user_editable,
            autofill_formula: normalizedFormula.trim() || null,
            validation_rule: parameterForm.validation_rule.trim() || null,
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
      await loadTemplate();
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
      await loadTemplate();
    } finally {
      setIsReordering(false);
    }
  };

  const moveParameter = async (parameterId: string, direction: 'UP' | 'DOWN') => {
    if (isReordering) return;
    const groups = parameterGroups(parameters);
    const groupIndex = groups.findIndex((group) => group.items.some((item) => item.id === parameterId));
    if (groupIndex < 0) return;
    const items = groups[groupIndex].items;
    const index = items.findIndex((item) => item.id === parameterId);
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const reorderedItems = [...items];
    const [moved] = reorderedItems.splice(index, 1);
    reorderedItems.splice(targetIndex, 0, moved);
    const flat = groups.flatMap((group, i) => (i === groupIndex ? reorderedItems : group.items));
    await commitParameterLayout(flat.map((item, i) => ({ ...item, sort_order: i + 1 })));
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
          show_in_popup: Boolean(step.show_in_popup),
          popup_section: step.popup_section || null,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the rule order.');
  };

  const commitLogicOrder = async (updated: LogicStep[]) => {
    const previous = new Map(logicSteps.map((step) => [step.id, step.step_number]));
    const changed = updated.filter((step) => previous.get(step.id) !== step.step_number);
    setLogicSteps(updated);
    if (changed.length === 0) return;
    setIsReordering(true);
    setError(null);
    try {
      await Promise.all(changed.map((step) => persistLogicStep(step)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the rule order.');
      await loadTemplate();
    } finally {
      setIsReordering(false);
    }
  };

  const moveLogic = async (stepId: string, direction: 'UP' | 'DOWN') => {
    if (isReordering) return;
    const ordered = [...logicSteps].sort((a, b) => a.step_number - b.step_number);
    const index = ordered.findIndex((step) => step.id === stepId);
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    await commitLogicOrder(next.map((step, itemIndex) => ({ ...step, step_number: itemIndex + 1 })));
  };

  const dropLogic = async (sourceId: string, target: { stepId: string; placement: 'before' | 'after' }) => {
    if (isReordering || target.stepId === sourceId) return;
    const ordered = [...logicSteps].sort((a, b) => a.step_number - b.step_number);
    const sourceIndex = ordered.findIndex((step) => step.id === sourceId);
    if (sourceIndex < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(sourceIndex, 1);
    const targetIndex = next.findIndex((step) => step.id === target.stepId);
    if (targetIndex < 0 || !moved) return;
    next.splice(target.placement === 'before' ? targetIndex : targetIndex + 1, 0, moved);
    setLogicDropTarget(null);
    await commitLogicOrder(next.map((step, itemIndex) => ({ ...step, step_number: itemIndex + 1 })));
  };

  const saveLogic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!logicForm || !templateId || isSaving) return;
    const otherRuleKeys = logicSteps
      .filter((step) => step.id !== editingLogicId && step.rule_key?.trim())
      .map((step) => step.rule_key!.trim());
    const allowedNames = [...formulaNames.map((item) => item.name), ...logicContextNames.map((item) => item.name), ...ledgerFormulaNames.map((item) => item.name), ...otherRuleKeys];
    const selectedSection = canonicalLogicSection(logicForm.section);
    const entityFormula = logicSectionShowsEntity(selectedSection) && logicForm.entity_mode === 'formula';
    const formulas = [
      ...(selectedSection === 'Calculation' ? [] : [['Condition', logicForm.apply_condition] as const]),
      ['Custom baseline', logicForm.custom_baseline],
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
      const response = await fetch('/api/commission-template-logic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logic: {
            id: editingLogicId,
            template_id: templateId,
            client_id: 'DEMO',
            step_number: existing?.step_number ?? logicSteps.length + 1,
            rule_name: logicForm.rule_name.trim(),
            rule_key: ruleKey,
            section: section || null,
            apply_condition: postsSplit ? normalizeFormula(logicForm.apply_condition).text.trim() || null : null,
            agent_key: postsSplit && logicSectionShowsAgent(section) ? logicForm.agent_key.trim() || null : null,
            payee_entity_id: postsSplit && logicSectionShowsEntity(section) && logicForm.entity_mode === 'fixed' ? logicForm.payee_entity_id || null : null,
            payee_formula: postsSplit && logicSectionShowsEntity(section) && logicForm.entity_mode === 'formula'
              ? normalizeFormula(logicForm.payee_formula).text.trim() || null
              : null,
            custom_baseline: normalizeFormula(logicForm.custom_baseline).text.trim() || null,
            calculation_formula: normalizeFormula(logicForm.calculation_formula).text.trim() || null,
            split_type: postsSplit ? (logicForm.split_type === 'PERCENT' ? 'PERCENT' : 'AMOUNT') : null,
            show_in_popup: !postsSplit && logicForm.show_in_popup,
            popup_section: !postsSplit && logicForm.show_in_popup ? logicForm.popup_section.trim() || null : null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the logic step.');
      setLogicForm(null);
      setEditingLogicId(null);
      await loadTemplate();
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
      await loadTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditParameter = (parameter: TemplateParameter) => {
    setFormError(null);
    setEditingParameterId(parameter.id);
    setParameterForm({
      parameter_name: parameter.parameter_name,
      data_type: canonicalParameterType(parameter.data_type),
      is_required: Boolean(parameter.is_required),
      is_user_editable: parameter.is_user_editable !== false,
      autofill_formula: parameter.autofill_formula || '',
      validation_rule: parameter.validation_rule || '',
      notes: parameter.notes || '',
      section: parameter.section || '',
      dropdown_options: Array.isArray(parameter.dropdown_options) ? parameter.dropdown_options : [],
    });
    setNewDropdownOption('');
    setRenamingOption(null);
  };

  const openEditLogic = (step: LogicStep) => {
    setFormError(null);
    setEditingLogicId(step.id);
    const storedFormula = step.payee_formula?.trim() || '';
    const legacyAgentKey = !step.agent_key?.trim() && /^[A-Za-z_][A-Za-z0-9_]*$/.test(storedFormula) ? storedFormula : '';
    const entityFormula = storedFormula && storedFormula !== legacyAgentKey ? storedFormula : '';
    const takenKeys = new Set(
      [...formulaNames.map((item) => item.name), ...logicContextNames.map((item) => item.name), 'total_commission',
        ...logicSteps.filter((item) => item.id !== step.id && item.rule_key?.trim()).map((item) => item.rule_key!.trim())]
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
    setLogicForm({
      rule_name: step.rule_name,
      rule_key: step.rule_key?.trim() || freeRuleKey(step.rule_name),
      section: canonicalLogicSection(step.section || ''),
      apply_condition: step.apply_condition || '',
      agent_key: step.agent_key?.trim() || legacyAgentKey,
      entity_mode: entityFormula && !step.payee_entity_id ? 'formula' : 'fixed',
      payee_entity_id: step.payee_entity_id || '',
      payee_formula: entityFormula,
      custom_baseline: step.custom_baseline || '',
      calculation_formula: step.calculation_formula || '',
      split_type: String(step.split_type || '').trim().toUpperCase() === 'PERCENT' ? 'PERCENT' : 'AMOUNT',
      show_in_popup: Boolean(step.show_in_popup),
      popup_section: step.popup_section || '',
    });
  };

  const openEditTemplate = () => {
    if (!template) return;
    setEditName(template.template_name);
    setEditDescription(template.description || '');
    setError(null);
    setEditTemplateOpen(true);
  };

  const handleSaveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!template || !editName.trim() || isSaving) return;
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
      });
      setEditTemplateOpen(false);
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

  const filteredLogicSteps = useMemo(() => {
    const query = logicSearch.trim().toLowerCase();
    if (!query) return logicSteps;
    return logicSteps.filter((step) => {
      const section = (canonicalLogicSection(step.section || '') || step.section || '').toLowerCase();
      const entity = entityName(step.payee_entity_id).toLowerCase();
      const splitType = String(step.split_type || '').toLowerCase();
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
        (step.custom_baseline || '').toLowerCase().includes(query) ||
        (step.calculation_formula || '').toLowerCase().includes(query) ||
        splitType.includes(query) ||
        stepNum === query ||
        `#${stepNum}` === query ||
        (step.popup_section || '').toLowerCase().includes(query) ||
        isPopup.includes(query)
      );
    });
  }, [logicSteps, logicSearch, entities]);

  const parameterFields: FormulaName[] = parameters
    .filter((parameter) => parameter.id !== editingParameterId)
    .map((parameter) => ({
      name: parameter.parameter_key,
      label: parameter.parameter_name,
      kind: 'parameter' as const,
    }));

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
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md">
        <div className="grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
          <Link href="/commission-tracker/settings/commission-templates" className="col-start-1 row-start-1 self-start text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
            ← All templates
          </Link>
          {isLoading ? (
            <p className="col-start-1 row-start-2 text-xs text-slate-500">Loading template...</p>
          ) : template ? (
            <h2 className="col-start-1 row-start-2 text-sm font-bold leading-5 text-slate-900 dark:text-white uppercase tracking-wider">
              {template.template_name}
            </h2>
          ) : null}
          {template?.description && (
            <p className="col-start-1 row-start-3 self-end text-[11px] leading-4 text-slate-500 dark:text-slate-400">{template.description}</p>
          )}
          {template && (
            <div className="col-start-2 row-start-1 row-span-3 self-center flex items-center gap-1">
              <button
                type="button"
                onClick={openEditTemplate}
                className={`${rowActionClass} text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700`}
                title="Edit template"
                aria-label="Edit template"
              >
                <EditPencil className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete({ kind: 'template', label: template.template_name })}
                className={`${rowActionClass} text-[18px] leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`}
                title="Delete template"
                aria-label="Delete template"
              >
                🗑️
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {!isLoading && template && (
        <>
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden">
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Parameters
                    {parameterSearch.trim() && (
                      <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 normal-case ml-1.5">
                        ({filteredParameters.length} of {parameters.length})
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Values the user fills in when this template is applied to a transaction.
                  </p>
                </span>
              </button>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <div className="relative w-full sm:w-64">
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
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  {parameterSearch && (
                    <button
                      type="button"
                      onClick={() => setParameterSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setEditingParameterId(null);
                    setParameterForm({ ...emptyParameter });
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Add parameter
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
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-xs [&_th]:border-b [&_td]:border-b [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-700 dark:[&_td]:border-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Parameter</th>
                      <th className="px-4 py-3">Key</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Required</th>
                      <th className="px-4 py-3">Formula</th>
                      <th className="px-4 py-3">Validation</th>
                      <th className="sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {parameterGroups(filteredParameters).map((group) => {
                      const isUnsectioned = group.name === 'No Section';
                      return (
                      <React.Fragment key={group.name}>
                        <tr
                          onDragOver={(event) => {
                            if (parameterSearch.trim()) return;
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
                          <td colSpan={8} className={`px-4 py-2 ${dropTarget && 'sectionName' in dropTarget && dropTarget.sectionName === group.name ? (isUnsectioned ? 'bg-amber-500/20' : 'bg-emerald-500/15') : 'bg-slate-50 dark:bg-slate-900/60'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${isUnsectioned ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${isUnsectioned ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                Section: {group.name}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold ml-auto">
                                {group.items.length} {group.items.length === 1 ? 'Parameter' : 'Parameters'}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {group.items.map((parameter, itemIndex) => (
                      <tr
                        key={parameter.id}
                        className={`align-top ${dropTarget && 'parameterId' in dropTarget && dropTarget.parameterId === parameter.id ? (dropTarget.placement === 'before' ? '[&>td]:shadow-[inset_0_2px_0_0_#10b981]' : '[&>td]:shadow-[inset_0_-2px_0_0_#10b981]') : ''}`}
                        onDragOver={(event) => {
                          if (parameterSearch.trim()) return;
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
                        <td className="px-4 py-3 font-mono text-slate-500">{parameter.sort_order ?? '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{parameter.parameter_name}</p>
                          {parameter.is_user_editable === false && (
                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-1">Read-only on the transaction</p>
                          )}
                          {parameter.notes && <p className="text-[11px] text-slate-500 mt-1">{parameter.notes}</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-300 whitespace-nowrap">{parameter.parameter_key}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{typeLabel(parameter.data_type)}</td>
                        <td className="px-4 py-3">{parameter.is_required ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3 min-w-[18rem]">
                          <div className="flex items-start gap-2">
                            <FormulaExplain value={parameter.autofill_formula || ''} names={formulaNames} />
                            <FormulaPreview value={parameter.autofill_formula || ''} names={formulaNames} />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {parameter.validation_rule || '—'}
                        </td>
                        <td className="sticky right-0 z-10 bg-white dark:bg-slate-800 px-4 py-3 whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]">
                          <div className="inline-flex items-center justify-end gap-1">
                            <span
                              draggable={!isReordering && !parameterSearch.trim()}
                              onDragStart={(event) => {
                                if (parameterSearch.trim()) return;
                                event.dataTransfer.setData('text/plain', parameter.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setDropTarget(null)}
                              className={`${parameterSearch.trim() ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'} text-sm px-0.5 select-none`}
                              title={parameterSearch.trim() ? 'Clear search to reorder' : 'Drag to reorder or move to a section'}
                            >
                              ⠿
                            </span>
                            <ReorderControls
                              size="sm"
                              orientation="vertical"
                              onMoveUp={() => void moveParameter(parameter.id, 'UP')}
                              onMoveDown={() => void moveParameter(parameter.id, 'DOWN')}
                              isFirst={itemIndex === 0 || isReordering || Boolean(parameterSearch.trim())}
                              isLast={itemIndex === group.items.length - 1 || isReordering || Boolean(parameterSearch.trim())}
                            />
                            <button type="button" onClick={() => openEditParameter(parameter)} className={`${rowActionClass} text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Edit" aria-label="Edit">
                              <EditPencil className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" onClick={() => setConfirmDelete({ kind: 'parameter', id: parameter.id, label: parameter.parameter_name })} className={`${rowActionClass} text-[18px] leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`} title="Delete" aria-label="Delete">🗑️</button>
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

          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden">
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Logic
                    {logicSearch.trim() && (
                      <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 normal-case ml-1.5">
                        ({filteredLogicSteps.length} of {logicSteps.length})
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Each rule decides when it applies, who gets paid, and how the amount is calculated.
                  </p>
                </span>
              </button>
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <div className="relative w-full sm:w-64">
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
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  {logicSearch && (
                    <button
                      type="button"
                      onClick={() => setLogicSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      title="Clear search"
                      aria-label="Clear search"
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
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Add step
                </button>
              </div>
            </div>
            {logicCollapsed ? null : logicSteps.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">No calculation steps yet.</p>
            ) : filteredLogicSteps.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No rules matching &ldquo;{logicSearch}&rdquo;.
                <button
                  type="button"
                  onClick={() => setLogicSearch('')}
                  className="ml-2 font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-xs [&_th]:border-b [&_td]:border-b [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-700 dark:[&_td]:border-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Custom baseline</th>
                      <th className="px-4 py-3">Formula</th>
                      <th className="px-4 py-3">Split type</th>
                      <th className="sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {[...filteredLogicSteps].sort((a, b) => a.step_number - b.step_number).map((step, stepIndex, orderedSteps) => (
                      <tr
                        key={step.id}
                        className={`align-top ${logicDropTarget?.stepId === step.id ? (logicDropTarget.placement === 'before' ? '[&>td]:shadow-[inset_0_2px_0_0_#10b981]' : '[&>td]:shadow-[inset_0_-2px_0_0_#10b981]') : ''}`}
                        onDragOver={(event) => {
                          if (logicSearch.trim()) return;
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
                          if (sourceId) void dropLogic(sourceId, { stepId: step.id, placement });
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-slate-500">{step.step_number}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{step.rule_name}</div>
                          {step.rule_key?.trim() && <div className="mt-0.5 font-mono text-[11px] text-sky-700 dark:text-sky-300">{step.rule_key}</div>}
                          {step.show_in_popup && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Shown when applying{step.popup_section?.trim() ? ` · ${step.popup_section.trim()}` : ''}</div>}
                        </td>
                        <td className="px-4 py-3 min-w-[12rem] text-slate-600 dark:text-slate-300">
                          {canonicalLogicSection(step.section || '') === 'Calculation' ? '—' : step.apply_condition?.trim() ? (
                            <div className="flex items-start gap-2">
                              <FormulaExplain value={step.apply_condition} names={logicFormulaNames} />
                              <FormulaPreview value={step.apply_condition} names={logicFormulaNames} />
                            </div>
                          ) : 'Always'}
                        </td>
                        <td className="px-4 py-3">{canonicalLogicSection(step.section || '') || step.section?.trim() || '—'}</td>
                        <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-300">
                          {logicSectionShowsAgent(canonicalLogicSection(step.section || '')) ? (step.agent_key?.trim() || '—') : '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[12rem] text-slate-600 dark:text-slate-300">
                          {logicSectionShowsEntity(canonicalLogicSection(step.section || '')) && step.payee_entity_id
                            ? entityName(step.payee_entity_id)
                            : logicSectionShowsEntity(canonicalLogicSection(step.section || '')) && step.payee_formula?.trim()
                              ? (
                                <div className="flex items-start gap-2">
                                  <FormulaExplain value={step.payee_formula} names={logicFormulaNames} />
                                  <FormulaPreview value={step.payee_formula} names={logicFormulaNames} />
                                </div>
                              )
                              : '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[12rem] text-slate-600 dark:text-slate-300">
                          {step.custom_baseline?.trim() ? (
                            <div className="flex items-start gap-2">
                              <FormulaExplain value={step.custom_baseline} names={logicFormulaNames} />
                              <FormulaPreview value={step.custom_baseline} names={logicFormulaNames} />
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[16rem] leading-relaxed text-slate-600 dark:text-slate-300">
                          <div className="flex items-start gap-2">
                            <FormulaExplain value={step.calculation_formula || ''} names={logicFormulaNames} />
                            <FormulaPreview value={step.calculation_formula || ''} names={logicFormulaNames} />
                          </div>
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
                                event.dataTransfer.setData('text/plain', step.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setLogicDropTarget(null)}
                              className={`${logicSearch.trim() ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'} text-sm px-0.5 select-none`}
                              title={logicSearch.trim() ? 'Clear search to reorder' : 'Drag to reorder'}
                            >
                              ⠿
                            </span>
                            <ReorderControls
                              size="sm"
                              orientation="vertical"
                              onMoveUp={() => void moveLogic(step.id, 'UP')}
                              onMoveDown={() => void moveLogic(step.id, 'DOWN')}
                              isFirst={stepIndex === 0 || isReordering || Boolean(logicSearch.trim())}
                              isLast={stepIndex === orderedSteps.length - 1 || isReordering || Boolean(logicSearch.trim())}
                            />
                            <button type="button" onClick={() => openEditLogic(step)} className={`${rowActionClass} text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700`} title="Edit" aria-label="Edit">
                              <EditPencil className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" onClick={() => setConfirmDelete({ kind: 'logic', id: step.id, label: step.rule_name })} className={`${rowActionClass} text-[18px] leading-none text-rose-500 hover:text-rose-600 hover:bg-rose-500/10`} title="Delete" aria-label="Delete">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {parameterForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <form onSubmit={saveParameter} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="shrink-0 px-6 pt-6 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingParameterId ? 'Edit parameter' : 'Add parameter'}</h3>
              {formError && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
            <label className={underlineShell}>
              <span className={underlineLabel}>Name</span>
              <input required value={parameterForm.parameter_name} onChange={(event) => setParameterForm({ ...parameterForm, parameter_name: event.target.value })} className={underlineControl} />
            </label>
            <div ref={sectionFieldRef} className={underlineShell}>
              <label className={underlineLabel}>Section</label>
              <input
                value={parameterForm.section}
                onChange={(event) => setParameterForm({ ...parameterForm, section: event.target.value })}
                onFocus={() => openSectionMenu()}
                onClick={() => openSectionMenu()}
                onBlur={() => setSectionMenuOpen(false)}
                placeholder="Example: Off the top"
                className={`${underlineControl} pr-4`}
              />
              <FieldChevron />
            </div>
            <label className={underlineShell}>
              <span className={underlineLabel}>Key</span>
              <input
                readOnly
                tabIndex={-1}
                value={(parameters.find((parameter) => parameter.id === editingParameterId)?.parameter_key) || parameterKeyFromName(parameterForm.parameter_name)}
                className={`${underlineControl} cursor-default font-mono !text-sky-700 dark:!text-sky-300`}
              />
            </label>
            <label className={underlineShell}>
              <span className={underlineLabel}>Type</span>
              <ClearableSelect value={parameterForm.data_type} onChange={(event) => setParameterForm({ ...parameterForm, data_type: event.target.value as ParameterType })} className={`${underlineControl} overview-field-select cursor-pointer`}>
                {PARAMETER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </ClearableSelect>
              <FieldChevron />
            </label>
            {parameterForm.data_type === 'SELECT' && (
              <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold text-xs">
                    Dropdown Select Options ({parameterForm.dropdown_options.length})
                  </label>
                  {parameterForm.dropdown_options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setParameterForm({
                        ...parameterForm,
                        dropdown_options: [...parameterForm.dropdown_options].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
                      })}
                      className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold text-[10px] border border-slate-300 dark:border-slate-600 transition cursor-pointer"
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
                    className="px-3 py-2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 rounded-lg font-bold hover:bg-emerald-500/30 transition cursor-pointer"
                  >
                    + Add Option
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {parameterForm.dropdown_options.map((option, index) => (
                    <div key={`${option}-${index}`} className="flex justify-between items-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition">
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
                        <span className="font-medium truncate mr-2" title={option}>{option}</span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingOption(option);
                            setRenameDraft(option);
                          }}
                          className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                          title={`Rename "${option}"`}
                        >
                          <EditPencil />
                        </button>
                        <ReorderControls
                          size="sm"
                          onMoveUp={() => {
                            if (index === 0) return;
                            const next = [...parameterForm.dropdown_options];
                            const [item] = next.splice(index, 1);
                            next.splice(index - 1, 0, item);
                            setParameterForm({ ...parameterForm, dropdown_options: next });
                          }}
                          onMoveDown={() => {
                            if (index === parameterForm.dropdown_options.length - 1) return;
                            const next = [...parameterForm.dropdown_options];
                            const [item] = next.splice(index, 1);
                            next.splice(index + 1, 0, item);
                            setParameterForm({ ...parameterForm, dropdown_options: next });
                          }}
                          isFirst={index === 0}
                          isLast={index === parameterForm.dropdown_options.length - 1}
                        />
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
            )}
            <div>
              <FormulaEditor
                value={parameterForm.autofill_formula}
                onChange={(formula) => setParameterForm({ ...parameterForm, autofill_formula: formula })}
                names={formulaNames}
                fieldGroups={fieldGroups}
              />
            </div>
            <label className={underlineShell}>
              <span className={underlineLabel}>Validation</span>
              <input value={parameterForm.validation_rule} onChange={(event) => setParameterForm({ ...parameterForm, validation_rule: event.target.value })} className={underlineControl} placeholder="Example: 0–100%" />
            </label>
            <label className={underlineShell}>
              <span className={underlineLabel}>Notes</span>
              <input value={parameterForm.notes} onChange={(event) => setParameterForm({ ...parameterForm, notes: event.target.value })} className={underlineControl} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={parameterForm.is_required} onChange={(event) => setParameterForm({ ...parameterForm, is_required: event.target.checked })} />
              Required before the template can be submitted
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={parameterForm.is_user_editable} onChange={(event) => setParameterForm({ ...parameterForm, is_user_editable: event.target.checked })} />
              User can change this value on the transaction
            </label>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button type="button" onClick={() => { setParameterForm(null); setEditingParameterId(null); setFormError(null); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{isSaving ? 'Saving...' : 'Save parameter'}</button>
            </div>
          </form>
          {sectionMenuOpen && sectionOptions.length > 0 && createPortal(
            <ul
              className="fixed z-[90] max-h-60 overflow-y-auto rounded-lg border border-black/10 bg-white/95 py-1 text-[13px] text-slate-900 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#3a3a3c]/95 dark:text-white"
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
        />
      )}

      {editTemplateOpen && template && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => { if (!isSaving) setEditTemplateOpen(false); }}>
          <form
            onSubmit={(event) => void handleSaveTemplate(event)}
            onClick={(event) => event.stopPropagation()}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-template-title"
          >
            <h3 id="edit-template-title" className="text-lg font-bold text-slate-900 dark:text-white">Edit Commission Template</h3>
            <label className={underlineShell}>
              <span className={underlineLabel}>Template name</span>
              <input
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className={`${underlineControl} h-5`}
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
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => { if (!isSaving) setConfirmDelete(null); }}>
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
          >
            <h3 id="confirm-delete-title" className="text-base font-bold text-slate-900 dark:text-white">
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
