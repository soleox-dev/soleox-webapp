'use client';

import { signOut } from 'next-auth/react';

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Soleox</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">No access</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        This account cannot open that part of Soleox. Ask an administrator for the permission, or sign in with a different account.
      </p>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="mt-6 w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
      >
        Sign out
      </button>
    </main>
  );
}
