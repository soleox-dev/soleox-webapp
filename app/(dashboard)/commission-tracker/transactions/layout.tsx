import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Transactions');

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
