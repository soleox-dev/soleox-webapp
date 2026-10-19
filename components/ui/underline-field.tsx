import React from 'react';

export const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';

export const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';

/* Phones get 16px text so iOS does not zoom on focus. Desktop sizes sit under `md:`. */
const controlBase =
  'w-full border-0 bg-transparent p-0 text-base md:h-5 md:text-xs md:leading-4 font-medium text-slate-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed dark:text-white';

/** A control that keeps the browser's own placeholder tone. */
export const underlineControlPlain = controlBase;

export const underlineControl =
  `${controlBase} placeholder:text-slate-400 dark:placeholder:text-slate-500`;

/** Compact underline field for list filter rows. */
export const filterShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 px-2 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';

export const filterControl =
  'w-full border-0 bg-transparent p-0 text-base md:h-5 md:text-[11px] md:leading-4 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500';

export function FieldChevron() {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
    >
      <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UnderlineField({
  label,
  children,
  className = '',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`${underlineShell} ${className}`}>
      <span className={underlineLabel}>{label}</span>
      {children}
    </label>
  );
}
