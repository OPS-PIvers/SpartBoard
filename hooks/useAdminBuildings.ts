import { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  BUILDINGS,
  Building,
  buildingRecordToBuilding,
} from '@/config/buildings';

/**
 * Returns the list of school buildings to display in admin UIs (widget
 * configuration panels, the dock defaults selector, the feature permissions
 * manager, etc.) in the legacy `Building` shape.
 *
 * Resolution order:
 *   1. If the user's org has buildings configured in Firestore
 *      (`/organizations/{orgId}/buildings`), use those — they're the
 *      source of truth now that buildings are manageable from
 *      Admin Settings &gt; Organization &gt; Buildings.
 *   2. Otherwise fall back to the hardcoded {@link BUILDINGS} seed list so
 *      the UI still renders during the initial snapshot load, in tests, or
 *      for orgs that haven't migrated their building data yet.
 *
 * The hook intentionally returns the same `Building` shape that
 * `config/buildings.ts` already exports, so existing panels can adopt it by
 * replacing a single `BUILDINGS` reference with a call to this hook.
 *
 * Reads from `AuthContext.orgBuildings` (a single AuthProvider-level
 * `onSnapshot`) rather than opening its own listener, so mounting
 * `useAdminBuildings` in many admin panels does not multiply Firestore
 * subscriptions to `/organizations/{orgId}/buildings`.
 */
export function useAdminBuildings(): Building[] {
  // Use useContext directly rather than useAuth() so the hook still works in
  // test setups (e.g. WidgetBuildingToggle) that render without AuthProvider.
  // If no provider is mounted, fall back to the legacy BUILDINGS seed list.
  const auth = useContext(AuthContext);
  const orgBuildings = auth?.orgBuildings;

  return useMemo(() => {
    if (!orgBuildings || orgBuildings.length === 0) {
      return BUILDINGS;
    }
    return orgBuildings.map(buildingRecordToBuilding);
  }, [orgBuildings]);
}

/**
 * Like {@link useAdminBuildings} but also exposes a loading signal.
 *
 * `isLoading` is `true` during the window between sign-in and the first
 * `orgBuildings` snapshot resolving. During this window the hook returns
 * the `BUILDINGS` seed list as a placeholder — consumers that need to
 * distinguish "definitive empty result" from "still loading" (e.g.
 * {@link PermissionBuildingMultiSelect} suppressing orphan chips) should
 * gate on `isLoading` instead of using the plain `useAdminBuildings()` hook.
 *
 * Does not break existing consumers of `useAdminBuildings`, which continues
 * to return `Building[]` unchanged.
 */
export function useAdminBuildingsState(): {
  buildings: Building[];
  isLoading: boolean;
} {
  const auth = useContext(AuthContext);
  const orgBuildings = auth?.orgBuildings;
  // `orgBuildingsLoaded` flips to true after the first snapshot (or the
  // "no org" reset). The seed fallback is returned in the loading window so
  // the UI never shows blank, but consumers can suppress destructive actions
  // (like removing orphan chips) until the list is confirmed.
  const orgBuildingsLoaded = auth?.orgBuildingsLoaded ?? false;

  const buildings = useMemo(() => {
    if (!orgBuildings || orgBuildings.length === 0) {
      return BUILDINGS;
    }
    return orgBuildings.map(buildingRecordToBuilding);
  }, [orgBuildings]);

  return { buildings, isLoading: !orgBuildingsLoaded };
}
