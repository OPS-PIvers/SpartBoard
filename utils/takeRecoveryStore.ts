// A take in progress, mirrored to IndexedDB so a crash or reload can still offer it back (D17).

const DB_NAME = 'spartboard-take-recovery';
const STORE = 'takes';

export const TAKE_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

export interface TakeRecoveryKey {
  sessionId: string;
  responseKey: string;
  questionId: string;
}

export type RecoveredMicState = 'on' | 'denied' | 'unavailable';

export interface TakeRecoveryBeginOptions {
  micState?: RecoveredMicState;
}

export interface RecoveredTake {
  key: string;
  mimeType: string;
  /** When capture started; the 24 h expiry counts from here. */
  startedAt: number;
  /** When the last chunk landed; `updatedAt - startedAt` is the captured length. */
  updatedAt: number;
  chunks: Blob[];
  /** Serialized drawing log for whiteboard takes (W5); each write replaces it. */
  log?: string;
  micState?: RecoveredMicState;
}

export interface TakeRecoveryStore {
  /** Starts a fresh record for this take, replacing any older one under the key. */
  begin: (
    key: string,
    mimeType: string,
    startedAt: number,
    options?: TakeRecoveryBeginOptions
  ) => Promise<void>;
  appendChunk: (key: string, chunk: Blob, at: number) => Promise<void>;
  setLog: (key: string, log: string, at: number) => Promise<void>;
  /** Null when nothing usable is stored; an expired record is dropped on read. */
  load: (key: string, now: number) => Promise<RecoveredTake | null>;
  remove: (key: string) => Promise<void>;
  /** Wipes every take for one response, on quiz submit. */
  removeForResponse: (sessionId: string, responseKey: string) => Promise<void>;
  removeExpired: (now: number) => Promise<void>;
}

export function takeRecoveryKey(k: TakeRecoveryKey): string {
  return `${responseKeyPrefix(k.sessionId, k.responseKey)}${k.questionId}`;
}

function responseKeyPrefix(sessionId: string, responseKey: string): string {
  return `${sessionId}/${responseKey}/`;
}

export function isRecoveryExpired(take: RecoveredTake, now: number): boolean {
  return now - take.startedAt >= TAKE_RECOVERY_TTL_MS;
}

/** Drops anything malformed so a foreign or old record never reaches review. */
export function parseRecoveredTake(raw: unknown): RecoveredTake | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== 'string' || !r.key) return null;
  if (typeof r.mimeType !== 'string') return null;
  if (typeof r.startedAt !== 'number' || typeof r.updatedAt !== 'number')
    return null;
  if (!Array.isArray(r.chunks)) return null;
  const chunks = r.chunks.filter((c): c is Blob => c instanceof Blob);
  return {
    key: r.key,
    mimeType: r.mimeType,
    startedAt: r.startedAt,
    updatedAt: Math.max(r.startedAt, r.updatedAt),
    chunks,
    ...(typeof r.log === 'string' ? { log: r.log } : {}),
    ...(r.micState === 'on' ||
    r.micState === 'denied' ||
    r.micState === 'unavailable'
      ? { micState: r.micState }
      : {}),
  };
}

/** True when the record holds something worth offering back. */
export function hasRecoverableContent(take: RecoveredTake): boolean {
  return take.chunks.some((c) => c.size > 0) || !!take.log;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

function withStore(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore, done: (value?: unknown) => void) => void
): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let result: unknown;
        op(tx.objectStore(STORE), (value) => {
          result = value;
        });
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB failed'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB aborted'));
        };
      })
  );
}

function freshTake(
  key: string,
  mimeType: string,
  startedAt: number,
  options?: TakeRecoveryBeginOptions
): RecoveredTake {
  return {
    key,
    mimeType,
    startedAt,
    updatedAt: startedAt,
    chunks: [],
    ...(options?.micState ? { micState: options.micState } : {}),
  };
}

function updateRecord(
  key: string,
  patch: (take: RecoveredTake) => RecoveredTake
): Promise<void> {
  return withStore('readwrite', (store) => {
    const get = store.get(key);
    get.onsuccess = () => {
      const take = parseRecoveredTake(get.result);
      // A chunk with no begun record belongs to a take already wiped.
      if (take) store.put(patch(take), key);
    };
  }).then(() => undefined);
}

export const indexedDbTakeRecoveryStore: TakeRecoveryStore = {
  begin: (key, mimeType, startedAt, options) =>
    withStore('readwrite', (store) => {
      store.put(freshTake(key, mimeType, startedAt, options), key);
    }).then(() => undefined),
  appendChunk: (key, chunk, at) =>
    updateRecord(key, (take) => ({
      ...take,
      chunks: [...take.chunks, chunk],
      updatedAt: Math.max(take.updatedAt, at),
    })),
  setLog: (key, log, at) =>
    updateRecord(key, (take) => ({
      ...take,
      log,
      updatedAt: Math.max(take.updatedAt, at),
    })),
  load: (key, now) =>
    withStore('readwrite', (store, done) => {
      const get = store.get(key);
      get.onsuccess = () => {
        const take = parseRecoveredTake(get.result);
        if (get.result !== undefined && (!take || isRecoveryExpired(take, now)))
          store.delete(key);
        done(take && !isRecoveryExpired(take, now) ? take : null);
      };
    }).then((v) => (v as RecoveredTake | null) ?? null),
  remove: (key) =>
    withStore('readwrite', (store) => {
      store.delete(key);
    }).then(() => undefined),
  removeForResponse: (sessionId, responseKey) => {
    const prefix = responseKeyPrefix(sessionId, responseKey);
    return withStore('readwrite', (store) => {
      store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
    }).then(() => undefined);
  },
  removeExpired: (now) =>
    withStore('readwrite', (store) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const take = parseRecoveredTake(cursor.value);
        if (!take || isRecoveryExpired(take, now)) cursor.delete();
        cursor.continue();
      };
    }).then(() => undefined),
};

/** For tests and browsers without IndexedDB; lost on reload. */
export const memoryTakeRecoveryStore = (): TakeRecoveryStore => {
  const byKey = new Map<string, RecoveredTake>();
  const patch = (
    key: string,
    fn: (take: RecoveredTake) => RecoveredTake
  ): Promise<void> => {
    const take = byKey.get(key);
    if (take) byKey.set(key, fn(take));
    return Promise.resolve();
  };
  return {
    begin: (key, mimeType, startedAt, options) => {
      byKey.set(key, freshTake(key, mimeType, startedAt, options));
      return Promise.resolve();
    },
    appendChunk: (key, chunk, at) =>
      patch(key, (take) => ({
        ...take,
        chunks: [...take.chunks, chunk],
        updatedAt: Math.max(take.updatedAt, at),
      })),
    setLog: (key, log, at) =>
      patch(key, (take) => ({
        ...take,
        log,
        updatedAt: Math.max(take.updatedAt, at),
      })),
    load: (key, now) => {
      const take = byKey.get(key) ?? null;
      if (take && isRecoveryExpired(take, now)) {
        byKey.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(take);
    },
    remove: (key) => {
      byKey.delete(key);
      return Promise.resolve();
    },
    removeForResponse: (sessionId, responseKey) => {
      const prefix = responseKeyPrefix(sessionId, responseKey);
      for (const key of [...byKey.keys()]) {
        if (key.startsWith(prefix)) byKey.delete(key);
      }
      return Promise.resolve();
    },
    removeExpired: (now) => {
      for (const [key, take] of [...byKey.entries()]) {
        if (isRecoveryExpired(take, now)) byKey.delete(key);
      }
      return Promise.resolve();
    },
  };
};

let fallbackStore: TakeRecoveryStore | null = null;

export const defaultTakeRecoveryStore = (): TakeRecoveryStore => {
  if (typeof indexedDB !== 'undefined') return indexedDbTakeRecoveryStore;
  fallbackStore ??= memoryTakeRecoveryStore();
  return fallbackStore;
};
