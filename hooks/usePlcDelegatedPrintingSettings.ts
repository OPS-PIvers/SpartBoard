/** Live view of `admin_settings/plc_delegated_printing`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS,
  PLC_DELEGATED_PRINTING_SETTINGS_DOC,
  normalizePlcDelegatedPrintingSettings,
  type PlcDelegatedPrintingSettings,
} from '@/config/plcDelegatedPrinting';

export function usePlcDelegatedPrintingSettings(
  enabled: boolean = true
): PlcDelegatedPrintingSettings {
  const [settings, setSettings] = useState<PlcDelegatedPrintingSettings>(
    DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', PLC_DELEGATED_PRINTING_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizePlcDelegatedPrintingSettings(snap.data())
            : DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
