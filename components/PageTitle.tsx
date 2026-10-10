'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { titleForPath } from '@/lib/page-titles';

function applyTitle(pathname: string) {
  const page = titleForPath(pathname);
  document.title = page ? `Soleox REBI > ${page}` : 'Soleox REBI';
}

export function PageTitle() {
  const pathname = usePathname();

  useEffect(() => {
    applyTitle(pathname);
    const frame = window.requestAnimationFrame(() => applyTitle(pathname));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
