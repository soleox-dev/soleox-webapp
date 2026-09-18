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
}: DecimalInputProps) {
  const formatVal = (num: number) => {
    if (num === null || num === undefined || isNaN(num)) return '';
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
          const cleanRate = parsed > 100 ? 1.0 : parsed > 1 ? parsed / 100 : parsed;
          onChange(cleanRate);
        } else {
          onChange(roundCurrency(parsed));
        }
      } else {
        onChange(0);
      }
    }
  };

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
      className={className}
      disabled={disabled}
    />
  );
}