// Build-time stand-in for 'firebase/firestore' (vite.config.ts) that runs every write past the View as guard.
import * as firestore from 'firebase/firestore';
import {
  ViewAsReadOnlyError,
  isViewAsTab,
  viewAsBlocksRawWrite,
  viewAsRawWriteNeedsAudit,
  viewAsWriteIsAudited,
} from '@/utils/viewAsTab';
import type { ViewAsRawWrite, ViewAsRawWriteOp } from '@/utils/viewAsAudit';

export * from 'firebase/firestore';

type Ref = { path: string };

// Loaded lazily: viewAsAudit imports 'firebase/firestore', which resolves to this module.
function audit(writes: ViewAsRawWrite[]): void {
  void import('@/utils/viewAsAudit').then(({ recordViewAsRawWrites }) =>
    recordViewAsRawWrites(writes)
  );
}

function guarded<T>(
  paths: string[],
  write: () => Promise<T>,
  describe: (result: T) => ViewAsRawWrite[]
): Promise<T> {
  if (viewAsBlocksRawWrite(paths)) {
    return Promise.reject(new ViewAsReadOnlyError());
  }
  if (!viewAsRawWriteNeedsAudit(paths)) return write();
  return write().then((result) => {
    audit(describe(result));
    return result;
  });
}

type AnyWrite = (ref: Ref, ...rest: unknown[]) => Promise<void>;

/** updateDoc takes either a data map or alternating field/value pairs. */
function updateData(rest: unknown[]): unknown {
  if (
    typeof rest[0] !== 'string' &&
    !(rest[0] instanceof firestore.FieldPath)
  ) {
    return rest[0];
  }
  const out: Record<string, unknown> = {};
  for (let i = 0; i + 1 < rest.length; i += 2) {
    out[String(rest[i])] = rest[i + 1];
  }
  return out;
}

export const setDoc = ((ref: Ref, ...rest: unknown[]) =>
  guarded(
    [ref.path],
    () => (firestore.setDoc as AnyWrite)(ref, ...rest),
    () => [{ op: 'set', path: ref.path, data: rest[0] }]
  )) as typeof firestore.setDoc;

export const updateDoc = ((ref: Ref, ...rest: unknown[]) =>
  guarded(
    [ref.path],
    () => (firestore.updateDoc as AnyWrite)(ref, ...rest),
    () => [{ op: 'update', path: ref.path, data: updateData(rest) }]
  )) as typeof firestore.updateDoc;

export const deleteDoc = ((ref: Ref) =>
  guarded(
    [ref.path],
    () => (firestore.deleteDoc as AnyWrite)(ref),
    () => [{ op: 'delete', path: ref.path }]
  )) as typeof firestore.deleteDoc;

export const addDoc = ((ref: Ref, data: unknown) =>
  guarded(
    [`${ref.path}/new`],
    () => (firestore.addDoc as (r: Ref, d: unknown) => Promise<Ref>)(ref, data),
    (created) => [{ op: 'add', path: created.path, data }]
  )) as typeof firestore.addDoc;

type Writer = 'set' | 'update' | 'delete';
const WRITERS: Writer[] = ['set', 'update', 'delete'];

function trackWrites<T extends Record<Writer, unknown>>(
  target: T,
  onWrite: (write: ViewAsRawWrite) => void
): void {
  for (const name of WRITERS) {
    const original = target[name] as (ref: Ref, ...rest: unknown[]) => T;
    target[name] = (ref: Ref, ...rest: unknown[]) => {
      const op: ViewAsRawWriteOp = name;
      onWrite({
        op,
        path: ref.path,
        ...(name === 'delete'
          ? {}
          : { data: name === 'update' ? updateData(rest) : rest[0] }),
      });
      return original.call(target, ref, ...rest);
    };
  }
}

export const writeBatch = (db: firestore.Firestore): firestore.WriteBatch => {
  const batch = firestore.writeBatch(db);
  if (!isViewAsTab) return batch;
  const writes: ViewAsRawWrite[] = [];
  trackWrites(batch, (w) => writes.push(w));
  const commit = batch.commit.bind(batch);
  batch.commit = () =>
    writes.length === 0
      ? commit()
      : guarded(
          writes.map((w) => w.path),
          commit,
          () => writes
        );
  return batch;
};

export const runTransaction = (<T>(
  db: firestore.Firestore,
  update: (tx: firestore.Transaction) => Promise<T>,
  options?: firestore.TransactionOptions
): Promise<T> => {
  if (!isViewAsTab || viewAsWriteIsAudited()) {
    return firestore.runTransaction(db, update, options);
  }
  let writes: ViewAsRawWrite[] = [];
  return firestore
    .runTransaction(
      db,
      (tx) => {
        writes = [];
        trackWrites(tx, (w) => {
          if (viewAsBlocksRawWrite([w.path])) throw new ViewAsReadOnlyError();
          writes.push(w);
        });
        return update(tx);
      },
      options
    )
    .then((result) => {
      const paths = writes.map((w) => w.path);
      if (paths.length > 0 && viewAsRawWriteNeedsAudit(paths)) {
        audit(writes);
      }
      return result;
    });
}) as typeof firestore.runTransaction;
