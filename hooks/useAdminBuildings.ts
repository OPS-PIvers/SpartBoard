import { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { useOrgBuildings } from '@/hooks/useOrgBuildings';
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
 */
export function useAdminBuildings(): Building[] {
  // Use useContext directly rather than useAuth() so the hook still works in
  // test setups (e.g. WidgetBuildingToggle) that render without AuthProvider.
  // If no provider is mounted, fall back to the legacy BUILDINGS seed list.
  const auth = useContext(AuthContext);
  const orgId = auth?.orgId ?? null;
  const { buildings, loading } = useOrgBuildings(orgId);

  return useMemo(() => {
    if (loading || buildings.length === 0) {
      return BUILDINGS;
    }
    return buildings.map(buildingRecordToBuilding);
  }, [buildings, loading]);
}
