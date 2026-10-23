'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { AccessProfile } from '@/lib/access';

type ClientMismatch = { clientId: string; clientName: string };

type AccessContextValue = {
  access: AccessProfile | null;
  loading: boolean;
  /** Makes a client active. `stay` keeps this page (Switch Back) instead of going to the home page. */
  chooseClient: (clientId: string, options?: { stay?: boolean }) => Promise<void>;
  /** Another tab switched the browser's client away from the one this tab shows; this tab must reload first. */
  clientMismatch: ClientMismatch | null;
};

const AccessContext = createContext<AccessContextValue>({
  access: null,
  loading: true,
  chooseClient: async () => {},
  clientMismatch: null,
});

/** Tabs tell each other when the client changes. The active client is one cookie shared by every tab. */
const CLIENT_CHANNEL = 'soleox-client';

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [access, setAccess] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientMismatch, setClientMismatch] = useState<ClientMismatch | null>(null);
  // The client this tab loaded. Requests carry the shared cookie, so after a switch in another tab this tab's next
  // request would act on the other client.
  const tabClient = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setAccess(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch('/api/access')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load access.');
        const body = await response.json();
        if (cancelled) return;
        const loaded = body.access as AccessProfile;
        setAccess(loaded);
        if (loaded?.clientId) tabClient.current = { id: loaded.clientId, name: loaded.clientName || loaded.clientId };
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // A switch in another tab: told right away when the browser supports it, and checked again whenever this tab
  // comes back into view (covers older browsers and a client the server changed on its own).
  useEffect(() => {
    if (status !== 'authenticated') return;
    const compare = (clientId: string | null | undefined, clientName: string | null | undefined) => {
      const mine = tabClient.current;
      if (!mine || !clientId) return;
      setClientMismatch(clientId === mine.id ? null : { clientId, clientName: clientName || clientId });
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CLIENT_CHANNEL);
      channel.onmessage = (event: MessageEvent<{ clientId?: string; clientName?: string }>) => compare(event.data?.clientId, event.data?.clientName);
    } catch {
      channel = null;
    }
    let checking = false;
    const recheck = async () => {
      if (document.visibilityState !== 'visible' || checking || !tabClient.current) return;
      checking = true;
      try {
        const response = await fetch('/api/access', { cache: 'no-store' });
        if (response.ok) {
          const body = await response.json();
          compare(body.access?.clientId, body.access?.clientName);
        }
      } catch {
        // Offline: checked again next time.
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { void recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      channel?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [status]);

  const chooseClient = async (clientId: string, options: { stay?: boolean } = {}) => {
    const response = await fetch('/api/access/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not switch client.');
    const next = body.access as AccessProfile;
    setAccess(next);
    // This tab now shows that client, so the message to the other tabs does not warn this one.
    tabClient.current = { id: next?.clientId || clientId, name: next?.clientName || clientId };
    setClientMismatch(null);
    try {
      const channel = new BroadcastChannel(CLIENT_CHANNEL);
      channel.postMessage({ clientId: next?.clientId || clientId, clientName: next?.clientName || clientId });
      channel.close();
    } catch {
      // Other tabs notice when they come back into view.
    }
    if (!options.stay) window.location.assign('/');
  };

  return (
    <AccessContext.Provider value={{ access, loading, chooseClient, clientMismatch }}>
      {children}
      {clientMismatch && tabClient.current ? (
        <ClientSwitchedNotice
          shown={tabClient.current.name}
          active={clientMismatch.clientName}
          onSwitchBack={() => void chooseClient(tabClient.current?.id || '', { stay: true })}
        />
      ) : null}
    </AccessContext.Provider>
  );
}

/**
 * Where this tab goes in the new client: the same page, except a page for one record (a transaction, a template),
 * which the new client does not have; that goes to its list (/commission-tracker/transactions/TXN_… → Transactions).
 */
function pageInNewClient(pathname: string): { path: string; listName: string | null } {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  // Record IDs are PREFIX_<hex> (ARCHITECTURE.md); `new` is a record being created.
  if (parts.length > 1 && (/^[A-Z]{2,6}_[0-9A-F]{6,}$/i.test(last) || last === 'new')) {
    const list = parts.slice(0, -1);
    const name = (list[list.length - 1] || '').split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return { path: `/${list.join('/')}`, listName: name || null };
  }
  return { path: `${pathname}${window.location.search}`, listName: null };
}

/**
 * Covers the page when another tab switched the client, so nothing here is saved or loaded for the wrong client.
 * Reload continues in the client now active; Switch Back makes this tab's client active again (the other tab then
 * shows this notice).
 */
function ClientSwitchedNotice({ shown, active, onSwitchBack }: { shown: string; active: string; onSwitchBack: () => void }) {
  const target = pageInNewClient(window.location.pathname);
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="client-switched-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 id="client-switched-title" className="text-lg font-semibold text-slate-900 dark:text-white">Client Changed in Another Tab</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          This tab shows <span className="font-semibold">{shown}</span>, but another tab switched to <span className="font-semibold">{active}</span>. Every tab
          shares one active client, so reload this tab before working here, to keep anything from being saved to the wrong client.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onSwitchBack}
            className="h-9 cursor-pointer rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Switch Back to {shown}
          </button>
          <button
            type="button"
            onClick={() => window.location.assign(target.path)}
            className="h-9 cursor-pointer rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            {target.listName ? `Open ${target.listName} in ${active}` : `Reload in ${active}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}
