import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { FlashcardsSpeakAdminConfig } from '@/types';
import {
  FLASHCARDS_SPEAK_SETTINGS_DOC,
  defaultFlashcardsSpeakAdminConfig,
  normalizeFlashcardsSpeakAdminConfig,
} from '@/config/flashcardsSpeakAdmin';

/** Live `admin_settings/flashcardsSpeak`, normalized; `null` until the first snapshot. */
export function useFlashcardsSpeakAdminConfig(): FlashcardsSpeakAdminConfig | null {
  const [config, setConfig] = useState<FlashcardsSpeakAdminConfig | null>(null);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', FLASHCARDS_SPEAK_SETTINGS_DOC);
    return onSnapshot(
      ref,
      (snap) => setConfig(normalizeFlashcardsSpeakAdminConfig(snap.data())),
      (err) => {
        console.error('[useFlashcardsSpeakAdminConfig]', err);
        setConfig(defaultFlashcardsSpeakAdminConfig());
      }
    );
  }, []);

  return config;
}
