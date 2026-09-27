'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormulaEditor, FormulaExplain, FormulaPreview, type FormulaName } from '../FormulaEditor';
import { normalizeFormula, validateFormula } from '../formula-validator';

type ParameterType = 'CURRENCY' | 'PERCENT' | 'AGENT' | 'YES_NO' | 'TEXT';

interface CommissionTemplate {
  id: string;
  template_name: string;
  description?: string | null;
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
}

interface LogicStep {
  id: string;
  step_number: number;
  rule_name: string;
  section?: string | null;
  payee_type?: string | null;
  payee_entity_id?: string | null;
  calculation_formula?: string | null;
}

interface CommissionEntity {
  id: string;
  entity_name: string;
}

const PARAMETER_TYPES: { value: ParameterType; label: string }[] = [
  { value: 'CURRENCY', label: 'Currency' },
  { value: 'PERCENT', label: 'Percent' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'TEXT', label: 'Text' },
];

const PAYEE_TYPES = ['AGENT', 'ENTITY', 'BROKERAGE'];

const inputClass =
  'w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500';

function typeLabel(dataType?: string | null): string {
  return PARAMETER_TYPES.find((type) => type.value === dataType)?.label || dataType || '—';
}

function parameterKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key || 'parameter';
}

const emptyParameter = {
  parameter_name: '',
  data_type: 'CURRENCY' as ParameterType,
  is_required: false,
  is_user_editable: true,
  autofill_formula: '',
  validation_rule: '',
  notes: '',
};

const emptyLogic = {
  rule_name: '',
  section: '',
  payee_type: 'ENTITY',
  payee_entity_id: '',
  calculation_formula: '',
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
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [parameterForm, setParameterForm] = useState<typeof emptyParameter | null>(null);
  const [editingParameterId, setEditingParameterId] = useState<string | null>(null);
  const [logicForm, setLogicForm] = useState<typeof emptyLogic | null>(null);
  const [editingLogicId, setEditingLogicId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { kind: 'template' | 'parameter' | 'logic'; id?: string; label: string }>(null);

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

  const saveLogic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!logicForm || !templateId || isSaving) return;
    setIsSaving(true);
    setError(null);
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
            section: logicForm.section.trim() || null,
            payee_type: logicForm.payee_type,
            payee_entity_id: logicForm.payee_entity_id || null,
            calculation_formula: logicForm.calculation_formula.trim() || null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the logic step.');
      setLogicForm(null);
      setEditingLogicId(null);
      await loadTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the logic step.');
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
      data_type: (parameter.data_type as ParameterType) || 'CURRENCY',
      is_required: Boolean(parameter.is_required),
      is_user_editable: parameter.is_user_editable !== false,
      autofill_formula: parameter.autofill_formula || '',
      validation_rule: parameter.validation_rule || '',
      notes: parameter.notes || '',
    });
  };

  const openEditLogic = (step: LogicStep) => {
    setEditingLogicId(step.id);
    setLogicForm({
      rule_name: step.rule_name,
      section: step.section || '',
      payee_type: step.payee_type || 'ENTITY',
      payee_entity_id: step.payee_entity_id || '',
      calculation_formula: step.calculation_formula || '',
    });
  };

  const entityName = (id?: string | null) => entities.find((entity) => entity.id === id)?.entity_name || '—';

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

  const fieldGroups = [
    { id: 'transactions', title: 'Transactions', fields: transactionFields },
    { id: 'agents', title: 'Agents', fields: agentFields },
    { id: 'parameters', title: 'Template Parameters', fields: parameterFields },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/commission-tracker/settings/commission-templates" className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
              ← All templates
            </Link>
            {isLoading ? (
              <p className="mt-3 text-xs text-slate-500">Loading template...</p>
            ) : template ? (
              <h2 className="mt-3 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {template.template_name}
              </h2>
            ) : null}
            {template?.description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{template.description}</p>
            )}
          </div>
          {template && (
            <button
              type="button"
              onClick={() => setConfirmDelete({ kind: 'template', label: template.template_name })}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 cursor-pointer"
            >
              Delete template
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {!isLoading && template && (
        <>
          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">Parameters</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Values the user fills in when this template is applied to a transaction.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setEditingParameterId(null);
                  setParameterForm({ ...emptyParameter });
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
              >
                Add parameter
              </button>
            </div>
            {parameters.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">No parameters yet.</p>
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
                    {parameters.map((parameter) => (
                      <tr key={parameter.id} className="align-top">
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
                          <button type="button" onClick={() => openEditParameter(parameter)} className="text-xs p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition" title="Edit" aria-label="Edit">
                            <span className="inline-block -scale-x-100">✏️</span>
                          </button>
                          <button type="button" onClick={() => setConfirmDelete({ kind: 'parameter', id: parameter.id, label: parameter.parameter_name })} className="text-xs text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition ml-1" title="Delete" aria-label="Delete">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">Logic</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Steps that calculate splits from the submitted parameter values. A specific payee must be an entity in this client’s settings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLogicId(null);
                  setLogicForm({ ...emptyLogic });
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
              >
                Add step
              </button>
            </div>
            {logicSteps.length === 0 ? (
              <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">No calculation steps yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-left text-xs [&_th]:border-b [&_td]:border-b [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-700 dark:[&_td]:border-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Payee</th>
                      <th className="px-4 py-3">Formula</th>
                      <th className="sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {logicSteps.map((step) => (
                      <tr key={step.id} className="align-top">
                        <td className="px-4 py-3 font-mono text-slate-500">{step.step_number}</td>
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{step.rule_name}</td>
                        <td className="px-4 py-3">{step.section || '—'}</td>
                        <td className="px-4 py-3">
                          <p>{step.payee_type || '—'}</p>
                          {step.payee_entity_id && <p className="text-[11px] text-slate-500 mt-1">{entityName(step.payee_entity_id)}</p>}
                        </td>
                        <td className="px-4 py-3 min-w-[16rem] leading-relaxed text-slate-600 dark:text-slate-300">
                          <div className="flex items-start gap-2">
                            <FormulaExplain value={step.calculation_formula || ''} names={formulaNames} />
                            <FormulaPreview value={step.calculation_formula || ''} names={formulaNames} />
                          </div>
                        </td>
                        <td className="sticky right-0 z-10 bg-white dark:bg-slate-800 px-4 py-3 whitespace-nowrap text-right border-l border-slate-200 dark:border-slate-700 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.7)]">
                          <button type="button" onClick={() => openEditLogic(step)} className="text-xs p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition" title="Edit" aria-label="Edit">
                            <span className="inline-block -scale-x-100">✏️</span>
                          </button>
                          <button type="button" onClick={() => setConfirmDelete({ kind: 'logic', id: step.id, label: step.rule_name })} className="text-xs text-rose-500 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer transition ml-1" title="Delete" aria-label="Delete">🗑️</button>
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
          <form onSubmit={saveParameter} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-2xl rounded-xl p-6 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingParameterId ? 'Edit parameter' : 'Add parameter'}</h3>
            {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
            <label className="block text-[11px] font-bold text-slate-500">Name
              <input required value={parameterForm.parameter_name} onChange={(event) => setParameterForm({ ...parameterForm, parameter_name: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[11px] font-bold text-slate-500">Key
              <input
                readOnly
                value={(parameters.find((parameter) => parameter.id === editingParameterId)?.parameter_key) || parameterKeyFromName(parameterForm.parameter_name)}
                className={`${inputClass} mt-1 font-mono text-sky-700 dark:text-sky-300`}
              />
            </label>
            <label className="block text-[11px] font-bold text-slate-500">Type
              <select value={parameterForm.data_type} onChange={(event) => setParameterForm({ ...parameterForm, data_type: event.target.value as ParameterType })} className={`${inputClass} mt-1`}>
                {PARAMETER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <div className="block text-[11px] font-bold text-slate-500">
              Formula
              <FormulaEditor
                value={parameterForm.autofill_formula}
                onChange={(formula) => setParameterForm({ ...parameterForm, autofill_formula: formula })}
                names={formulaNames}
                fieldGroups={fieldGroups}
              />
            </div>
            <label className="block text-[11px] font-bold text-slate-500">Validation
              <input value={parameterForm.validation_rule} onChange={(event) => setParameterForm({ ...parameterForm, validation_rule: event.target.value })} className={`${inputClass} mt-1`} placeholder="Example: 0–100%" />
            </label>
            <label className="block text-[11px] font-bold text-slate-500">Notes
              <input value={parameterForm.notes} onChange={(event) => setParameterForm({ ...parameterForm, notes: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={parameterForm.is_required} onChange={(event) => setParameterForm({ ...parameterForm, is_required: event.target.checked })} />
              Required before the template can be submitted
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={parameterForm.is_user_editable} onChange={(event) => setParameterForm({ ...parameterForm, is_user_editable: event.target.checked })} />
              User can change this value on the transaction
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setParameterForm(null); setEditingParameterId(null); setFormError(null); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{isSaving ? 'Saving...' : 'Save parameter'}</button>
            </div>
          </form>
        </div>
      )}

      {logicForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <form onSubmit={saveLogic} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingLogicId ? 'Edit step' : 'Add step'}</h3>
            <label className="block text-[11px] font-bold text-slate-500">Rule name
              <input required value={logicForm.rule_name} onChange={(event) => setLogicForm({ ...logicForm, rule_name: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-[11px] font-bold text-slate-500">Section
              <input value={logicForm.section} onChange={(event) => setLogicForm({ ...logicForm, section: event.target.value })} className={`${inputClass} mt-1`} placeholder="Example: Off the top" />
            </label>
            <label className="block text-[11px] font-bold text-slate-500">Payee type
              <select value={logicForm.payee_type} onChange={(event) => setLogicForm({ ...logicForm, payee_type: event.target.value, payee_entity_id: '' })} className={`${inputClass} mt-1`}>
                {PAYEE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {logicForm.payee_type !== 'AGENT' && (
              <label className="block text-[11px] font-bold text-slate-500">Entity
                <select value={logicForm.payee_entity_id} onChange={(event) => setLogicForm({ ...logicForm, payee_entity_id: event.target.value })} className={`${inputClass} mt-1`}>
                  <option value="">No specific entity</option>
                  {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entity_name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-[11px] font-bold text-slate-500">Formula
              <textarea required rows={4} value={logicForm.calculation_formula} onChange={(event) => setLogicForm({ ...logicForm, calculation_formula: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setLogicForm(null); setEditingLogicId(null); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 cursor-pointer disabled:opacity-50">{isSaving ? 'Saving...' : 'Save step'}</button>
            </div>
          </form>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete {confirmDelete.label}?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">This removes it from the template.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Cancel</button>
              <button type="button" onClick={() => void runDelete()} disabled={isSaving} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white cursor-pointer disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
