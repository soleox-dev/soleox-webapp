import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Agents');

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
