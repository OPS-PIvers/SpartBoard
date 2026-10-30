/** Live view of `admin_settings/import_conversion`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_IMPORT_CONVERSION_SETTINGS,
  IMPORT_CONVERSION_SETTINGS_DOC,
  normalizeImportConversionSettings,
  type ImportConversionSettings,
} from '@/config/importConversion';

export function useImportConversionSettings(
  enabled: boolean = true
): ImportConversionSettings {
  const [settings, setSettings] = useState<ImportConversionSettings>(
    DEFAULT_IMPORT_CONVERSION_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', IMPORT_CONVERSION_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeImportConversionSettings(snap.data())
            : DEFAULT_IMPORT_CONVERSION_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_IMPORT_CONVERSION_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
