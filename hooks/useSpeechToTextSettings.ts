import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_SPEECH_TO_TEXT_SETTINGS,
  SPEECH_TO_TEXT_SETTINGS_DOC,
  normalizeSpeechToTextSettings,
} from '@/config/speechToText';
import type { SpeechToTextSettings } from '@/types';

// Read once per page; a failed or missing read means everything is off.
let pending: Promise<SpeechToTextSettings> | null = null;
let loaded: SpeechToTextSettings | null = null;

function loadSettings(): Promise<SpeechToTextSettings> {
  pending ??= getDoc(doc(db, 'admin_settings', SPEECH_TO_TEXT_SETTINGS_DOC))
    .then((snap) =>
      snap.exists()
        ? normalizeSpeechToTextSettings(snap.data())
        : DEFAULT_SPEECH_TO_TEXT_SETTINGS
    )
    .catch(() => DEFAULT_SPEECH_TO_TEXT_SETTINGS)
    .then((settings) => {
      loaded = settings;
      return settings;
    });
  return pending;
}

/** Test hook: forget the settings read earlier on this page. */
export function resetSpeechToTextSettingsCache(): void {
  pending = null;
  loaded = null;
}

/** The paid Speech to text switches; the defaults (all off) until read, and whenever `enabled` is false. */
export function useSpeechToTextSettings(
  enabled: boolean
): SpeechToTextSettings {
  const [settings, setSettings] = useState<SpeechToTextSettings | null>(
    () => loaded
  );

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadSettings().then((next) => {
      if (alive) setSettings(next);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled && settings ? settings : DEFAULT_SPEECH_TO_TEXT_SETTINGS;
}
