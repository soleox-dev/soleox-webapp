import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import { widePageFrame } from '@/lib/page-frame';

export const metadata: Metadata = pageMetadata('Agent Reports');

export default function AgentReportsPage() {
  return (
    <div className={`${widePageFrame} py-8`}>
      <h1 className="text-2xl font-bold mb-4">Agent Reports</h1>
      <p className="text-slate-500">Agent Reports are not ready yet.</p>
    </div>
  );
}
