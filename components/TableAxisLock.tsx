'use client';

import { useEffect } from 'react';

/**
 * The boxes that scroll a table sideways. On phones globals.css gives them `touch-action: pan-y pinch-zoom`, so the
 * browser scrolls them up and down (and the page) natively but never sideways; this component does the sideways part.
 * Keep the two lists the same.
 */
export const TABLE_SCROLLER_SELECTOR = ':is(.report-table, .overflow-x-auto, .overflow-x-scroll, .overflow-auto, .overflow-scroll):has(table)';

/** Mobile view on a touch screen, the same test as the CSS rule. */
const PHONE_QUERY = '(max-width: 767px) and (pointer: coarse)';
/** How far a finger moves before the swipe is read as sideways or up and down. Under the browser's own slop. */
const DECIDE_PX = 6;
/** Momentum after a sideways flick: the speed kept per 16ms frame, and the speed (px/ms) where it stops. */
const FRICTION = 0.95;
const MIN_SPEED = 0.02;

/** The box this touch would scroll sideways: the nearest one that can, inside a table scroller. */
function sidewaysScroller(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const overflowX = getComputedStyle(node).overflowX;
      const scrolls = (overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
      if (scrolls) return node.closest(TABLE_SCROLLER_SELECTOR) ? node : null;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Tables on phones scroll one way at a time: a swipe that starts mostly sideways scrolls the table sideways only,
 * with momentum, and the page holds still; one that starts mostly up or down scrolls only up and down, natively.
 * No diagonal drift while reading across a row or down a column. Mobile view only.
 */
export function TableAxisLock() {
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    let scroller: HTMLElement | null = null;
    let axis: 'x' | 'y' | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let samples: { x: number; t: number }[] = [];
    let glide = 0;

    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide);
      glide = 0;
    };

    const onStart = (event: TouchEvent) => {
      stopGlide();
      scroller = null;
      axis = null;
      if (!phone.matches || event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input[type="range"], [draggable="true"]')) return;
      scroller = sidewaysScroller(event.target);
      if (!scroller) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = scroller.scrollLeft;
      samples = [{ x: touch.clientX, t: event.timeStamp }];
    };

    const onMove = (event: TouchEvent) => {
      if (!scroller) return;
      if (event.touches.length !== 1) {
        scroller = null;
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      // Up and down is the browser's own scroll; the CSS already keeps it from moving the table sideways.
      if (axis === 'y') return;
      if (event.cancelable) event.preventDefault();
      scroller.scrollLeft = startLeft - dx;
      samples.push({ x: touch.clientX, t: event.timeStamp });
      while (samples.length > 2 && event.timeStamp - samples[0].t > 100) samples.shift();
    };

    const onEnd = () => {
      const box = scroller;
      const sideways = axis === 'x';
      scroller = null;
      axis = null;
      if (!box || !sideways || samples.length < 2) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = last.t - first.t;
      if (elapsed <= 0) return;
      // px/ms, positive when the content should move left (finger flicked left).
      let speed = (first.x - last.x) / elapsed;
      // Kept as a fraction: scrollLeft rounds, and a slow glide moves less than a pixel a frame.
      let position = box.scrollLeft;
      const end = box.scrollWidth - box.clientWidth;
      let previous: number | null = null;
      const step = (now: number) => {
        const dt = previous === null ? 16 : Math.min(48, Math.max(0, now - previous));
        previous = now;
        position = Math.min(end, Math.max(0, position + speed * dt));
        box.scrollLeft = position;
        speed *= FRICTION ** (dt / 16);
        const atEdge = position <= 0 || position >= end;
        glide = Math.abs(speed) > MIN_SPEED && !atEdge ? requestAnimationFrame(step) : 0;
      };
      if (Math.abs(speed) > MIN_SPEED) glide = requestAnimationFrame(step);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      stopGlide();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return null;
}
