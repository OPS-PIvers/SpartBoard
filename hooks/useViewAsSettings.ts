/** Live view of the `admin_settings/view_as` kill switch; off until the doc says otherwise. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_VIEW_AS_SETTINGS,
  VIEW_AS_SETTINGS_DOC,
  normalizeViewAsSettings,
  type ViewAsSettings,
} from '@/config/viewAs';

export function useViewAsSettings(enabled: boolean): ViewAsSettings {
  const [settings, setSettings] = useState<ViewAsSettings>(
    DEFAULT_VIEW_AS_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', VIEW_AS_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeViewAsSettings(snap.data())
            : DEFAULT_VIEW_AS_SETTINGS
        ),
      // Hiding the entry is the safe failure; the callable re-checks the switch.
      () => setSettings(DEFAULT_VIEW_AS_SETTINGS)
    );
  }, [enabled]);

  return enabled ? settings : DEFAULT_VIEW_AS_SETTINGS;
}
