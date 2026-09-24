// In-memory Firestore/Storage fakes for the GL media GC tests.
type Data = Record<string, unknown>;

interface FakeRef {
  id: string;
  path: string;
  parent: { id: string; parent: FakeRef | null };
  collection: (name: string) => {
    doc: (id: string) => { get: () => Promise<FakeSnap> };
  };
}

interface FakeQuery {
  stream: () => AsyncIterable<FakeSnap>;
  get: () => Promise<{ docs: FakeSnap[]; empty: boolean }>;
  where: (field: string, op: string, value: unknown) => FakeQuery;
  limit: (n: number) => FakeQuery;
}

interface FakeSnap {
  id: string;
  ref: FakeRef;
  exists: boolean;
  data: () => Data | undefined;
  get: (field: string) => unknown;
}

export function createFakeDb(docs: Record<string, Data>) {
  const makeRef = (path: string): FakeRef => {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    const parentDocPath = parts.slice(0, -2).join('/');
    return {
      id,
      path,
      parent: {
        id: parts[parts.length - 2],
        parent: parentDocPath ? makeRef(parentDocPath) : null,
      },
      collection: (name) => ({
        doc: (child) => ({
          get: () => Promise.resolve(snap(`${path}/${name}/${child}`)),
        }),
      }),
    };
  };
  const snap = (path: string): FakeSnap => {
    const data = docs[path];
    return {
      id: path.split('/').pop() ?? '',
      ref: makeRef(path),
      exists: data !== undefined,
      data: () => data,
      get: (field) => data?.[field],
    };
  };
  const matching = (test: (parts: string[]) => boolean) =>
    Object.keys(docs)
      .filter((p) => {
        const parts = p.split('/');
        return parts.length % 2 === 0 && test(parts);
      })
      .map(snap);
  const query = (list: () => FakeSnap[]): FakeQuery => ({
    stream: () => ({
      [Symbol.asyncIterator]: () => {
        const items = list();
        let i = 0;
        return {
          next: () =>
            Promise.resolve(
              i < items.length
                ? { value: items[i++], done: false as const }
                : { value: undefined, done: true as const }
            ),
        };
      },
    }),
    get: () => {
      const found = list();
      return Promise.resolve({ docs: found, empty: found.length === 0 });
    },
    where: (field, _op, value) =>
      query(() =>
        list().filter((d) => {
          const arr = d.get(field);
          return Array.isArray(arr) && arr.includes(value);
        })
      ),
    limit: (n) => query(() => list().slice(0, n)),
  });
  return {
    collection: (name: string) => {
      const prefix = name.split('/');
      return query(() =>
        matching(
          (parts) =>
            parts.length === prefix.length + 1 &&
            prefix.every((seg, i) => parts[i] === seg)
        )
      );
    },
    collectionGroup: (name: string) =>
      query(() => matching((parts) => parts[parts.length - 2] === name)),
    doc: (path: string) => ({ path }),
    getAll: (...refs: { path: string }[]) =>
      Promise.resolve(refs.map((r) => snap(r.path))),
  };
}

export interface FakeFile {
  name: string;
  timeCreated: string;
  marked?: boolean;
}

export function createFakeBucket(files: FakeFile[]) {
  const deleted: string[] = [];
  return {
    deleted,
    getFiles: () =>
      Promise.resolve([
        files.map((f) => ({
          name: f.name,
          metadata: {
            timeCreated: f.timeCreated,
            metadata: f.marked === false ? {} : { glMedia: '1' },
          },
        })),
        null,
      ]),
    file: (name: string) => ({
      // Files not listed count as marked GL uploads.
      getMetadata: () =>
        Promise.resolve([
          {
            metadata:
              files.find((f) => f.name === name)?.marked === false
                ? {}
                : { glMedia: '1' },
          },
        ]),
      delete: () => {
        deleted.push(name);
        return Promise.resolve();
      },
    }),
  };
}
