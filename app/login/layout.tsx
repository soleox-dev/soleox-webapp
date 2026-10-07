import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Sign In');

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
