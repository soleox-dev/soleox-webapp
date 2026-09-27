'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { evaluateFormula, formulaValueToInput, type FormulaValue } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-evaluator';

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

export function CommissionTemplatePanel({
  clientId,
  transactionId,
  deal,
  agents,
}: {
  clientId: string;
  transactionId: string;
  deal: Record<string, unknown> | null;
  agents: AgentOption[];
}) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [committedTemplateId, setCommittedTemplateId] = useState('');
  const [draftTemplateId, setDraftTemplateId] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingParameters, setIsLoadingParameters] = useState(false);
  const [loadError, setLoadError] = useState('');

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
      } catch {
        if (!cancelled) setCommittedTemplateId('');
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
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) next[row.parameter.id] = row.raw;
    setValues(next);
  }, [rows]);

  const closePopup = () => {
    setPopupOpen(false);
    setDraftTemplateId('');
  };

  const selectedTemplate = templates.find((template) => template.id === draftTemplateId);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl space-y-3 text-xs transition-colors">
      <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
        Commission Template
      </span>
      <label className="block text-[11px] font-bold text-slate-500">
        Template
        <select
          value={popupOpen ? draftTemplateId : committedTemplateId}
          onChange={(event) => {
            const nextId = event.target.value;
            if (!nextId) return;
            setDraftTemplateId(nextId);
            setPopupOpen(true);
          }}
          disabled={isLoadingTemplates || templates.length === 0}
          className="mt-1 w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">{templates.length === 0 && !isLoadingTemplates ? 'No templates' : ''}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>{template.template_name}</option>
          ))}
        </select>
      </label>
      {loadError && !popupOpen && <p className="text-[11px] text-rose-600 dark:text-rose-400">{loadError}</p>}

      {popupOpen && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-2xl rounded-xl p-5 shadow-2xl space-y-3 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedTemplate?.template_name || 'Commission template'}</h3>
            {loadError && <p className="text-xs text-rose-600 dark:text-rose-400">{loadError}</p>}
            {isLoadingParameters ? (
              <p className="text-xs text-slate-500">Loading parameters...</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-slate-500">This template has no parameters.</p>
            ) : (
              <div className="space-y-1">
                {rows.map(({ parameter }) => (
                  <div key={parameter.id} className="flex items-center justify-between gap-4">
                    <label htmlFor={`template-parameter-${parameter.id}`} className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {parameter.parameter_name}
                    </label>
                    <input
                      id={`template-parameter-${parameter.id}`}
                      value={values[parameter.id] ?? ''}
                      onChange={(event) => setValues((current) => ({ ...current, [parameter.id]: event.target.value }))}
                      readOnly={parameter.is_user_editable === false}
                      className="w-56 shrink-0 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 read-only:opacity-80"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closePopup} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">Close</button>
              <button type="button" disabled title="Split calculations are not available yet." className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed">Submit</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
