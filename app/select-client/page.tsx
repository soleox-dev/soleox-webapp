'use client';

import React from 'react';
import { useAccess } from '@/components/access-provider';

export default function SelectClientPage() {
  const { access, loading, chooseClient } = useAccess();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');

  const choose = async (clientId: string) => {
    setError('');
    setPending(clientId);
    try {
      await chooseClient(clientId);
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : 'Could not open that client.');
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16 md:px-6">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Soleox</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Choose a Client</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        This account can work in more than one client. Choose one to continue. You can switch later without signing out.
      </p>
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading clients…</p>}
        {!loading && access?.clients.map((client) => (
          <button
            key={client.id}
            type="button"
            disabled={pending !== null}
            onClick={() => choose(client.id)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 cursor-pointer"
          >
            <span>{client.name}</span>
            <span className="text-[11px] font-medium text-slate-400">{pending === client.id ? 'Opening…' : client.id}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
