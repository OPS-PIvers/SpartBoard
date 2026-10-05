// Normalizes the artifact db export (an ArtifactData list of decks/<deckId>/grades) into GradeRow[].

import type { Level } from '../types.ts';
import type { GradeRow } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** Accepts GradeRow[], [{id, data}], or {docs|documents|items: [...]}. Rows that don't validate are dropped. */
export function parseGradeRows(raw: unknown): GradeRow[] {
  const top = asRecord(raw);
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : ((top?.docs ?? top?.documents ?? top?.items ?? []) as unknown[]);
  const rows: GradeRow[] = [];
  for (const item of list) {
    const outer = asRecord(item);
    if (!outer) continue;
    const data = asRecord(outer.data) ?? outer;
    const cardId =
      typeof data.cardId === 'string'
        ? data.cardId
        : typeof outer.id === 'string'
          ? outer.id
          : null;
    const level = data.level;
    if (
      !cardId ||
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < 0 ||
      level > 4 ||
      typeof data.gradedAt !== 'string' ||
      !TIMESTAMP.test(data.gradedAt)
    )
      continue;
    const text = (k: string) =>
      typeof data[k] === 'string' && (data[k] as string).trim()
        ? { [k]: (data[k] as string).slice(0, 2000) }
        : {};
    rows.push({
      cardId,
      level: level as Level,
      ...text('note'),
      ...text('missed'),
      ...(data.exemplar === true ? { exemplar: true } : {}),
      gradedAt: data.gradedAt,
    });
  }
  return rows;
}
