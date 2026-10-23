'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** "1234567.5" → "1,234,567.5". Keeps a leading minus, a trailing point and typed decimals as they are. */
export function formatThousands(raw: string): string {
  const match = /^(-?)(\d*)(\.?\d*)$/.exec(raw);
  if (!match) return raw;
  const [, sign, integer, rest] = match;
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${rest}`;
}

/** The typed text without thousands commas (and without $ or spaces pasted with it). */
export function stripThousands(text: string): string {
  return text.replace(/[,\s$]/g, '');
}

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** The number as plain text (no commas), or a number. */
  value: string | number | null | undefined;
  /** Called with the typed number as plain text (no commas): "", "-", "12.", "1234.5". */
  onValueChange: (raw: string) => void;
  /** Digits allowed after the decimal point; omit for any. */
  decimals?: number;
  /** Whether a minus sign may be typed. */
  allowNegative?: boolean;
  /** No thousands commas: for years and postal codes. */
  plain?: boolean;
};

/**
 * A text box for amounts and counts that shows thousands commas while typing (1,234,567.89) and keeps the cursor
 * after the same digit as commas come and go. Not for years or postal codes, which never take commas.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, decimals, allowNegative = true, plain = false, inputMode = 'decimal', ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  // Digits (and point or minus) left of the cursor after the last edit, to put the cursor back after formatting.
  const caretTokens = useRef<number | null>(null);
  const raw = value === null || value === undefined ? '' : String(value);
  const shown = plain ? raw : formatThousands(raw);

  useLayoutEffect(() => {
    const input = innerRef.current;
    const tokens = caretTokens.current;
    if (!input || tokens === null || document.activeElement !== input) return;
    caretTokens.current = null;
    let position = 0;
    let seen = 0;
    while (position < shown.length && seen < tokens) {
      if (shown[position] !== ',') seen += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
  }, [shown]);

  return (
    <input
      {...rest}
      ref={(node) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      type="text"
      inputMode={inputMode}
      value={shown}
      onChange={(event) => {
        const typed = event.target.value;
        const caret = event.target.selectionStart ?? typed.length;
        let next = stripThousands(typed);
        const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
        if (!pattern.test(next)) return;
        if (decimals !== undefined && next.includes('.')) {
          const [integer, fraction] = next.split('.');
          if (decimals === 0) next = integer;
          else if (fraction.length > decimals) next = `${integer}.${fraction.slice(0, decimals)}`;
        }
        caretTokens.current = stripThousands(typed.slice(0, caret)).length;
        onValueChange(next);
      }}
    />
  );
});

/** Years and postal or zip codes are numbers people read digit by digit: they never take thousands commas. */
export function takesThousands(...names: Array<string | null | undefined>): boolean {
  return !names.some((name) => /year|zip|postal/i.test(String(name || '')));
}

const UNFINISHED = new Set(['', '-', '.', '-.']);

/**
 * NumberInput for a value kept as a number: it holds the typed text (so "12." or "-" can be typed) and reports
 * the number, or undefined while the box is empty. An outside change (load, discard) rewrites the text.
 */
export function NumberValueInput({
  value,
  onNumberChange,
  ...rest
}: Omit<NumberInputProps, 'value' | 'onValueChange'> & {
  value: number | string | null | undefined;
  onNumberChange: (value: number | undefined) => void;
}) {
  const outside = value === null || value === undefined || value === '' ? '' : String(value);
  const [text, setText] = useState(outside);
  useEffect(() => {
    const typed = UNFINISHED.has(text) ? '' : String(Number(text));
    const current = outside === '' ? '' : String(Number(outside));
    if (typed !== current) setText(outside);
  }, [outside]);
  return (
    <NumberInput
      {...rest}
      value={text}
      onValueChange={(raw) => {
        setText(raw);
        if (UNFINISHED.has(raw)) {
          onNumberChange(undefined);
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onNumberChange(parsed);
      }}
    />
  );
}
