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
  return useImportConversionSettingsState(enabled).settings;
}

/** The settings plus whether the first read has come back, for choices that can't wait to be corrected. */
export function useImportConversionSettingsState(enabled: boolean = true): {
  settings: ImportConversionSettings;
  loaded: boolean;
} {
  const [state, setState] = useState({
    settings: DEFAULT_IMPORT_CONVERSION_SETTINGS,
    loaded: false,
  });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', IMPORT_CONVERSION_SETTINGS_DOC),
      (snap) =>
        setState({
          settings: snap.exists()
            ? normalizeImportConversionSettings(snap.data())
            : DEFAULT_IMPORT_CONVERSION_SETTINGS,
          loaded: true,
        }),
      // An unreadable doc must keep AI off, never strand it half-on.
      () =>
        setState({ settings: DEFAULT_IMPORT_CONVERSION_SETTINGS, loaded: true })
    );
  }, [enabled]);

  return state;
}
