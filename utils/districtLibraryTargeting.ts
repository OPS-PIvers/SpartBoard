// District library targeting; isTargetedAt mirrors dlTargeted() in firestore.rules.
import { BUILDING_ID_ALIASES, canonicalBuildingId } from '@/config/buildings';
import { bandsFromGrades, normalizeGrades } from '@/utils/gradeMatch';
import type { GradeLevel } from '@/types';
import type {
  DistrictLibraryIndex,
  DistrictLibraryIndexEntry,
  DistrictLibraryItem,
  DistrictLibraryTargeting,
  DistrictLibraryViewer,
} from '@/types/districtLibrary';

export interface TargetingBuilding {
  id: string;
  gradeLevels: readonly GradeLevel[];
}

/** Canonical ids plus every legacy alias, so a profile in either form matches. */
export function expandBuildingAliases(ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const canonical = canonicalBuildingId(raw);
    out.add(canonical);
    for (const [legacy, target] of Object.entries(BUILDING_ID_ALIASES)) {
      if (target === canonical) out.add(legacy);
    }
  }
  return [...out].sort();
}

/** Buildings (with aliases) whose grade bands include any of `grades`. */
export function gradeBuildingsFor(
  grades: readonly string[],
  buildings: readonly TargetingBuilding[]
): string[] {
  const bands = new Set(bandsFromGrades(grades));
  if (bands.size === 0) return [];
  const ids = buildings
    .filter((b) => b.gradeLevels.some((band) => bands.has(band)))
    .map((b) => b.id);
  return expandBuildingAliases(ids);
}

const EMAIL = /^[^@\s]+@[^@\s]+$/;

/** Splits pasted emails on commas, semicolons and whitespace; lowercased and deduplicated. */
export function parseEmails(text: string): {
  emails: string[];
  invalid: string[];
} {
  const emails = new Set<string>();
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const value = part.trim().toLowerCase();
    if (!value) continue;
    if (EMAIL.test(value)) emails.add(value);
    else invalid.push(part.trim());
  }
  return { emails: [...emails].sort(), invalid };
}

/** Clean targeting fields ready to write, plus the derived `gradeBuildings`. */
export function normalizeTargeting(
  input: DistrictLibraryTargeting,
  buildings: readonly TargetingBuilding[]
): DistrictLibraryTargeting & { gradeBuildings: string[] } {
  const targetGrades = normalizeGrades(input.targetGrades);
  return {
    everyone: input.everyone,
    targetBuildings: input.everyone
      ? []
      : expandBuildingAliases(input.targetBuildings),
    targetGrades: input.everyone ? [] : targetGrades,
    targetEmails: input.everyone
      ? []
      : parseEmails(input.targetEmails.join(' ')).emails,
    gradeBuildings: input.everyone
      ? []
      : gradeBuildingsFor(targetGrades, buildings),
  };
}

/** True when the item reaches nobody yet. */
export function targetsNobody(t: DistrictLibraryTargeting): boolean {
  return (
    !t.everyone &&
    t.targetBuildings.length === 0 &&
    t.targetGrades.length === 0 &&
    t.targetEmails.length === 0
  );
}

/** Same test as dlTargeted() in firestore.rules. */
export function isTargetedAt(
  item: DistrictLibraryIndexEntry & { targetEmails?: readonly string[] },
  viewer: DistrictLibraryViewer
): boolean {
  if (item.everyone) return true;
  const email = viewer.email.toLowerCase();
  if (email && (item.targetEmails ?? []).includes(email)) return true;
  const buildings = new Set(viewer.buildings);
  if (item.targetBuildings.some((b) => buildings.has(b))) return true;
  if (item.targetGrades.some((g) => viewer.grades.includes(g))) return true;
  return (
    viewer.grades.length === 0 &&
    item.gradeBuildings.some((b) => buildings.has(b))
  );
}

/** Index doc content: every published item's targeting without names. */
export function buildDistrictLibraryIndex(
  items: readonly DistrictLibraryItem[],
  now: number
): DistrictLibraryIndex {
  const out: Record<string, DistrictLibraryIndexEntry> = {};
  for (const item of items) {
    if (item.status !== 'published') continue;
    out[item.id] = {
      everyone: item.everyone,
      targetBuildings: [...item.targetBuildings],
      targetGrades: [...item.targetGrades],
      gradeBuildings: [...item.gradeBuildings],
    };
  }
  return { items: out, updatedAt: now };
}

/** Item ids the index says reach this viewer (named-teacher items come from a separate query). */
export function indexedItemIdsFor(
  index: DistrictLibraryIndex | null,
  viewer: DistrictLibraryViewer
): string[] {
  if (!index) return [];
  return Object.entries(index.items)
    .filter(([, entry]) => isTargetedAt(entry, viewer))
    .map(([id]) => id)
    .sort();
}

/** Short plain-language summary for admin rows. */
export function describeTargeting(
  t: DistrictLibraryTargeting,
  buildingName: (id: string) => string
): string {
  if (t.everyone) return 'Everyone';
  const parts: string[] = [];
  const canonical = [...new Set(t.targetBuildings.map(canonicalBuildingId))];
  if (canonical.length > 0) parts.push(canonical.map(buildingName).join(', '));
  if (t.targetGrades.length > 0) {
    parts.push(
      t.targetGrades.map((g) => (g === 'K' ? 'K' : `Grade ${g}`)).join(', ')
    );
  }
  if (t.targetEmails.length > 0) {
    parts.push(
      `${t.targetEmails.length} ${t.targetEmails.length === 1 ? 'teacher' : 'teachers'}`
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'Nobody yet';
}
