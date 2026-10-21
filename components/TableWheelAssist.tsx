'use client';

import { useEffect } from 'react';

/** Space below a card-less table that is only the page's bottom margin, nothing to read. */
const NOTHING_BELOW_PX = 160;

/** The card a table sits in: the nearest ancestor with its own background and a border or shadow. */
function cardAround(scroller: HTMLElement): HTMLElement | null {
  let node = scroller.parentElement;
  while (node && node !== document.body && node.tagName !== 'MAIN') {
    const style = getComputedStyle(node);
    const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const edged = parseFloat(style.borderBottomWidth) > 0 || style.boxShadow !== 'none';
    if (filled && edged) return node;
    node = node.parentElement;
  }
  return null;
}

/** The scroll box a wheel turn would move: the nearest ancestor that scrolls up and down and holds a table. */
function tableScroller(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.closest('.app-modal, [role="dialog"], [role="menu"], [role="listbox"], [data-app-layer]')) return null;
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const scrolls = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
      if (scrolls) return node.querySelector('table') ? node : null;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * A wheel turn over a table whose box runs past the bottom of the screen scrolls the page first, until the
 * whole table box is in view; then the table scrolls. Once the table is at its last row, the page scrolls on
 * to the bottom edge of the table's card (or to the page's end when the table has no card and nothing follows). Upward, a table whose top is hidden under the
 * top bar brings the page down first. So nobody has to move the pointer off a table to reach its last rows.
 * Desktop pointers only; touch scrolling is left as it is.
 */
export function TableWheelAssist() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
      const scroller = tableScroller(event.target);
      if (!scroller) return;
      const box = scroller.getBoundingClientRect();
      const root = document.scrollingElement || document.documentElement;
      const pageBottom = root.scrollHeight - window.innerHeight;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
      if (delta > 0) {
        if (window.scrollY >= pageBottom - 1) return;
        // First the page, until the table's bottom edge is on screen.
        let hiddenBelow = box.bottom - window.innerHeight;
        if (hiddenBelow <= 1) {
          // Then the table. Once it has reached its last row, the page finishes the job: to the bottom edge of
          // the table's card, or, with no card, to the very bottom of the page when nothing but the page
          // margin follows the table.
          const tableAtEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
          if (!tableAtEnd) return;
          const card = cardAround(scroller);
          if (card) {
            hiddenBelow = card.getBoundingClientRect().bottom - window.innerHeight;
          } else {
            const belowTable = root.scrollHeight - (window.scrollY + box.bottom);
            if (belowTable > NOTHING_BELOW_PX) return;
            hiddenBelow = pageBottom - window.scrollY;
          }
        }
        if (hiddenBelow <= 1) return;
        event.preventDefault();
        window.scrollBy({ top: Math.min(delta, hiddenBelow) });
      } else {
        const header = document.querySelector('header');
        const topEdge = header && getComputedStyle(header).position !== 'static' ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        const hiddenAbove = topEdge - box.top;
        if (hiddenAbove <= 1 || window.scrollY <= 0) return;
        event.preventDefault();
        window.scrollBy({ top: Math.max(delta, -hiddenAbove) });
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return null;
}
