import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import OwnerReportsPage from './reports-client';

export const metadata: Metadata = pageMetadata('Owner Reports');

export default function OwnerReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OwnerReportsPage />
      {children}
    </>
  );
}
