import { RandomGroup, Station } from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';

/**
 * Convert Randomizer groups into a Stations widget config payload. Used by
 * the "Send Groups → Stations" button on the Randomizer settings panel; lives
 * in its own file so re-exporting it from Settings.tsx doesn't trip the
 * `react-refresh/only-export-components` lint rule.
 */
export const buildStationsFromRandomGroups = (
  groups: RandomGroup[]
): { stations: Station[]; assignments: Record<string, string | null> } => {
  const stations: Station[] = groups.map((group, i) => {
    const trimmed = group.id?.trim();
    return {
      id: crypto.randomUUID(),
      title: trimmed && trimmed.length > 0 ? trimmed : `Group ${i + 1}`,
      color: WIDGET_PALETTE[i % WIDGET_PALETTE.length],
      order: i,
    };
  });
  const assignments: Record<string, string | null> = {};
  groups.forEach((group, i) => {
    const station = stations[i];
    for (const name of group.names) {
      // Last write wins for duplicate names across groups — that's the only
      // sane choice given assignments are keyed by display name.
      assignments[name] = station.id;
    }
  });
  return { stations, assignments };
};
