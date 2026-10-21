'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** A search box on the page itself: a text field whose placeholder starts with "Search", outside dialogs. */
function pageSearchField(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof HTMLInputElement)) return null;
  if (target.type !== 'text' && target.type !== 'search') return null;
  if (!/^search/i.test(target.placeholder || '')) return null;
  if (target.closest('[role="dialog"], .app-modal')) return null;
  return target;
}

/**
 * Typing in a search box narrows the list under it, which can make the page shorter than where it is scrolled
 * to; the browser then pulls the page up and the search box jumps away under the finger. While a search box
 * holds text, the page keeps at least the height it had before the first keystroke. Clearing the search or
 * leaving the page lets it shrink again.
 */
export function SearchHeightHold() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    let held: HTMLInputElement | null = null;
    const release = () => {
      if (!held) return;
      held = null;
      root.style.minHeight = '';
    };
    // Capture phase: runs before React re-renders the narrowed list, so the height read is the full one.
    const onInput = (event: Event) => {
      const field = pageSearchField(event.target);
      if (!field) return;
      if (!held) root.style.minHeight = `${root.scrollHeight}px`;
      held = field;
      queueMicrotask(() => {
        if (!field.value) release();
      });
    };
    // A clear button empties the field without an input event; check once the click has been handled.
    const onClick = () => {
      window.setTimeout(() => {
        if (held && (!held.isConnected || !held.value)) release();
      }, 0);
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('click', onClick, true);
      release();
    };
  }, [pathname]);

  return null;
}
