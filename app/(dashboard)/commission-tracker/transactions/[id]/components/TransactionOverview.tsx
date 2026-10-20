import React from 'react';
import {
  FieldSetting,
  formatPercentageClean,
  formatPercent,
  toPercentPoints,
  fromPercentPoints,
  KnownAgentInfo,
  readTransactionField,
  isOverviewFieldVisible,
} from '../types';

import {
  DecimalInput,
} from './DecimalInput';
import { normalizeAgentName } from '@/lib/id';
import { isHiddenRecordId } from '@/lib/fields';
import { EditPencil } from '@/components/ui/edit-pencil';
import { HoverNote } from './HoverNote';
import { SectionIcon } from './SectionIcon';
import { CancelEditPrompt } from './CancelEditPrompt';
import { useEditOnDoublePress } from './useEditOnDoublePress';
import { useSectionEditKeys } from './useSectionEditKeys';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { BooleanField, isBooleanChecked } from '@/components/ui/BooleanCheckbox';
import { UndoableDateInput } from '@/components/ui/UndoableDateInput';
import { useAccess } from '@/components/access-provider';

interface TransactionOverviewProps {
  isEditing: boolean;
  hasChanges: boolean;
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

/** Field types that make a section read as a strip of dates and amounts. */
const STRIP_TYPES = new Set(['DATE', 'CURRENCY', 'NUMBER', 'PERCENT']);
/** The date and amount strips use the same emerald as the amounts in them, tinted like the blue pills of the
    other sections, so they read as their own sub-section. */
const STRIP_PILL = 'flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400';

export function TransactionOverview({
  isEditing,
  hasChanges,
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
  const canWrite = Boolean(useAccess().access?.permissions.commissionTrackerWrite);
  const editOnDoublePress = useEditOnDoublePress(!isEditing && canWrite, onStartEdit);
  const editKeys = useSectionEditKeys(isEditing, onCancelEdit, hasChanges);

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
    return isOverviewFieldVisible(field, rawDbVal, getControllingFieldValue);
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

  // Sections that are mostly dates and amounts sit in one row at the top, in the client's section
  // order, lined up with the columns below; every other section keeps its place in those columns. Decided by
  // field type, so it works for any client's own sections.
  const isStripSection = (fields: FieldSetting[]) => fields.length > 0
    && fields.filter((field) => STRIP_TYPES.has(String(field.type))).length * 2 >= fields.length;
  const sectionEntries = Object.entries(groupedSections);
  const stripSections = sectionEntries.filter(([, fields]) => isStripSection(fields));
  const columnSections = sectionEntries.filter(([, fields]) => !isStripSection(fields));

  const renderSection = (sectionName: string, fields: FieldSetting[], strip: boolean) => {
            const visibleFields = fields.filter((field) => {
              const rawDbVal = readTransactionField(selectedDeal, field.key);
              const activeValue = isEditing
                ? (overviewFormValues[field.key] ?? rawDbVal ?? '')
                : (rawDbVal ?? '');

              if (isHiddenRecordId('transactions', field.key)) return false;
              return isFieldVisible(field, activeValue);
            });

            if (visibleFields.length === 0) return null;

            // While viewing, a strip reads as a small table: one cell per field, label above a larger value.
            if (strip && !isEditing) {
              return (
                <div key={sectionName} className="min-w-0 space-y-2">
                  <div className={STRIP_PILL}>
                    <span className="min-w-0 text-xs font-bold">{sectionName}</span>
                  </div>
                  {/* The grid sits 1px outside its frame so the outer edges of the cell borders are clipped. */}
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <dl className="-m-px grid [grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))]">
                      {visibleFields.map((field) => {
                        const { text } = getFieldValue(field.key, field.type);
                        const stored = readTransactionField(selectedDeal, field.key);
                        const unmatched = validateFieldValue(field, stored ?? text).isLegacyUnmatched;
                        const empty = text === '—';
                        return (
                          <div key={field.id} className="min-w-0 border-l border-t border-slate-200 px-3 py-2 dark:border-slate-700">
                            <dt className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {field.label}
                              {field.is_required && <span className="text-rose-500" title="Required Field">*</span>}
                            </dt>
                            <dd
                              title={unmatched ? validateFieldValue(field, stored ?? text).message : undefined}
                              className={`mt-0.5 truncate text-[15px] font-semibold ${
                                unmatched
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : empty
                                  ? 'font-normal text-slate-400 dark:text-slate-500'
                                  : field.type === 'CURRENCY'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {text}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={sectionName}
                className={`${strip ? 'min-w-0' : 'mb-6 break-inside-avoid'} space-y-2`}
              >
                {/* A full-width pill so each section title is easy to follow across the columns. */}
                <div className={strip ? STRIP_PILL : 'flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 dark:bg-brand-500/15'}>
                  <span className={`min-w-0 text-xs font-bold ${strip ? '' : 'text-brand-700 dark:text-brand-400'}`}>
                    {sectionName}
                  </span>
                </div>

                <div className={strip ? 'grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]' : 'flex flex-col gap-2'}>
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
                    const isBoolean = field.type === 'BOOLEAN';
                    const booleanChecked = isBooleanChecked(isEditing ? overviewFormValues[field.key] : readTransactionField(selectedDeal, field.key));
                    const filledControl = 'w-full bg-transparent border-0 p-0 h-5 text-xs leading-4 text-slate-900 dark:text-white focus:outline-none focus:ring-0 font-medium disabled:opacity-50 disabled:cursor-not-allowed';
                    const shellBorder = showError
                      ? 'border-b-rose-500'
                      : showWarning
                      ? 'border-b-amber-500'
                      : 'border-b-slate-300 dark:border-b-slate-600 focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)]';
                    const labelTone = showError
                      ? 'text-rose-600 dark:text-rose-400'
                      : showWarning
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400';

                    if (isBoolean) {
                      return (
                        <div key={field.id} className="min-w-0 py-1">
                          <BooleanField
                            label={field.label}
                            required={field.is_required}
                            checked={booleanChecked}
                            disabled={!isEditing || isInputDisabled}
                            onChange={(checked) => handleOverviewInputChange(field.key, checked)}
                          />
                          {assistiveMessage && (
                            <p className={`mt-0.5 text-[10px] leading-3 font-medium ${showError ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {assistiveMessage}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={field.id} className="min-w-0">
                        <div className={`group relative underline-field rounded-t-md pl-2.5 ${isSystemLocked && isEditing ? 'pr-14' : 'pr-2.5'} pt-1 pb-0.5 border-b transition-colors ${shellBorder} ${isInputDisabled && isEditing ? 'opacity-70' : ''}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] leading-3 font-medium truncate ${labelTone} ${!showError && !showWarning ? 'group-focus-within:text-brand-600 dark:group-focus-within:text-brand-400' : ''}`}>
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
                                <ClearableSelect
                                  disabled={isInputDisabled}
                                  value={
                                    uniqueKnownAgents.find(
                                      (ag) => ag.id === formVal || ag.name.toLowerCase() === String(formVal || '').toLowerCase()
                                    )?.id || formVal || ''
                                  }
                                  onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                  className={`${filledControl} overview-field-select cursor-pointer`}
                                >
                                  {uniqueKnownAgents.map((ag) => (
                                    <option key={ag.id} value={ag.id}>
                                      {ag.name} {ag.isTeamLead ? '(Team Lead)' : ''}
                                    </option>
                                  ))}
                                </ClearableSelect>
                              ) : field.type === 'SELECT' && dynamicOptions.length > 0 ? (
                                <ClearableSelect
                                  disabled={isInputDisabled}
                                  value={formVal ?? ''}
                                  onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                  className={`${filledControl} overview-field-select cursor-pointer ${showWarning ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}
                                >
                                  {dynamicOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </ClearableSelect>
                              ) : field.type === 'DATE' ? (
                                <UndoableDateInput
                                  disabled={isInputDisabled}
                                  value={
                                    overviewFormValues[field.key]
                                      ? String(overviewFormValues[field.key]).substring(0, 10)
                                      : ''
                                  }
                                  onChange={(next) => handleOverviewInputChange(field.key, next)}
                                  className={`${filledControl} overview-date dark:[color-scheme:dark]`}
                                />
                              ) : field.type === 'CURRENCY' || field.type === 'NUMBER' || field.type === 'PERCENT' ? (
                                <DecimalInput
                                  disabled={isInputDisabled}
                                  value={
                                    field.type === 'PERCENT' || field.key === 'gci_perc'
                                      ? toPercentPoints(Number(overviewFormValues[field.key]) || 0)
                                      : Number(overviewFormValues[field.key]) || 0
                                  }
                                  onChange={(val) => handleOverviewInputChange(
                                    field.key,
                                    field.type === 'PERCENT' || field.key === 'gci_perc' ? fromPercentPoints(val) : val,
                                  )}
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
  };

  // A strip whose fields are all hidden on this deal renders nothing, so it must not take a column.
  const renderedStrips = stripSections
    .map(([sectionName, fields]) => [sectionName, renderSection(sectionName, fields, true)] as const)
    .filter(([, element]) => element !== null);

  return (
    <section id="overview" onKeyDown={editKeys.onKeyDown} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden scroll-mt-[calc(var(--app-nav-offset,4rem)+var(--txn-header-height))] transition-colors">
      <div
        className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center"
      >
        <div className="flex items-center gap-3">
          <SectionIcon name="overview" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Transaction Overview</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {canWrite && !isEditing ? (
            <HoverNote label="Edit Transaction Overview">
              <button
                onClick={onStartEdit}
                aria-label="Edit Transaction Overview"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
              >
                <EditPencil className="h-5 w-5" />
              </button>
            </HoverNote>
          ) : canWrite ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelEdit}
                className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              {hasChanges && (
                <button
                  onClick={onApplyEdit}
                  className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-bold transition hover:bg-brand-500 cursor-pointer"
                >
                  Apply Changes
                </button>
              )}
            </div>
          ) : null}

        </div>
      </div>

      <div className="p-6" {...editOnDoublePress}>
        {Object.keys(groupedSections).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 italic">
            Loading Overview fields...
          </div>
        ) : (
          <div className="space-y-6">
          {renderedStrips.length > 0 && (
          // The strips sit on the same columns as the sections below (up to four, at least 20rem each).
          // Each strip takes one column and the last one fills the rest of the row.
          <div className="grid gap-6 lg:gap-x-8 lg:[grid-template-columns:repeat(auto-fill,minmax(max(20rem,calc((100%-6rem)/4)),1fr))]">
          {renderedStrips.map(([sectionName, element], index) => (
            <div
              key={sectionName}
              className="min-w-0 lg:[grid-column:var(--strip-span)]"
              // The others fill columns 1, 2, 3 in turn, so the last one starts right after them and runs to the row's end.
              style={{ '--strip-span': index === renderedStrips.length - 1 && index < 3 ? `${index + 1} / -1` : 'span 1' } as React.CSSProperties}
            >
              {element}
            </div>
          ))}
          </div>
          )}
          {columnSections.length > 0 && (
          <div className="lg:[column-count:4] lg:[column-width:20rem] lg:gap-x-8">
          {columnSections.map(([sectionName, fields]) => renderSection(sectionName, fields, false))}
          </div>
          )}
          </div>
        )}
      </div>
      <CancelEditPrompt
        open={editKeys.confirmCancel}
        sectionLabel="Transaction Overview"
        onKeepEditing={editKeys.keepEditing}
        onDiscard={editKeys.discard}
      />
    </section>
  );
}