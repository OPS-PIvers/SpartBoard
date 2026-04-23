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
 * IDs MUST match the doc IDs that the Organization admin panel writes to
 * `/organizations/{orgId}/buildings/{id}` so user-profile selections,
 * member role assignments (`members.buildingIds`), and feature-permission
 * filtering all line up. Legacy long-form IDs (e.g. `orono-high-school`)
 * are handled via {@link BUILDING_ID_ALIASES} so existing stored data
 * continues to work.
 *
 * @deprecated Prefer the `useAdminBuildings()` hook in any component that
 * reads buildings. These constants remain only to support non-React callers
 * (e.g. the LunchCountConfig type narrowing) and initial-render fallback.
 */
export const BUILDINGS: Building[] = [
  {
    id: 'schumann',
    name: 'Schumann Elementary',
    gradeLevels: ['k-2'],
    gradeLabel: 'K-2',
    supportsLunchCount: true,
  },
  {
    id: 'intermediate',
    name: 'Orono Intermediate',
    gradeLevels: ['3-5'],
    gradeLabel: '3-5',
    supportsLunchCount: true,
  },
  {
    id: 'middle',
    name: 'Orono Middle School',
    gradeLevels: ['6-8'],
    gradeLabel: '6-8',
    supportsLunchCount: true,
  },
  {
    id: 'high',
    name: 'Orono High School',
    gradeLevels: ['9-12'],
    gradeLabel: '9-12',
    supportsLunchCount: true,
  },
  {
    id: 'orono-community-education',
    name: 'Orono Community Education',
    // K-12 building — show widgets across all grade bands.
    gradeLevels: ['k-2', '3-5', '6-8', '9-12'],
    gradeLabel: 'K-12',
    supportsLunchCount: false,
  },
  {
    id: 'orono-discovery-center',
    name: 'Orono Discovery Center',
    // Pre-K building. There is no Pre-K GradeLevel in the type union, so
    // map to k-2 (the closest band) so users still see early-elementary
    // widgets rather than nothing. Revisit if/when Pre-K becomes a first-
    // class GradeLevel.
    gradeLevels: ['k-2'],
    gradeLabel: 'Pre-K',
    supportsLunchCount: false,
  },
];

/**
 * Legacy → canonical building ID alias map.
 *
 * Background: prior to the Organization Buildings admin panel shipping,
 * the canonical IDs were the long forms below. User profiles, root user
 * docs, and Feature Permissions all stored these. When the panel began
 * writing short IDs (`high`, `intermediate`, etc.) to Firestore, the
 * two ID spaces drifted apart:
 *
 *   - Sidebar wrote `selectedBuildings: ['orono-high-school']` (legacy)
 *   - Org admin panel wrote `members.buildingIds: ['high']` (canonical)
 *
 * The two never matched, so feature-permission filtering, analytics
 * labelling, grade-level inference, and the sidebar's own selected-state
 * indicator all broke for affected users.
 *
 * The alias map lets every reader normalize legacy IDs to canonical IDs
 * transparently. A one-off backfill script
 * (`scripts/backfill-user-building-ids.js`) rewrites stored data to
 * canonical IDs so the alias map can eventually be retired.
 */
export const BUILDING_ID_ALIASES: Readonly<Record<string, string>> = {
  'orono-high-school': 'high',
  'orono-middle-school': 'middle',
  'orono-intermediate-school': 'intermediate',
  'schumann-elementary': 'schumann',
};

/**
 * Returns the canonical (current) building ID for a stored ID. If the
 * stored ID is already canonical or unknown, it is returned unchanged.
 *
 * All consumers that read building IDs from user profiles, member docs,
 * or Firestore should pass values through this before lookup so legacy
 * data continues to work.
 */
export function canonicalBuildingId(id: string): string {
  return BUILDING_ID_ALIASES[id] ?? id;
}

/**
 * Returns a new record whose keys have been normalized via
 * {@link canonicalBuildingId}. Use when reading Firestore data that is
 * keyed by building ID (e.g. `feature_permissions.*.config.dockDefaults`,
 * `buildingDefaults`) so legacy stored keys (`orono-high-school`) resolve
 * against canonical lookup IDs (`high`).
 *
 * If two source keys collapse to the same canonical ID, the later entry
 * in `Object.entries` iteration order wins. In practice this doesn't
 * occur today — the admin panel writes canonical keys only — but the
 * alias is deterministic regardless.
 */
export function canonicalizeBuildingKeyedRecord<T>(
  record: Readonly<Record<string, T>>
): Record<string, T> {
  // Object.create(null) instead of {} so that a stored key like
  // "__proto__" (however unlikely) doesn't walk the prototype chain or
  // trigger the __proto__ setter.
  const out = Object.create(null) as Record<string, T>;
  for (const [rawKey, value] of Object.entries(record)) {
    out[canonicalBuildingId(rawKey)] = value;
  }
  return out;
}

/**
 * Normalizes an array of building IDs in-place: legacy IDs become
 * canonical, and duplicates are dropped (preserving insertion order of
 * first occurrence). Returns a new array; the input is not mutated.
 */
export function canonicalizeBuildingIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const canonical = canonicalBuildingId(id);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

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
 * requiring `as` assertions at call sites. Normalizes legacy IDs first so
 * stored values like `schumann-elementary` are recognized.
 */
export function isLunchCountBuilding(
  id: string
): id is LunchCountConfig['schoolSite'] {
  return LUNCH_COUNT_BUILDING_IDS.has(canonicalBuildingId(id));
}

/**
 * Returns the union of grade levels for the given building IDs, resolving
 * against either the legacy hardcoded `BUILDINGS` list or an explicit list
 * passed by a caller that knows the org's buildings (e.g. from Firestore).
 *
 * Each input ID is normalized via {@link canonicalBuildingId} before
 * lookup, so legacy stored IDs (e.g. `orono-high-school`) resolve to the
 * same grade band as their canonical counterparts (`high`).
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
  for (const rawId of buildingIds) {
    const id = canonicalBuildingId(rawId);
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
