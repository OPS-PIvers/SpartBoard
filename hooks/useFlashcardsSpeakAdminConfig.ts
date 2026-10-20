import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardsSpeakAdminConfig } from '@/types';
import {
  FLASHCARDS_SPEAK_SETTINGS_DOC,
  defaultFlashcardsSpeakAdminConfig,
  normalizeFlashcardsSpeakAdminConfig,
} from '@/config/flashcardsSpeakAdmin';

interface FlashcardsSpeakAdminConfigState {
  /** Normalized doc; `null` until the first snapshot. */
  config: FlashcardsSpeakAdminConfig | null;
  /** True when the read failed and `config` holds the defaults. */
  failed: boolean;
}

/** Live `admin_settings/flashcardsSpeak`, normalized. */
export function useFlashcardsSpeakAdminConfig(): FlashcardsSpeakAdminConfigState {
  const [state, setState] = useState<FlashcardsSpeakAdminConfigState>({
    config: null,
    failed: false,
  });

  useEffect(() => {
    const ref = doc(db, 'admin_settings', FLASHCARDS_SPEAK_SETTINGS_DOC);
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          config: normalizeFlashcardsSpeakAdminConfig(snap.data()),
          failed: false,
        }),
      (err) => {
        console.error('[useFlashcardsSpeakAdminConfig]', err);
        setState({ config: defaultFlashcardsSpeakAdminConfig(), failed: true });
      }
    );
  }, []);

  return state;
}
