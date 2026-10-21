'use client';

import { phoneSheet } from '@/lib/page-frame';
import React, { useEffect, useState } from 'react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { useRegisterSave } from '@/components/save-leave-guard';
import type { CommissionEntity } from './page';

function placedIds(entities: CommissionEntity[]): string[] {
  return entities
    .filter((entity) => entity.waterfall_sort_order != null && Number.isFinite(Number(entity.waterfall_sort_order)))
    .sort((left, right) => Number(left.waterfall_sort_order) - Number(right.waterfall_sort_order) || left.entity_name.localeCompare(right.entity_name))
    .map((entity) => entity.id);
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function PostSplitOrder({
  entities,
  loading,
  onSaved,
}: {
  entities: CommissionEntity[];
  loading: boolean;
  onSaved: () => Promise<void>;
}) {
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (dirty) return;
    setOrderIds(placedIds(entities));
  }, [entities, dirty]);

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const ordered = orderIds.map((id) => byId.get(id)).filter((entity): entity is CommissionEntity => Boolean(entity));
  const unordered = entities
    .filter((entity) => !orderIds.includes(entity.id))
    .sort((left, right) => left.entity_name.localeCompare(right.entity_name));
  const unchanged = sameIds(orderIds, placedIds(entities));

  const commit = (next: string[]) => {
    setOrderIds(next);
    setDirty(!sameIds(next, placedIds(entities)));
    setError('');
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= orderIds.length || to >= orderIds.length) return;
    const next = [...orderIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const clientId = ordered[0]?.client_id || entities[0]?.client_id || 'DEMO';
      const response = await fetch('/api/commission-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REORDER', client_id: clientId, entity_ids: orderIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) throw new Error(body.error || 'Failed to save post-split order');
      await onSaved();
      setDirty(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post-split order');
      return false;
    } finally {
      setSaving(false);
    }
  };

  useRegisterSave({
    id: 'post-split-order',
    active: !unchanged,
    saving,
    onSave: save,
    onDiscard: () => {
      setOrderIds(placedIds(entities));
      setDirty(false);
      setError('');
    },
  });

  if (loading && entities.length === 0) return null;

  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Post-Split Order</h3>
          <p className="mt-1 max-w-2xl text-2xs text-slate-500 dark:text-slate-400">
            The waterfall table lists these entities in this order inside each post-split level. An entity left out stays at the bottom of its level.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || unchanged}
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save Order'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      {ordered.length === 0 ? (
        <p className="mt-4 text-xs italic text-slate-400">No entities are in the post-split order yet.</p>
      ) : (
        <ol className="mt-4 space-y-1">
          {ordered.map((entity, index) => (
            <li
              key={entity.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex != null) move(dragIndex, index);
                setDragIndex(null);
              }}
              className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 ${entity.is_active ? '' : 'opacity-60'}`}
            >
              <span className="w-5 text-right text-2xs font-bold tabular-nums text-slate-400">{index + 1}</span>
              <span className="cursor-grab px-0.5 text-slate-400 active:cursor-grabbing" title="Drag to reorder">⠿</span>
              <span className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-white">{entity.entity_name}</span>
              <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-2xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">{entity.entity_type || 'BROKERAGE'}</span>
              <button
                type="button"
                onClick={() => commit(orderIds.filter((id) => id !== entity.id))}
                className="ml-auto shrink-0 cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                title={`Remove ${entity.entity_name}`}
                aria-label={`Remove ${entity.entity_name}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ol>
      )}

      {unordered.length > 0 && (
        <div className="mt-4">
          <p className="text-2xs font-bold text-slate-400">Not Ordered</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unordered.map((entity) => (
              <button
                key={entity.id}
                type="button"
                onClick={() => commit(orderIds.includes(entity.id) ? orderIds : [...orderIds, entity.id])}
                className="cursor-pointer rounded-full border border-slate-300 bg-white px-2.5 py-1 text-2xs font-semibold text-slate-700 hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:text-brand-300"
              >
                Add {entity.entity_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
