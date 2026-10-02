// Meeting audio segments that failed to upload, kept in IndexedDB so a reload can still send them (MR-D7).

const DB_NAME = 'spartboard-meeting-audio';
const STORE = 'segments';

export interface QueuedSegment {
  /** The Storage path, which is also the queue key. */
  path: string;
  blob: Blob;
  queuedAt: number;
}

export interface SegmentQueue {
  put: (segment: QueuedSegment) => Promise<void>;
  list: () => Promise<QueuedSegment[]>;
  remove: (path: string) => Promise<void>;
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

/** Drops anything malformed so a foreign or old record never reaches an upload. */
export function parseQueuedSegment(raw: unknown): QueuedSegment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.path !== 'string' || !r.path) return null;
  if (!(r.blob instanceof Blob)) return null;
  return {
    path: r.path,
    blob: r.blob,
    queuedAt: typeof r.queuedAt === 'number' ? r.queuedAt : 0,
  };
}

export const indexedDbSegmentQueue: SegmentQueue = {
  put: (segment) =>
    run('readwrite', (s) => s.put(segment, segment.path)).then(() => undefined),
  list: () =>
    run<unknown[]>('readonly', (s) => s.getAll()).then((rows) =>
      rows
        .map(parseQueuedSegment)
        .filter((s): s is QueuedSegment => s !== null)
        .sort((a, b) => a.queuedAt - b.queuedAt)
    ),
  remove: (path) =>
    run('readwrite', (s) => s.delete(path)).then(() => undefined),
};

/** For tests and browsers without IndexedDB; lost on reload. */
export const memorySegmentQueue = (): SegmentQueue => {
  const byPath = new Map<string, QueuedSegment>();
  return {
    put: (segment) => {
      byPath.set(segment.path, segment);
      return Promise.resolve();
    },
    list: () =>
      Promise.resolve(
        [...byPath.values()].sort((a, b) => a.queuedAt - b.queuedAt)
      ),
    remove: (path) => {
      byPath.delete(path);
      return Promise.resolve();
    },
  };
};

export const defaultSegmentQueue = (): SegmentQueue =>
  typeof indexedDB === 'undefined'
    ? memorySegmentQueue()
    : indexedDbSegmentQueue;
