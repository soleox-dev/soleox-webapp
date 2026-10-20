import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Dropdown lists');

export default function ListsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
