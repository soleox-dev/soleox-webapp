'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronUp } from 'lucide-react';

const SHOW_AFTER = 320;

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

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setVisible(window.scrollY > SHOW_AFTER);
        setLeft(railLeft());
      });
    };

    sync();
    const observed = new Set<Element>();
    const observer = new ResizeObserver(sync);
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
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(layoutWatch);
      observer.disconnect();
      media.removeEventListener('change', syncMotion);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [pathname]);

  if (pathname === '/login' || left === null) return null;

  const goToTop = () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
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
