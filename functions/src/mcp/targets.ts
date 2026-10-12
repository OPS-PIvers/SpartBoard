// Learning Targets field on questions: MN standards plus the teacher's own and PLC targets, as the editor's TargetPicker tags them.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import {
  MAX_STANDARDS_PER_QUESTION,
  applyStandards,
  loadBenchmarks,
  normalizeStandardRef,
  type TargetTag,
} from './standards';

export const MAX_LEARNING_TARGETS_PER_QUESTION = 10;
/** LEARNING_TARGET_LIST_CAP in types.ts. */
const TARGET_LIST_CAP = 1000;
const MAX_PLCS = 30;

export const targetInputFields = {
  standards: z
    .array(z.string().max(40))
    .max(MAX_STANDARDS_PER_QUESTION)
    .optional()
    .describe(
      "Saved in the question's Learning Targets field. Minnesota benchmark codes (ELA, Social Studies, Math, Science, Physical Education or Arts), e.g. 6.1.2.1 or 7L.3.1.1.1, or World Language Can-Do codes like WL.3.2.1 (level.mode.indicator). A code in more than one set needs the full id, e.g. mn-math-2022:6.1.2.1. Find codes with search_standards. Replaces the question's standards; omit to keep them, [] clears them."
    ),
  learning_targets: z
    .array(z.string().trim().min(1).max(300))
    .max(MAX_LEARNING_TARGETS_PER_QUESTION)
    .optional()
    .describe(
      "Optional, only when the teacher gives targets; standards come first. Also saved in the Learning Targets field: the teacher's own or PLC targets, such as \"I can cite evidence from the text\", matched to an existing target by its code or wording (case-insensitive). Wording that matches none is added to the teacher's My targets. Replaces the question's PLC and personal targets; omit to keep them, [] clears them. Never put targets in the question text."
    ),
};

export interface TargetInput {
  standards?: string[];
  learning_targets?: string[];
}

interface StoredTarget {
  id: string;
  label: string;
  code?: string;
  standardIds?: string[];
  archived?: boolean;
}

interface Source {
  kind: 'personal' | 'plc';
  ownerId?: string;
  targets: StoredTarget[];
}

const keyOf = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const personalPath = (uid: string) =>
  `users/${uid}/userProfile/learningTargets`;

function parseTargets(raw: unknown): StoredTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is StoredTarget =>
      !!t &&
      typeof t === 'object' &&
      typeof (t as StoredTarget).id === 'string' &&
      typeof (t as StoredTarget).label === 'string'
  );
}

/** Mirrors tagFromTarget in utils/learningTargets.ts. */
export function tagFromTarget(
  t: StoredTarget,
  kind: 'personal' | 'plc',
  ownerId?: string
): TargetTag {
  const tag: TargetTag = { id: t.id, kind, label: t.label };
  if (kind === 'plc' && ownerId) tag.ownerId = ownerId;
  if (t.code) tag.code = t.code;
  if (t.standardIds?.length) tag.standardIds = [...t.standardIds];
  return tag;
}

const tagMatches = (t: TargetTag, key: string) =>
  keyOf(t.label) === key || (t.code !== undefined && keyOf(t.code) === key);

/** Teacher-facing wording of a question's non-standard targets, as get_* returns them. */
export const learningTargetLabels = (
  targets: TargetTag[] | undefined
): string[] =>
  (targets ?? []).filter((t) => t.kind !== 'standard').map((t) => t.label);

async function loadSources(ctx: ToolContext): Promise<Source[]> {
  const [personal, plcs] = await Promise.all([
    ctx.db.doc(personalPath(ctx.uid)).get(),
    ctx.db
      .collection('plcs')
      .where('memberUids', 'array-contains', ctx.uid)
      .limit(MAX_PLCS)
      .get(),
  ]);
  const plcLists = plcs.empty
    ? []
    : await ctx.db.getAll(
        ...plcs.docs.map((p) => ctx.db.doc(`plcs/${p.id}/meta/learningTargets`))
      );
  return [
    { kind: 'personal', targets: parseTargets(personal.get('targets')) },
    ...plcLists.map((snap, i): Source => ({
      kind: 'plc',
      ownerId: plcs.docs[i].id,
      targets: snap.exists ? parseTargets(snap.get('targets')) : [],
    })),
  ];
}

function findInSources(sources: Source[], key: string): TargetTag | undefined {
  for (const s of sources) {
    const hit = s.targets.find(
      (t) =>
        !t.archived &&
        (keyOf(t.label) === key ||
          (t.code !== undefined && keyOf(t.code) === key))
    );
    if (hit) return tagFromTarget(hit, s.kind, s.ownerId);
  }
  return undefined;
}

/** Appends new targets to My targets in a transaction, reusing any added meanwhile. */
async function addPersonalTargets(
  ctx: ToolContext,
  labels: string[]
): Promise<Map<string, TargetTag>> {
  const ref = ctx.db.doc(personalPath(ctx.uid));
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const targets = parseTargets(snap.get('targets'));
    const out = new Map<string, TargetTag>();
    const now = Date.now();
    let added = false;
    for (const label of labels) {
      const key = keyOf(label);
      const hit = targets.find((t) => !t.archived && keyOf(t.label) === key);
      if (hit) {
        out.set(key, tagFromTarget(hit, 'personal'));
        continue;
      }
      const t = {
        id: randomUUID(),
        label: label.trim().replace(/\s+/g, ' '),
        createdAt: now,
        updatedAt: now,
      };
      targets.push(t);
      added = true;
      out.set(key, tagFromTarget(t, 'personal'));
    }
    if (targets.length > TARGET_LIST_CAP) {
      throw new ToolError(
        `My targets can hold at most ${TARGET_LIST_CAP} targets. Use targets the teacher already has.`
      );
    }
    if (added) tx.set(ref, { targets, updatedAt: now }, { merge: true });
    return out;
  });
}

export type ApplyTargets = (
  n: number,
  current: TargetTag[] | undefined,
  input: TargetInput
) => TargetTag[] | undefined;

/** Loads what `inputs` reference, adds missing My targets, and returns a per-question applier; `known` tags still match after a rename. */
export async function prepareTargets(
  ctx: ToolContext,
  inputs: TargetInput[],
  known: TargetTag[] = []
): Promise<ApplyTargets> {
  const refs = inputs
    .flatMap((q) => q.standards ?? [])
    .map(normalizeStandardRef);
  const catalog = await loadBenchmarks(ctx.db, [...new Set(refs)]);
  const wanted = new Map<string, string>();
  for (const l of inputs.flatMap((q) => q.learning_targets ?? [])) {
    if (!wanted.has(keyOf(l))) wanted.set(keyOf(l), l);
  }
  const sources = wanted.size > 0 ? await loadSources(ctx) : [];
  const knownOther = known.filter((t) => t.kind !== 'standard');
  const missing = [...wanted]
    .filter(
      ([key]) =>
        !findInSources(sources, key) &&
        !knownOther.some((t) => tagMatches(t, key))
    )
    .map(([, label]) => label);
  const created =
    missing.length > 0
      ? await addPersonalTargets(ctx, missing)
      : new Map<string, TargetTag>();

  return (n, current, input) => {
    let targets = current;
    if (input.standards !== undefined) {
      targets = applyStandards(n, targets, input.standards, catalog);
    }
    if (input.learning_targets !== undefined) {
      const standardsOnly = (targets ?? []).filter(
        (t) => t.kind === 'standard'
      );
      const prior = (targets ?? []).filter((t) => t.kind !== 'standard');
      const picked: TargetTag[] = [];
      for (const label of input.learning_targets) {
        const key = keyOf(label);
        const tag =
          prior.find((t) => tagMatches(t, key)) ??
          findInSources(sources, key) ??
          knownOther.find((t) => tagMatches(t, key)) ??
          created.get(key);
        if (!tag) {
          throw new ToolError(
            `Question ${n}: couldn't save the learning target "${label}".`
          );
        }
        if (!picked.some((t) => t.id === tag.id)) picked.push(tag);
      }
      targets = [...standardsOnly, ...picked];
    }
    return targets && targets.length > 0 ? targets : undefined;
  };
}
