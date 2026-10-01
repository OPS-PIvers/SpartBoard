// Building id aliases and canonicalization shared by server code.

/** Mirrors `BUILDING_ID_ALIASES` in `config/buildings.ts`; functions cannot import it. */
export const BUILDING_ID_ALIASES: Readonly<Record<string, string>> = {
  'orono-high-school': 'high',
  'orono-middle-school': 'middle',
  'orono-intermediate-school': 'intermediate',
  'schumann-elementary': 'schumann',
};

/** The canonical id for one stored building id. */
export function canonicalBuildingIdServer(id: string): string {
  return BUILDING_ID_ALIASES[id] ?? id;
}

/** Server twin of `canonicalizeBuildingIds` — legacy ids, de-duplicated. */
export function canonicalizeBuildingIdsServer(
  ids: readonly unknown[]
): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const canonical = canonicalBuildingIdServer(raw);
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/** Every stored id that canonicalizes to `canonicalId`, itself first. */
export function buildingIdVariants(canonicalId: string): string[] {
  const out = [canonicalId];
  for (const [legacy, canonical] of Object.entries(BUILDING_ID_ALIASES)) {
    if (canonical === canonicalId && !out.includes(legacy)) out.push(legacy);
  }
  return out;
}
