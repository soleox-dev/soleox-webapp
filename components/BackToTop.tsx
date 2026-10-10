'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronUp } from 'lucide-react';

const TOP_GAP = 48;
const UP_IDLE_MS = 700;

function railLeft(): number {
  const aside = document.querySelector('aside');
  if (aside) {
    const rect = aside.getBoundingClientRect();
    if (rect.width >= 40) return rect.left;
  }
  const main = document.querySelector('main');
  if (main) return main.getBoundingClientRect().left;
  return window.innerWidth >= 768 ? 32 : 24;
}

export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener('change', syncMotion);

    let lastY = window.scrollY;
    let hideTimer = 0;
    const show = (next: boolean) => {
      setVisible((current) => (current === next ? current : next));
    };
    const place = () => setLeft(railLeft());
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (y <= TOP_GAP) {
        window.clearTimeout(hideTimer);
        show(false);
        return;
      }
      if (delta < -2) {
        show(true);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => show(false), UP_IDLE_MS);
      } else if (delta > 2) {
        window.clearTimeout(hideTimer);
        show(false);
      }
    };

    place();
    onScroll();
    const observed = new Set<Element>();
    const observer = new ResizeObserver(place);
    const watch = () => {
      for (const node of [document.querySelector('aside'), document.querySelector('main')]) {
        if (!node || observed.has(node)) continue;
        observed.add(node);
        observer.observe(node);
      }
    };
    watch();
    const layoutWatch = window.setInterval(() => {
      watch();
      if (document.querySelector('aside, main')) window.clearInterval(layoutWatch);
    }, 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearInterval(layoutWatch);
      observer.disconnect();
      media.removeEventListener('change', syncMotion);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', place);
    };
  }, [pathname]);

  if (pathname === '/login' || left === null) return null;

  const goToTop = () => {
    const root = document.scrollingElement || document.documentElement;
    root.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    root.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  return (
    <div
      aria-hidden={!visible}
      className={`fixed bottom-6 z-40 transition-[opacity,translate] duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'
      } ${reducedMotion ? 'transition-none' : ''}`}
      style={{ left }}
    >
      <div className="flex w-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={goToTop}
          aria-label="Back to top"
          tabIndex={visible ? 0 : -1}
          className="group flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white"
        >
          <ChevronUp className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
