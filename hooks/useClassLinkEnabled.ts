import { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { ClassesGlobalConfig } from '@/types';

/**
 * Resolves whether ClassLink sync should be visible for a given building.
 *
 * Looks up the `classes` feature permission's `buildingDefaults[buildingId]`
 * setting, which is managed by the admin `ClassesConfigurationPanel`. Defaults
 * to enabled when no building is selected or no override is configured.
 *
 * External (no-org/free-tier) users never see ClassLink: it's a roster-import
 * integration tied to an org's SSO/roster provider. The gate is keyed on
 * `orgId`, NOT on `selectedBuildings` — an Orono (org) teacher who hasn't
 * picked a building yet must still see ClassLink exactly as before, so we must
 * not conflate "no building selected" with "no org". Orono always resolves a
 * non-null `orgId`. `orgId` is null both for genuine no-org users and during
 * the brief membership-loading window; treating the loading window as "no
 * ClassLink" is the safe default (the button simply appears once membership
 * resolves for an org member — same late-appearance as every other
 * snapshot-driven affordance).
 */
export function useClassLinkEnabled(buildingId?: string): boolean {
  const { featurePermissions, orgId } = useAuth();
  return useMemo(() => {
    if (orgId === null) return false;
    if (!buildingId) return true;
    const perm = featurePermissions.find((p) => p.widgetType === 'classes');
    const config = perm?.config as Partial<ClassesGlobalConfig> | undefined;
    return config?.buildingDefaults?.[buildingId]?.classLinkEnabled ?? true;
  }, [featurePermissions, buildingId, orgId]);
}
