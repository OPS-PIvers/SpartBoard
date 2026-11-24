import { useEffect, useState } from 'react';
import { arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

export const GRADUATED_SWITCHES_DOC = 'graduated_switches';

const NONE: ReadonlySet<string> = new Set();

/** District switch keys an admin moved from Previews to Features, plus a setter. */
export const useGraduatedSwitches = () => {
  const [keys, setKeys] = useState<ReadonlySet<string> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'admin_settings', GRADUATED_SWITCHES_DOC),
        (snap) => {
          const raw: unknown = snap.data()?.keys;
          setKeys(
            new Set(
              Array.isArray(raw)
                ? raw.filter((k): k is string => typeof k === 'string')
                : []
            )
          );
        },
        (err) => {
          console.error('[useGraduatedSwitches]', err);
          setKeys(NONE);
        }
      ),
    []
  );

  const graduate = async (key: string) => {
    setSaving(key);
    setError(null);
    try {
      await setDoc(
        doc(db, 'admin_settings', GRADUATED_SWITCHES_DOC),
        { keys: arrayUnion(key) },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  return {
    keys: keys ?? NONE,
    loading: keys === null,
    saving,
    error,
    graduate,
  };
};
