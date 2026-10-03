import { useRef } from 'react';

const INTERACTIVE = 'button, a, input, textarea, select, [role="button"]';

export function useEditOnDoublePress(enabled: boolean, onEdit: () => void) {
  const lastTap = useRef(0);
  const lastEdit = useRef(0);

  const ignored = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest(INTERACTIVE));

  const startEdit = () => {
    const now = Date.now();
    if (now - lastEdit.current < 500) return;
    lastEdit.current = now;
    onEdit();
  };

  return {
    onDoubleClick: (event: React.MouseEvent) => {
      if (!enabled || ignored(event.target)) return;
      startEdit();
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (!enabled || ignored(event.target)) return;
      const now = Date.now();
      if (now - lastTap.current < 350) {
        lastTap.current = 0;
        startEdit();
      } else {
        lastTap.current = now;
      }
    },
  };
}
