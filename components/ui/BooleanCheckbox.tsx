import React from 'react';
import { Check } from 'lucide-react';

export function isBooleanChecked(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const key = String(value ?? '').trim().toLowerCase();
  return key === 'true' || key === 'yes' || key === '1';
}

/** A table cell: a check when the toggle is on, and nothing when it is off. */
export function BooleanMark({ checked, compact = false }: { checked: boolean; compact?: boolean }) {
  if (!checked) return null;
  return (
    <span className="inline-flex items-center justify-center" role="img" aria-label="Yes">
      <Check
        className={`text-emerald-500 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
        strokeWidth={2.5}
        aria-hidden
      />
    </span>
  );
}

export function BooleanCheckbox({
  checked,
  disabled = false,
  id,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  id?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.checked)}
      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-default dark:border-slate-600 dark:bg-slate-900"
    />
  );
}

export function BooleanField({
  label,
  checked,
  disabled = false,
  required = false,
  id,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      <BooleanCheckbox id={id} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
    </label>
  );
}
