'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Tailwind's `md` breakpoint. Desktop layout starts here. */
export const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Same media query as the `desktop-nav:` variant in globals.css: md and wider, except phones in
 * landscape (touch with a short viewport), which keep the phone menu.
 */
export const DESKTOP_NAV_QUERY =
  '(min-width: 768px) and (not ((hover: none) and (pointer: coarse) and (max-height: 500px)))';

/** Same media query as the `touch:` variant in globals.css. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * Tracks a CSS media query. `serverValue` is used while rendering on the server and
 * during hydration, so pick the value that keeps the first paint unchanged.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      // Some environments (device emulation, older WebKit) skip `change`; a resize re-checks too.
      // React only re-renders when the boolean actually flips.
      window.addEventListener('resize', onChange);
      return () => {
        list.removeEventListener('change', onChange);
        window.removeEventListener('resize', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** True at `md` and wider. Assumes desktop before hydration so desktop renders exactly as before. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, true);
}

/** True on touch screens (no hover, coarse pointer). False before hydration, matching desktop. */
export function useIsTouch(): boolean {
  return useMediaQuery(TOUCH_QUERY, false);
}

/** True where the desktop top bar shows (see DESKTOP_NAV_QUERY). Assumes desktop before hydration. */
export function useIsDesktopNav(): boolean {
  return useMediaQuery(DESKTOP_NAV_QUERY, true);
}
