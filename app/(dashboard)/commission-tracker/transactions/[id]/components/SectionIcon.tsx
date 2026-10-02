import { Droplet, HandCoins, House, type LucideIcon } from 'lucide-react';

const sectionIcons = {
  overview: House,
  commission: Droplet,
  disbursements: HandCoins,
} as const satisfies Record<string, LucideIcon>;

export function SectionIcon({
  name,
  className = 'w-5 h-5',
}: {
  name: 'overview' | 'commission' | 'disbursements';
  className?: string;
}) {
  const Icon = sectionIcons[name];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
