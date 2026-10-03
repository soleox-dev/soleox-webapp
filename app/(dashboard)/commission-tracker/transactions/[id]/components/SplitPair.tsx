import React, { useEffect, useRef, useState } from 'react';
import { roundCurrency } from '../types';
import { DecimalInput } from './DecimalInput';

type SplitKind = 'PERCENT' | 'AMOUNT';

interface SplitPairProps {
  isEditing: boolean;
  type: SplitKind;
  percentPoints: number;
  dollarAmount: number;
  onPercentChange: (value: number) => void;
  onAmountChange: (value: number) => void;
  preventMinus: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  deduction?: boolean;
  compact?: boolean;
  beforePercent?: React.ReactNode;
  invalid?: boolean;
  locked?: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function storedFromPoints(points: number) {
  if (!points) return 0;
  return points > 1 ? points : points / 100;
}

export function SplitPair({
  isEditing,
  type,
  percentPoints,
  dollarAmount,
  onPercentChange,
  onAmountChange,
  preventMinus,
  deduction = false,
  compact = false,
  beforePercent,
  invalid = false,
  locked = false,
}: SplitPairProps) {
  const amountBased = type === 'AMOUNT';
  const percentBox = compact ? 'w-[6.25rem]' : 'w-[6.75rem]';
  const dollarBox = compact ? 'w-[6.5rem]' : 'w-[7.25rem]';
  const dollarPrefix = deduction ? '-$' : '$';
  const boxChrome = 'h-7 border-t-0 border-x-0 border-b rounded-t-md px-2 text-xs text-right font-semibold focus:outline-none transition-colors duration-150 shrink-0';
  const quietInput = 'h-7 border-0 bg-transparent text-xs text-right font-semibold focus:outline-none shrink-0';
  const quietField = 'underline-field rounded-t-md border-b border-b-slate-300 transition-colors dark:border-b-slate-600 focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)]';
  const invalidField = 'rounded-t-md border-b border-b-rose-400 bg-rose-50 transition-colors dark:border-b-rose-500 dark:bg-rose-950/40 focus-within:border-b-rose-600 focus-within:shadow-[0_1px_0_rgb(225_29_72/0.45),0_6px_12px_-6px_rgb(225_29_72/0.8)]';
  const shownPercent = amountBased || !percentPoints
    ? Number(percentPoints || 0)
    : (percentPoints > 1 ? percentPoints : percentPoints * 100);
  const percentRef = useRef<HTMLInputElement>(null);
  const dollarRef = useRef<HTMLInputElement>(null);
  const selectUntil = useRef(0);
  const selectDollarUntil = useRef(0);
  const [suffixHover, setSuffixHover] = useState(false);

  const activatePercent = () => {
    if (!amountBased) return;
    selectUntil.current = Date.now() + 400;
    onPercentChange(storedFromPoints(Number(percentPoints) || 0));
  };

  const keepCalculatedSelection = () => {
    if (Date.now() > selectUntil.current) return;
    percentRef.current?.select();
  };

  const keepDollarSelection = () => {
    if (Date.now() > selectDollarUntil.current) return;
    dollarRef.current?.select();
  };

  useEffect(() => {
    if (amountBased || selectUntil.current < Date.now()) return;
    const input = percentRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [amountBased, shownPercent]);

  useEffect(() => {
    if (!amountBased || selectDollarUntil.current < Date.now()) return;
    const input = dollarRef.current;
    if (!input) return;
    input.focus();
    const select = () => {
      if (Date.now() > selectDollarUntil.current) return;
      dollarRef.current?.select();
    };
    select();
    const frame = requestAnimationFrame(select);
    const timer = window.setTimeout(select, 0);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [amountBased, dollarAmount]);

  if (locked) {
    const lockedBox = 'bg-slate-200 text-slate-600 border-b-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-b-slate-600';
    const [amountInteger, amountFraction] = (dollarAmount || 0).toFixed(2).split('.');
    const amountText = `${amountInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${amountFraction}`;
    return (
      <div className={`flex items-center gap-1.5 ${compact ? 'w-full justify-end' : ''}`} aria-readonly="true">
        <span className={`${percentBox} relative inline-flex shrink-0 items-center`}>
          <span className={`flex w-full items-center justify-end pr-6 ${boxChrome} ${lockedBox}`}>
            {shownPercent.toFixed(2)}
          </span>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            %
          </span>
        </span>
        <span className={`${dollarBox} relative inline-flex shrink-0`}>
          <span className={`flex w-full items-center justify-end ${boxChrome} ${lockedBox} ${deduction ? 'pl-7' : 'pl-5'}`}>
            {amountText}
          </span>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            {dollarPrefix}
          </span>
        </span>
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div className={`flex items-center justify-end ${compact ? 'w-full gap-1.5' : 'gap-3'}`}>
        {compact ? (
          <span className={`${percentBox} shrink-0 text-right text-xs font-semibold ${invalid ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {!amountBased && `(${shownPercent.toFixed(2)}%)`}
          </span>
        ) : !amountBased ? (
          <span className={`text-xs font-semibold whitespace-nowrap ${invalid ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}>
            ({shownPercent.toFixed(2)}%)
          </span>
        ) : null}
        <span className={`${compact ? `${dollarBox} shrink-0 pr-2 text-xs` : 'text-sm'} text-right font-bold whitespace-nowrap ${invalid ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {deduction ? '-' : ''}{formatCurrency(dollarAmount)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'w-full justify-end' : ''}`}>
      <span className={compact ? `${percentBox} shrink-0 inline-flex items-center justify-end gap-0.5` : 'inline-flex items-center gap-0.5'}>
      {beforePercent}
      <span
        title={amountBased ? 'Click to enter a percentage' : 'Percent'}
        className={`group/percent relative inline-flex transition-all duration-150 ${invalid && !amountBased ? invalidField : quietField} ${amountBased ? 'w-8 shrink-0' : compact ? (beforePercent ? 'min-w-0 flex-1' : 'w-full') : percentBox}`}
      >
        <DecimalInput
          key={type}
          ref={percentRef}
          value={amountBased ? 0 : shownPercent}
          onChange={(points) => onPercentChange(storedFromPoints(points))}
          isPercent={!amountBased && !suffixHover}
          decimalPlaces={amountBased ? undefined : 2}
          colorCode={!amountBased && !suffixHover}
          invalid={invalid && !amountBased}
          filled
          allowEmpty
          onKeyDown={preventMinus}
          onMouseDown={(event) => {
            if (!amountBased) return;
            event.preventDefault();
            activatePercent();
          }}
          onFocus={() => {
            if (amountBased) activatePercent();
          }}
          onMouseUp={keepCalculatedSelection}
          onClick={keepCalculatedSelection}
          placeholder={amountBased ? '' : '0.00'}
          className={`w-full ${quietInput} ${
            amountBased
              ? 'px-0 cursor-pointer text-slate-400 dark:text-slate-500'
              : suffixHover
                ? 'px-2 pr-6 text-slate-400 dark:text-slate-500'
                : 'px-2 pr-6'
          }`}
        />
        {amountBased ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400 dark:text-slate-500"
          >
            %
          </span>
        ) : (
          <button
            type="button"
            title="Switch back to amount"
            aria-label="Switch back to amount"
            onMouseEnter={() => setSuffixHover(true)}
            onMouseLeave={() => setSuffixHover(false)}
            onMouseDown={(event) => {
              event.preventDefault();
              setSuffixHover(false);
              selectDollarUntil.current = Date.now() + 400;
              onAmountChange(roundCurrency(dollarAmount || 0));
            }}
            className={`absolute inset-y-0 right-0 flex w-6 items-center justify-center text-xs font-semibold cursor-pointer ${
              suffixHover ? 'text-slate-400 dark:text-slate-500' : invalid ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
            }`}
          >
            %
          </button>
        )}
      </span>
      </span>
      <span title="Amount" className={`relative inline-flex shrink-0 ${invalid && amountBased ? invalidField : quietField}`}>
        <DecimalInput
          ref={dollarRef}
          value={dollarAmount || 0}
          onChange={onAmountChange}
          useCommas
          colorCode
          invalid={invalid && amountBased}
          filled
          allowEmpty
          onKeyDown={preventMinus}
          onMouseUp={keepDollarSelection}
          onClick={keepDollarSelection}
          placeholder="0.00"
          className={`${dollarBox} ${quietInput} ${deduction ? 'pl-7 pr-2' : 'pl-5 pr-2'}`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs font-semibold ${invalid && amountBased ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {dollarPrefix}
        </span>
      </span>
    </div>
  );
}
