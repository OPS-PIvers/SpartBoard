import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import type {
  ArtsLettersAgendaPart,
  ArtsLettersAgendaVersion,
  BuildingArtsLettersAgendaDefaults,
} from '@/types';
import {
  DEFAULT_AGENDA_PARTS,
  MAX_AGENDA_PARTS,
  PART_LABEL_MAX_LENGTH,
} from './constants';

/** Keeps well-formed, unique-id parts (capped); an empty result means "use the defaults". */
export const sanitizeAgendaParts = (
  value: unknown
): ArtsLettersAgendaPart[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ArtsLettersAgendaPart[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, label } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (typeof label !== 'string') continue;
    const trimmed = label.trim().slice(0, PART_LABEL_MAX_LENGTH);
    if (!trimmed) continue;
    seen.add(id);
    out.push({ id, label: trimmed });
    if (out.length === MAX_AGENDA_PARTS) break;
  }
  return out;
};

/** The stored list as the admin typed it: no trimming or dropping, so the editor never fights the keyboard. */
export const editableAgendaParts = (
  value: unknown
): ArtsLettersAgendaPart[] => {
  if (!Array.isArray(value)) return [];
  const out: ArtsLettersAgendaPart[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, label } = entry as Record<string, unknown>;
    if (typeof id === 'string' && id && typeof label === 'string') {
      out.push({ id, label });
    }
  }
  return out;
};

export interface AgendaPartLists {
  simple: ArtsLettersAgendaPart[];
  detailed: ArtsLettersAgendaPart[];
}

/** Reads one building's lists out of the widget's admin config; unset lists fall back to the defaults. */
export const resolveAgendaPartLists = (
  adminConfig: unknown,
  buildingId: string | undefined
): AgendaPartLists => {
  const raw = (
    adminConfig as
      | { buildingDefaults?: Record<string, BuildingArtsLettersAgendaDefaults> }
      | undefined
  )?.buildingDefaults;
  const building =
    raw && typeof raw === 'object' && buildingId
      ? canonicalizeBuildingKeyedRecord(raw)[canonicalBuildingId(buildingId)]
      : undefined;
  const simple = sanitizeAgendaParts(building?.simpleParts);
  const detailed = sanitizeAgendaParts(building?.detailedParts);
  return {
    simple: simple.length ? simple : DEFAULT_AGENDA_PARTS,
    detailed: detailed.length ? detailed : DEFAULT_AGENDA_PARTS,
  };
};

export const listsDiffer = (
  a: ArtsLettersAgendaPart[],
  b: ArtsLettersAgendaPart[]
) =>
  a.length !== b.length ||
  a.some((part, i) => part.id !== b[i].id || part.label !== b[i].label);

export const partsForVersion = (
  lists: AgendaPartLists,
  version: ArtsLettersAgendaVersion | undefined
): ArtsLettersAgendaPart[] =>
  version === 'detailed' ? lists.detailed : lists.simple;
