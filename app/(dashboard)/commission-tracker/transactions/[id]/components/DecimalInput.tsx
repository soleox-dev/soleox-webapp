'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PERCENT_POINT_DECIMALS, roundPercentPoints } from '@/lib/percent';
import { evaluateArithmetic, isArithmeticExpression, mayBeArithmetic, percentPointsFromArithmetic } from '@/lib/arithmetic';
import { formatPercentageClean, roundCurrency } from '../types';
import { undoKeyAction, useUndoHistory } from '@/components/ui/undo-history';

interface DecimalInputProps {
  value: number;
  onChange: (val: number) => void;
  isPercent?: boolean;
  useCommas?: boolean;
  className?: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  colorCode?: boolean;
  filled?: boolean;
  invalid?: boolean;
  allowEmpty?: boolean;
  decimalPlaces?: number;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLInputElement>) => void;
  onMouseUp?: (event: React.MouseEvent<HTMLInputElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
}

export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput({
  value,
  onChange,
  isPercent = false,
  useCommas = false,
  className = '',
  placeholder = '0.00',
  onKeyDown,
  disabled = false,
  colorCode = false,
  filled = false,
  invalid = false,
  allowEmpty = false,
  decimalPlaces,
  onFocus,
  onMouseDown,
  onMouseUp,
  onClick,
}, ref) {
  const formatVal = (num: number) => {
    if (num === null || num === undefined || isNaN(num)) return '';
    if (allowEmpty && num === 0) return '';
    if (isPercent) return formatPercentageClean(num);
    if (decimalPlaces != null) return Number(num).toFixed(decimalPlaces);

    const formatted = num.toFixed(2);
    if (!useCommas) return formatted;

    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const [localStr, setLocalStr] = useState<string>(formatVal(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const history = useUndoHistory();
  const lastEmitted = useRef(value);

  const emit = (raw: string) => {
    const parsed = parseFloat(raw.replace(/[$,%\s]/g, ''));
    if (!isNaN(parsed)) {
      const next = isPercent || decimalPlaces != null ? parsed : roundCurrency(parsed);
      lastEmitted.current = next;
      onChange(next);
      return;
    }
    lastEmitted.current = 0;
    onChange(0);
  };

  useEffect(() => {
    if (isFocused) return;
    setLocalStr(formatVal(value));
    if (value !== lastEmitted.current) {
      history.reset();
      lastEmitted.current = value;
    }
  }, [value, isPercent, useCommas, isFocused, decimalPlaces, allowEmpty]);

  // A calculation ("60/70", "1500*2") is held as typed and worked out on Enter or when the field is left; until
  // then nothing is sent. A result that cannot be worked out puts the last value back.
  const commitExpression = (): number | null => {
    if (!isArithmeticExpression(localStr)) return null;
    const result = isPercent ? percentPointsFromArithmetic(localStr) : evaluateArithmetic(localStr);
    if (result === null) return null;
    const next = isPercent ? roundPercentPoints(result) : decimalPlaces != null ? Number(result.toFixed(decimalPlaces)) : roundCurrency(result);
    history.record(localStr, formatVal(next));
    lastEmitted.current = next;
    onChange(next);
    return next;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (isArithmeticExpression(e.target.value) && mayBeArithmetic(e.target.value)) {
      history.record(localStr, e.target.value);
      setLocalStr(e.target.value);
      return;
    }
    let raw = e.target.value.replace(/,/g, '');
    const fractionLimit = isPercent ? PERCENT_POINT_DECIMALS : (decimalPlaces ?? 2);

    if (fractionLimit != null && raw.includes('.')) {
      const [integer, decimals] = raw.split('.');
      if (decimals && decimals.length > fractionLimit) {
        raw = `${integer}.${decimals.slice(0, fractionLimit)}`;
      }
    }

    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      history.record(localStr, raw);
      setLocalStr(raw);
      emit(raw);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !disabled && isArithmeticExpression(localStr)) {
      event.preventDefault();
      const next = commitExpression();
      setLocalStr(formatVal(next ?? value));
      return;
    }
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const action = undoKeyAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const next = history.take(action, localStr);
    if (next === null) return;
    history.restoring.current = true;
    setLocalStr(next);
    emit(next);
    history.restoring.current = false;
  };

  const colorStyles = invalid
    ? filled
      ? 'text-rose-600 dark:text-rose-400 placeholder-rose-300 dark:placeholder-rose-500'
      : 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-700/80 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 placeholder-rose-300 dark:placeholder-rose-500'
    : !colorCode
    ? ''
    : filled
      ? isPercent
        ? 'text-blue-600 dark:text-blue-400 placeholder-slate-400 dark:placeholder-slate-500'
        : 'text-emerald-600 dark:text-emerald-400 placeholder-slate-400 dark:placeholder-slate-500'
      : isPercent
        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder-slate-400 dark:placeholder-slate-500'
        : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/80 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder-slate-400 dark:placeholder-slate-500';

  return (
    <input
      ref={ref}
      type="text"
      value={localStr}
      onChange={handleChange}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={() => {
        const computed = commitExpression();
        const formatted = formatVal(computed ?? value);
        if (formatted !== localStr) history.record(localStr, formatted);
        setIsFocused(false);
        setLocalStr(formatted);
      }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={`${colorStyles} ${className}`.trim()}
      disabled={disabled}
    />
  );
});