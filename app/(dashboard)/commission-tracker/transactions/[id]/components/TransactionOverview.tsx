import React from 'react';
import {
  FieldSetting,
  formatPercentageClean,
  formatPercent,
  VisibilityCondition,
  KnownAgentInfo,
  readTransactionField,
} from '../types';

import {
  DecimalInput,
} from './DecimalInput';
import { normalizeAgentName } from '@/lib/id';
import { EditPencil } from '@/components/ui/edit-pencil';
import { HoverNote } from './HoverNote';
import { SectionIcon } from './SectionIcon';

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
      const stored = readTransactionField(selectedDeal, fieldKey);
      if (stored !== undefined && stored !== null && stored !== '') {
        return stored;
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
    let rawVal = readTransactionField(selectedDeal, fieldKey);

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
          <SectionIcon name="overview" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Transaction Overview</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {!isEditing ? (
            <HoverNote label="Edit Transaction Overview">
              <button
                onClick={onStartEdit}
                aria-label="Edit Transaction Overview"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
              >
                <EditPencil className="h-5 w-5" />
              </button>
            </HoverNote>
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
        <div className="p-6">
          {Object.keys(groupedSections).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 italic">
              Loading Overview fields...
            </div>
          ) : (
            <div className="lg:columns-2 lg:gap-x-8">
            {Object.entries(groupedSections).map(([sectionName, fields]) => {
              const visibleFields = fields.filter((field) => {
                const rawDbVal = readTransactionField(selectedDeal, field.key);
                const activeValue = isEditing
                  ? (overviewFormValues[field.key] ?? rawDbVal ?? '')
                  : (rawDbVal ?? '');

                return isFieldVisible(field, activeValue);
              });

              if (visibleFields.length === 0) return null;

              return (
                <div key={sectionName} className="mb-6 break-inside-avoid space-y-2">
                  <div className="border-b border-slate-300 dark:border-slate-700 pb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      SECTION: {sectionName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold ml-auto">
                      {visibleFields.length} {visibleFields.length === 1 ? 'Field' : 'Fields'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {visibleFields.map((field) => {
                      const fieldData = getFieldValue(field.key, field.type);
                      const isSystemLocked = field.key === 'id' || field.key === 'total_commission';

                      const rawGciType = overviewFormValues.gci_type !== undefined ? overviewFormValues.gci_type : gciType;
                      const cleanGciType = String(rawGciType || '').toUpperCase().replace(/[\s_]+/g, '');

                      const isGciPercLocked = field.key === 'gci_perc' && !cleanGciType.includes('PERCENT');
                      const isGciAmountLocked = field.key === 'gci_amount' && (cleanGciType.includes('PERCENT') || !cleanGciType);
                      const isInputDisabled = isSystemLocked || isGciPercLocked || isGciAmountLocked;

                      let currentValueToValidate = readTransactionField(selectedDeal, field.key);
                      const activeValue = isEditing
                        ? (overviewFormValues[field.key] ?? currentValueToValidate ?? '')
                        : (currentValueToValidate ?? fieldData.text);

                      const validationResult = validateFieldValue(field, activeValue);
                      const formVal = overviewFormValues[field.key] ?? activeValue;
                      const dynamicOptions = field.options ? [...field.options] : [];

                      if (formVal && String(formVal).trim() !== '' && String(formVal) !== '—' && !dynamicOptions.some((opt) => opt.trim().toLowerCase() === String(formVal).trim().toLowerCase())) {
                        dynamicOptions.unshift(String(formVal));
                      }

                      const labelKey = `${field.key} ${field.label}`.trim().toLowerCase();
                      const spansBoth = labelKey.includes('property address') || labelKey.includes('commission split');
                      const showError = Boolean(validationResult.isRequiredMissing && isEditing);
                      const showWarning = Boolean(validationResult.isLegacyUnmatched);
                      const assistiveMessage = (showError || showWarning || (isEditing && !validationResult.isValid))
                        ? validationResult.message
                        : '';
                      const isDropdown = field.type === 'AGENT_PICKER' || field.key === 'agent_id' || field.key === 'primary_agent' || (field.type === 'SELECT' && dynamicOptions.length > 0);
                      const filledControl = 'w-full bg-transparent border-0 p-0 h-5 text-xs leading-4 text-slate-900 dark:text-white focus:outline-none focus:ring-0 font-medium disabled:opacity-50 disabled:cursor-not-allowed';
                      const shellBorder = showError
                        ? 'border-b-rose-500'
                        : showWarning
                        ? 'border-b-amber-500'
                        : 'border-b-slate-300 dark:border-b-slate-600 focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]';
                      const labelTone = showError
                        ? 'text-rose-600 dark:text-rose-400'
                        : showWarning
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400';

                      return (
                        <div key={field.id} className="min-w-0">
                          <div className={`group relative underline-field rounded-t-md pl-2.5 ${isSystemLocked && isEditing ? 'pr-14' : 'pr-2.5'} pt-1 pb-0.5 border-b transition-colors ${shellBorder} ${isInputDisabled && isEditing ? 'opacity-70' : ''}`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] leading-3 font-medium truncate ${labelTone} ${!showError && !showWarning ? 'group-focus-within:text-emerald-600 dark:group-focus-within:text-emerald-400' : ''}`}>
                                {field.label}
                                {field.is_required && <span className="text-rose-500" title="Required Field">*</span>}
                              </span>
                              {showWarning && (
                                <span className="cursor-help text-xs shrink-0" title={validationResult.message}>⚠️</span>
                              )}
                            </div>
                            <div className={`${spansBoth ? 'min-h-5 items-start' : 'h-5 items-center'} flex`}>
                              {isEditing ? (
                                field.type === 'AGENT_PICKER' || field.key === 'agent_id' || field.key === 'primary_agent' ? (
                                  <select
                                    disabled={isInputDisabled}
                                    value={
                                      uniqueKnownAgents.find(
                                        (ag) => ag.id === formVal || ag.name.toLowerCase() === String(formVal || '').toLowerCase()
                                      )?.id || formVal || ''
                                    }
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={`${filledControl} overview-field-select cursor-pointer`}
                                  >
                                    <option value="">Select primary agent</option>
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
                                    className={`${filledControl} overview-field-select cursor-pointer ${showWarning ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}
                                  >
                                    <option value="">Select an option</option>
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
                                    className={`${filledControl} overview-date dark:[color-scheme:dark]`}
                                  />
                                ) : field.type === 'CURRENCY' || field.type === 'NUMBER' || field.type === 'PERCENT' ? (
                                  <DecimalInput
                                    disabled={isInputDisabled}
                                    value={Number(overviewFormValues[field.key]) || 0}
                                    onChange={(val) => handleOverviewInputChange(field.key, val)}
                                    isPercent={field.type === 'PERCENT' || field.key === 'gci_perc'}
                                    useCommas={field.type === 'CURRENCY'}
                                    onKeyDown={preventMinus}
                                    className={`${filledControl} text-left`}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    disabled={isInputDisabled}
                                    value={overviewFormValues[field.key] ?? ''}
                                    onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                    className={filledControl}
                                  />
                                )
                              ) : (
                                <span
                                  className={`text-xs leading-4 ${spansBoth ? 'whitespace-normal' : 'truncate'} ${
                                    showWarning
                                      ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                      : fieldData.text === '—'
                                      ? 'text-slate-400 dark:text-slate-500'
                                      : 'text-slate-900 dark:text-white font-medium'
                                  }`}
                                >
                                  {fieldData.text}
                                </span>
                              )}
                            </div>
                            {isSystemLocked && isEditing && (
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.5 rounded font-mono">
                                LOCKED
                              </span>
                            )}
                            {isEditing && isDropdown && (
                              <svg
                                viewBox="0 0 10 6"
                                aria-hidden
                                className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
                              >
                                <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isEditing && field.type === 'DATE' && !isInputDisabled && (
                              <button
                                type="button"
                                aria-label={`Choose ${field.label}`}
                                onClick={(event) => {
                                  const input = event.currentTarget.parentElement?.querySelector('input[type="date"]');
                                  if (!(input instanceof HTMLInputElement)) return;
                                  input.focus();
                                  if (typeof input.showPicker === 'function') input.showPicker();
                                }}
                                className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 cursor-pointer text-slate-600 dark:text-slate-300"
                              >
                                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.25" />
                                  <path d="M2.25 6.75h11.5M5.25 2v2.5M10.75 2v2.5" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {assistiveMessage && (
                            <p className={`mt-1 text-[11px] font-medium ${showWarning && !showError ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {assistiveMessage}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}