'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UnsavedChangesModal } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/UnsavedChangesModal';

export type SaveRegistration = {
  id: string;
  /** True while that Save button is visible and enabled, or its save is in progress. */
  active: boolean;
  saving?: boolean;
  onSave: () => Promise<boolean> | boolean;
  onDiscard?: () => void;
};

type SaveLeaveContextValue = {
  register: (registration: SaveRegistration) => void;
  unregister: (id: string) => void;
  requestLeave: (navigate: () => void) => void;
};

const SaveLeaveContext = createContext<SaveLeaveContextValue | null>(null);

function anyActive(registrations: Map<string, SaveRegistration>) {
  for (const registration of registrations.values()) {
    if (registration.active) return true;
  }
  return false;
}

export function useRegisterSave(registration: SaveRegistration) {
  const context = useContext(SaveLeaveContext);
  const saveRef = useRef(registration.onSave);
  const discardRef = useRef(registration.onDiscard);
  saveRef.current = registration.onSave;
  discardRef.current = registration.onDiscard;

  useEffect(() => {
    if (!context) return;
    context.register({
      id: registration.id,
      active: registration.active,
      saving: registration.saving,
      onSave: () => saveRef.current(),
      onDiscard: () => discardRef.current?.(),
    });
  }, [context, registration.id, registration.active, registration.saving]);

  useEffect(() => {
    if (!context) return;
    return () => context.unregister(registration.id);
  }, [context, registration.id]);
}

export function useRequestLeave() {
  const context = useContext(SaveLeaveContext);
  return context?.requestLeave ?? ((navigate: () => void) => navigate());
}

export function SaveLeaveGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const registrations = useRef(new Map<string, SaveRegistration>());
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [leavingSave, setLeavingSave] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const publish = () => setRevision((current) => current + 1);

  const register = useCallback((registration: SaveRegistration) => {
    const previous = registrations.current.get(registration.id);
    registrations.current.set(registration.id, registration);
    if (!previous || previous.active !== registration.active || previous.saving !== registration.saving) publish();
  }, []);

  const unregister = useCallback((id: string) => {
    const previous = registrations.current.get(id);
    if (!previous) return;
    registrations.current.delete(id);
    if (previous.active) publish();
  }, []);

  const requestLeave = useCallback((navigate: () => void) => {
    if (!anyActive(registrations.current)) {
      navigate();
      return;
    }
    pending.current = navigate;
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ register, unregister, requestLeave }), [register, unregister, requestLeave]);
  const blocked = anyActive(registrations.current);
  const saving = leavingSave || [...registrations.current.values()].some((registration) => registration.active && registration.saving);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!anyActive(registrations.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [revision]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!anyActive(registrations.current) || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      pending.current = () => router.push(`${url.pathname}${url.search}${url.hash}`);
      setOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router, revision]);

  useEffect(() => {
    if (!blocked) return;
    let released = false;
    const pushGuard = () => window.history.pushState({ soleoxSaveGuard: true }, '');
    pushGuard();
    const onPopState = () => {
      if (released) return;
      pushGuard();
      if (openRef.current) return;
      pending.current = () => {
        released = true;
        window.history.go(-2);
      };
      setOpen(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      released = true;
      window.removeEventListener('popstate', onPopState);
    };
  }, [blocked]);

  const stay = () => {
    pending.current = null;
    setOpen(false);
  };

  const discard = () => {
    const active = [...registrations.current.values()].filter((registration) => registration.active);
    for (const registration of active) registration.onDiscard?.();
    const navigate = pending.current;
    pending.current = null;
    setOpen(false);
    navigate?.();
  };

  const saveAndLeave = async () => {
    setLeavingSave(true);
    try {
      const active = [...registrations.current.values()].filter((registration) => registration.active);
      for (const registration of active) {
        const saved = await registration.onSave();
        if (!saved) {
          setOpen(false);
          return;
        }
      }
      const navigate = pending.current;
      pending.current = null;
      setOpen(false);
      navigate?.();
    } finally {
      setLeavingSave(false);
    }
  };

  return (
    <SaveLeaveContext.Provider value={value}>
      {children}
      <UnsavedChangesModal
        isOpen={open}
        isSaving={saving}
        description="These changes are not saved. Save them, discard them, or stay on this page."
        onStay={stay}
        onDiscard={discard}
        onSave={() => void saveAndLeave()}
      />
    </SaveLeaveContext.Provider>
  );
}
