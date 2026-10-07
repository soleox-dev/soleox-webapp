import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = pageMetadata('Goals Settings');

export default function GoalsSettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Goals Settings</h1>
      <p className="text-slate-500">Goals settings module coming soon.</p>
    </div>
  );
}
