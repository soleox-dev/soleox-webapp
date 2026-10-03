'use client';

import React, { useState, useEffect } from 'react';
import { formatPercentageClean, roundCurrency } from '../types';

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
    if (decimalPlaces != null) return Number(num).toFixed(decimalPlaces);
    if (isPercent) return formatPercentageClean(num);

    const formatted = num.toFixed(2);
    if (!useCommas) return formatted;

    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const [localStr, setLocalStr] = useState<string>(formatVal(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) setLocalStr(formatVal(value));
  }, [value, isPercent, useCommas, isFocused, decimalPlaces]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    let raw = e.target.value.replace(/,/g, '');
    const fractionLimit = decimalPlaces ?? (isPercent ? null : 2);

    if (fractionLimit != null && raw.includes('.')) {
      const [integer, decimals] = raw.split('.');
      if (decimals && decimals.length > fractionLimit) {
        raw = `${integer}.${decimals.slice(0, fractionLimit)}`;
      }
    }

    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setLocalStr(raw);
      let parsed = parseFloat(raw);

      if (!isNaN(parsed)) {
        if (isPercent || decimalPlaces != null) {
          onChange(parsed);
        } else {
          onChange(roundCurrency(parsed));
        }
      } else {
        onChange(0);
      }
    }
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
        : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder-slate-400 dark:placeholder-slate-500';

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
        setIsFocused(false);
        setLocalStr(formatVal(value));
      }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onClick={onClick}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`${colorStyles} ${className}`.trim()}
      disabled={disabled}
    />
  );
});