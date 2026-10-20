import React from 'react';
import { SectionIcon } from './SectionIcon';

export type TransactionSectionId = 'overview' | 'commission' | 'disbursements';

export interface TransactionSectionLink {
  id: TransactionSectionId;
  label: string;
  count: number;
  /** Read out with the count, such as "37 fields". */
  countNoun: string;
}

/** Jumps to a Transaction Detail section and marks the one in view. */
export function SectionLinks({
  sections,
  active,
  onSelect,
}: {
  sections: TransactionSectionLink[];
  active: TransactionSectionId;
  onSelect: (id: TransactionSectionId) => void;
}) {
  return (
    <nav aria-label="Transaction sections" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {sections.map((section) => {
        const isActive = section.id === active;
        const description = `${section.label}: ${section.count} ${section.countNoun}`;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? 'true' : undefined}
            aria-label={description}
            title={description}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition ${
              isActive
                ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <SectionIcon name={section.id} className="h-3.5 w-3.5" />
            <span>{section.label}</span>
            <span className={`text-[10px] font-bold tabular-nums ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {section.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
