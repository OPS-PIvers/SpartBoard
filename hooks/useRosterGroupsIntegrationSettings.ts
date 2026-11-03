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
  return useRosterGroupsIntegrationSettingsState(enabled).settings;
}

/** The same view plus whether the doc has answered yet, for callers that must not act on the stand-in default. */
export function useRosterGroupsIntegrationSettingsState(
  enabled: boolean = true
): { settings: RosterGroupsIntegrationSettings; loaded: boolean } {
  const [state, setState] = useState({
    settings: DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS,
    loaded: false,
  });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC),
      (snap) =>
        setState({
          settings: snap.exists()
            ? normalizeRosterGroupsIntegrationSettings(snap.data())
            : DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS,
          loaded: true,
        }),
      // An unreadable doc must hide the feature, never strand it half-on.
      () =>
        setState({
          settings: DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS,
          loaded: true,
        })
    );
  }, [enabled]);

  return state;
}
