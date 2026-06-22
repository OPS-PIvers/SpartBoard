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
 *   2. If the user has NO org (`orgId == null` — external/free-tier, or a
 *      provider-less test render), return an EMPTY list. Buildings are an
 *      org concept; falling back to the Orono seed here would leak another
 *      district's real school names to a no-org user. The genuine
 *      org-set-but-loading window (orgId present, snapshot not yet in) is
 *      handled by case 3.
 *   3. Otherwise (an org IS set but its buildings snapshot is empty — initial
 *      load, or an org that hasn't migrated its building data) fall back to
 *      the hardcoded {@link BUILDINGS} seed list so the UI still renders. Orono
 *      reaches this only briefly during its first snapshot, after which its
 *      Firestore-hydrated buildings (case 1) take over — so Orono is unaffected.
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
  // If no provider is mounted, `orgId` is undefined — treated like "no org" so
  // a provider-less render yields an empty list rather than another district's
  // seed names.
  const auth = useContext(AuthContext);
  const orgBuildings = auth?.orgBuildings;
  const orgId = auth?.orgId ?? null;

  return useMemo(() => {
    if (orgBuildings && orgBuildings.length > 0) {
      return orgBuildings.map(buildingRecordToBuilding);
    }
    // No org (external/free-tier or provider-less): never leak the Orono seed.
    if (orgId === null) return [];
    // An org IS set but its buildings snapshot hasn't landed yet (or is empty):
    // keep the seed so the admin UI renders during the org-set-but-loading
    // window. Orono only hits this transiently before its Firestore buildings
    // hydrate.
    return BUILDINGS;
  }, [orgBuildings, orgId]);
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
  const orgId = auth?.orgId ?? null;
  // `orgBuildingsLoaded` flips to true after the first snapshot (or the
  // "no org" reset). The seed fallback is returned in the org-set-but-loading
  // window so the UI never shows blank, but consumers can suppress destructive
  // actions (like removing orphan chips) until the list is confirmed.
  const orgBuildingsLoaded = auth?.orgBuildingsLoaded ?? false;

  const buildings = useMemo(() => {
    if (orgBuildings && orgBuildings.length > 0) {
      return orgBuildings.map(buildingRecordToBuilding);
    }
    // No org (external/free-tier or provider-less): empty, never the Orono seed.
    if (orgId === null) return [];
    // Org set but buildings snapshot not yet landed: seed placeholder.
    return BUILDINGS;
  }, [orgBuildings, orgId]);

  return { buildings, isLoading: !orgBuildingsLoaded };
}
