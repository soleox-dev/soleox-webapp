'use client';

import React from 'react';
import { OptionMenu } from '@/components/ui/option-menu';
import { FieldChevron, UnderlineField, underlineControl } from '@/components/ui/underline-field';

/**
 * Several values picked from a list: each shows as a pill with a remove button, and the field's menu offers the
 * values not picked yet. A picked value that is no longer in the list stays, marked, until removed.
 */
export function PillMultiSelect({
  label,
  values,
  options,
  onChange,
  placeholder = 'Add…',
}: {
  label: React.ReactNode;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const known = new Set(options.map((option) => option.toLowerCase()));
  const remaining = options.filter((option) => !values.some((value) => value.toLowerCase() === option.toLowerCase()));
  return (
    <UnderlineField label={label}>
      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
        {values.map((value) => {
          const missing = !known.has(value.toLowerCase());
          return (
            <span
              key={value}
              title={missing ? `${value} is not one of the current options.` : undefined}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${missing ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-brand-500/10 text-brand-700 dark:text-brand-300'}`}
            >
              {value}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onChange(values.filter((item) => item !== value));
                }}
                className="cursor-pointer leading-none opacity-70 hover:opacity-100"
                aria-label={`Remove ${value}`}
                title={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {remaining.length > 0 && (
          <div className="relative min-w-[8rem] flex-1">
            <OptionMenu
              className={`${underlineControl} overview-field-select`}
              value=""
              placeholder={placeholder}
              options={remaining.map((option) => ({ value: option, label: option }))}
              onChange={(value) => value && onChange([...values, value])}
            />
            <FieldChevron />
          </div>
        )}
      </div>
    </UnderlineField>
  );
}
