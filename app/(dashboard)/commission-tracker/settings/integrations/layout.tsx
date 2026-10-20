import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('TMS integrations');

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
