// Build-time stand-in for 'firebase/firestore' (vite.config.ts) that runs every write past the View as guard.
import * as firestore from 'firebase/firestore';
import {
  ViewAsReadOnlyError,
  isViewAsTab,
  viewAsBlocksRawWrite,
  viewAsWriteIsAudited,
} from '@/utils/viewAsTab';

export * from 'firebase/firestore';

type Ref = { path: string };

function blocked<T>(paths: string[], write: () => Promise<T>): Promise<T> {
  return viewAsBlocksRawWrite(paths)
    ? Promise.reject(new ViewAsReadOnlyError())
    : write();
}

type AnyWrite = (ref: Ref, ...rest: unknown[]) => Promise<void>;

export const setDoc = ((ref: Ref, ...rest: unknown[]) =>
  blocked([ref.path], () =>
    (firestore.setDoc as AnyWrite)(ref, ...rest)
  )) as typeof firestore.setDoc;

export const updateDoc = ((ref: Ref, ...rest: unknown[]) =>
  blocked([ref.path], () =>
    (firestore.updateDoc as AnyWrite)(ref, ...rest)
  )) as typeof firestore.updateDoc;

export const deleteDoc = ((ref: Ref) =>
  blocked([ref.path], () =>
    (firestore.deleteDoc as AnyWrite)(ref)
  )) as typeof firestore.deleteDoc;

export const addDoc = ((ref: Ref, data: unknown) =>
  blocked([`${ref.path}/new`], () =>
    (firestore.addDoc as (r: Ref, d: unknown) => Promise<unknown>)(ref, data)
  )) as typeof firestore.addDoc;

type Writer = 'set' | 'update' | 'delete';
const WRITERS: Writer[] = ['set', 'update', 'delete'];

function trackPaths<T extends Record<Writer, unknown>>(
  target: T,
  onWrite: (path: string) => void
): void {
  for (const name of WRITERS) {
    const original = target[name] as (ref: Ref, ...rest: unknown[]) => T;
    target[name] = ((ref: Ref, ...rest: unknown[]) => {
      onWrite(ref.path);
      return original.call(target, ref, ...rest);
    }) as T[Writer];
  }
}

export const writeBatch = (db: firestore.Firestore): firestore.WriteBatch => {
  const batch = firestore.writeBatch(db);
  if (!isViewAsTab) return batch;
  const paths: string[] = [];
  trackPaths(batch, (path) => paths.push(path));
  const commit = batch.commit.bind(batch);
  batch.commit = () => (paths.length === 0 ? commit() : blocked(paths, commit));
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
  return firestore.runTransaction(
    db,
    (tx) => {
      trackPaths(tx, (path) => {
        if (viewAsBlocksRawWrite([path])) throw new ViewAsReadOnlyError();
      });
      return update(tx);
    },
    options
  );
}) as typeof firestore.runTransaction;
