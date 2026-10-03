'use client';

import React, { useEffect, useRef, useState } from 'react';

type NativeDateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const TRIPLE_CLICK_MS = 500;

function assignInputValue(input: HTMLInputElement, next: string) {
  const tracker = (input as HTMLInputElement & { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
  tracker?.setValue(input.value);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export const NativeDateInput = React.forwardRef<HTMLInputElement, NativeDateInputProps>(
  function NativeDateInput({ className, onClick, onKeyDown, onBlur, disabled, readOnly, ...props }, ref) {
    const [allSelected, setAllSelected] = useState(false);
    const allSelectedRef = useRef(false);
    const clicks = useRef({ count: 0, time: 0 });

    const selectAll = () => {
      allSelectedRef.current = true;
      setAllSelected(true);
    };
    const clearSelection = () => {
      allSelectedRef.current = false;
      setAllSelected(false);
    };

    useEffect(() => {
      clearSelection();
    }, [props.value]);

    return (
      <input
        {...props}
        ref={ref}
        type="date"
        disabled={disabled}
        readOnly={readOnly}
        className={`${className ?? ''} ${allSelected ? 'date-all-selected' : ''}`.trim()}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled || readOnly) return;
          const now = event.timeStamp;
          clicks.current.count = now - clicks.current.time < TRIPLE_CLICK_MS ? clicks.current.count + 1 : 1;
          clicks.current.time = now;
          if (event.detail >= 3 || clicks.current.count >= 3) {
            clicks.current.count = 0;
            selectAll();
            return;
          }
          clearSelection();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || disabled || readOnly || !allSelectedRef.current) return;
          if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            event.stopPropagation();
            clearSelection();
            if (event.currentTarget.value !== '') assignInputValue(event.currentTarget, '');
            return;
          }
          if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt') return;
          clearSelection();
        }}
        onBlur={(event) => {
          clearSelection();
          onBlur?.(event);
        }}
      />
    );
  },
);
