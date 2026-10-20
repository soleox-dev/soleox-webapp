import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Fields');

export default function FieldsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
