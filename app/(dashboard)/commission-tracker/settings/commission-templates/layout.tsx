import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Commission templates');

export default function CommissionTemplatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
