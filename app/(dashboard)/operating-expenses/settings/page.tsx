import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import { pageFrame } from '@/lib/page-frame';

export const metadata: Metadata = pageMetadata('Operating Expenses Settings');

export default function OperatingExpensesSettingsPage() {
  return (
    <div className={`${pageFrame} py-8`}>
      <h1 className="text-2xl font-bold mb-4">Operating Expenses Settings</h1>
      <p className="text-slate-500">Operating Expenses settings module coming soon.</p>
    </div>
  );
}
