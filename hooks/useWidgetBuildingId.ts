import { useContext } from 'react';
import { useAuth } from '@/context/useAuth';
import { WidgetBuildingOverrideContext } from '@/context/WidgetBuildingContextValue';
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
 *
 * Inside an override (the `/subs` portal) the share's building decides
 * instead, because the viewer's own buildings say nothing about a board
 * another teacher shared with them.
 */
export function useWidgetBuildingId(widget: WidgetData): string | undefined {
  const override = useContext(WidgetBuildingOverrideContext);
  const { selectedBuildings = [] } = useAuth();
  if (override) {
    return canonicalBuildingId(widget.buildingId ?? override);
  }
  return resolveWidgetBuildingId(widget, selectedBuildings);
}

/** The effective building for a widget outside any override: its own if still selected, else the primary one. */
export function resolveWidgetBuildingId(
  widget: Pick<WidgetData, 'buildingId'>,
  selectedBuildings: string[]
): string | undefined {
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
