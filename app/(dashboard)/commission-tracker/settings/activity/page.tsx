'use client';

import React, { useEffect, useState } from 'react';
import { SettingsHeader, SETTINGS_CARD, SETTINGS_PRIMARY_BUTTON } from '@/components/settings/SettingsHeader';

interface AuditEvent {
  id: string;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

const when = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function ActivityPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/audit-events');
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.success === false) throw new Error(body.error || 'The activity log could not be loaded.');
        if (!cancelled) setEvents(Array.isArray(body.events) ? body.events : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The activity log could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs transition-colors dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5">
        <SettingsHeader
          title="Activity"
          description="Who changed a permission, a template, a transaction, or a sync, and who exported or deleted this brokerage’s data."
        />
      </div>
      {loading ? (
        <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">Loading activity…</p>
      ) : error ? (
        <p className="px-6 py-8 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : events.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {events.map((event) => (
            <li key={event.id} className="px-6 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{event.summary}</p>
                <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={event.created_at}>
                  {when.format(new Date(event.created_at))}
                </time>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.actor_email}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
