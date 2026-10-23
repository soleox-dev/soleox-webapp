/**
 * The Owner Reports download kept in the browser (IndexedDB), one copy per signed-in user and client, so the reports
 * open instantly and download again only when the client's data changed. Every call fails quietly: without storage
 * (private windows, blocked site data) the reports simply download each time.
 */
const DB_NAME = 'soleox-report-cache';
const STORE = 'downloads';

export type SavedReportData<T> = {
  /** When this copy was downloaded (ISO). */
  savedAt: string;
  /** The client's data-changed time when the download started; a later one means the copy is out of date. */
  changedAt: string | null;
  data: T;
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<R>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | null, empty: R): Promise<R> {
  const db = await openDb();
  if (!db) return empty;
  return new Promise<R>((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => {
        db.close();
        resolve((request?.result as R) ?? empty);
      };
      transaction.onerror = () => {
        db.close();
        resolve(empty);
      };
      transaction.onabort = () => {
        db.close();
        resolve(empty);
      };
    } catch {
      db.close();
      resolve(empty);
    }
  });
}

export function reportCacheKey(email: string, clientId: string): string {
  return `${email.trim().toLowerCase()}|${clientId}`;
}

export function readReportCache<T>(key: string): Promise<SavedReportData<T> | null> {
  return withStore<SavedReportData<T> | null>('readonly', (store) => store.get(key), null);
}

export async function writeReportCache<T>(key: string, value: SavedReportData<T>): Promise<void> {
  await withStore<null>('readwrite', (store) => store.put(value, key), null);
}

/** Removes every saved copy in this browser: on sign-out, or when the server refuses the user. */
export async function clearReportCache(): Promise<void> {
  await withStore<null>('readwrite', (store) => store.clear(), null);
}

/** Removes copies saved for anyone other than this user, so a shared browser keeps only the current user's data. */
export async function pruneReportCache(email: string): Promise<void> {
  const prefix = `${email.trim().toLowerCase()}|`;
  await withStore<null>('readwrite', (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!String(cursor.key).startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    return null;
  }, null);
}
