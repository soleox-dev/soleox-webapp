import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Commission Rules');

export default function CommissionRulesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
