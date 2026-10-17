import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Caps');

export default function CapsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
