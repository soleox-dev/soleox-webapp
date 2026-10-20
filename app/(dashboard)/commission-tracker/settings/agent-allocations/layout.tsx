import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Agent allocations');

export default function AgentAllocationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
