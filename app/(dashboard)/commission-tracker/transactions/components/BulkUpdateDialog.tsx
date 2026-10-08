'use client';

import React, { useMemo, useState } from 'react';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import {
  isOverviewFieldVisible,
  readTransactionField,
  type VisibilityRulesConfig,
} from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
import { isBulkEditableField, type BulkFieldChoice } from '@/lib/transaction-bulk';

const CLEAR_VALUE = '__bulk_clear__';

export interface BulkDialogField {
  field_key: string;
  field_label: string;
  field_type: string;
  storage_type?: string | null;
  calculation_formula?: string | null;
  is_enabled?: boolean | null;
  is_required?: boolean | null;
  dropdown_options?: string[];
  visibility_rules?: VisibilityRulesConfig | null;
}

interface BulkAgent {
  id: string;
  agent_name?: string;
  name?: string;
}

export function BulkUpdateDialog({
  fields,
  agents,
  selectedDeals,
  selectedCount,
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  fields: BulkDialogField[];
  agents: BulkAgent[];
  selectedDeals: Record<string, unknown>[];
  selectedCount: number;
  isPending: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (fieldKey: string, value: string) => void;
}) {
  const choices = useMemo(() => {
    return fields
      .filter((field) => isBulkEditableField(field))
      .map((field) => ({
        fieldKey: field.field_key,
        fieldLabel: field.field_label || field.field_key,
        fieldType: field.field_key === 'gci_perc' ? 'PERCENT' : field.field_type || 'TEXT',
        isRequired: Boolean(field.is_required),
        visibilityRules: field.visibility_rules || undefined,
        options: Array.isArray(field.dropdown_options) ? field.dropdown_options.filter(Boolean) : [],
      }))
      .sort((left, right) => left.fieldLabel.localeCompare(right.fieldLabel));
  }, [fields]);

  const [fieldKey, setFieldKey] = useState(choices[0]?.fieldKey || '');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const selected = choices.find((choice) => choice.fieldKey === fieldKey) || null;
  const noun = selectedCount === 1 ? 'transaction' : 'transactions';
  const isTmsId = selected?.fieldKey === 'tms_id';
  const isText = Boolean(selected && selected.fieldType === 'TEXT' && !isTmsId);
  const choosingClear = value === CLEAR_VALUE;
  const textClear = isText && value.trim() === '';
  const clearing = Boolean(selected && (isTmsId || choosingClear || (value.trim() === '' && (textClear || touched))));
  const requiredCount = useMemo(() => {
    if (!selected?.isRequired || !clearing) return 0;
    return selectedDeals.filter((deal) => isOverviewFieldVisible(
      { visibility_rules: selected.visibilityRules },
      readTransactionField(deal, selected.fieldKey),
      (key) => readTransactionField(deal, key),
    )).length;
  }, [selected, selectedDeals, clearing]);
  const requiredNoun = requiredCount === 1 ? 'transaction' : 'transactions';
  const canSubmit = Boolean(selected) && selectedCount > 0 && (clearing || (value.trim() !== '' && !choosingClear));

  const summary = !selected
    ? 'Choose a field and a value.'
    : isTmsId
      ? `Clearing TMS ID disconnects these ${selectedCount} ${noun} from the Transaction Management System. Sync will no longer update them. If that ID is still on the sheet, the next sync can add a new transaction for it.`
      : clearing
        ? `This clears ${selected.fieldLabel} on ${selectedCount} ${noun}. Commission calculations are not rerun.`
        : `This sets ${selected.fieldLabel} on ${selectedCount} ${noun}. Commission calculations are not rerun.`;
  const actionLabel = isPending
    ? 'Updating...'
    : isTmsId
      ? 'Clear TMS ID'
      : textClear
        ? 'Clear'
        : clearing
          ? 'Clear field'
          : 'Update';

  return (
    <div
      className="app-modal fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-center items-center p-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-update-title"
      >
        <div>
          <h3 id="bulk-update-title" className="text-base font-bold text-slate-900 dark:text-white">
            {isTmsId ? `Clear TMS ID on ${selectedCount} ${noun}` : `Update ${selectedCount} ${noun}`}
          </h3>
          <p className={`mt-1 text-sm ${isTmsId ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}`}>{summary}</p>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Field</span>
          <ClearableSelect
            allowBlank={false}
            value={fieldKey}
            disabled={isPending || choices.length === 0}
            onChange={(event) => {
              setFieldKey(event.target.value);
              setValue('');
              setTouched(false);
            }}
            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          >
            {choices.length === 0 ? <option value="">No editable fields</option> : null}
            {choices.map((choice) => (
              <option key={choice.fieldKey} value={choice.fieldKey}>{choice.fieldLabel}</option>
            ))}
          </ClearableSelect>
        </label>

        {selected && !isTmsId ? (
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Value</span>
            <BulkValueControl
              field={selected}
              agents={agents}
              value={value}
              disabled={isPending}
              onChange={(next) => {
                setTouched(true);
                setValue(next);
              }}
            />
          </label>
        ) : null}

        {clearing && requiredCount > 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            It is not recommended to proceed with clearing a required field for {requiredCount} {requiredNoun}.
          </p>
        ) : null}

        {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected && canSubmit) onConfirm(selected.fieldKey, choosingClear ? '' : value.trim());
            }}
            disabled={!canSubmit || isPending}
            className={`px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isTmsId || requiredCount > 0
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {isPending ? 'Updating...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkValueControl({
  field,
  agents,
  value,
  disabled,
  onChange,
}: {
  field: Pick<BulkFieldChoice, 'fieldKey' | 'fieldType' | 'fieldLabel' | 'isRequired' | 'options'>;
  agents: BulkAgent[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const inputClass = 'w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500';

  if (field.fieldType === 'AGENT_PICKER' || field.fieldKey === 'agent_id') {
    return (
      <ClearableSelect allowBlank={false} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Choose an agent</option>
        <option value={CLEAR_VALUE}>Clear</option>
        {agents.map((agent) => {
          const name = agent.agent_name || agent.name || agent.id;
          return <option key={agent.id} value={agent.id}>{name}</option>;
        })}
      </ClearableSelect>
    );
  }

  if (field.fieldType === 'SELECT') {
    return (
      <ClearableSelect allowBlank={false} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">{`Choose ${field.fieldLabel}`}</option>
        <option value={CLEAR_VALUE}>Clear</option>
        {field.options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </ClearableSelect>
    );
  }

  if (field.fieldType === 'BOOLEAN') {
    return (
      <ClearableSelect allowBlank={false} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Choose</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </ClearableSelect>
    );
  }

  if (field.fieldType === 'DATE') {
    return (
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );
  }

  const numeric = field.fieldType === 'CURRENCY' || field.fieldType === 'NUMBER' || field.fieldType === 'PERCENT';
  return (
    <input
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      step={field.fieldType === 'CURRENCY' ? '0.01' : field.fieldType === 'PERCENT' ? '0.001' : undefined}
      value={value}
      disabled={disabled}
      placeholder={field.fieldType === 'PERCENT' ? '2.5 for 2.5%' : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}
