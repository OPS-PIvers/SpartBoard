// The Print results settings, saved to the teacher's profile so they follow them to every device.
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { viewAsBlocksWrite } from '@/utils/viewAsTab';
import { viewAsDirectSave } from '@/utils/viewAsAudit';
import {
  loadResultsPrintChoice,
  parseResultsPrintChoice,
  saveResultsPrintChoice,
  type ResultsPrintPresetId,
  type SavedResultsPrintChoice,
} from '@/utils/quizResultsPrintPresets';

/** Profile field holding the last Print results choice. */
export const RESULTS_PRINT_PROFILE_FIELD = 'resultsPrintChoice';

/** Starts from this browser's copy, then takes the profile copy unless the teacher already changed something. */
export function useResultsPrintChoice(
  uid: string | null,
  defaultPreset: ResultsPrintPresetId | undefined,
  adjust: (choice: SavedResultsPrintChoice) => SavedResultsPrintChoice
): [SavedResultsPrintChoice, (next: SavedResultsPrintChoice) => void] {
  const [choice, setChoice] = useState(() =>
    adjust(loadResultsPrintChoice(defaultPreset))
  );
  // Set by the teacher's first change; the account copy never replaces it.
  const touched = useRef(false);

  useEffect(() => {
    if (!uid || isAuthBypass) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => getDoc(doc(db, 'users', uid, 'userProfile', 'profile')))
      .then((snap) => {
        const raw: unknown = snap.data()?.[RESULTS_PRINT_PROFILE_FIELD];
        if (cancelled || !raw || touched.current) return;
        const saved = parseResultsPrintChoice(raw, defaultPreset);
        // A super admin viewing as a teacher keeps their own browser copy.
        if (!viewAsBlocksWrite()) saveResultsPrintChoice(saved);
        setChoice(adjust(saved));
      })
      .catch((err: unknown) => logError('useResultsPrintChoice.load', err));
    return () => {
      cancelled = true;
    };
    // `adjust` and the default are read once per open, like the first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const update = (next: SavedResultsPrintChoice) => {
    touched.current = true;
    setChoice(next);
    saveResultsPrintChoice(next);
    if (!uid || isAuthBypass || viewAsBlocksWrite()) return;
    void Promise.resolve()
      .then(() => {
        const ref = doc(db, 'users', uid, 'userProfile', 'profile');
        return viewAsDirectSave(ref, [RESULTS_PRINT_PROFILE_FIELD], () =>
          setDoc(
            ref,
            { [RESULTS_PRINT_PROFILE_FIELD]: next },
            { mergeFields: [RESULTS_PRINT_PROFILE_FIELD] }
          )
        );
      })
      .catch((err: unknown) => logError('useResultsPrintChoice.save', err));
  };

  return [choice, update];
}
