// Build-time stand-in for 'firebase/firestore' (vite.config.ts) that runs every write past the View as guard.
import * as firestore from 'firebase/firestore';
import { ViewAsReadOnlyError, viewAsBlocksRawWrite } from '@/utils/viewAsTab';

export * from 'firebase/firestore';

function guarded<F extends (...args: never[]) => Promise<unknown>>(fn: F): F {
  return ((...args: Parameters<F>) =>
    viewAsBlocksRawWrite()
      ? Promise.reject(new ViewAsReadOnlyError())
      : fn(...args)) as F;
}

export const setDoc = guarded(firestore.setDoc);
export const updateDoc = guarded(firestore.updateDoc);
export const addDoc = guarded(firestore.addDoc);
export const deleteDoc = guarded(firestore.deleteDoc);
export const runTransaction = guarded(firestore.runTransaction);

export const writeBatch = (db: firestore.Firestore): firestore.WriteBatch => {
  const batch = firestore.writeBatch(db);
  const commit = batch.commit.bind(batch);
  batch.commit = () =>
    viewAsBlocksRawWrite()
      ? Promise.reject(new ViewAsReadOnlyError())
      : commit();
  return batch;
};
