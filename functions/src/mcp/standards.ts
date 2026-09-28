// Minnesota standards tags on quiz and bank questions, mirroring tagFromBenchmark in utils/learningTargets.ts.
import type * as admin from 'firebase-admin';
import { ToolError } from './activity';

export const STANDARD_SETS = ['mn-ela-2020', 'mn-ss-2021'] as const;
export const MAX_STANDARDS_PER_QUESTION = 10;
/** Distinct codes per save, so one call reads at most 200 catalog docs. */
export const MAX_STANDARDS_PER_SAVE = 100;

/** QuestionTargetTag in types.ts. */
export interface TargetTag {
  id: string;
  kind: 'standard' | 'plc' | 'personal';
  ownerId?: string;
  code?: string;
  label: string;
  standardIds?: string[];
  parentId?: string;
  parentLabel?: string;
}

interface Benchmark {
  id: string;
  set: string;
  code: string;
  standard: string;
  text: string;
  standardCode?: string;
  standardTitle?: string;
}

const ELA_HEADING = /^([A-Z]{1,6}\s?\d{1,2})\b[.:]?\s*(.*)$/s;
const SS_HEADING = /^(\d{1,2})\.\s*(.*)$/s;
const TITLE_MAX = 72;

function shortTitle(rest: string): string {
  const colon = rest.indexOf(':');
  if (colon > 0) return rest.slice(0, colon).trim();
  const clause = rest.split(/[,;.]|\s-\s/)[0].trim();
  if (clause.length <= TITLE_MAX) return clause;
  return `${clause.slice(0, TITLE_MAX).replace(/\s+\S*$/, '')}…`;
}

/** Mirrors benchmarkHeading / parseStandardHeading in utils/standardsCatalog.ts. */
export function benchmarkHeading(b: Benchmark): {
  code: string;
  title: string;
} {
  if (b.standardCode && b.standardTitle !== undefined) {
    return { code: b.standardCode, title: b.standardTitle };
  }
  const text = b.standard.trim();
  const match = ELA_HEADING.exec(text) ?? SS_HEADING.exec(text);
  const title = shortTitle((match ? match[2] : text).trim());
  if (match) return { code: match[1].replace(/\s+/g, ' '), title };
  const parts = b.code.split('.');
  const code = parts.length >= 3 ? `${parts[1]}.${parts[2]}` : b.code;
  return { code, title: title || text };
}

export function tagFromBenchmark(b: Benchmark): TargetTag {
  const heading = benchmarkHeading(b);
  return {
    id: b.id,
    kind: 'standard',
    code: b.code,
    label: b.text,
    parentId: `${b.set}:std:${heading.code}`,
    parentLabel: heading.title || b.standard,
  };
}

/** Normalizes "MN ELA 6.1.2.1" style input to a bare code, keeping an explicit "set:code" id. */
export function normalizeStandardRef(raw: string): string {
  const s = raw.trim();
  if (
    (STANDARD_SETS as readonly string[]).some((set) => s.startsWith(`${set}:`))
  )
    return s;
  const m = /([0-9K]{1,2}(?:\.[0-9A-Za-z]{1,3}){2,4})\s*$/.exec(s);
  return m ? m[1] : s;
}

export const standardCodes = (targets: TargetTag[] | undefined): string[] =>
  (targets ?? [])
    .filter((t) => t.kind === 'standard')
    .map((t) => t.code ?? t.id);

/** Loads catalog docs for every code referenced, keyed by code and by full id. */
export async function loadBenchmarks(
  db: admin.firestore.Firestore,
  refs: string[]
): Promise<Map<string, Benchmark[]>> {
  if (new Set(refs).size > MAX_STANDARDS_PER_SAVE) {
    throw new ToolError(
      `Use at most ${MAX_STANDARDS_PER_SAVE} different standards in one save.`
    );
  }
  const ids = new Set<string>();
  for (const ref of refs) {
    if (ref.includes(':')) ids.add(ref);
    else for (const set of STANDARD_SETS) ids.add(`${set}:${ref}`);
  }
  const out = new Map<string, Benchmark[]>();
  if (ids.size === 0) return out;
  const snaps = await db.getAll(
    ...[...ids].map((id) => db.doc(`standards_catalog/${id}`))
  );
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const b = { ...(snap.data() as Benchmark), id: snap.id };
    out.set(b.id, [b]);
    out.set(b.code, [...(out.get(b.code) ?? []), b]);
  }
  return out;
}

/** Replaces a question's standard tags with `refs`, keeping PLC and personal targets and existing tags in place. */
export function applyStandards(
  n: number,
  current: TargetTag[] | undefined,
  refs: string[],
  catalog: Map<string, Benchmark[]>
): TargetTag[] {
  if (refs.length > MAX_STANDARDS_PER_QUESTION) {
    throw new ToolError(
      `Question ${n}: at most ${MAX_STANDARDS_PER_QUESTION} standards.`
    );
  }
  const existing = (current ?? []).filter((t) => t.kind === 'standard');
  const out: TargetTag[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    const ref = normalizeStandardRef(raw);
    const already = existing.find((t) => t.id === ref || t.code === ref);
    let tag = already;
    if (!tag) {
      const hits = catalog.get(ref) ?? [];
      if (hits.length === 0) {
        throw new ToolError(
          `Question ${n}: "${raw}" is not a Minnesota ELA (2020) or Social Studies (2021) benchmark in SpartBoard. Use a benchmark code like 6.1.2.1, or leave standards off.`
        );
      }
      if (hits.length > 1) {
        throw new ToolError(
          `Question ${n}: "${raw}" matches both ${hits.map((h) => h.id).join(' and ')}. Pass the full id.`
        );
      }
      tag = tagFromBenchmark(hits[0]);
    }
    if (seen.has(tag.id)) continue;
    seen.add(tag.id);
    out.push(tag);
  }
  const kept = (current ?? []).filter(
    (t) => t.kind !== 'standard' || seen.has(t.id)
  );
  const keptIds = new Set(kept.map((t) => t.id));
  return [...kept, ...out.filter((t) => !keptIds.has(t.id))];
}
