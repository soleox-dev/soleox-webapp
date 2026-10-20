import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Commission template');

export default function CommissionTemplateDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
