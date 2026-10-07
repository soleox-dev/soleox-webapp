import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Transactions: Default View');

export default function TransactionViewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
