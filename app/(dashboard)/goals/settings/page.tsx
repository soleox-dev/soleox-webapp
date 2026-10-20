import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-titles';
import { pageFrame } from '@/lib/page-frame';

export const metadata: Metadata = pageMetadata('Goals settings');

export default function GoalsSettingsPage() {
  return (
    <div className={`${pageFrame} py-8`}>
      <h1 className="text-2xl font-bold mb-4">Goals settings</h1>
      <p className="text-slate-500">Goals settings module coming soon.</p>
    </div>
  );
}
