/**
 * Review crops for a resumable paper import (plan Q26). Bubble-row crops are
 * PNG data URLs, far too big for the batch doc, so they stay in this browser's
 * IndexedDB keyed by batch id. Handwriting crops (handwritten plan D21) sit
 * beside them as blobs and are also uploaded to Storage, so a review resumed
 * elsewhere can still show them. Everything here is best-effort.
 */

const DB_NAME = 'spartboard-paper-review';
const STORE = 'crops';

export type WrittenBoxState = 'ink' | 'blank';

/** One handwritten box read from the scan; `blob` is null when the crop lives only in Storage. */
export interface WrittenCrop {
  seat: number;
  questionId: string;
  page: number;
  state: WrittenBoxState;
  blob: Blob | null;
}

export interface WrittenCropSet {
  scanId: string;
  crops: WrittenCrop[];
}

export interface CropStore {
  save: (batchId: string, crops: ReadonlyMap<string, string>) => Promise<void>;
  load: (batchId: string) => Promise<Map<string, string>>;
  saveWritten: (batchId: string, set: WrittenCropSet) => Promise<void>;
  loadWritten: (batchId: string) => Promise<WrittenCropSet | null>;
  clear: (batchId: string) => Promise<void>;
}

export const writtenCropKey = (seat: number, questionId: string) =>
  `${seat}:${questionId}`;

const writtenStoreKey = (batchId: string) => `written:${batchId}`;

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

const isState = (v: unknown): v is WrittenBoxState =>
  v === 'ink' || v === 'blank';

/** Drops anything malformed, so an old or foreign record never reaches the review. */
export function parseWrittenCropSet(raw: unknown): WrittenCropSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const { scanId, crops } = raw as { scanId?: unknown; crops?: unknown };
  if (typeof scanId !== 'string' || !scanId || !Array.isArray(crops)) {
    return null;
  }
  const out: WrittenCrop[] = [];
  for (const c of crops as unknown[]) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    if (
      typeof r.seat !== 'number' ||
      typeof r.questionId !== 'string' ||
      typeof r.page !== 'number' ||
      !isState(r.state)
    ) {
      continue;
    }
    out.push({
      seat: r.seat,
      questionId: r.questionId,
      page: r.page,
      state: r.state,
      blob: r.blob instanceof Blob ? r.blob : null,
    });
  }
  return { scanId, crops: out };
}

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
  saveWritten: (batchId, set) =>
    quiet(
      run('readwrite', (s) => s.put(set, writtenStoreKey(batchId))).then(
        () => undefined
      ),
      undefined
    ),
  loadWritten: (batchId) =>
    quiet(
      run<unknown>('readonly', (s) => s.get(writtenStoreKey(batchId))).then(
        parseWrittenCropSet
      ),
      null
    ),
  clear: (batchId) =>
    quiet(
      Promise.all([
        run('readwrite', (s) => s.delete(batchId)),
        run('readwrite', (s) => s.delete(writtenStoreKey(batchId))),
      ]).then(() => undefined),
      undefined
    ),
};

/** For tests and environments without IndexedDB. */
export const memoryCropStore = (): CropStore => {
  const byBatch = new Map<string, Map<string, string>>();
  const writtenByBatch = new Map<string, WrittenCropSet>();
  return {
    save: (batchId, crops) => {
      byBatch.set(batchId, new Map(crops));
      return Promise.resolve();
    },
    load: (batchId) => Promise.resolve(new Map(byBatch.get(batchId) ?? [])),
    saveWritten: (batchId, set) => {
      writtenByBatch.set(batchId, {
        scanId: set.scanId,
        crops: [...set.crops],
      });
      return Promise.resolve();
    },
    loadWritten: (batchId) => {
      const set = writtenByBatch.get(batchId);
      return Promise.resolve(
        set ? { scanId: set.scanId, crops: [...set.crops] } : null
      );
    },
    clear: (batchId) => {
      byBatch.delete(batchId);
      writtenByBatch.delete(batchId);
      return Promise.resolve();
    },
  };
};

export type CropUploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface CropUploadJob {
  key: string;
  path: string;
  blob: Blob;
  /** Set on a resumed review: the object may already exist, and the create-only rule then denies it. */
  mayExist?: boolean;
}

export interface CropUploader {
  enqueue: (job: CropUploadJob) => void;
  /** Records a crop a previous session already uploaded. */
  markDone: (key: string) => void;
  status: (key: string) => CropUploadStatus | undefined;
  /** Resolves once nothing is queued or uploading. */
  whenIdle: () => Promise<void>;
  retryFailed: () => void;
}

const UPLOAD_ATTEMPTS = 2;

const deniedAsExisting = (err: unknown) =>
  !!err &&
  typeof err === 'object' &&
  (err as { code?: unknown }).code === 'storage/unauthorized';

/** A small upload queue; `onChange` fires on every status change so the review can re-render. */
export function createCropUploader(
  upload: (path: string, blob: Blob) => Promise<void>,
  onChange: (key: string, status: CropUploadStatus) => void,
  concurrency = 3
): CropUploader {
  const statuses = new Map<string, CropUploadStatus>();
  const jobs = new Map<string, CropUploadJob>();
  const queue: string[] = [];
  let active = 0;
  let idleWaiters: Array<() => void> = [];

  const settleIdle = () => {
    if (active > 0 || queue.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((w) => w());
  };

  const set = (key: string, status: CropUploadStatus) => {
    statuses.set(key, status);
    onChange(key, status);
  };

  const runOne = async (job: CropUploadJob) => {
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
      try {
        await upload(job.path, job.blob);
        return 'done' as const;
      } catch (err) {
        const denied = deniedAsExisting(err);
        if (job.mayExist && denied) return 'done' as const;
        // A failed upload may still have landed, so a later denial means it exists.
        if (!denied) job.mayExist = true;
      }
    }
    return 'failed' as const;
  };

  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      const key = queue.shift() as string;
      const job = jobs.get(key);
      if (!job) continue;
      active += 1;
      set(key, 'uploading');
      void runOne(job).then((result) => {
        active -= 1;
        set(key, result);
        pump();
        settleIdle();
      });
    }
    settleIdle();
  };

  return {
    enqueue: (job) => {
      const current = statuses.get(job.key);
      if (current && current !== 'failed') return;
      jobs.set(job.key, job);
      queue.push(job.key);
      set(job.key, 'queued');
      pump();
    },
    markDone: (key) => set(key, 'done'),
    status: (key) => statuses.get(key),
    whenIdle: () =>
      active === 0 && queue.length === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => idleWaiters.push(resolve)),
    retryFailed: () => {
      const failed = [...statuses].filter(([, s]) => s === 'failed');
      for (const [key] of failed) {
        if (!jobs.has(key)) continue;
        queue.push(key);
        set(key, 'queued');
      }
      pump();
    },
  };
}
