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
  allowEmpty?: boolean;
}

export function DecimalInput({
  value,
  onChange,
  isPercent = false,
  useCommas = false,
  className = '',
  placeholder = '0.00',
  onKeyDown,
  disabled = false,
  colorCode = false,
  allowEmpty = false,
}: DecimalInputProps) {
  const formatVal = (num: number) => {
    if (num === null || num === undefined || isNaN(num)) return '';
    if (allowEmpty && num === 0) return '';
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
  }, [value, isPercent, useCommas, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    let raw = e.target.value.replace(/,/g, '');

    if (!isPercent && raw.includes('.')) {
      const [integer, decimals] = raw.split('.');
      if (decimals && decimals.length > 2) {
        raw = `${integer}.${decimals.slice(0, 2)}`;
      }
    }

    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setLocalStr(raw);
      let parsed = parseFloat(raw);

      if (!isNaN(parsed)) {
        if (isPercent) {
          onChange(parsed);
        } else {
          onChange(roundCurrency(parsed));
        }
      } else {
        onChange(0);
      }
    }
  };

  const colorStyles = colorCode
    ? isPercent
      ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder-slate-400 dark:placeholder-slate-500'
      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder-slate-400 dark:placeholder-slate-500'
    : '';

  return (
    <input
      type="text"
      value={localStr}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        setLocalStr(formatVal(value));
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`${colorStyles} ${className}`.trim()}
      disabled={disabled}
    />
  );
}