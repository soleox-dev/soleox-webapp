/**
 * Helper to fetch all rows across PostgREST's default 1,000-row limit.
 * Uses exact count on the first page and fetches subsequent pages in
 * concurrency-controlled parallel batches to prevent Postgres connection
 * exhaustion and statement timeouts.
 */

export interface FetchAllPagesOptions {
  pageSize?: number;
  concurrency?: number;
  maxRows?: number;
}

export async function fetchAllPages<T = Record<string, unknown>>(
  fetchPage: (offset: number, limit: number, withCount: boolean) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
    count?: number | null;
  }>,
  options?: FetchAllPagesOptions,
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000;
  const concurrency = options?.concurrency ?? 5;
  const maxRows = options?.maxRows ?? 200000;

  // 1. Fetch first page with exact count
  const first = await fetchPage(0, pageSize, true);
  if (first.error) throw first.error;

  const rows = (Array.isArray(first.data) ? first.data : []) as T[];
  if (rows.length < pageSize) return rows;

  const countVal = first.count;
  const total = Math.min(countVal != null ? countVal : maxRows, maxRows);

  if (countVal != null) {
    const offsets: number[] = [];
    for (let offset = pageSize; offset < total; offset += pageSize) {
      offsets.push(offset);
    }
    if (offsets.length === 0) return rows;

    const rest: T[] = [];
    for (let i = 0; i < offsets.length; i += concurrency) {
      const chunk = offsets.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        chunk.map(async (offset) => {
          const res = await fetchPage(offset, pageSize, false);
          if (res.error) throw res.error;
          return (Array.isArray(res.data) ? res.data : []) as T[];
        }),
      );
      for (const batch of batchResults) {
        rest.push(...batch);
      }
    }
    return rows.concat(rest);
  }

  // Fallback if count is not returned: sequential paging until end
  let offset = pageSize;
  while (offset < maxRows) {
    const res = await fetchPage(offset, pageSize, false);
    if (res.error) throw res.error;
    const batch = (Array.isArray(res.data) ? res.data : []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

const ID_PAGE = 1000;
const ID_BAND_CONCURRENCY = 4;
let idBandActive = 0;
const idBandWaiters: Array<() => void> = [];

function withIdBandSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      idBandActive += 1;
      task().then(resolve, reject).finally(() => {
        idBandActive -= 1;
        const next = idBandWaiters.shift();
        if (next) next();
      });
    };
    if (idBandActive < ID_BAND_CONCURRENCY) start();
    else idBandWaiters.push(start);
  });
}

/** Splits PREFIX_ + hex ids into contiguous string ranges, such as PAY_0…PAY_4. */
export function idBands(prefix: string, bands = 4): Array<{ after: string; before: string | null }> {
  const width = Math.ceil(16 / bands);
  const ranges: Array<{ after: string; before: string | null }> = [];
  for (let start = 0; start < 16; start += width) {
    const end = start + width;
    ranges.push({
      after: prefix + start.toString(16).toUpperCase(),
      before: end >= 16 ? null : prefix + end.toString(16).toUpperCase(),
    });
  }
  return ranges;
}

/**
 * Reads every row past PostgREST's 1,000-row cap by walking the id index.
 * Deep offsets and exact counts time out once a table is past a few thousand rows.
 */
export async function fetchAllByIdBands<T extends { id?: unknown }>(
  load: (after: string, before: string | null, limit: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>,
  prefix: string,
  bands = 4,
  onBand?: () => void,
): Promise<T[]> {
  const parts = await Promise.all(idBands(prefix, bands).map(async (band) => {
    const rows: T[] = [];
    let after = band.after;
    try {
      for (;;) {
        const result = await withIdBandSlot(() => Promise.resolve(load(after, band.before, ID_PAGE)));
        if (result.error) throw result.error;
        const batch = (Array.isArray(result.data) ? result.data : []) as T[];
        rows.push(...batch);
        if (batch.length < ID_PAGE) break;
        const last = String(batch[batch.length - 1]?.id || '');
        if (!last || last <= after) break;
        after = last;
      }
    } finally {
      onBand?.();
    }
    return rows;
  }));
  return parts.flat();
}
