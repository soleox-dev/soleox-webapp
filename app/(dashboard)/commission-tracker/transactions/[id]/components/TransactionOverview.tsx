import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { SECTION_BAND_PHONE, SECTION_BODY_PHONE, SECTION_SHELL_PHONE } from './sectionChrome';
import { CancelEditPrompt } from './CancelEditPrompt';
import { useEditOnDoublePress } from './useEditOnDoublePress';
import { useSectionEditKeys } from './useSectionEditKeys';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { BooleanCheckbox, BooleanField, isBooleanChecked } from '@/components/ui/BooleanCheckbox';
import { ChevronDown, ChevronUp, Ellipsis } from 'lucide-react';
import { UndoableDateInput } from '@/components/ui/UndoableDateInput';
import { useAccess } from '@/components/access-provider';
import { takesThousands } from '@/components/ui/number-input';

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
  /** Key Terms as shown, for the pinned header; null when the deal has none to show. */
  onPinnedKeyTerms?: (terms: PinnedKeyTerm[] | null) => void;
  /** A Key Term clicked in the pinned header: the Overview opens for editing and that field's control takes focus. */
  focusField?: { key: string; nonce: number } | null;
}

/** One Key Term in the pinned header: its label and its value as the Overview shows it. */
export interface PinnedKeyTerm {
  key: string;
  label: string;
  value: string;
  currency: boolean;
  empty: boolean;
}

/**
 * A long value of an optional field, kept to one line to save room. When it does not fit, a "…" button opens the
 * rest (wrapped in balanced lines) and a chevron folds it back up. Short values look like any other.
 */
function FoldedValue({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node || open) return;
    const measure = () => setOverflows(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <span className="flex min-w-0 items-start justify-end gap-1">
      <span ref={textRef} className={`min-w-0 ${open ? 'whitespace-normal break-words text-balance' : 'truncate'} ${className}`}>
        {text}
      </span>
      {(overflows || open) && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          aria-expanded={open}
          aria-label={open ? 'Show less' : 'Show all'}
          title={open ? 'Show less' : 'Show all'}
          className="mt-0.5 inline-flex h-4 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition hover:bg-brand-500/20 hover:text-brand-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:text-brand-300 cursor-pointer"
        >
          {open ? <ChevronUp aria-hidden className="h-3 w-3" strokeWidth={2.25} /> : <Ellipsis aria-hidden className="h-3 w-3" strokeWidth={2.25} />}
        </button>
      )}
    </span>
  );
}

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
  onPinnedKeyTerms,
  focusField,
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

  // Key Terms: the fields the client picked in Settings › Fields, in their Key Terms order. They show in the pinned
  // header (HeaderCard) the whole time; here each stays in its own section, where it is edited.
  const keyTermsFields = Object.values(groupedSections)
    .flat()
    .filter((field) => field.key_terms_position != null)
    .sort((a, b) => Number(a.key_terms_position) - Number(b.key_terms_position));
  const columnSections = Object.entries(groupedSections).filter(([, fields]) => fields.length > 0);

  const visibleFieldsOf = (fields: FieldSetting[]) => fields.filter((field) => {
    const rawDbVal = readTransactionField(selectedDeal, field.key);
    const activeValue = isEditing
      ? (overviewFormValues[field.key] ?? rawDbVal ?? '')
      : (rawDbVal ?? '');

    if (isHiddenRecordId('transactions', field.key)) return false;
    return isFieldVisible(field, activeValue);
  });

  const pinnedTerms: PinnedKeyTerm[] = visibleFieldsOf(keyTermsFields).map((field) => {
    const { text } = getFieldValue(field.key, field.type);
    return { key: field.key, label: field.label, value: text, currency: field.type === 'CURRENCY', empty: text === '—' };
  });
  const pinnedKey = pinnedTerms.length > 0 ? JSON.stringify(pinnedTerms) : '';
  useEffect(() => {
    onPinnedKeyTerms?.(pinnedKey ? JSON.parse(pinnedKey) as PinnedKeyTerm[] : null);
  }, [pinnedKey, onPinnedKeyTerms]);
  useEffect(() => () => onPinnedKeyTerms?.(null), [onPinnedKeyTerms]);

  // A Key Term clicked in the pinned header: start editing like the pencil, then, once the inputs are drawn, bring
  // that field in under the pinned header, focus its control, and flash the line.
  const sectionRef = useRef<HTMLElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const handledFocusRef = useRef<number | null>(null);
  useEffect(() => {
    if (!focusField || !canWrite || handledFocusRef.current === focusField.nonce) return;
    handledFocusRef.current = focusField.nonce;
    pendingFocusRef.current = focusField.key;
    if (!isEditing) onStartEdit();
  }, [focusField, canWrite, isEditing, onStartEdit]);
  useEffect(() => {
    const key = pendingFocusRef.current;
    if (!key || !isEditing) return;
    // Effects run after the commit, so the edit inputs are already in the page.
    pendingFocusRef.current = null;
    const line = sectionRef.current?.querySelector<HTMLElement>(`[data-field-key="${CSS.escape(key)}"]`);
    if (!line) return;
    // Land just under the pinned strip, as the section jumps do (page.tsx scrollToSection): the top bar shows again
    // while scrolling up, so leave room for it then.
    const stripBottom = document.getElementById('transaction-detail-header')?.getBoundingClientRect().bottom ?? 0;
    const rect = line.getBoundingClientRect();
    if (rect.top < stripBottom + 12 || rect.bottom > window.innerHeight - 24) {
      const goingUp = rect.top < stripBottom;
      const barHidden = document.documentElement.style.getPropertyValue('--app-nav-offset').trim() === '0px';
      const barRoom = goingUp && barHidden ? (document.querySelector('header')?.offsetHeight ?? 64) : 0;
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - stripBottom - barRoom - 12), behavior: 'smooth' });
    }
    const control = line.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    control?.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement && control.type === 'text') control.select();
    line.classList.remove('field-flash');
    void line.offsetWidth;
    line.classList.add('field-flash');
    const endFlash = (event: AnimationEvent) => {
      if (event.target !== line) return;
      line.classList.remove('field-flash');
      line.removeEventListener('animationend', endFlash);
    };
    line.addEventListener('animationend', endFlash);
  }, [isEditing, focusField]);

  // Enter applies the Overview's changes (useSectionEditKeys). In a dropdown the same Enter first picks the
  // highlighted choice, which lands on the next render, so apply once it has.
  const applyAfterChoiceRef = useRef(false);
  const onSectionKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (
      isEditing && event.key === 'Enter' && !event.shiftKey && event.defaultPrevented
      && target instanceof HTMLElement && target.getAttribute('role') === 'combobox'
    ) {
      applyAfterChoiceRef.current = true;
      window.setTimeout(() => { applyAfterChoiceRef.current = false; }, 0);
      return;
    }
    editKeys.onKeyDown(event);
  };
  useEffect(() => {
    if (!applyAfterChoiceRef.current) return;
    applyAfterChoiceRef.current = false;
    if (isEditing && hasChanges) onApplyEdit();
  }, [overviewFormValues, isEditing, hasChanges, onApplyEdit]);

  const renderSection = (sectionName: string, fields: FieldSetting[]) => {
            const visibleFields = visibleFieldsOf(fields);

            if (visibleFields.length === 0) return null;

            return (
              <div
                key={sectionName}
                className="mb-4 min-w-0 break-inside-avoid"
              >
                {/* A full-width pill so each section title is easy to follow across the columns. */}
                <div className="flex items-center gap-2 rounded-full bg-brand-500/10 px-3.5 py-1.5 dark:bg-brand-500/15">
                  <span className="min-w-0 text-sm font-bold text-brand-700 dark:text-brand-400">
                    {sectionName}
                  </span>
                </div>

                {/* Key Terms while editing: a grid of fields. Other sections: one line per field, its name on the left
                    and its value on the right, edited in place, like the Commission Template form. */}
                <div className="mt-0.5 flex flex-col">
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

                    const showError = Boolean(validationResult.isRequiredMissing && isEditing);
                    const showWarning = Boolean(validationResult.isLegacyUnmatched);
                    const assistiveMessage = (showError || showWarning || (isEditing && !validationResult.isValid))
                      ? validationResult.message
                      : '';
                    const isDropdown = field.type === 'AGENT_PICKER' || field.key === 'agent_id' || field.key === 'primary_agent' || (field.type === 'SELECT' && dynamicOptions.length > 0);
                    const isBoolean = field.type === 'BOOLEAN';
                    const booleanChecked = isBooleanChecked(isEditing ? overviewFormValues[field.key] : readTransactionField(selectedDeal, field.key));
                    const filledControl = 'w-full bg-transparent border-0 p-0 h-5 text-xs leading-4 text-slate-900 dark:text-white focus:outline-none focus:ring-0 font-medium disabled:opacity-50 disabled:cursor-not-allowed';
                    const labelTone = showError
                      ? 'text-rose-600 dark:text-rose-400'
                      : showWarning
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400';

                    if (isBoolean) {
                      return (
                        <div
                          key={field.id}
                          data-field-key={field.key}
                          // Y or N sets a flag from the keyboard, like Space toggles it; Enter then applies.
                          onKeyDown={(event) => {
                            if (!isEditing || isInputDisabled || event.metaKey || event.ctrlKey || event.altKey) return;
                            const key = event.key.toLowerCase();
                            if (key !== 'y' && key !== 'n') return;
                            event.preventDefault();
                            handleOverviewInputChange(field.key, key === 'y');
                          }}
                          className={`group/field relative underline-field parameter-line flex min-h-7 flex-wrap items-center gap-x-3 rounded-md border-b border-b-slate-200 py-0.5 pl-2.5 pr-2 focus-within:border-b-brand-500 dark:border-b-slate-700/70`}
                        >
                          <span className={`min-w-0 flex-1 truncate text-xs leading-4 ${labelTone}`}>
                            {field.label}
                            {field.is_required && <span className="text-rose-500" title="Required field">*</span>}
                          </span>
                          <BooleanCheckbox
                            checked={booleanChecked}
                            disabled={!isEditing || isInputDisabled}
                            onChange={(checked) => handleOverviewInputChange(field.key, checked)}
                          />
                          {assistiveMessage && (
                            <p className={`basis-full pb-0.5 text-right text-2xs leading-3 font-medium ${showError ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {assistiveMessage}
                            </p>
                          )}
                        </div>
                      );
                    }

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
                            <p className={`mt-0.5 text-2xs leading-3 font-medium ${showError ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {assistiveMessage}
                            </p>
                          )}
                        </div>
                      );
                    }

                    // The value, or its input while editing. Both layouts below show it.
                    const control = isEditing ? (
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
                                  useCommas={field.type === 'CURRENCY' || (field.type === 'NUMBER' && takesThousands(field.key, field.label))}
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
                              (() => {
                                const tone = `text-xs leading-5 ${
                                  showWarning
                                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                    : fieldData.text === '—'
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : 'text-slate-900 dark:text-white font-medium'
                                }`;
                                // Optional fields keep long text to one line, opened with "…"; required ones show it all.
                                if (!field.is_required) return <FoldedValue text={fieldData.text} className={tone} />;
                                return (
                                  <span className={`${tone} whitespace-normal break-words text-balance`}>
                                    {fieldData.text}
                                  </span>
                                );
                              })()
                            );

                    return (
                      <div
                        key={field.id}
                        data-field-key={field.key}
                        className={`group/field relative underline-field parameter-line flex flex-wrap items-start gap-x-3 rounded-md border-b py-1 pl-2.5 pr-2 transition-colors ${
                          showError ? 'border-b-rose-500' : showWarning ? 'border-b-amber-500' : 'border-b-slate-200 dark:border-b-slate-700/70 focus-within:border-b-brand-500'
                        } ${isInputDisabled && isEditing ? 'opacity-70' : ''}`}
                      >
                        {/* Name and value boxes are both 20px tall per line, so a name lines up with the first line of a
                            value that wraps. */}
                        <div className={`flex min-h-5 min-w-0 items-center gap-1.5 ${isEditing ? 'flex-1' : 'max-w-[45%] flex-none'}`}>
                          <span className={`min-w-0 break-words text-xs leading-4 ${labelTone} ${!showError && !showWarning ? 'group-focus-within/field:text-brand-600 dark:group-focus-within/field:text-brand-400' : ''}`}>
                            {field.label}
                            {field.is_required && <span className="text-rose-500" title="Required field">*</span>}
                          </span>
                          {showWarning && (
                            <span className="cursor-help text-xs shrink-0" title={validationResult.message}>⚠️</span>
                          )}
                        </div>
                        {/* Values sit on the right. A long one wraps onto more lines, still on the right. */}
                        <div
                          className={`relative flex min-w-0 items-center justify-end text-right [&_input]:text-right [&_input]:placeholder:text-slate-400 dark:[&_input]:placeholder:text-slate-500 ${
                            isEditing ? 'min-h-5 w-[55%] max-w-[16rem] shrink-0' : 'min-h-5 min-w-0 flex-1'
                          } ${isEditing && (isDropdown || field.type === 'DATE') ? '[&_input]:pr-5' : ''} ${isSystemLocked && isEditing ? 'pr-12' : ''}`}
                        >
                          {control}
                          {isSystemLocked && isEditing && (
                            <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-2xs bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.5 rounded font-mono">
                              LOCKED
                            </span>
                          )}
                          {isEditing && isDropdown && (
                            <ChevronDown aria-hidden strokeWidth={2} className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
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
                              className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 cursor-pointer text-slate-500 dark:text-slate-400"
                            >
                              <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.25" />
                                <path d="M2.25 6.75h11.5M5.25 2v2.5M10.75 2v2.5" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {assistiveMessage && (
                          <p className={`basis-full pb-0.5 text-right text-2xs leading-3 font-medium ${showWarning && !showError ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
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

  return (
    <section ref={sectionRef} id="overview" onKeyDown={onSectionKeyDown} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden scroll-mt-[calc(var(--app-nav-offset,4rem)+var(--txn-header-height))] transition-colors ${SECTION_SHELL_PHONE}`}>
      <div
        className={`bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center ${SECTION_BAND_PHONE}`}
      >
        <div className="flex items-center gap-3">
          <SectionIcon name="overview" className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transaction Overview</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {canWrite && !isEditing ? (
            <HoverNote label="Edit transaction overview">
              <button
                onClick={onStartEdit}
                aria-label="Edit transaction overview"
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

      <div className={`p-6 ${SECTION_BODY_PHONE}`} {...editOnDoublePress}>
        {Object.keys(groupedSections).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 italic">
            Loading Overview fields...
          </div>
        ) : (
          <div className="space-y-6">
          {columnSections.length > 0 && (
          <div className="lg:[column-count:4] lg:[column-width:20rem] lg:gap-x-12">
          {columnSections.map(([sectionName, fields]) => renderSection(sectionName, fields))}
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