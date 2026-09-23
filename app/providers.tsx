'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  /** User preference: light, dark, or follow system. */
  theme: ThemePreference;
  /** Effective theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'soleox-theme';

function getSystemIsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return getSystemIsDark() ? 'dark' : 'light';
  }
  return preference;
}

function applyResolvedTheme(resolved: ResolvedTheme, animate = true) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = resolved === 'dark';

  const commit = () => {
    root.classList.remove('theme-transition');
    root.classList.toggle('dark', dark);
    root.style.backgroundColor = dark ? '#0f172a' : '#f1f5f9';
    root.style.colorScheme = dark ? 'dark' : 'light';
  };

  const startViewTransition = (document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  }).startViewTransition;

  if (!animate || reduceMotion || typeof startViewTransition !== 'function') {
    commit();
    return;
  }

  try {
    startViewTransition.call(document, commit);
  } catch {
    commit();
  }
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    typeof window !== 'undefined' ? resolveTheme(readStoredPreference()) : 'light'
  );

  const applyPreference = (preference: ThemePreference, animate = true) => {
    const resolved = resolveTheme(preference);
    setThemeState(preference);
    setResolvedTheme(resolved);
    localStorage.setItem(STORAGE_KEY, preference);
    applyResolvedTheme(resolved, animate);
  };

  useEffect(() => {
    applyPreference(readStoredPreference(), false);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      const current = readStoredPreference();
      if (current === 'system') {
        const resolved = resolveTheme('system');
        setResolvedTheme(resolved);
        applyResolvedTheme(resolved);
      }
    };

    // Modern browsers
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onSystemThemeChange);
      return () => media.removeEventListener('change', onSystemThemeChange);
    }

    // Safari / older
    media.addListener(onSystemThemeChange);
    return () => media.removeListener(onSystemThemeChange);
  }, []);

  const setTheme = (newTheme: ThemePreference) => {
    applyPreference(newTheme);
  };

  const toggleTheme = () => {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    applyPreference(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useSoleoxTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useSoleoxTheme must be used within a Providers wrapper');
  }
  return context;
}

export default Providers;
