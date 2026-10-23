// Write with Claude (docs/plans/shipped/WEB_TOURS_CLAUDE.md C9-C11): which fields a run writes, applying them, and undo.
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { draftLabel } from './recordedSteps';

export type WritingMode = 'blanks' | 'all' | 'questions';
export type WritingField = 'title' | 'tip';

export interface WritingRequestStep {
  id: string;
  fields: WritingField[];
}

export interface WrittenStep {
  id: string;
  title?: string;
  tip?: string;
  question?: string;
}

interface StepWords {
  label: string;
  text: string;
  claudeQuestion?: string;
}

/** By step id: the words before a run and what the run left, so Undo only reverts what is still Claude's. */
export type WritingUndo = Record<
  string,
  { before: StepWords; after: StepWords }
>;

// Matches MAX_WRITE_STEPS in functions/src/webTourWriting.ts.
export const WRITE_BATCH = 12;

/** True while the title is still the one recording gave it, or empty. */
export function hasStarterTitle(step: GuidedLearningStep): boolean {
  const label = step.label?.trim() ?? '';
  return (
    !label ||
    (!!step.web && label === draftLabel(step.web.action, step.web.locator))
  );
}

const blankFields = (step: GuidedLearningStep): WritingField[] => [
  ...(hasStarterTitle(step) ? (['title'] as const) : []),
  ...(step.text?.trim() ? [] : (['tip'] as const)),
];

// A step Claude asked about is rewritten whole once it has no blanks left, so its question can be answered.
const fieldsFor = (
  step: GuidedLearningStep,
  mode: WritingMode
): WritingField[] => {
  if (mode === 'all') return ['title', 'tip'];
  const blanks = blankFields(step);
  return mode === 'questions' && blanks.length === 0
    ? ['title', 'tip']
    : blanks;
};

/** The steps and fields a run writes: blanks keeps typed words, all rewrites, questions reruns asked steps. */
export function writingRequests(
  set: GuidedLearningSet,
  mode: WritingMode
): WritingRequestStep[] {
  return set.steps.flatMap((step) => {
    if (!step.web) return [];
    if (mode === 'questions' && !step.web.claudeQuestion) return [];
    const fields = fieldsFor(step, mode);
    return fields.length ? [{ id: step.id, fields }] : [];
  });
}

const wordsOf = (step: GuidedLearningStep): StepWords => ({
  label: step.label ?? '',
  text: step.text ?? '',
  ...(step.web?.claudeQuestion
    ? { claudeQuestion: step.web.claudeQuestion }
    : {}),
});

const withWords = (
  step: GuidedLearningStep,
  words: StepWords
): GuidedLearningStep => {
  if (!step.web) return step;
  const { claudeQuestion: _q, ...web } = step.web;
  return {
    ...step,
    label: words.label,
    text: words.text,
    web: words.claudeQuestion
      ? { ...web, claudeQuestion: words.claudeQuestion }
      : web,
  };
};

/** Puts Claude's words on the set; outside Rewrite all, only on the fields the run would ask for now. */
export function applyWriting(
  set: GuidedLearningSet,
  written: readonly WrittenStep[],
  mode: WritingMode
): { set: GuidedLearningSet; undo: WritingUndo; wrote: number; asked: number } {
  const byId = new Map(written.map((w) => [w.id, w]));
  const undo: WritingUndo = {};
  let wrote = 0;
  let asked = 0;
  const steps = set.steps.map((step) => {
    const w = byId.get(step.id);
    if (!w || !step.web) return step;
    const fields = fieldsFor(step, mode);
    const before = wordsOf(step);
    const after: StepWords = {
      label: w.title && fields.includes('title') ? w.title : before.label,
      text: w.tip && fields.includes('tip') ? w.tip : before.text,
      ...(w.question ? { claudeQuestion: w.question } : {}),
    };
    if (
      after.label === before.label &&
      after.text === before.text &&
      after.claudeQuestion === before.claudeQuestion
    )
      return step;
    undo[step.id] = { before, after };
    if (w.question) asked++;
    else wrote++;
    return withWords(step, after);
  });
  return { set: { ...set, steps }, undo, wrote, asked };
}

/** Puts back each field a run replaced, unless the admin has changed it since. */
export function undoWriting(
  set: GuidedLearningSet,
  undo: WritingUndo
): GuidedLearningSet {
  return {
    ...set,
    steps: set.steps.map((step) => {
      const entry = undo[step.id];
      if (!entry || !step.web) return step;
      const now = wordsOf(step);
      const { before, after } = entry;
      const pick = <K extends keyof StepWords>(k: K) =>
        now[k] === after[k] ? before[k] : now[k];
      const label = pick('label');
      const text = pick('text');
      const claudeQuestion = pick('claudeQuestion');
      return withWords(step, {
        label,
        text,
        ...(claudeQuestion ? { claudeQuestion } : {}),
      });
    }),
  };
}

/** Removes Claude's question from one step. */
export const dismissQuestion = (step: GuidedLearningStep): GuidedLearningStep =>
  withWords(step, { ...wordsOf(step), claudeQuestion: undefined });

export interface WritingResult {
  steps: WrittenStep[];
  /** Ids of steps in batches that failed. */
  failed: string[];
}

/** Asks Claude for the steps' words a batch at a time; a failed batch is reported, not fatal, unless all fail. */
export async function requestWebTourWriting(
  setId: string,
  steps: readonly WritingRequestStep[]
): Promise<WritingResult> {
  const call = httpsCallable<
    { setId: string; steps: WritingRequestStep[] },
    { steps: WrittenStep[] }
  >(functions, 'writeWebTourTextV1', { timeout: 190_000 });
  const out: WritingResult = { steps: [], failed: [] };
  let firstError: Error | null = null;
  for (let i = 0; i < steps.length; i += WRITE_BATCH) {
    const batch = steps.slice(i, i + WRITE_BATCH);
    try {
      const res = await call({ setId, steps: batch });
      out.steps.push(...res.data.steps);
    } catch (err) {
      firstError ??= err instanceof Error ? err : new Error(String(err));
      out.failed.push(...batch.map((s) => s.id));
    }
  }
  if (out.failed.length === steps.length && firstError) throw firstError;
  return out;
}
