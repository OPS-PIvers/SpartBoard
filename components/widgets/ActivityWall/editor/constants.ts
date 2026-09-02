import type { ActivityWallSection } from '@/types';

/** Fallback center when a map wall has never been positioned (US view, zoom 3). */
export const DEFAULT_MAP_CENTER = { lat: 39.5, lng: -98.35, zoom: 3 };

/** Layout-specific structure fields edited by `SectionsEditor`. */
export interface WallStructure {
  sections?: ActivityWallSection[];
  tableRows?: ActivityWallSection[];
  tableCols?: ActivityWallSection[];
  mapCenter?: { lat: number; lng: number; zoom: number };
}
