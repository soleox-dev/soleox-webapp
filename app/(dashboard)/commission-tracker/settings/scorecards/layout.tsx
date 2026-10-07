import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Transactions: Scorecards');

export default function ScorecardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
