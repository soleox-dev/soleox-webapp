'use client';

import { useEffect, useState } from 'react';

/**
 * Mobile or desktop layout on a phone. Desktop works like a browser's "Request Desktop Site": the page is
 * laid out 1280px wide and the phone shows it zoomed out. Remembered per browser; the blocking script in
 * app/layout.tsx applies it before the first paint.
 */
export type ViewMode = 'mobile' | 'desktop';

export const VIEW_MODE_KEY = 'soleox-view-mode';
export const DESKTOP_VIEWPORT = 'width=1280';
export const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1';

/** A phone: a touch screen whose narrow side is under 768px. Uses the screen, not the layout width. */
export function isPhoneDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return touch && Math.min(window.screen.width, window.screen.height) < 768;
}

export function readViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'desktop' ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}

function setViewport(content: string) {
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]')];
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
    metas.push(meta);
  }
  metas.forEach((meta) => {
    if (meta.getAttribute('content') !== content) meta.setAttribute('content', content);
  });
}

/** The view mode on this phone, a setter, and whether to offer the choice at all (phones only). */
export function useViewMode(): { mode: ViewMode; setMode: (mode: ViewMode) => void; available: boolean } {
  const [mode, setModeState] = useState<ViewMode>('mobile');
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const phone = isPhoneDevice();
    setAvailable(phone);
    const saved = phone ? readViewMode() : 'mobile';
    setModeState(saved);
    if (!phone || saved !== 'desktop') return;
    // Next.js can rewrite the viewport tag on navigation; keep the desktop width while it is chosen.
    setViewport(DESKTOP_VIEWPORT);
    const observer = new MutationObserver(() => setViewport(DESKTOP_VIEWPORT));
    observer.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['content'] });
    return () => observer.disconnect();
  }, []);

  const setMode = (next: ViewMode) => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // Not remembered; the reload below still shows the choice once.
    }
    setViewport(next === 'desktop' ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT);
    // A fresh load lays the page out cleanly at the new width and zoom.
    window.location.reload();
  };

  return { mode, setMode, available };
}
