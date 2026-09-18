/** Live view of `admin_settings/roster_groups_integration`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS,
  ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC,
  normalizeRosterGroupsIntegrationSettings,
  type RosterGroupsIntegrationSettings,
} from '@/config/rosterGroupsIntegration';

export function useRosterGroupsIntegrationSettings(
  enabled: boolean = true
): RosterGroupsIntegrationSettings {
  const [settings, setSettings] = useState<RosterGroupsIntegrationSettings>(
    DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeRosterGroupsIntegrationSettings(snap.data())
            : DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
