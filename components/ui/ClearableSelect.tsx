'use client';

import React from 'react';
import { undoKeyAction, useUndoHistory } from '@/components/ui/undo-history';

type ClearableSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Value left behind by Delete or Backspace. Defaults to blank. */
  clearValue?: string;
  /** Insert a hidden blank so the closed control can display nothing. The menu does not list it. */
  allowBlank?: boolean;
};

function assignSelectValue(select: HTMLSelectElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, next);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

export const ClearableSelect = React.forwardRef<HTMLSelectElement, ClearableSelectProps>(
  function ClearableSelect(
    { onKeyDown, onChange, children, clearValue = '', allowBlank = true, value, ...props },
    ref,
  ) {
    const history = useUndoHistory();
    const current = value == null ? '' : String(value);

    return (
      <select
        {...props}
        ref={ref}
        value={value}
        onChange={(event) => {
          history.record(current, event.target.value);
          onChange?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.currentTarget.disabled) return;

          const action = undoKeyAction(event);
          if (action) {
            event.preventDefault();
            event.stopPropagation();
            const next = history.take(action, event.currentTarget.value);
            if (next === null) return;
            history.restoring.current = true;
            assignSelectValue(event.currentTarget, next);
            history.restoring.current = false;
            return;
          }

          if (event.key !== 'Backspace' && event.key !== 'Delete') return;
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.value === clearValue) return;
          assignSelectValue(event.currentTarget, clearValue);
        }}
      >
        {allowBlank && <option value="" hidden />}
        {children}
      </select>
    );
  },
);
