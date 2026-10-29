// Minimal in-memory Firestore for the focus session tests; the same tests run against the emulator when FIRESTORE_EMULATOR_HOST is set.
import type * as admin from 'firebase-admin';

type Data = Record<string, unknown>;

interface Filter {
  field: string;
  op: '==' | '>=' | 'array-contains-any';
  value: unknown;
}

let autoId = 0;

export function createMemoryFirestore(): admin.firestore.Firestore & {
  dump: () => Map<string, Data>;
} {
  const store = new Map<string, Data>();
  const copy = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(copy)
      : v && typeof v === 'object' && v.constructor === Object
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]))
        : v;
  const clone = (d: Data): Data => copy(d) as Data;

  const snap = (path: string) => {
    const data = store.get(path);
    return {
      id: path.split('/').pop() ?? '',
      ref: docRef(path),
      exists: data !== undefined,
      data: () => (data ? clone(data) : undefined),
      get: (field: string) => data?.[field],
    };
  };

  const docRef = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop() ?? '',
    path,
    parent: {
      id: path.split('/').slice(-2)[0],
      get parent() {
        const up = path.split('/').slice(0, -2);
        return up.length >= 2 ? docRef(up.join('/')) : null;
      },
    },
    get: () => Promise.resolve(snap(path)),
    set: (data: Data) => {
      store.set(path, clone(data));
      return Promise.resolve();
    },
    delete: () => {
      store.delete(path);
      return Promise.resolve();
    },
    update: (data: Data) => {
      const cur = store.get(path);
      if (!cur) return Promise.reject(new Error(`NOT_FOUND: ${path}`));
      store.set(path, { ...cur, ...clone(data) });
      return Promise.resolve();
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });

  const matches = (data: Data, f: Filter) => {
    const v = data[f.field];
    if (f.op === '==') return v === f.value;
    if (f.op === '>=') return typeof v === 'number' && v >= (f.value as number);
    return (
      Array.isArray(v) &&
      (f.value as unknown[]).some((x) => (v as unknown[]).includes(x))
    );
  };

  const query = (path: string, filters: Filter[], max?: number) => ({
    where: (field: string, op: Filter['op'], value: unknown) =>
      query(path, [...filters, { field, op, value }], max),
    limit: (n: number) => query(path, filters, n),
    get: () => {
      const depth = path.split('/').length + 1;
      const docs = [...store.keys()]
        .filter(
          (k) => k.startsWith(`${path}/`) && k.split('/').length === depth
        )
        .sort()
        .filter((k) => filters.every((f) => matches(store.get(k) as Data, f)))
        .slice(0, max)
        .map(snap);
      return Promise.resolve({
        docs,
        empty: docs.length === 0,
        size: docs.length,
      });
    },
  });

  const collectionRef = (path: string) => ({
    ...query(path, []),
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
  });

  const db = {
    collectionGroup: (name: string) => ({
      where: (field: string, op: Filter['op'], value: unknown) => ({
        where: (field2: string, op2: Filter['op'], value2: unknown) => ({
          get: () => {
            const docs = [...store.keys()]
              .filter((k) => {
                const parts = k.split('/');
                return (
                  parts.length % 2 === 0 && parts[parts.length - 2] === name
                );
              })
              .filter((k) =>
                [
                  { field, op, value },
                  { field: field2, op: op2, value: value2 },
                ].every((f) => matches(store.get(k) as Data, f))
              )
              .map(snap);
            return Promise.resolve({
              docs,
              empty: docs.length === 0,
              size: docs.length,
            });
          },
        }),
      }),
    }),
    doc: (path: string) => docRef(path),
    collection: (path: string) => collectionRef(path),
    getAll: (...refs: Array<{ get: () => Promise<unknown> }>) =>
      Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      const b = {
        set: (ref: { set: (d: Data) => Promise<void> }, d: Data) => {
          ops.push(() => ref.set(d));
          return b;
        },
        update: (ref: { update: (d: Data) => Promise<void> }, d: Data) => {
          ops.push(() => ref.update(d));
          return b;
        },
        commit: async () => {
          for (const op of ops) await op();
        },
      };
      return b;
    },
    // Transactions run one at a time, which is what Firestore's retries amount to for these tests.
    runTransaction: <T>(fn: (tx: Record<string, unknown>) => Promise<T>) => {
      const run = txQueue.then(() => runOne(fn));
      txQueue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    dump: () => store,
  };
  let txQueue: Promise<void> = Promise.resolve();
  async function runOne<T>(fn: (tx: Record<string, unknown>) => Promise<T>) {
    const ops: Array<() => Promise<void>> = [];
    const tx = {
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      update: (ref: { update: (d: Data) => Promise<void> }, d: Data) => {
        ops.push(() => ref.update(d));
      },
      set: (ref: { set: (d: Data) => Promise<void> }, d: Data) => {
        ops.push(() => ref.set(d));
      },
      delete: (ref: { delete: () => Promise<void> }) => {
        ops.push(() => ref.delete());
      },
    };
    const out = await fn(tx);
    for (const op of ops) await op();
    return out;
  }
  return db as unknown as admin.firestore.Firestore & {
    dump: () => Map<string, Data>;
  };
}
