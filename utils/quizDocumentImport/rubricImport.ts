/** Imported rubrics: conversion, pairing, split slicing and review flags (QUIZ_IMPORT_VERSIONS V2, V3, V10, V14–V16). */

import type { QuizQuestion, Rubric, RubricCriterion } from '@/types';
import { GUIDE_MAX_POINTS, guideLevels } from '@/utils/rubricGuide';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import type {
  AiExtractedRubric,
  AiRubricCriterion,
  VersionGroup,
} from './types';

/** What pairing and flags read from a test set: the AI's or the review's (pictures already cropped). */
export interface RubricSource {
  versions: readonly {
    label: string;
    questions: readonly { text: string; label?: string }[];
  }[];
  rubrics: readonly AiExtractedRubric[];
  groups: readonly VersionGroup[];
}

type SourceVersion = RubricSource['versions'][number];

export interface RubricImportOptions {
  /** False when `rubric-scoring-guides` is off for the teacher: guide text goes in a plain criterion (V26). */
  scoringGuides: boolean;
  newId?: () => string;
  now?: number;
}

export type RubricFlagKind =
  | 'count-mismatch'
  | 'letters'
  | 'prompt'
  | 'total'
  | 'typo'
  | 'points'
  | 'split-order';

/** A suspected problem shown in review; nothing is changed because of it (V16). */
export interface RubricFlag {
  kind: RubricFlagKind;
  message: string;
  letter?: string;
}

/** One printed prompt line, e.g. letter "C" and its text. */
export interface PromptItem {
  letter: string;
  text: string;
}

const CREDIT_HEADING = 'Credit received for:';

/** The scoring guidelines for one row: credit bullets then the no-credit lines, verbatim (V3). */
export function criterionGuideText(c: AiRubricCriterion): string {
  const lines: string[] = [];
  const credit = c.credit.map((l) => l.trim()).filter(Boolean);
  if (credit.length > 0) {
    lines.push(CREDIT_HEADING, ...credit.map((l) => `- ${l}`));
  }
  lines.push(...c.notes.map((l) => l.trim()).filter(Boolean));
  return lines.join('\n');
}

/** "C. Explain …"; the prompt alone when the row printed no letter. */
export function criterionTitle(c: AiRubricCriterion): string {
  const prompt = c.prompt.trim();
  const letter = c.letter.trim();
  if (!letter) return prompt;
  if (!prompt) return letter;
  return `${letter}. ${prompt}`;
}

/** The row's points as a level ceiling a rubric can hold (1..GUIDE_MAX_POINTS). */
export const criterionMaxLevel = (points: number): number =>
  Math.min(
    GUIDE_MAX_POINTS,
    Math.max(1, Math.round(Number.isFinite(points) ? points : 1))
  );

/** One criterion per letter, levels 0..points (V2). */
export function toRubricCriterion(
  c: AiRubricCriterion,
  opts: Pick<RubricImportOptions, 'scoringGuides' | 'newId'>
): RubricCriterion {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const levels = guideLevels(criterionMaxLevel(c.points)).map((l) => ({
    ...l,
    id: newId(),
  }));
  const description = criterionGuideText(c);
  return {
    id: newId(),
    name: criterionTitle(c),
    ...(description ? { description } : {}),
    levels,
    ...(opts.scoringGuides ? { guide: { examples: [] } } : {}),
  };
}

/** A SpartBoard rubric from printed rows; Teacher Comments never reach here (V3). */
export function toRubric(
  title: string,
  criteria: readonly AiRubricCriterion[],
  opts: RubricImportOptions
): Rubric {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const now = opts.now ?? Date.now();
  return {
    id: newId(),
    title,
    criteria: criteria.map((c) => toRubricCriterion(c, { ...opts, newId })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Library name "‹file› – Version A" (V15). */
export function rubricLibraryName(fileTitle: string, label: string): string {
  const file = fileTitle.trim();
  const name = label.trim();
  if (!file) return name;
  if (!name) return file;
  return `${file} – ${name}`;
}

/** The fields the quiz editor sets when it attaches a library rubric to a written question. */
export const rubricAttachment = (
  rubric: Rubric,
  rubricId: string = rubric.id
): Pick<QuizQuestion, 'rubricId' | 'rubricSnapshot' | 'points'> => ({
  rubricId,
  rubricSnapshot: rubric,
  points: rubricMaxPoints(rubric),
});

// --- Pairing (V14) ---

/** A version as rubrics count them: the split's parts together make one. */
export interface PairingUnit {
  /** Indexes into `RubricSource.versions`, in order. */
  versions: number[];
  label: string;
  split: boolean;
}

export interface RubricPairing {
  units: PairingUnit[];
  /** Per unit, an index into `RubricSource.rubrics`, or null for none. */
  rubricFor: (number | null)[];
  /** Set when the counts differ; never resolved by guessing. */
  countMismatch: { versions: number; rubrics: number } | null;
}

/** Versions in file order, each split group folded into one unit at its first part. */
export function pairingUnits(set: RubricSource): PairingUnit[] {
  const splitOf = new Map<number, number>();
  set.groups.forEach((g, gi) => {
    if (g.kind !== 'split' || g.versions.length < 2) return;
    for (const v of g.versions) if (!splitOf.has(v)) splitOf.set(v, gi);
  });
  const units: PairingUnit[] = [];
  const seenGroups = new Set<number>();
  set.versions.forEach((version, vi) => {
    const gi = splitOf.get(vi);
    if (gi === undefined) {
      units.push({ versions: [vi], label: version.label, split: false });
      return;
    }
    if (seenGroups.has(gi)) return;
    seenGroups.add(gi);
    const group = set.groups[gi];
    const parts = group.versions
      .filter((v) => splitOf.get(v) === gi && v < set.versions.length)
      .sort((a, b) => a - b);
    units.push({
      versions: parts,
      label: group.name.trim() || version.label,
      split: true,
    });
  });
  return units;
}

/** First rubric to the first version, and so on; extras on either side stay unpaired. */
export function pairRubricsByOrder(set: RubricSource): RubricPairing {
  const units = pairingUnits(set);
  const rubrics = set.rubrics.length;
  return {
    units,
    rubricFor: units.map((_, i) => (i < rubrics ? i : null)),
    countMismatch:
      units.length === rubrics ? null : { versions: units.length, rubrics },
  };
}

/** The review dropdown: give one unit a different rubric, or none. Other pairs are left alone. */
export function reassignRubric(
  pairing: RubricPairing,
  unitIndex: number,
  rubricIndex: number | null
): RubricPairing {
  if (unitIndex < 0 || unitIndex >= pairing.units.length) return pairing;
  return {
    ...pairing,
    rubricFor: pairing.rubricFor.map((r, i) =>
      i === unitIndex ? rubricIndex : r
    ),
  };
}

export function countMismatchFlag(pairing: RubricPairing): RubricFlag | null {
  const m = pairing.countMismatch;
  if (!m) return null;
  return {
    kind: 'count-mismatch',
    message: `Found ${m.versions} ${m.versions === 1 ? 'version' : 'versions'} and ${m.rubrics} ${m.rubrics === 1 ? 'rubric' : 'rubrics'}. Check which rubric goes with each version.`,
  };
}

// --- Prompt letters ---

const PROMPT_LINE = /^\s*\(?([A-Za-z])[.)]\s+(\S.*)$/;

/** Lettered prompts printed in sequence (a split's Pt 2 may start at D); stray letters stay out. */
export function parsePromptItems(text: string): PromptItem[] {
  const items: PromptItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = PROMPT_LINE.exec(line);
    const letter = m?.[1].toUpperCase();
    const prev = items[items.length - 1]?.letter;
    const expected = prev
      ? String.fromCharCode(prev.charCodeAt(0) + 1)
      : letter && letter <= 'H'
        ? letter
        : 'A';
    if (m && letter === expected) {
      items.push({ letter, text: m[2].trim() });
    } else if (items.length > 0 && line.trim()) {
      const last = items[items.length - 1];
      last.text = `${last.text} ${line.trim()}`;
    }
  }
  return items;
}

const labelLetter = (label: string | undefined): string | null => {
  const m = /([A-Za-z])\)?$/.exec((label ?? '').trim());
  return m ? m[1].toUpperCase() : null;
};

/** A version's prompts: lettered lines in one written question, or one question per letter. */
export function versionPromptItems(version: SourceVersion): PromptItem[] {
  const fromText = version.questions.flatMap((q) => parsePromptItems(q.text));
  if (fromText.length > 0) return fromText;
  if (version.questions.length < 2) return [];
  return version.questions.map((q, i) => ({
    letter: labelLetter(q.label) ?? String.fromCharCode(65 + i),
    text: q.text.trim(),
  }));
}

// --- Split slicing (V10) ---

export interface SplitSlices {
  /** Per part, the rows it carries; every row lands in exactly one part. */
  slices: AiRubricCriterion[][];
  /** Rows were dealt by order because their letters didn't match the parts' prompts. */
  byOrder: boolean;
}

/** Each part's rows of the split's one rubric, so the quiz total stays the rubric's (V10). */
export function sliceSplitRubric(
  criteria: readonly AiRubricCriterion[],
  partLetters: readonly (readonly string[])[]
): SplitSlices {
  const parts = partLetters.map(
    (ls) => new Set(ls.map((l) => l.toUpperCase()))
  );
  if (parts.length === 0) return { slices: [], byOrder: false };
  const owner = criteria.map((c) =>
    parts.findIndex((p) => p.has(c.letter.toUpperCase()))
  );
  if (criteria.length > 0 && owner.every((o) => o >= 0)) {
    return {
      slices: parts.map((_, pi) =>
        criteria.filter((_, ci) => owner[ci] === pi)
      ),
      byOrder: false,
    };
  }
  const slices: AiRubricCriterion[][] = [];
  let start = 0;
  parts.forEach((p, pi) => {
    const end = pi === parts.length - 1 ? criteria.length : start + p.size;
    slices.push(criteria.slice(start, end));
    start = Math.min(end, criteria.length);
  });
  return { slices, byOrder: criteria.length > 0 };
}

// --- Review flags (V16) ---

const STOPWORDS = new Set(
  "the and for are was were with that this from what which their there these those into onto than then them they your have has had how why who whom does did each one two any all its it’s it's explain describe identify discuss define provide give using use used between within about would could should also more most such other another example examples".split(
    ' '
  )
);

const words = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z][a-z'’]*/g) ?? []).map((w) =>
    w.replace(/['’]s$/, '')
  );

const contentWords = (text: string): Set<string> =>
  new Set(words(text).filter((w) => w.length >= 4 && !STOPWORDS.has(w)));

/** Shared content words over the smaller side; 1 when one side is too short to judge. */
function promptOverlap(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  const small = Math.min(wa.size, wb.size);
  if (small < 3) return 1;
  let shared = 0;
  for (const w of wa) {
    if (wb.has(w) || [...wb].some((x) => x.startsWith(w) || w.startsWith(x)))
      shared++;
  }
  return shared / small;
}

const PROMPT_OVERLAP_MIN = 0.2;

const formatLetters = (letters: readonly string[]): string =>
  letters.length === 0 ? 'none' : letters.join(', ');

/** Rows whose letters or wording don't match the paired prompts. */
export function promptMatchFlags(
  criteria: readonly AiRubricCriterion[],
  prompts: readonly PromptItem[]
): RubricFlag[] {
  if (prompts.length === 0) return [];
  const rowLetters = criteria
    .map((c) => c.letter.toUpperCase())
    .filter(Boolean);
  const promptLetters = prompts.map((p) => p.letter);
  const flags: RubricFlag[] = [];
  if (rowLetters.join() !== promptLetters.join()) {
    flags.push({
      kind: 'letters',
      message: `The rubric has rows ${formatLetters(rowLetters)}, but the version has prompts ${formatLetters(promptLetters)}.`,
    });
  }
  for (const c of criteria) {
    const letter = c.letter.toUpperCase();
    const prompt = prompts.find((p) => p.letter === letter);
    if (!prompt || !c.prompt.trim()) continue;
    if (promptOverlap(c.prompt, prompt.text) < PROMPT_OVERLAP_MIN) {
      flags.push({
        kind: 'prompt',
        letter,
        message: `Rubric row ${letter} may not match prompt ${letter}.`,
      });
    }
  }
  return flags;
}

/** Rows that don't add up to the printed total. */
export function totalFlag(rubric: AiExtractedRubric): RubricFlag | null {
  if (rubric.printedTotal === undefined) return null;
  const sum = rubric.criteria.reduce((s, c) => s + c.points, 0);
  if (sum === rubric.printedTotal) return null;
  return {
    kind: 'total',
    message: `The rows add up to ${sum} points, but the rubric prints ${rubric.printedTotal}.`,
  };
}

/** Rows whose points a rubric row can't hold as printed; the stored ceiling is named. */
export function pointsFlags(
  criteria: readonly AiRubricCriterion[]
): RubricFlag[] {
  return criteria.flatMap((c) => {
    const kept = criterionMaxLevel(c.points);
    if (kept === c.points) return [];
    const row = c.letter || criteriaRowName(c);
    return [
      {
        kind: 'points' as const,
        letter: c.letter || undefined,
        message: `Row ${row} prints ${c.points} points. Rows can be worth 1 to ${GUIDE_MAX_POINTS}, so it was set to ${kept}.`,
      },
    ];
  });
}

const criteriaRowName = (c: AiRubricCriterion): string =>
  c.prompt.trim().split(/\s+/).slice(0, 4).join(' ');

/** Spellings common on these tests, counted as known words for the typo check. */
const KNOWN_WORDS = [
  'christian',
  'christianity',
  'islam',
  'muslim',
  'buddhism',
  'buddhist',
  'hinduism',
  'judaism',
  'religion',
  'religious',
  'language',
  'culture',
  'cultural',
  'diffusion',
  'colonialism',
  'imperialism',
  'globalization',
  'ethnicity',
  'migration',
  'population',
  'government',
  'environment',
  'relocation',
  'hierarchical',
  'contagious',
  'expansion',
  'acculturation',
  'assimilation',
  'syncretism',
  'indigenous',
  'traditional',
  'because',
  'example',
  'explain',
  'describe',
  'identify',
  'receive',
  'separate',
  'definitely',
];
const KNOWN_WEIGHT = 2;
const TYPO_MIN_LENGTH = 6;

/** Word counts across the whole file, so a word spelled right elsewhere can vouch for itself. */
export function testSetVocabulary(set: RubricSource): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (text: string) => {
    for (const w of words(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  };
  for (const v of set.versions) for (const q of v.questions) add(q.text);
  for (const r of set.rubrics) for (const t of rubricTexts(r)) add(t);
  return counts;
}

const rubricTexts = (r: AiExtractedRubric): string[] => [
  r.title,
  ...r.criteria.flatMap((c) => [c.prompt, ...c.credit, ...c.notes]),
];

/** True when `b` is `a` with one adjacent pair swapped or one inner letter changed. */
function isNearMiss(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length === 2) {
    const [i, j] = diff;
    return j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
  return diff.length === 1 && diff[0] > 0 && diff[0] < a.length - 1;
}

/** Likely typos in the given text: a rare word one slip away from a commoner one. No AI. */
export function typoFlags(
  texts: readonly string[],
  vocabulary: ReadonlyMap<string, number>
): RubricFlag[] {
  const weight = (w: string): number =>
    (vocabulary.get(w) ?? 0) + (KNOWN_WORDS.includes(w) ? KNOWN_WEIGHT : 0);
  const candidates = [...new Set([...vocabulary.keys(), ...KNOWN_WORDS])];
  const flags: RubricFlag[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const raw of text.match(/[A-Za-z]+/g) ?? []) {
      const w = raw.toLowerCase();
      if (w.length < TYPO_MIN_LENGTH || seen.has(w) || KNOWN_WORDS.includes(w))
        continue;
      seen.add(w);
      const own = weight(w);
      const fix = candidates.find(
        (c) => isNearMiss(w, c) && weight(c) > Math.max(own, 1)
      );
      if (!fix) continue;
      const shown =
        raw[0] === raw[0].toUpperCase()
          ? fix[0].toUpperCase() + fix.slice(1)
          : fix;
      flags.push({
        kind: 'typo',
        message: `"${raw}" may be a typo for "${shown}".`,
      });
    }
  }
  return flags;
}

/** Every review flag for one rubric and the prompts it's paired with. */
export function pairFlags(
  rubric: AiExtractedRubric,
  prompts: readonly PromptItem[],
  vocabulary: ReadonlyMap<string, number>,
  promptTexts: readonly string[] = []
): RubricFlag[] {
  const total = totalFlag(rubric);
  return [
    ...promptMatchFlags(rubric.criteria, prompts),
    ...(total ? [total] : []),
    ...pointsFlags(rubric.criteria),
    ...typoFlags([...rubricTexts(rubric), ...promptTexts], vocabulary),
  ];
}

// --- Building what review creates ---

/** One rubric to save, and the snapshot each of its versions' written questions gets (V15). */
export interface ImportedRubricPlan {
  unitIndex: number;
  rubricIndex: number;
  libraryRubric: Rubric;
  /** Per version in the unit; a split part gets only its slice (V10). */
  attachments: {
    versionIndex: number;
    fields: Pick<QuizQuestion, 'rubricId' | 'rubricSnapshot' | 'points'>;
  }[];
  flags: RubricFlag[];
}

const splitPartLabel = (version: SourceVersion, i: number): string =>
  version.label.trim() || `Part ${i + 1}`;

/** Rubrics and snapshots for every paired unit; nothing is saved here. */
export function planImportedRubrics(
  set: RubricSource,
  pairing: RubricPairing,
  fileTitle: string,
  opts: RubricImportOptions
): ImportedRubricPlan[] {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const now = opts.now ?? Date.now();
  const build = { ...opts, newId, now };
  const vocabulary = testSetVocabulary(set);
  const plans: ImportedRubricPlan[] = [];
  pairing.units.forEach((unit, unitIndex) => {
    const rubricIndex = pairing.rubricFor[unitIndex];
    if (rubricIndex === null || rubricIndex === undefined) return;
    const source = set.rubrics[rubricIndex];
    if (!source) return;
    const versions = unit.versions.map((vi) => set.versions[vi]);
    const prompts = versions.flatMap(versionPromptItems);
    const promptTexts = versions.flatMap((v) => v.questions.map((q) => q.text));
    const flags = pairFlags(source, prompts, vocabulary, promptTexts);
    const libraryRubric = toRubric(
      rubricLibraryName(fileTitle, unit.label),
      source.criteria,
      build
    );
    if (!unit.split) {
      plans.push({
        unitIndex,
        rubricIndex,
        libraryRubric,
        attachments: unit.versions.map((versionIndex) => ({
          versionIndex,
          fields: rubricAttachment(libraryRubric),
        })),
        flags,
      });
      return;
    }
    const { slices, byOrder } = sliceSplitRubric(
      source.criteria,
      versions.map((v) => versionPromptItems(v).map((p) => p.letter))
    );
    if (byOrder) {
      flags.push({
        kind: 'split-order',
        message:
          "The rubric's row letters don't match the parts' prompts, so its rows were split between the parts in order.",
      });
    }
    const byCriterion = new Map(
      source.criteria.map((c, i) => [c, libraryRubric.criteria[i]])
    );
    plans.push({
      unitIndex,
      rubricIndex,
      libraryRubric,
      attachments: unit.versions.map((versionIndex, pi) => {
        const snapshot: Rubric = {
          ...libraryRubric,
          id: newId(),
          title: rubricLibraryName(
            fileTitle,
            splitPartLabel(set.versions[versionIndex], pi)
          ),
          criteria: (slices[pi] ?? []).flatMap((c) => {
            const built = byCriterion.get(c);
            return built ? [built] : [];
          }),
        };
        return {
          versionIndex,
          fields: rubricAttachment(snapshot, libraryRubric.id),
        };
      }),
      flags,
    });
  });
  return plans;
}

/** Saves each planned rubric once through the injected saver (the Rubrics library's `saveRubric`). */
export async function saveImportedRubrics(
  plans: readonly ImportedRubricPlan[],
  save: (rubric: Rubric) => Promise<void>
): Promise<void> {
  for (const plan of plans) await save(plan.libraryRubric);
}
