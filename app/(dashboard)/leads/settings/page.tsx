import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import { pageFrame } from '@/lib/page-frame';

export const metadata: Metadata = pageMetadata('Leads Settings');

export default function LeadsSettingsPage() {
  return (
    <div className={`${pageFrame} py-8`}>
      <h1 className="text-2xl font-bold mb-4">Leads Settings</h1>
      <p className="text-slate-500">Leads settings module coming soon.</p>
    </div>
  );
}
