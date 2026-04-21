import { GradeLevel, LunchCountConfig } from '../types';
import type { BuildingRecord, BuildingType } from '../types/organization';

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

/**
 * Seed/default buildings used as a fallback when the organization has no
 * buildings configured in Firestore yet. Production buildings now come from
 * `/organizations/{orgId}/buildings` via {@link useAdminBuildings}.
 *
 * @deprecated Prefer the `useAdminBuildings()` hook in any component that
 * reads buildings. These constants remain only to support non-React callers
 * (e.g. the LunchCountConfig type narrowing) and initial-render fallback.
 */
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
 * O(1) lookup map for building details to avoid O(N) array scans during renders.
 */
export const BUILDINGS_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

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
 * Returns the union of grade levels for the given building IDs, resolving
 * against either the legacy hardcoded `BUILDINGS` list or an explicit list
 * passed by a caller that knows the org's buildings (e.g. from Firestore).
 *
 * Returns an empty array if no building IDs are provided, which widgets
 * should interpret as "show all content".
 */
export function getBuildingGradeLevels(
  buildingIds: string[],
  source: readonly Building[] = BUILDINGS
): GradeLevel[] {
  if (buildingIds.length === 0) return [];
  const byId = new Map(source.map((b) => [b.id, b]));
  const levels = new Set<GradeLevel>();
  for (const id of buildingIds) {
    const building = byId.get(id);
    if (building) {
      building.gradeLevels.forEach((l) => levels.add(l));
    }
  }
  return Array.from(levels);
}

/**
 * Parses a free-form grade string (e.g. "K-2", "3-5", "K-5", "Pre-K",
 * "K-12") into the canonical `GradeLevel[]` buckets used by widget
 * filtering. Unknown strings fall back to an empty array (widgets interpret
 * this as "show universal content only").
 */
export function parseGradeLevels(grades: string): GradeLevel[] {
  const normalized = grades.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return [];

  const known: Record<string, GradeLevel[]> = {
    'k-2': ['k-2'],
    '3-5': ['3-5'],
    '6-8': ['6-8'],
    '9-12': ['9-12'],
    'k-5': ['k-2', '3-5'],
    'k-6': ['k-2', '3-5', '6-8'],
    'k-8': ['k-2', '3-5', '6-8'],
    'k-12': ['k-2', '3-5', '6-8', '9-12'],
    'pre-k': ['k-2'],
    prek: ['k-2'],
    'pre-k-2': ['k-2'],
    '6-12': ['6-8', '9-12'],
    '7-12': ['6-8', '9-12'],
  };
  if (known[normalized]) return known[normalized];

  // Try generic "N-M" numeric range.
  const match = normalized.match(/^(?:k|pre-?k|(\d+))-(\d+)$/);
  if (match) {
    const low = match[1] ? parseInt(match[1], 10) : 0; // treat K/Pre-K as 0
    const high = parseInt(match[2], 10);
    const buckets: GradeLevel[] = [];
    if (low <= 2) buckets.push('k-2');
    if (low <= 5 && high >= 3) buckets.push('3-5');
    if (low <= 8 && high >= 6) buckets.push('6-8');
    if (high >= 9) buckets.push('9-12');
    return buckets;
  }

  return [];
}

/**
 * Fallback grade levels derived from a BuildingRecord's type when the
 * `grades` string is unparseable.
 */
function gradesFromType(type: BuildingType): GradeLevel[] {
  switch (type) {
    case 'elementary':
      return ['k-2', '3-5'];
    case 'middle':
      return ['6-8'];
    case 'high':
      return ['9-12'];
    default:
      return [];
  }
}

/**
 * Adapts an org's `BuildingRecord` (the Firestore shape used by the
 * Organization admin panel) into the `Building` shape that widget admin
 * configuration panels expect.
 */
export function buildingRecordToBuilding(record: BuildingRecord): Building {
  const parsed = parseGradeLevels(record.grades);
  const gradeLevels = parsed.length > 0 ? parsed : gradesFromType(record.type);
  return {
    id: record.id,
    name: record.name,
    gradeLevels,
    gradeLabel: record.grades || gradeLabelFromType(record.type),
    // NOTE: LunchCount's `schoolSite` is still a fixed literal union in
    // `LunchCountConfig` and `isLunchCountBuilding()` only recognises the four
    // legacy seeded IDs. A dynamically-added Firestore building cannot yet be
    // used as a LunchCount site even if this flag is true — it is only used by
    // admin UIs (e.g. the LunchCount configuration panel) to decide whether to
    // offer the building as an option. Widening `schoolSite` to string and
    // teaching `useNutrislice` about dynamic building IDs is tracked as
    // follow-up work and intentionally out of scope here.
    supportsLunchCount: record.type === 'elementary',
  };
}

function gradeLabelFromType(type: BuildingType): string {
  switch (type) {
    case 'elementary':
      return 'K-5';
    case 'middle':
      return '6-8';
    case 'high':
      return '9-12';
    default:
      return '';
  }
}
