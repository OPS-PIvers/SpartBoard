import { useAuth } from '@/context/useAuth';
import { canonicalBuildingId } from '@/config/buildings';
import { WidgetData } from '@/types';

/**
 * Returns the effective building ID for a widget.
 * Prefers `widget.buildingId` if it's still in the user's selected buildings,
 * otherwise falls back to the user's primary building.
 *
 * Both the widget's stored `buildingId` and the user's `selectedBuildings`
 * are normalized via {@link canonicalBuildingId} before comparison so legacy
 * long-form IDs (e.g. `orono-high-school`) match their canonical short-form
 * equivalents (`high`).
 */
export function useWidgetBuildingId(widget: WidgetData): string | undefined {
  const { selectedBuildings = [] } = useAuth();
  const canonicalSelected = selectedBuildings.map((id) =>
    canonicalBuildingId(id)
  );
  if (widget.buildingId) {
    const widgetCanonical = canonicalBuildingId(widget.buildingId);
    if (canonicalSelected.includes(widgetCanonical)) {
      return widgetCanonical;
    }
  }
  return canonicalSelected[0];
}
