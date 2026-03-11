import { GradeLevel, LunchCountConfig } from '../types';

/**
 * Represents a school building with its associated grade levels.
 * Used to drive per-user widget content preferences (e.g. which
 * instructional routines appear) without requiring manual per-widget toggles.
 */
export interface Building {
  /** Stable identifier — should match the schoolSite IDs used in LunchCount */
  id: string;
  /** Display name shown in settings */
  name: string;
  /** Grade levels taught at this building */
  gradeLevels: GradeLevel[];
  /** Short human-readable label for the grade range, e.g. "K-2" */
  gradeLabel: string;
  /** Whether this building uses the LunchCount widget */
  supportsLunchCount?: boolean;
}

export const BUILDINGS: Building[] = [
  {
    id: 'schumann-elementary',
    name: 'Schumann Elementary',
    gradeLevels: ['k-2'],
    gradeLabel: 'K-2',
    supportsLunchCount: true,
  },
  {
    id: 'orono-intermediate-school',
    name: 'Orono Intermediate',
    gradeLevels: ['3-5'],
    gradeLabel: '3-5',
    supportsLunchCount: true,
  },
  {
    id: 'orono-middle-school',
    name: 'Orono Middle School',
    gradeLevels: ['6-8'],
    gradeLabel: '6-8',
    supportsLunchCount: true,
  },
  {
    id: 'orono-high-school',
    name: 'Orono High School',
    gradeLevels: ['9-12'],
    gradeLabel: '9-12',
    supportsLunchCount: true,
  },
];

/**
 * IDs of buildings that support the LunchCount widget.
 * Derived from BUILDINGS to keep a single source of truth.
 */
export const LUNCH_COUNT_BUILDING_IDS: ReadonlySet<string> = new Set(
  BUILDINGS.filter((b) => b.supportsLunchCount).map((b) => b.id)
);

/**
 * Narrows a building ID string to the LunchCountConfig['schoolSite'] literal
 * union, allowing type-safe use of the value as a config field without
 * requiring `as` assertions at call sites.
 */
export function isLunchCountBuilding(
  id: string
): id is LunchCountConfig['schoolSite'] {
  return LUNCH_COUNT_BUILDING_IDS.has(id);
}

/**
 * Returns the union of grade levels for the given building IDs.
 * Returns an empty array if no building IDs are provided, which
 * widgets should interpret as "show all content".
 */
export function getBuildingGradeLevels(buildingIds: string[]): GradeLevel[] {
  if (buildingIds.length === 0) return [];
  const levels = new Set<GradeLevel>();
  for (const id of buildingIds) {
    const building = BUILDINGS.find((b) => b.id === id);
    if (building) {
      building.gradeLevels.forEach((l) => levels.add(l));
    }
  }
  return Array.from(levels);
}
