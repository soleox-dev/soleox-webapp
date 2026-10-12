import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Office Reports');

export default function OfficeReportsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Office Reports</h1>
      <p className="text-slate-500">Office Reports are not ready yet.</p>
    </div>
  );
}
