/** Live view of `admin_settings/plc_note_collab`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_PLC_NOTE_COLLAB_SETTINGS,
  PLC_NOTE_COLLAB_SETTINGS_DOC,
  normalizePlcNoteCollabSettings,
  type PlcNoteCollabSettings,
} from '@/config/plcNoteCollab';

export function usePlcNoteCollabSettings(
  enabled: boolean = true
): PlcNoteCollabSettings {
  const [settings, setSettings] = useState<PlcNoteCollabSettings>(
    DEFAULT_PLC_NOTE_COLLAB_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', PLC_NOTE_COLLAB_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizePlcNoteCollabSettings(snap.data())
            : DEFAULT_PLC_NOTE_COLLAB_SETTINGS
        ),
      // An unreadable doc must fall back to the legacy editor, never strand it.
      () => setSettings(DEFAULT_PLC_NOTE_COLLAB_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
