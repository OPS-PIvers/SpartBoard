// CSV import/export for M12 written-response rubrics (see
// docs/specs/M12-written-response-rubrics-spec.md §7).
//
// The RFC-4180 row/cell tokenizer below is duplicated from
// `utils/csvImport.ts` rather than shared — see the cross-reference comment
// there. Both parsers are small and dependency-free by design; keeping them
// independent avoids coupling the bulk-invite flow's column model to the
// rubric one.

import type { Rubric, RubricCriterion, RubricLevel } from '@/types';

export interface ParseRubricResult {
  rubric: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'> | null;
  errors: Array<{ line: number; reason: string }>;
  warnings: Array<{ line: number; reason: string }>;
}

const MAX_LEVELS = 6;
const MIN_LEVELS = 2;

// ---------------------------------------------------------------------------
// RFC 4180 line/cell tokenization (duplicated from utils/csvImport.ts — see
// the cross-reference comment there).
// ---------------------------------------------------------------------------

function splitLogicalRows(source: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      rows.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function parseRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** Quote a cell for CSV output if it contains a comma, quote, or newline. */
function quoteCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface LevelColumnGroup {
  n: number;
  labelIdx: number;
  pointsIdx: number;
  descriptionIdx?: number;
}

/** Locate `Criterion`, `Description`, and `Level N ...` columns by header name. */
function buildColumnIndex(headerCells: string[]): {
  criterionIdx: number | undefined;
  descriptionIdx: number | undefined;
  levelGroups: LevelColumnGroup[];
} {
  let criterionIdx: number | undefined;
  let descriptionIdx: number | undefined;
  const levelGroups = new Map<number, LevelColumnGroup>();

  headerCells.forEach((raw, idx) => {
    const name = raw.trim();
    if (/^criterion$/i.test(name)) {
      criterionIdx = idx;
      return;
    }
    if (/^description$/i.test(name)) {
      descriptionIdx = idx;
      return;
    }
    const levelMatch = name.match(
      /^Level\s+(\d+)\s+(Label|Points|Description)$/i
    );
    if (!levelMatch) return;
    const n = Number(levelMatch[1]);
    if (n < 1 || n > MAX_LEVELS) return;
    const field = levelMatch[2].toLowerCase();
    const group = levelGroups.get(n) ?? { n, labelIdx: -1, pointsIdx: -1 };
    if (field === 'label') group.labelIdx = idx;
    else if (field === 'points') group.pointsIdx = idx;
    else if (field === 'description') group.descriptionIdx = idx;
    levelGroups.set(n, group);
  });

  return {
    criterionIdx,
    descriptionIdx,
    levelGroups: Array.from(levelGroups.values())
      .filter((g) => g.labelIdx >= 0 && g.pointsIdx >= 0)
      .sort((a, b) => a.n - b.n),
  };
}

export function parseRubricCsv(text: string): ParseRubricResult {
  if (!text.trim()) {
    return {
      rubric: null,
      errors: [{ line: 0, reason: 'CSV is empty.' }],
      warnings: [],
    };
  }

  const logicalRows = splitLogicalRows(text);
  if (logicalRows.length === 0) {
    return {
      rubric: null,
      errors: [{ line: 0, reason: 'CSV is empty.' }],
      warnings: [],
    };
  }

  const headerCells = parseRow(logicalRows[0]);
  const { criterionIdx, descriptionIdx, levelGroups } =
    buildColumnIndex(headerCells);

  if (criterionIdx === undefined) {
    return {
      rubric: null,
      errors: [{ line: 1, reason: 'CSV must include a "Criterion" column.' }],
      warnings: [],
    };
  }

  const errors: ParseRubricResult['errors'] = [];
  const warnings: ParseRubricResult['warnings'] = [];
  const criteria: RubricCriterion[] = [];

  for (let i = 1; i < logicalRows.length; i++) {
    const raw = logicalRows[i];
    if (!raw.trim()) continue;
    const line = i + 1;
    const cells = parseRow(raw);

    const name = cells[criterionIdx]?.trim() ?? '';
    if (!name) {
      errors.push({ line, reason: 'Missing Criterion name.' });
      continue;
    }

    const levels: RubricLevel[] = [];
    for (const group of levelGroups) {
      const label = cells[group.labelIdx]?.trim() ?? '';
      if (!label) continue;
      const rawPoints = cells[group.pointsIdx]?.trim() ?? '';
      const points = Number(rawPoints);
      if (!/^\d+$/.test(rawPoints) || !Number.isInteger(points) || points < 0) {
        errors.push({
          line,
          reason: `Level ${group.n} Points must be a non-negative integer (got "${rawPoints}").`,
        });
        continue;
      }
      const description =
        group.descriptionIdx !== undefined
          ? cells[group.descriptionIdx]?.trim()
          : undefined;
      const level: RubricLevel = { id: crypto.randomUUID(), label, points };
      if (description) level.description = description;
      levels.push(level);
    }

    if (levels.length > MAX_LEVELS) {
      warnings.push({
        line,
        reason: `Criterion "${name}" has more than ${MAX_LEVELS} levels; truncated to ${MAX_LEVELS}.`,
      });
      levels.length = MAX_LEVELS;
    }

    if (levels.length < MIN_LEVELS) {
      errors.push({
        line,
        reason: `Criterion "${name}" needs at least ${MIN_LEVELS} valid levels (found ${levels.length}).`,
      });
      continue;
    }

    const description =
      descriptionIdx !== undefined ? cells[descriptionIdx]?.trim() : undefined;
    const criterion: RubricCriterion = {
      id: crypto.randomUUID(),
      name,
      levels,
    };
    if (description) criterion.description = description;
    criteria.push(criterion);
  }

  if (criteria.length === 0) {
    return { rubric: null, errors, warnings };
  }

  return {
    rubric: { title: 'Imported Rubric', criteria },
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/** Inverse of `parseRubricCsv`. Pads shorter criteria with empty cells. */
export function rubricToCsv(rubric: Rubric): string {
  const maxLevels = Math.min(
    MAX_LEVELS,
    rubric.criteria.reduce((max, c) => Math.max(max, c.levels.length), 0)
  );

  const header: string[] = ['Criterion', 'Description'];
  for (let n = 1; n <= maxLevels; n++) {
    header.push(
      `Level ${n} Label`,
      `Level ${n} Points`,
      `Level ${n} Description`
    );
  }

  const rows = rubric.criteria.map((c) => {
    const row: string[] = [c.name, c.description ?? ''];
    for (let n = 0; n < maxLevels; n++) {
      const level = c.levels[n];
      row.push(
        level?.label ?? '',
        level ? String(level.points) : '',
        level?.description ?? ''
      );
    }
    return row;
  });

  return [header, ...rows]
    .map((row) => row.map(quoteCell).join(','))
    .join('\r\n');
}
