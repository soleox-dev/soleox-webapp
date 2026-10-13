'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { AccessProfile } from '@/lib/access';

type AccessContextValue = {
  access: AccessProfile | null;
  loading: boolean;
  chooseClient: (clientId: string) => Promise<void>;
};

const AccessContext = createContext<AccessContextValue>({
  access: null,
  loading: true,
  chooseClient: async () => {},
});

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [access, setAccess] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (!cancelled) setAccess(body.access as AccessProfile);
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

  const chooseClient = async (clientId: string) => {
    const response = await fetch('/api/access/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not switch client.');
    setAccess(body.access as AccessProfile);
    window.location.assign('/');
  };

  return (
    <AccessContext.Provider value={{ access, loading, chooseClient }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}
