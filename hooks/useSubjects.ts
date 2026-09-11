import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  DEFAULT_SUBJECTS,
  SUBJECTS_DOC,
  activeSubjects,
  normalizeSubjectsDoc,
  type Subject,
} from '@/config/subjects';
import { logError } from '@/utils/logError';

interface UseSubjectsResult {
  /** Every subject, archived included (admin editing). */
  subjects: Subject[];
  /** Subjects teachers can pick. */
  active: Subject[];
  byId: Map<string, Subject>;
  loading: boolean;
}

/** Live view of `admin_settings/subjects`; the defaults stand in until the doc exists. */
export function useSubjects(): UseSubjectsResult {
  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [loading, setLoading] = useState(!isAuthBypass);

  useEffect(() => {
    if (isAuthBypass) return;
    const unsub = onSnapshot(
      doc(db, 'admin_settings', SUBJECTS_DOC),
      (snap) => {
        setSubjects(normalizeSubjectsDoc(snap.data()).subjects);
        setLoading(false);
      },
      (err) => {
        logError('useSubjects', err);
        setSubjects(DEFAULT_SUBJECTS);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return useMemo(
    () => ({
      subjects,
      active: activeSubjects(subjects),
      byId: new Map(subjects.map((s) => [s.id, s])),
      loading,
    }),
    [subjects, loading]
  );
}
