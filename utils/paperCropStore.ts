/**
 * Review crops for a resumable paper import (plan Q26). They are PNG data
 * URLs, far too big for the batch doc, so they stay in this browser's
 * IndexedDB keyed by batch id. Everything is best-effort: a review resumed
 * elsewhere simply shows no crops.
 */

const DB_NAME = 'spartboard-paper-review';
const STORE = 'crops';

export interface CropStore {
  save: (batchId: string, crops: ReadonlyMap<string, string>) => Promise<void>;
  load: (batchId: string) => Promise<Map<string, string>>;
  clear: (batchId: string) => Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
        tx.oncomplete = () => db.close();
      })
  );
}

const quiet = <T>(p: Promise<T>, fallback: T): Promise<T> =>
  p.catch(() => fallback);

export const indexedDbCropStore: CropStore = {
  save: (batchId, crops) =>
    quiet(
      run('readwrite', (s) => s.put(Object.fromEntries(crops), batchId)).then(
        () => undefined
      ),
      undefined
    ),
  load: (batchId) =>
    quiet(
      run<unknown>('readonly', (s) => s.get(batchId)).then((raw) => {
        const out = new Map<string, string>();
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof v === 'string') out.set(k, v);
          }
        }
        return out;
      }),
      new Map<string, string>()
    ),
  clear: (batchId) =>
    quiet(
      run('readwrite', (s) => s.delete(batchId)).then(() => undefined),
      undefined
    ),
};

/** For tests and environments without IndexedDB. */
export const memoryCropStore = (): CropStore => {
  const byBatch = new Map<string, Map<string, string>>();
  return {
    save: (batchId, crops) => {
      byBatch.set(batchId, new Map(crops));
      return Promise.resolve();
    },
    load: (batchId) => Promise.resolve(new Map(byBatch.get(batchId) ?? [])),
    clear: (batchId) => {
      byBatch.delete(batchId);
      return Promise.resolve();
    },
  };
};
