'use client';

import { useRef } from 'react';

export type UndoAction = 'undo' | 'redo';

export function undoKeyAction(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): UndoAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && event.shiftKey) return 'redo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  if (key === 'z') return 'undo';
  return null;
}

export function useUndoHistory() {
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const restoring = useRef(false);

  const record = (previous: string, next: string) => {
    if (restoring.current || previous === next) return;
    past.current.push(previous);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
  };

  const take = (action: UndoAction, current: string): string | null => {
    const source = action === 'undo' ? past : future;
    const destination = action === 'undo' ? future : past;
    if (source.current.length === 0) return null;
    const next = source.current.pop() ?? null;
    if (next === null) return null;
    destination.current.push(current);
    return next;
  };

  const reset = () => {
    past.current = [];
    future.current = [];
  };

  return { record, take, reset, restoring };
}
