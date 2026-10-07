import { Minus, Plus } from 'lucide-react';

export function SectionCollapseButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = collapsed ? Plus : Minus;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? 'Expand Section' : 'Collapse Section'}
      aria-label={collapsed ? 'Expand Section' : 'Collapse Section'}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 cursor-pointer"
    >
      <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
