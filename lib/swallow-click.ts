/**
 * Called when a tap or click outside an open dropdown closes it: the same tap then does nothing else,
 * so it never opens a transaction, follows a link, or presses a button under the pointer.
 * Only the click that follows this press is stopped; it is forgotten after a moment.
 */
export function swallowNextClick(): void {
  if (typeof document === 'undefined') return;
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener('click', stop, true);
    window.clearTimeout(timer);
  };
  document.addEventListener('click', stop, true);
  const timer = window.setTimeout(cleanup, 700);
}
