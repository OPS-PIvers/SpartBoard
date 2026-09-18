/** Admin-curated `admin_settings/roster_groups_integration` rollout switch for roster groups in widgets. */

export const ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC =
  'roster_groups_integration';

export interface RosterGroupsIntegrationSettings {
  /**
   * Surface saved class groups inside board widgets. Ships OFF: a group can be
   * named "Modified Assessments" and boards are projected, so the privacy
   * behaviour (docs/plans/ROSTER_GROUPS_INTEGRATION.md §2) has to be verified
   * in a browser before any teacher sees it, and flipping it back is the kill
   * switch.
   */
  enabled: boolean;
}

export const DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS: RosterGroupsIntegrationSettings =
  {
    enabled: false,
  };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeRosterGroupsIntegrationSettings(
  raw: unknown
): RosterGroupsIntegrationSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_ROSTER_GROUPS_INTEGRATION_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
