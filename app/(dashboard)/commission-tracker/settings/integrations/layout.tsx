import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('TMS Integrations');

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
