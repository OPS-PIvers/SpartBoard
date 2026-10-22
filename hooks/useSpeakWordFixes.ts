import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  SPEAK_WORD_FIXES_DOC,
  normalizeSpeakWordFixes,
  type SpeakWordFixes,
} from '@/utils/pronunciation/wordFixes';

const NONE: SpeakWordFixes = {};

/** Live district Speak word fixes; empty while off, loading, or unreadable (public visitors). */
export function useSpeakWordFixes(enabled: boolean): SpeakWordFixes {
  const [fixes, setFixes] = useState<SpeakWordFixes>(NONE);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', SPEAK_WORD_FIXES_DOC),
      (snap) => setFixes(normalizeSpeakWordFixes(snap.data())),
      () => setFixes(NONE)
    );
  }, [enabled]);

  return enabled ? fixes : NONE;
}
