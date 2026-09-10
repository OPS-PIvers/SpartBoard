import {
  LEARNING_TARGET_LIST_CAP,
  LearningTarget,
  LearningTargetList,
  QuestionTargetTag,
  StandardBenchmark,
} from '@/types';

export interface TargetDraft {
  code?: string;
  label: string;
  standardIds?: string[];
}

export interface TargetCsvRow {
  code?: string;
  label: string;
  standardCodes: string[];
}

export interface TargetCsvError {
  line: number;
  message: string;
}

export interface TargetCsvResult {
  rows: TargetCsvRow[];
  errors: TargetCsvError[];
}

export type MasteryCutoffs = NonNullable<LearningTargetList['masteryCutoffs']>;

export const DEFAULT_MASTERY_CUTOFFS: MasteryCutoffs = {
  proficient: 80,
  approaching: 60,
};

export const EMPTY_LEARNING_TARGET_LIST: LearningTargetList = {
  targets: [],
  updatedAt: 0,
};

/** Lines of `CODE | description` or bare `description`; blanks skipped. */
export function parsePastedTargets(
  text: string
): { code?: string; label: string }[] {
  const out: { code?: string; label: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.indexOf('|');
    if (bar === -1) {
      out.push({ label: line });
      continue;
    }
    const code = line.slice(0, bar).trim();
    const label = line.slice(bar + 1).trim();
    if (!label) {
      if (code) out.push({ label: code });
      continue;
    }
    out.push(code ? { code, label } : { label });
  }
  return out;
}

/** RFC 4180 parser: returns rows of fields, handling quoted commas/newlines and "" escapes. */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const LABEL_HEADERS = new Set(['label', 'target']);

/** Header row: `code` (optional), `label`/`target` (required), `standards` (optional, `;`-separated). */
export function parseTargetsCsv(text: string): TargetCsvResult {
  const records = parseCsvRecords(text);
  const errors: TargetCsvError[] = [];
  const rows: TargetCsvRow[] = [];
  const headerIdx = records.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (headerIdx === -1) {
    return { rows, errors: [{ line: 1, message: 'File is empty' }] };
  }
  const header = records[headerIdx].map((h) => h.trim().toLowerCase());
  const labelCol = header.findIndex((h) => LABEL_HEADERS.has(h));
  if (labelCol === -1) {
    return {
      rows,
      errors: [
        {
          line: headerIdx + 1,
          message: 'Missing required "label" (or "target") column',
        },
      ],
    };
  }
  const codeCol = header.indexOf('code');
  const standardsCol = header.indexOf('standards');
  for (let r = headerIdx + 1; r < records.length; r += 1) {
    const rec = records[r];
    const line = r + 1;
    if (rec.every((c) => c.trim() === '')) continue;
    const label = (rec[labelCol] ?? '').trim();
    if (!label) {
      errors.push({ line, message: 'Missing label' });
      continue;
    }
    const code = codeCol === -1 ? '' : (rec[codeCol] ?? '').trim();
    const standardCodes =
      standardsCol === -1
        ? []
        : (rec[standardsCol] ?? '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean);
    rows.push(code ? { code, label, standardCodes } : { label, standardCodes });
  }
  return { rows, errors };
}

function newId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `lt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanDraft(draft: TargetDraft): Omit<TargetDraft, 'label'> & {
  label: string;
} {
  const label = draft.label.trim();
  const code = draft.code?.trim();
  const standardIds = draft.standardIds?.filter(Boolean);
  const out: TargetDraft = { label };
  if (code) out.code = code;
  if (standardIds && standardIds.length > 0) out.standardIds = standardIds;
  return out;
}

function assertUnderCap(count: number): void {
  if (count > LEARNING_TARGET_LIST_CAP) {
    throw new Error(
      `A learning target list can hold at most ${LEARNING_TARGET_LIST_CAP} targets`
    );
  }
}

/** Insert or replace by id; a new id must fit under the cap. */
export function upsertTarget(
  list: LearningTargetList,
  target: LearningTarget
): LearningTargetList {
  const idx = list.targets.findIndex((t) => t.id === target.id);
  const targets = list.targets.slice();
  if (idx === -1) {
    assertUnderCap(targets.length + 1);
    targets.push(target);
  } else {
    targets[idx] = target;
  }
  return { ...list, targets, updatedAt: target.updatedAt };
}

export function archiveTarget(
  list: LearningTargetList,
  id: string,
  now: number = Date.now()
): LearningTargetList {
  const idx = list.targets.findIndex((t) => t.id === id);
  if (idx === -1) return list;
  const targets = list.targets.slice();
  targets[idx] = { ...targets[idx], archived: true, updatedAt: now };
  return { ...list, targets, updatedAt: now };
}

export function unarchiveTarget(
  list: LearningTargetList,
  id: string,
  now: number = Date.now()
): LearningTargetList {
  const idx = list.targets.findIndex((t) => t.id === id);
  if (idx === -1) return list;
  const targets = list.targets.slice();
  const { archived: _archived, ...rest } = targets[idx];
  targets[idx] = { ...rest, updatedAt: now };
  return { ...list, targets, updatedAt: now };
}

/** Append drafts (blank labels dropped); throws when the result would exceed the cap. */
export function addTargets(
  list: LearningTargetList,
  drafts: TargetDraft[],
  now: number = Date.now()
): LearningTargetList {
  const cleaned = drafts.map(cleanDraft).filter((d) => d.label);
  if (cleaned.length === 0) return list;
  assertUnderCap(list.targets.length + cleaned.length);
  const added: LearningTarget[] = cleaned.map((d) => ({
    id: newId(),
    ...d,
    createdAt: now,
    updatedAt: now,
  }));
  return { ...list, targets: [...list.targets, ...added], updatedAt: now };
}

function isPercentInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100;
}

/** Validates ints 0..100 with approaching ≤ proficient. */
export function setMasteryCutoffs(
  list: LearningTargetList,
  cutoffs: MasteryCutoffs,
  now: number = Date.now()
): LearningTargetList {
  if (!isPercentInt(cutoffs.proficient) || !isPercentInt(cutoffs.approaching)) {
    throw new Error('Mastery cutoffs must be whole numbers from 0 to 100');
  }
  if (cutoffs.approaching > cutoffs.proficient) {
    throw new Error('Approaching cutoff must not exceed the proficient cutoff');
  }
  return {
    ...list,
    masteryCutoffs: {
      proficient: cutoffs.proficient,
      approaching: cutoffs.approaching,
    },
    updatedAt: now,
  };
}

export function tagFromTarget(
  target: LearningTarget,
  kind: 'plc' | 'personal',
  ownerId?: string
): QuestionTargetTag {
  const tag: QuestionTargetTag = { id: target.id, kind, label: target.label };
  if (kind === 'plc' && ownerId) tag.ownerId = ownerId;
  if (target.code) tag.code = target.code;
  if (target.standardIds && target.standardIds.length > 0) {
    tag.standardIds = [...target.standardIds];
  }
  return tag;
}

export function tagFromBenchmark(b: StandardBenchmark): QuestionTargetTag {
  return { id: b.id, kind: 'standard', code: b.code, label: b.text };
}
