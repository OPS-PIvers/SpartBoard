/* eslint-disable @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/require-await -- a hand-rolled in-memory Firestore for the Writing function tests. */
import type { Firestore } from 'firebase-admin/firestore';

export const DELETE = Symbol('delete');
export const SERVER_TS = Symbol('serverTimestamp');

const apply = (prev: any, patch: any): any => {
  const next = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE) delete next[k];
    else next[k] = v;
  }
  return next;
};

export function fakeFirestore(store: Map<string, any>) {
  const snap = (path: string) => {
    const data = store.get(path);
    return {
      exists: data !== undefined,
      id: path.split('/').pop(),
      data: () => (data === undefined ? undefined : { ...data }),
      get: (k: string) => data?.[k],
    };
  };
  const ref = (path: string): any => ({
    path,
    id: path.split('/').pop(),
    collection: (name: string) => col(`${path}/${name}`),
    get: async () => snap(path),
  });
  const col = (path: string): any => ({
    path,
    doc: (id: string) => ref(`${path}/${id}`),
  });
  const write = {
    set: (r: any, data: any, opts?: { merge?: boolean }) =>
      store.set(
        r.path,
        apply(opts?.merge ? (store.get(r.path) ?? {}) : {}, data)
      ),
    create: (r: any, data: any) => {
      if (store.has(r.path)) throw new Error(`exists: ${r.path}`);
      store.set(r.path, apply({}, data));
    },
    update: (r: any, data: any) => {
      if (!store.has(r.path)) throw new Error(`missing: ${r.path}`);
      store.set(r.path, apply(store.get(r.path), data));
    },
    delete: (r: any) => store.delete(r.path),
  };
  const db = {
    collection: (name: string) => col(name),
    doc: (path: string) => ref(path),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const queued: Array<() => void> = [];
      const tx = {
        get: async (r: any) => snap(r.path),
        set: (r: any, d: any) => queued.push(() => write.set(r, d)),
        create: (r: any, d: any) => queued.push(() => write.create(r, d)),
        update: (r: any, d: any) => queued.push(() => write.update(r, d)),
        delete: (r: any) => queued.push(() => write.delete(r)),
      };
      const result = await fn(tx);
      queued.forEach((w) => w());
      return result;
    },
    batch: () => {
      const queued: Array<() => void> = [];
      return {
        set: (r: any, d: any, o?: { merge?: boolean }) =>
          queued.push(() => write.set(r, d, o)),
        create: (r: any, d: any) => queued.push(() => write.create(r, d)),
        update: (r: any, d: any) => queued.push(() => write.update(r, d)),
        delete: (r: any) => queued.push(() => write.delete(r)),
        commit: async () => queued.forEach((w) => w()),
      };
    },
    recursiveDelete: async (r: any) => {
      for (const key of [...store.keys()])
        if (key.startsWith(`${r.path}/`)) store.delete(key);
    },
  };
  return db as unknown as Firestore;
}
