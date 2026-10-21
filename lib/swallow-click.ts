/**
 * Called when a tap or click outside an open dropdown closes it: the same tap then does nothing else,
 * so it never opens a transaction, follows a link, or presses a button under the pointer.
 * The rest of that press (its mouseup, pointerup and click) is stopped, and it is forgotten a moment after
 * the button or finger lifts, so the next press works as usual. Pass the pointerdown that closed the
 * dropdown (listened for in the capture phase) to stop it too, along with the mousedown that follows it.
 */
export function swallowNextClick(pressStart?: Event): void {
  if (typeof document === 'undefined') return;
  if (pressStart) {
    // On a pointerdown this also cancels the mousedown the browser would send after it.
    pressStart.preventDefault();
    pressStart.stopPropagation();
    pressStart.stopImmediatePropagation();
  }
  const block = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const stopClick = (event: Event) => {
    block(event);
    cleanup();
  };
  // A press that never turns into a click (a drag) must not swallow a later one.
  const released = (event: Event) => {
    block(event);
    window.clearTimeout(timer);
    timer = window.setTimeout(cleanup, 400);
  };
  const cleanup = () => {
    document.removeEventListener('click', stopClick, true);
    document.removeEventListener('mousedown', block, true);
    document.removeEventListener('pointerup', released, true);
    document.removeEventListener('mouseup', released, true);
    document.removeEventListener('pointercancel', released, true);
    window.clearTimeout(timer);
  };
  document.addEventListener('click', stopClick, true);
  document.addEventListener('mousedown', block, true);
  document.addEventListener('pointerup', released, true);
  document.addEventListener('mouseup', released, true);
  document.addEventListener('pointercancel', released, true);
  // Held down longer than this (a long press), the press is let go of anyway.
  let timer = window.setTimeout(cleanup, 5000);
}
