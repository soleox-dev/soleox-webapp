import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import { pageFrame } from '@/lib/page-frame';

export const metadata: Metadata = pageMetadata('Operating Expenses');

export default function OperatingExpensesPage() {
  return (
    <div className={`${pageFrame} py-8`}>
      <h1 className="text-2xl font-bold mb-4">Operating Expenses</h1>
      <p className="text-slate-500">Operating Expenses module coming soon.</p>
    </div>
  );
}
