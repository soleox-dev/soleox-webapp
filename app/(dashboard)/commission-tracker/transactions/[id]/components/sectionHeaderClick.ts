import type { MouseEvent } from 'react';

const HEADER_CONTROL = 'button, a, input, select, textarea, label, [role="button"], [role="group"]';

/** Collapse or expand a section when the header is clicked outside its controls. */
export function toggleFromSectionHeader(event: MouseEvent<HTMLElement>, toggle: () => void) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(HEADER_CONTROL)) return;
  toggle();
}
