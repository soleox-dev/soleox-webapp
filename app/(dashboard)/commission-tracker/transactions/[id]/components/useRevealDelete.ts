'use client';

import { useEffect, type RefObject } from 'react';

/** Set on a `group/cell` while a long press has shown its delete button on a touch screen. */
const REVEALED = 'data-reveal-delete';
/** How long a finger rests on a cell before its delete button shows, and how far it may drift meanwhile. */
const HOLD_MS = 450;
const DRIFT_PX = 8;

/**
 * Classes for a waterfall delete button inside a `group/cell` (a post-split's entity or amount, a deduction's row).
 * With a mouse or trackpad it shows while the pointer is on that cell, and keeps its space so nothing shifts. On a
 * touch screen it is hidden and cannot be tapped until a long press on the cell shows it (useRevealDelete), so a
 * stray tap never deletes. Keyboard focus shows it too.
 */
export const REVEAL_DELETE_CLASS = [
  'pointer-fine:opacity-0 pointer-fine:group-hover/cell:opacity-100 pointer-fine:focus-visible:opacity-100',
  'pointer-coarse:pointer-events-none pointer-coarse:opacity-0',
  'pointer-coarse:group-data-[reveal-delete]/cell:pointer-events-auto pointer-coarse:group-data-[reveal-delete]/cell:opacity-100',
].join(' ');

/**
 * Touch screens: a long press on a `group/cell` inside `container` shows that cell's delete button (REVEAL_DELETE_CLASS);
 * a touch anywhere else puts it away again. Presses that start on a drag handle or a menu do nothing. Only while
 * `enabled` (the waterfall is being edited).
 */
export function useRevealDelete(container: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = container.current;
    if (!root || !enabled) return;
    let timer = 0;
    let startX = 0;
    let startY = 0;
    let revealed: HTMLElement | null = null;

    const hide = () => {
      revealed?.removeAttribute(REVEALED);
      revealed = null;
    };
    const cancel = () => {
      window.clearTimeout(timer);
      timer = 0;
    };

    const onStart = (event: TouchEvent) => {
      cancel();
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest<HTMLElement>('.group\\/cell') ?? null;
      // A touch on the shown button itself is the delete; anywhere else puts the button away.
      if (revealed && !(cell === revealed && target?.closest('button'))) hide();
      if (!cell || !root.contains(cell) || event.touches.length !== 1) return;
      if (target?.closest('[draggable="true"], select, [role="listbox"], [role="menu"]')) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      timer = window.setTimeout(() => {
        timer = 0;
        cell.setAttribute(REVEALED, '');
        revealed = cell;
        // The press may have started selecting a word; the delete button is what it was for.
        window.getSelection()?.removeAllRanges();
        navigator.vibrate?.(10);
      }, HOLD_MS);
    };
    const onMove = (event: TouchEvent) => {
      if (!timer) return;
      const touch = event.touches[0];
      if (!touch || Math.abs(touch.clientX - startX) > DRIFT_PX || Math.abs(touch.clientY - startY) > DRIFT_PX) cancel();
    };
    // Android follows a long press with a context menu (copy, select); not on a cell whose delete just showed.
    const onContextMenu = (event: Event) => {
      if (revealed && event.target instanceof Node && revealed.contains(event.target)) event.preventDefault();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', cancel, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    root.addEventListener('contextmenu', onContextMenu);
    return () => {
      cancel();
      hide();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', cancel);
      document.removeEventListener('touchcancel', cancel);
      root.removeEventListener('contextmenu', onContextMenu);
    };
  }, [container, enabled]);
}
