'use client';

import React from 'react';

interface ReorderControlsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  size?: 'sm' | 'md';
  orientation?: 'vertical' | 'horizontal';
  upTooltip?: string;
  downTooltip?: string;
}

export function ReorderControls({
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  size = 'md',
  orientation = 'horizontal',
  upTooltip = 'Move Up',
  downTooltip = 'Move Down',
}: ReorderControlsProps) {
  const isSmall = size === 'sm';
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`inline-flex items-center bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-300/80 dark:border-slate-700/80 shadow-xs transition-colors ${
        isVertical ? 'flex-col p-0.5 gap-0.5' : 'flex-row p-0.5 gap-0.5'
      }`}
    >
      <button
        type="button"
        disabled={isFirst}
        onClick={onMoveUp}
        title={upTooltip}
        className={`${
          isSmall ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[10px]'
        } font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all`}
      >
        ▲
      </button>

      {/* Divider */}
      <div
        className={
          isVertical
            ? 'w-3 h-px bg-slate-200 dark:bg-slate-800'
            : 'h-3 w-px bg-slate-200 dark:bg-slate-800'
        }
      />

      <button
        type="button"
        disabled={isLast}
        onClick={onMoveDown}
        title={downTooltip}
        className={`${
          isSmall ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[10px]'
        } font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all`}
      >
        ▼
      </button>
    </div>
  );
}