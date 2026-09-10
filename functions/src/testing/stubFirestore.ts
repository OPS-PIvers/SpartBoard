// In-memory Firestore stub covering the Admin SDK surface the PLC assessment functions use.
// Test-only helper; nothing in the deployable barrel imports it.

export type StubData = Record<string, unknown>;

interface StubQueryOpts {
  where: Array<{ field: string; op: string; value: unknown }>;
  orderBy?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export interface StubDocSnap {
  id: string;
  exists: boolean;
  ref: StubDocRef;
  data: () => StubData | undefined;
}

export interface StubQuery {
  where: (field: string, op: string, value: unknown) => StubQuery;
  orderBy: (field: string, dir?: 'asc' | 'desc') => StubQuery;
  limit: (n: number) => StubQuery;
  get: () => Promise<{ docs: StubDocSnap[]; size: number; empty: boolean }>;
}

export interface StubCollectionRef extends StubQuery {
  id: string;
  path: string;
  parent: StubDocRef | null;
  doc: (id: string) => StubDocRef;
}

export interface StubDocRef {
  id: string;
  path: string;
  parent: StubCollectionRef;
  collection: (name: string) => StubCollectionRef;
  get: () => Promise<StubDocSnap>;
  set: (data: StubData) => Promise<void>;
  update: (data: StubData) => Promise<void>;
  create: (data: StubData) => Promise<void>;
  delete: () => Promise<void>;
}

export class AlreadyExistsError extends Error {
  code = 6;
  constructor(path: string) {
    super(`6 ALREADY_EXISTS: document already exists: ${path}`);
  }
}

function matches(data: StubData, w: StubQueryOpts['where'][number]): boolean {
  const v = data[w.field];
  switch (w.op) {
    case '==':
      return v === w.value;
    case '!=':
      return v !== undefined && v !== w.value;
    default:
      throw new Error(`stub: unsupported operator ${w.op}`);
  }
}

export function makeStubFirestore(seed: Record<string, StubData> = {}) {
  const store = new Map<string, StubData>();
  for (const [path, data] of Object.entries(seed)) store.set(path, { ...data });
  const writes: Array<{ op: string; path: string; data?: StubData }> = [];
  const hooks: {
    beforeQuery?: (label: string) => Promise<void> | void;
    beforeWrite?: (op: string, path: string) => void;
  } = {};

  const runQuery = (
    candidates: () => string[],
    opts: StubQueryOpts
  ): StubDocSnap[] => {
    let rows = candidates()
      .map((path) => ({ path, data: store.get(path)! }))
      .filter((r) => opts.where.every((w) => matches(r.data, w)));
    const ob = opts.orderBy;
    if (ob) {
      rows = rows
        .filter((r) => r.data[ob.field] !== undefined)
        .sort((a, b) => {
          const av = a.data[ob.field] as number;
          const bv = b.data[ob.field] as number;
          return ob.dir === 'desc' ? bv - av : av - bv;
        });
    } else {
      rows.sort((a, b) => (a.path < b.path ? -1 : 1));
    }
    if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);
    return rows.map((r) => snapFor(r.path));
  };

  const makeQuery = (
    label: string,
    candidates: () => string[],
    opts: StubQueryOpts
  ): StubQuery => ({
    where: (field, op, value) =>
      makeQuery(label, candidates, {
        ...opts,
        where: [...opts.where, { field, op, value }],
      }),
    orderBy: (field, dir = 'asc') =>
      makeQuery(label, candidates, { ...opts, orderBy: { field, dir } }),
    limit: (n) => makeQuery(label, candidates, { ...opts, limit: n }),
    get: async () => {
      await hooks.beforeQuery?.(label);
      const docs = runQuery(candidates, opts);
      return { docs, size: docs.length, empty: !docs.length };
    },
  });

  const childDocPaths = (collectionPath: string) =>
    Array.from(store.keys()).filter((p) => {
      if (!p.startsWith(collectionPath + '/')) return false;
      return !p.slice(collectionPath.length + 1).includes('/');
    });

  const makeCollection = (
    path: string,
    parent: StubDocRef | null
  ): StubCollectionRef => ({
    ...makeQuery(path, () => childDocPaths(path), { where: [] }),
    id: path.split('/').pop()!,
    path,
    parent,
    doc: (id: string) => makeDoc(`${path}/${id}`),
  });

  const snapFor = (path: string): StubDocSnap => {
    const data = store.get(path);
    return {
      id: path.split('/').pop()!,
      exists: data !== undefined,
      ref: makeDoc(path),
      data: () => (data === undefined ? undefined : { ...data }),
    };
  };

  const makeDoc = (path: string): StubDocRef => {
    const segments = path.split('/');
    const parentPath = segments.slice(0, -1).join('/');
    const grandParentPath = segments.slice(0, -2).join('/');
    return {
      id: segments[segments.length - 1],
      path,
      get parent() {
        return makeCollection(
          parentPath,
          grandParentPath ? makeDoc(grandParentPath) : null
        );
      },
      collection: (name: string) =>
        makeCollection(`${path}/${name}`, makeDoc(path)),
      get: () => Promise.resolve(snapFor(path)),
      set: (data) => {
        hooks.beforeWrite?.('set', path);
        store.set(path, { ...data });
        writes.push({ op: 'set', path, data });
        return Promise.resolve();
      },
      update: (data) => {
        hooks.beforeWrite?.('update', path);
        const existing = store.get(path);
        if (!existing) return Promise.reject(new Error(`5 NOT_FOUND: ${path}`));
        store.set(path, { ...existing, ...data });
        writes.push({ op: 'update', path, data });
        return Promise.resolve();
      },
      create: (data) => {
        hooks.beforeWrite?.('create', path);
        if (store.has(path))
          return Promise.reject(new AlreadyExistsError(path));
        store.set(path, { ...data });
        writes.push({ op: 'create', path, data });
        return Promise.resolve();
      },
      delete: () => {
        hooks.beforeWrite?.('delete', path);
        if (store.delete(path)) writes.push({ op: 'delete', path });
        return Promise.resolve();
      },
    };
  };

  const db = {
    collection: (path: string) => makeCollection(path, null),
    doc: (path: string) => makeDoc(path),
    collectionGroup: (name: string) =>
      makeQuery(
        `group:${name}`,
        () =>
          Array.from(store.keys()).filter((p) => {
            const segs = p.split('/');
            return segs.length >= 2 && segs[segs.length - 2] === name;
          }),
        { where: [] }
      ),
    runTransaction: async <T>(
      fn: (tx: {
        get: (ref: StubDocRef) => Promise<StubDocSnap>;
        update: (ref: StubDocRef, data: StubData) => void;
        set: (ref: StubDocRef, data: StubData) => void;
      }) => Promise<T>
    ): Promise<T> => {
      const pending: Array<() => Promise<void>> = [];
      const result = await fn({
        get: (ref) => ref.get(),
        update: (ref, data) => {
          pending.push(() => ref.update(data));
        },
        set: (ref, data) => {
          pending.push(() => ref.set(data));
        },
      });
      for (const p of pending) await p();
      return result;
    },
  };

  return {
    db,
    store,
    writes,
    hooks,
    get: (path: string) => store.get(path),
    has: (path: string) => store.has(path),
  };
}
