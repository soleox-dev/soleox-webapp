'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Tailwind's `md` breakpoint. Desktop layout starts here. */
export const DESKTOP_QUERY = '(min-width: 768px)';

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
      return () => list.removeEventListener('change', onChange);
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
