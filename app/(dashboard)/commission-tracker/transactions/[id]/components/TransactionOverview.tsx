import React from 'react';
import {
  FieldSetting,
  formatPercentageClean,
  formatPercent,
  VisibilityCondition,
  KnownAgentInfo,
} from '../types';

import {
  DecimalInput,
} from './DecimalInput';
import { normalizeAgentName } from '@/lib/id';

interface TransactionOverviewProps {
  isCollapsed: boolean;
  onToggleSection: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onApplyEdit: () => void;
  groupedSections: Record<string, FieldSetting[]>;
  overviewFormValues: Record<string, any>;
  selectedDeal: any;
  knownAgents?: KnownAgentInfo[];
  gciType: string;
  dealId: string;
  gciPerc: number;
  grossCommission: number;
  totalCommission: number;
  handleOverviewInputChange: (key: string, val: any) => void;
  preventMinus: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  validateFieldValue: (field: FieldSetting, val: any) => { isValid: boolean; isLegacyUnmatched: boolean; isRequiredMissing?: boolean; message?: string };
}

export function TransactionOverview({
  isCollapsed,
  onToggleSection,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onApplyEdit,
  groupedSections,
  overviewFormValues,
  selectedDeal,
  knownAgents = [],
  gciType,
  dealId,
  gciPerc,
  grossCommission,
  totalCommission,
  handleOverviewInputChange,
  preventMinus,
  validateFieldValue,
}: TransactionOverviewProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const uniqueKnownAgents = React.useMemo(() => {
    const seen = new Set<string>();
    const list: KnownAgentInfo[] = [];
    knownAgents.forEach((ag) => {
      const norm = normalizeAgentName(ag.name || '').trim().toLowerCase();
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      list.push(ag);
    });
    return list;
  }, [knownAgents]);

  const getAgentDisplayName = (rawVal: any): string => {
    if (!rawVal) return '—';
    const str = String(rawVal).trim();
    const normalized = normalizeAgentName(str).toLowerCase();
    const matched = knownAgents.find(
      (a) => a.id === str || a.name.toLowerCase() === str.toLowerCase() || a.name.toLowerCase() === normalized
    );
    return matched ? matched.name : (normalizeAgentName(str) || str);
  };

  const getControllingFieldValue = (fieldKey: string): any => {
    if (isEditing && overviewFormValues[fieldKey] !== undefined) {
      return overviewFormValues[fieldKey];
    }
    if (selectedDeal) {
      if (selectedDeal[fieldKey] !== undefined && selectedDeal[fieldKey] !== null) {
        return selectedDeal[fieldKey];
      }
      let customAttrs: any = {};
      try {
        customAttrs = typeof selectedDeal.custom_attributes === 'string'
          ? JSON.parse(selectedDeal.custom_attributes)
          : (selectedDeal.custom_attributes || {});
      } catch (e) {}

      if (customAttrs[fieldKey] !== undefined && customAttrs[fieldKey] !== null) {
        return customAttrs[fieldKey];
      }
      if (fieldKey === 'transaction_status' || fieldKey === 'status') {
        return selectedDeal.transaction_status || selectedDeal.status;
      }
    }
    return undefined;
  };

  const isFieldVisible = (field: FieldSetting, rawDbVal: any): boolean => {
    const cleanStr = String(rawDbVal || '').trim();
    const hasData =
      rawDbVal !== undefined &&
      rawDbVal !== null &&
      cleanStr !== '' &&
      cleanStr !== '—';

    const config = field.visibility_rules;
    const conditions = config?.conditions || [];

    if (!conditions || conditions.length === 0) return true;

    const groupOperator = config?.operator || 'OR';

    const evaluateCondition = (cond: VisibilityCondition): boolean => {
      const controllingVal = getControllingFieldValue(cond.field_key);
      if (controllingVal === undefined || controllingVal === null || String(controllingVal).trim() === '') {
        return false;
      }
      const strControllingVal = String(controllingVal).trim().toLowerCase();
      const targetArray = Array.isArray(cond.value)
        ? cond.value.map((v) => String(v || '').trim().toLowerCase())
        : [String(cond.value || '').trim().toLowerCase()];

      const op = String(cond.operator || '').toUpperCase();
      if (op === 'IN' || op === 'IS_IN_LIST' || op === 'EQUALS') {
        return targetArray.includes(strControllingVal);
      }
      if (op === 'NOT_EQUALS' || op === 'NOT_IN') {
        return !targetArray.includes(strControllingVal);
      }
      return true;
    };

    const rulesSatisfied = groupOperator === 'AND'
      ? conditions.every(evaluateCondition)
      : conditions.some(evaluateCondition);

    return rulesSatisfied || hasData;
  };

  const getFieldValue = (fieldKey: string, fieldType: string): { text: string } => {
    let rawVal = selectedDeal ? selectedDeal[fieldKey] : undefined;

    if (rawVal === undefined || rawVal === null || rawVal === '') {
      if (fieldKey === 'id') rawVal = dealId;
      else if (fieldKey === 'agent_id' || fieldType === 'AGENT_PICKER') rawVal = selectedDeal?.agent_id || selectedDeal?.primary_agent;
      else if (fieldKey === 'transaction_status' || fieldKey === 'status') rawVal = selectedDeal?.transaction_status || selectedDeal?.status;
      else if (fieldKey === 'gci_type') rawVal = gciType;
      else if (fieldKey === 'gci_perc') rawVal = gciPerc;
      else if (fieldKey === 'gci_amount') rawVal = grossCommission;
      else if (fieldKey === 'total_commission') rawVal = totalCommission;
    }

    if (rawVal === undefined || rawVal === null || rawVal === '') return { text: '—' };
    if (fieldKey === 'agent_id' || fieldType === 'AGENT_PICKER' || fieldKey === 'primary_agent') {
      return { text: getAgentDisplayName(rawVal) };
    }
    if (fieldType === 'CURRENCY') return { text: formatCurrency(Number(rawVal) || 0) };
    if (fieldType === 'PERCENT' || (fieldType === 'NUMBER' && fieldKey === 'gci_perc') || fieldKey === 'gci_perc') {
      return { text: formatPercent(rawVal) };
    }
    if (fieldType === 'DATE') return { text: String(rawVal).substring(0, 10) };

    return { text: String(rawVal) };
  };

  return (
    <section id="overview" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
      <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-lg">📋</span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Transaction Overview</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {!isEditing ? (
            <button
              onClick={onStartEdit}
              className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>✏️</span> Edit Transaction Overview
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelEdit}
                className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onApplyEdit}
                className="text-xs bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg font-bold transition hover:bg-emerald-400 shadow-md cursor-pointer"
              >
                Apply Changes
              </button>
            </div>
          )}

          <button
            onClick={onToggleSection}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none cursor-pointer"
            title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {Object.keys(groupedSections).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 italic">
              Loading Overview fields...
            </div>
          ) : (
            Object.entries(groupedSections).map(([sectionName, fields]) => {
              const visibleFields = fields.filter((field) => {
                const rawDbVal = selectedDeal ? selectedDeal[field.key] : undefined;
                const activeValue = isEditing
                  ? (overviewFormValues[field.key] ?? rawDbVal ?? '')
                  : (rawDbVal ?? '');

                return isFieldVisible(field, activeValue);
              });

              if (visibleFields.length === 0) return null;

              return (
                <div key={sectionName} className="space-y-1">
                  <div className="border-b border-slate-300 dark:border-slate-700 pb-1.5 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      SECTION: {sectionName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold ml-auto">
                      {visibleFields.length} {visibleFields.length === 1 ? 'Field' : 'Fields'}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                    {visibleFields.map((field) => {
                      const fieldData = getFieldValue(field.key, field.type);
                      const isSystemLocked = field.key === 'id' || field.key === 'total_commission';

                      const rawGciType = overviewFormValues.gci_type !== undefined ? overviewFormValues.gci_type : gciType;
                      const cleanGciType = String(rawGciType || '').toUpperCase().replace(/[\s_]+/g, '');

                      const isGciPercLocked = field.key === 'gci_perc' && !cleanGciType.includes('PERCENT');
                      const isGciAmountLocked = field.key === 'gci_amount' && (cleanGciType.includes('PERCENT') || !cleanGciType);
                      const isInputDisabled = isSystemLocked || isGciPercLocked || isGciAmountLocked;

                      let currentValueToValidate = selectedDeal ? selectedDeal[field.key] : undefined;
                      const activeValue = isEditing
                        ? (overviewFormValues[field.key] ?? currentValueToValidate ?? '')
                        : (currentValueToValidate ?? fieldData.text);

                      const validationResult = validateFieldValue(field, activeValue);
                      const formVal = overviewFormValues[field.key] ?? activeValue;
                      const dynamicOptions = field.options ? [...field.options] : [];

                      if (formVal && String(formVal).trim() !== '' && String(formVal) !== '—' && !dynamicOptions.some((opt) => opt.trim().toLowerCase() === String(formVal).trim().toLowerCase())) {
                        dynamicOptions.unshift(String(formVal));
                      }

                      return (
                        <div
                          key={field.id}
                          className={`py-1.5 px-2 flex items-center transition relative group ${
                            validationResult.isLegacyUnmatched
                              ? 'bg-amber-500/10 dark:bg-amber-500/10'
                              : validationResult.isRequiredMissing && isEditing
                              ? 'bg-rose-500/10 dark:bg-rose-500/10'
                              : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="w-1/3 md:w-2/5 pr-4 text-right flex justify-end items-center gap-1.5">
                            {isSystemLocked && isEditing && (
                              <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.5 rounded font-mono">
                                LOCKED
                              </span>
                            )}
                            {field.is_required && (
                              <span className="text-rose-500 font-bold text-xs" title="Required Field">*</span>
                            )}
                            {validationResult.isLegacyUnmatched && (
                              <span className="cursor-help text-xs" title={validationResult.message}>⚠️</span>
                            )}
                            <span
                              className={`text-xs font-semibold uppercase tracking-wide truncate ${
                                validationResult.isLegacyUnmatched
                                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                                  : validationResult.isRequiredMissing && isEditing
                                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                                  : field.is_required
                                  ? 'text-slate-800 dark:text-slate-200 font-bold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {field.label}
                            </span>
                          </div>

                          <div className="w-2/3 md:w-3/5 pl-2 text-left relative flex items-center">
                            {isEditing ? (
                              <div className="max-w-md w-full">
                                {field.type === 'AGENT_PICKER' || field.key === 'agent_id' ? (
                                  <select
                                    disabled={isInputDisabled}
                                    value={
                                      uniqueKnownAgents.find(
                                        (ag) => ag.id === formVal || ag.name.toLowerCase() === String(formVal || '').toLowerCase()
                                      )?.id || formVal || ''
                                    }
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                      validationResult.isRequiredMissing
                                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-emerald-500'
                                    }`}
                                  >
                                    <option value="">— Select Primary Agent —</option>
                                    {uniqueKnownAgents.map((ag) => (
                                      <option key={ag.id} value={ag.id}>
                                        {ag.name} {ag.isTeamLead ? '(Team Lead)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : field.type === 'SELECT' && dynamicOptions.length > 0 ? (
                                  <select
                                    disabled={isInputDisabled}
                                    value={formVal}
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                      validationResult.isLegacyUnmatched
                                        ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                                        : validationResult.isRequiredMissing
                                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-emerald-500'
                                    }`}
                                  >
                                    <option value="">— Select Option —</option>
                                    {dynamicOptions.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : field.type === 'DATE' ? (
                                  <input
                                    type="date"
                                    disabled={isInputDisabled}
                                    value={
                                      overviewFormValues[field.key]
                                        ? String(overviewFormValues[field.key]).substring(0, 10)
                                        : ''
                                    }
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                      validationResult.isRequiredMissing
                                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                    }`}
                                  />
                                ) : field.type === 'CURRENCY' || field.type === 'NUMBER' || field.type === 'PERCENT' ? (
                                  <DecimalInput
                                    disabled={isInputDisabled}
                                    value={Number(overviewFormValues[field.key]) || 0}
                                    onChange={(val) => handleOverviewInputChange(field.key, val)}
                                    isPercent={field.type === 'PERCENT' || field.key === 'gci_perc'}
                                    useCommas={field.type === 'CURRENCY'}
                                    onKeyDown={preventMinus}
                                    className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white text-left focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                      validationResult.isRequiredMissing
                                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                    }`}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    disabled={isInputDisabled}
                                    value={overviewFormValues[field.key] ?? ''}
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                      validationResult.isRequiredMissing
                                        ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                    }`}
                                  />
                                )}
                              </div>
                            ) : (
                              <span
                                className={`text-xs ${
                                  validationResult.isLegacyUnmatched
                                    ? 'text-amber-600 dark:text-amber-400 font-bold'
                                    : field.type === 'SELECT' || field.key === 'transaction_status' || field.key === 'agent_id' || field.type === 'AGENT_PICKER'
                                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                    : 'text-slate-900 dark:text-white font-medium'
                                }`}
                              >
                                {fieldData.text}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}