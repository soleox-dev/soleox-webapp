import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Activity');

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
