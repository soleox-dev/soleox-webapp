'use client';

import React from 'react';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { undoKeyAction, useUndoHistory } from '@/components/ui/undo-history';

type UndoableDateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

export function UndoableDateInput({ value, onChange, onKeyDown, disabled, ...props }: UndoableDateInputProps) {
  const history = useUndoHistory();

  return (
    <NativeDateInput
      {...props}
      disabled={disabled}
      value={value}
      onChange={(event) => {
        history.record(value, event.target.value);
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled) return;
        const action = undoKeyAction(event);
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        const next = history.take(action, value);
        if (next !== null) onChange(next);
      }}
    />
  );
}
