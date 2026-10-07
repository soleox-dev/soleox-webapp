import { Trash2 } from 'lucide-react';

export function TrashIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <Trash2 className={className} strokeWidth={1.75} aria-hidden />;
}
