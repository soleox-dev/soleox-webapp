import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Agent Allocations');

export default function AgentAllocationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
