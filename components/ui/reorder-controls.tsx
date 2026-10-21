'use client';

import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';

/** Moves one item of a list to another position: the item at `from` ends up at index `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-to-reorder for a short list. Spread `handleProps(index)` on the grip and `rowProps(index)` on the row;
 * dropping a row on another moves it to that row's place. `overIndex` marks where it would land.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const end = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return {
    dragIndex,
    overIndex: dragIndex === null || overIndex === dragIndex ? null : overIndex,
    handleProps: (index: number) => ({
      draggable: true,
      onDragStart: (event: React.DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        const row = event.currentTarget.closest('[data-drag-row]');
        if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 16, 16);
        setDragIndex(index);
      },
      onDragEnd: end,
    }),
    rowProps: (index: number) => ({
      'data-drag-row': '',
      onDragOver: (event: React.DragEvent<HTMLElement>) => {
        if (dragIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        setOverIndex(index);
      },
      onDrop: (event: React.DragEvent<HTMLElement>) => {
        if (dragIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (dragIndex !== index) onMove(dragIndex, index);
        end();
      },
    }),
  };
}

/** The grip people drag a row by. */
export function DragHandle({ title = 'Drag to reorder', ...props }: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }) {
  return (
    <span
      {...props}
      title={title}
      aria-hidden
      className="inline-flex h-7 w-5 shrink-0 cursor-grab select-none items-center justify-center rounded text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500 dark:hover:text-slate-300"
    >
      <GripVertical className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}
