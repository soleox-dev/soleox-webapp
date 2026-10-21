'use client';

import { useEffect } from 'react';

/** A menu portaled onto the page stays usable while a popup is open. */
function isAppLayer(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-app-layer]'));
}

/**
 * The popup in front: the one stacked highest (z-index), and the last in the page among equals. A confirmation
 * rendered earlier in a page can sit over a dialog rendered after it, so page order alone picks the wrong one.
 */
function frontModal(): HTMLElement | null {
  const modals = [...document.querySelectorAll<HTMLElement>('.app-modal')];
  if (modals.length === 0) return null;
  const stackOrder = (modal: HTMLElement) => Number.parseInt(getComputedStyle(modal).zIndex, 10) || 0;
  return modals.reduce((top, modal) => (stackOrder(modal) >= stackOrder(top) ? modal : top));
}

/** Freezes the page behind any `.app-modal` overlay: no scroll, click, or typing. */
export function ModalScrollLock() {
  useEffect(() => {
    const inerted = new Set<HTMLElement>();
    const frozen = new Map<HTMLElement, string>();
    let frame = 0;
    let lockedScrollY = 0;

    const release = () => {
      inerted.forEach((element) => {
        element.inert = false;
      });
      inerted.clear();
      frozen.forEach((overflow, element) => {
        element.style.overflow = overflow;
      });
      frozen.clear();
      document.documentElement.classList.remove('modal-open');
      const top = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      if (top) window.scrollTo(0, Math.abs(parseInt(top, 10)) || lockedScrollY);
    };

    const apply = () => {
      const active = frontModal();
      release();
      if (!active) return;

      lockedScrollY = window.scrollY;
      document.documentElement.classList.add('modal-open');
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';

      const keep = new Set<HTMLElement>();
      let node: HTMLElement | null = active;
      while (node) {
        keep.add(node);
        node = node.parentElement;
      }

      node = active;
      while (node?.parentElement) {
        for (const child of node.parentElement.children) {
          if (!(child instanceof HTMLElement) || child === node || keep.has(child) || child.hasAttribute('data-app-layer')) continue;
          child.inert = true;
          inerted.add(child);
        }
        node = node.parentElement;
      }

      document.querySelectorAll<HTMLElement>('body *').forEach((element) => {
        if (active.contains(element) || element.contains(active) || keep.has(element) || element.closest('[data-app-layer]')) return;
        const style = getComputedStyle(element);
        const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll';
        if (!scrolls || element.scrollHeight <= element.clientHeight + 1) return;
        frozen.set(element, element.style.overflow);
        element.style.overflow = 'hidden';
      });

      const focused = document.activeElement;
      if (focused instanceof HTMLElement && !active.contains(focused) && !focused.closest('[data-app-layer]')) focused.blur();
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    const blockBackgroundScroll = (event: Event) => {
      const active = frontModal();
      if (!active) return;
      const target = event.target;
      if (isAppLayer(target)) return;
      if (target instanceof Node && active.contains(target)) return;
      event.preventDefault();
    };

    const blockBackgroundKeys = (event: KeyboardEvent) => {
      const keys = [' ', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const active = frontModal();
      if (!active) return;
      const target = event.target;
      if (isAppLayer(target)) return;
      if (target instanceof HTMLElement && active.contains(target)) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      event.preventDefault();
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('wheel', blockBackgroundScroll, { passive: false, capture: true });
    window.addEventListener('touchmove', blockBackgroundScroll, { passive: false, capture: true });
    window.addEventListener('keydown', blockBackgroundKeys, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', blockBackgroundScroll, true);
      window.removeEventListener('touchmove', blockBackgroundScroll, true);
      window.removeEventListener('keydown', blockBackgroundKeys, true);
      release();
    };
  }, []);

  return null;
}
