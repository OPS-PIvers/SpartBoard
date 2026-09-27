/**
 * The double gate for saved class groups in widgets
 * (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D23): the org-wide rollout switch
 * AND the per-user `roster-groups` permission.
 *
 * Both halves were spelled out at each call site through PR 3, which is
 * exactly the shape that let a sibling control ship ungated in PR 2. One
 * source, so the two can't drift apart again.
 */
import { useAuth } from '@/context/useAuth';
import { useRosterGroupsIntegrationSettings } from '@/hooks/useRosterGroupsIntegrationSettings';

export function useRosterGroupsGate(): boolean {
  const { canAccessFeature } = useAuth();
  const rollout = useRosterGroupsIntegrationSettings();
  return rollout.enabled && canAccessFeature('roster-groups');
}
