'use client';

import React, { useEffect, useState } from 'react';
import { FieldChevron, UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { OptionMenu } from '@/components/ui/option-menu';
import type { PlanLine } from '@/lib/commission-engine';

export const LINE_TYPES: { type: PlanLine['type']; label: string; hint: string }[] = [
  { type: 'capped_percent', label: 'Percentage up to a Yearly Cap', hint: 'A rate of the side after bonuses, up to a yearly cap. Gives the share past the cap.' },
  { type: 'per_deal_fee', label: 'Per-Deal Fee', hint: 'An amount per deal shared by split % and the Fee Share.' },
  { type: 'percent_of_net', label: 'Percentage of Net', hint: 'A rate of the side after chosen lines, for agents who opted in.' },
  { type: 'formula', label: 'Formula', hint: 'Any amount the formula language can express.' },
];

export const lineTypeLabel = (type: PlanLine['type']) => LINE_TYPES.find((item) => item.type === type)?.label || type;

/** A rate stored as a fraction (0.2) shown as percent points (20), without float noise. */
export const toPoints = (rate: number) => Number((rate * 100).toFixed(6));
export const fromPoints = (points: number) => Number((points / 100).toFixed(8));

export function newLine(type: PlanLine['type'], taken: Set<string>): PlanLine {
  const base = (key: string, name: string) => {
    let unique = key;
    let suffix = 2;
    while (taken.has(unique)) unique = `${key}_${suffix++}`;
    return { key: unique, name, payee: '' };
  };
  if (type === 'capped_percent') return { ...base('brokerage_share', 'Brokerage Share'), type, rate: 0.2, capAmount: null };
  if (type === 'per_deal_fee') return { ...base('fee', 'Fee'), type, amount: 0 };
  if (type === 'percent_of_net') return { ...base('opt_in_share', 'Opt-In Share'), type, rate: 0.05, after: [], optIn: true };
  return { ...base('formula_line', 'Formula Line'), type, formula: '' };
}

/** A number input that lets the text be mid-edit ("0.", "") and commits only real numbers. */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  placeholder,
  allowEmpty = false,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  suffix?: string;
  prefix?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== (value ?? null)) setText(shown);
    // Only an outside change (load, discard) rewrites the text.
  }, [shown]);
  return (
    <UnderlineField label={label}>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-slate-400">{prefix}</span>}
        <input
          className={`${underlineControl} tabular-nums`}
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value.replace(/[$,\s%]/g, '');
            setText(next);
            if (next === '') {
              if (allowEmpty) onChange(null);
              return;
            }
            const parsed = Number(next);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
    </UnderlineField>
  );
}

export function TextField({ label, value, onChange, mono = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; mono?: boolean; readOnly?: boolean }) {
  return (
    <UnderlineField label={label}>
      <input className={`${underlineControl} ${mono ? 'font-mono' : ''} ${readOnly ? 'text-slate-500' : ''}`} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />
    </UnderlineField>
  );
}

export function MenuField({
  label,
  value,
  options,
  onChange,
  placeholder = '',
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <UnderlineField label={label}>
      <OptionMenu className={`${underlineControl} overview-field-select`} value={value} options={options} placeholder={placeholder} onChange={onChange} />
      <FieldChevron />
    </UnderlineField>
  );
}

export const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
