/** Suggested learning targets read from a test (QUIZ_IMPORT_RELIABILITY.md R20). */

import type {
  LearningTarget,
  LearningTargetList,
  QuestionTargetTag,
} from '@/types';
import type { LearningTargetSource } from '@/hooks/useLearningTargets';
import { addTargets, tagFromTarget } from '@/utils/learningTargets';

/** A target line the reader lifted off a question, e.g. "ELT 1.1-I can explain…". */
export interface SuggestedTarget {
  code?: string;
  label: string;
}

/** Where a new target is written: the teacher's own list or a PLC list they can edit. */
export type TargetDestination =
  | { kind: 'personal'; name: string }
  | { kind: 'plc'; plcId: string; name: string };

export type TargetResolution =
  | { kind: 'existing'; target: LearningTarget; tag: QuestionTargetTag }
  | { kind: 'create' };

/** `ELT 1.1`, `ELT-1.1` and `elt1.1` all normalize to `elt1.1`. */
export const normalizeTargetCode = (code: string): string =>
  code
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/^\.+|\.+$/g, '');

/** Case, spacing, trailing punctuation and a leading "I can" don't count. */
export const normalizeTargetLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^\s*i\s+can\s+/, '')
    .replace(/[\s.,;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** One key per distinct suggestion, so "Add all" creates each target once. */
export const suggestionKey = (s: SuggestedTarget): string => {
  const code = s.code ? normalizeTargetCode(s.code) : '';
  return code ? `code:${code}` : `label:${normalizeTargetLabel(s.label)}`;
};

interface Candidate {
  target: LearningTarget;
  source: LearningTargetSource;
}

const candidatesOf = (sources: readonly LearningTargetSource[]): Candidate[] =>
  sources.flatMap((source) =>
    (source.list?.targets ?? [])
      .filter((target) => !target.archived)
      .map((target) => ({ target, source }))
  );

const tagFor = ({ target, source }: Candidate): QuestionTargetTag =>
  source.kind === 'plc'
    ? tagFromTarget(target, 'plc', source.ownerId)
    : tagFromTarget(target, 'personal');

/** Code match first, then label match, across every list the teacher can see; else create. */
export function resolveSuggestedTarget(
  suggestion: SuggestedTarget,
  sources: readonly LearningTargetSource[]
): TargetResolution {
  const candidates = candidatesOf(sources);
  const code = suggestion.code ? normalizeTargetCode(suggestion.code) : '';
  if (code) {
    const hit = candidates.find(
      (c) => c.target.code && normalizeTargetCode(c.target.code) === code
    );
    if (hit) return { kind: 'existing', target: hit.target, tag: tagFor(hit) };
  }
  const label = normalizeTargetLabel(suggestion.label);
  if (label) {
    const hit = candidates.find(
      (c) => normalizeTargetLabel(c.target.label) === label
    );
    if (hit) return { kind: 'existing', target: hit.target, tag: tagFor(hit) };
  }
  return { kind: 'create' };
}

/** My targets, then each PLC list the teacher can edit; viewer PLCs are left out. */
export function createDestinations(
  sources: readonly LearningTargetSource[],
  editablePlcIds: ReadonlySet<string>
): TargetDestination[] {
  const out: TargetDestination[] = [];
  for (const source of sources) {
    if (source.kind === 'personal') {
      out.push({ kind: 'personal', name: source.name });
    } else if (source.ownerId && editablePlcIds.has(source.ownerId)) {
      out.push({ kind: 'plc', plcId: source.ownerId, name: source.name });
    }
  }
  return out;
}

export interface SuggestedTargetPlan {
  /** Tags for suggestions that already exist, by `suggestionKey`. */
  existing: Map<string, QuestionTargetTag>;
  /** Distinct suggestions that need creating, in first-seen order. */
  toCreate: { key: string; suggestion: SuggestedTarget }[];
}

/** Groups every row's suggestion so each distinct target is resolved and created once. */
export function planSuggestedTargets(
  suggestions: Iterable<SuggestedTarget>,
  sources: readonly LearningTargetSource[]
): SuggestedTargetPlan {
  const existing = new Map<string, QuestionTargetTag>();
  const toCreate: SuggestedTargetPlan['toCreate'] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = resolveSuggestedTarget(suggestion, sources);
    if (resolved.kind === 'existing') existing.set(key, resolved.tag);
    else toCreate.push({ key, suggestion });
  }
  return { existing, toCreate };
}

/** Appends the new targets to `list` and returns their tags by `suggestionKey`. */
export function createSuggestedTargets(
  list: LearningTargetList,
  toCreate: SuggestedTargetPlan['toCreate'],
  destination: TargetDestination,
  now: number = Date.now()
): { list: LearningTargetList; tags: Map<string, QuestionTargetTag> } {
  const drafts = toCreate
    .map(({ key, suggestion }) => {
      const code = suggestion.code?.trim() ?? '';
      const label = suggestion.label.trim();
      return { key, code, label: label.length > 0 ? label : code };
    })
    .filter((d) => d.label);
  const next = addTargets(
    list,
    drafts.map(({ code, label }) => (code ? { code, label } : { label })),
    now
  );
  const added = next.targets.slice(list.targets.length);
  const tags = new Map<string, QuestionTargetTag>();
  added.forEach((target, i) => {
    const key = drafts[i]?.key;
    if (!key) return;
    tags.set(
      key,
      destination.kind === 'plc'
        ? tagFromTarget(target, 'plc', destination.plcId)
        : tagFromTarget(target, 'personal')
    );
  });
  return { list: next, tags };
}

/** Adds `tag` unless the question already carries that target. */
export function withTargetTag(
  tags: readonly QuestionTargetTag[] | undefined,
  tag: QuestionTargetTag
): QuestionTargetTag[] {
  const current = tags ?? [];
  return current.some((t) => t.id === tag.id && t.kind === tag.kind)
    ? [...current]
    : [...current, tag];
}
