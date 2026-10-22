import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Commission Plans');

export default function CommissionPlansLayout({ children }: { children: React.ReactNode }) {
  return children;
}
