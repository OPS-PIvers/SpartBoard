import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  InstructionalRoutine,
  ROUTINES as DEFAULT_ROUTINES,
} from '@/config/instructionalRoutines';

const COLLECTION_NAME = 'instructional_routines';

export const useInstructionalRoutines = () => {
  const [routines, setRoutines] = useState<InstructionalRoutine[]>(
    isAuthBypass ? DEFAULT_ROUTINES : []
  );
  const [loading, setLoading] = useState(!isAuthBypass);

  useEffect(() => {
    if (isAuthBypass) {
      return;
    }

    const routinesRef = collection(db, COLLECTION_NAME);
    const q = query(routinesRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudRoutines: InstructionalRoutine[] = [];
      snapshot.forEach((doc) => {
        cloudRoutines.push({
          ...doc.data(),
          id: doc.id,
        } as InstructionalRoutine);
      });

      // Merge defaults with cloud routines
      const routineMap = new Map<string, InstructionalRoutine>();
      DEFAULT_ROUTINES.forEach((r) => routineMap.set(r.id, r));
      cloudRoutines.forEach((r) => routineMap.set(r.id, r));

      setRoutines(Array.from(routineMap.values()));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const saveRoutine = useCallback(async (routine: InstructionalRoutine) => {
    if (isAuthBypass) return;
    const docRef = doc(db, COLLECTION_NAME, routine.id);
    await setDoc(docRef, routine);
  }, []);

  const deleteRoutine = useCallback(async (id: string) => {
    if (isAuthBypass) return;
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }, []);

  return {
    routines,
    loading,
    saveRoutine,
    deleteRoutine,
  };
};
