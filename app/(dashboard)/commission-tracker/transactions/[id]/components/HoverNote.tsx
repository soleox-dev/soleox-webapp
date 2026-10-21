'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function HoverNote({ label, children }: { label: string; children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tip = tipRef.current?.getBoundingClientRect();
      if (!anchor || !tip) return;
      const left = Math.max(
        8,
        Math.min(anchor.left + anchor.width / 2 - tip.width / 2, window.innerWidth - tip.width - 8),
      );
      const top = anchor.bottom + 6;
      setBox((prev) => (
        prev.top === top && prev.left === left && prev.ready ? prev : { top, left, ready: true }
      ));
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, label]);

  const close = () => {
    setOpen(false);
    setBox((prev) => ({ ...prev, ready: false }));
  };

  // Touch screens have no hover: a tap opens the note and a tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onTouch = (event: TouchEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener('touchstart', onTouch, { passive: true });
    return () => document.removeEventListener('touchstart', onTouch);
  }, [open]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={close}
      onTouchEnd={(event) => {
        // Buttons and links inside keep their own tap; the note opens on taps elsewhere in it.
        if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
        setOpen((value) => !value);
      }}
    >
      {children}
      {open && createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          style={{ top: box.top, left: box.left }}
          className={`pointer-events-none fixed z-50 w-max max-w-72 whitespace-pre-line rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${box.ready ? 'visible' : 'invisible'}`}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}
