// Write with Claude (docs/plans/WEB_TOURS_CLAUDE.md C9-C11): which fields a run writes, applying them, and undo.
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

/** A step's words before a run, by step id, so one Undo puts them back. */
export type WritingUndo = Record<
  string,
  { label: string; text: string; claudeQuestion?: string }
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

/** The steps and fields a run writes: blanks keeps typed words, all rewrites, questions reruns asked steps. */
export function writingRequests(
  set: GuidedLearningSet,
  mode: WritingMode
): WritingRequestStep[] {
  return set.steps.flatMap((step) => {
    if (!step.web) return [];
    if (mode === 'questions' && !step.web.claudeQuestion) return [];
    const fields: WritingField[] =
      mode === 'all' ? ['title', 'tip'] : blankFields(step);
    return fields.length ? [{ id: step.id, fields }] : [];
  });
}

/** Puts Claude's words on the set; outside Rewrite all, only on fields still blank now. */
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
    const blanks: WritingField[] =
      mode === 'all' ? ['title', 'tip'] : blankFields(step);
    const label = w.title && blanks.includes('title') ? w.title : step.label;
    const text = w.tip && blanks.includes('tip') ? w.tip : step.text;
    const { claudeQuestion: before, ...web } = step.web;
    const next: GuidedLearningStep = {
      ...step,
      label,
      text,
      web: w.question ? { ...web, claudeQuestion: w.question } : web,
    };
    if (
      next.label === step.label &&
      next.text === step.text &&
      w.question === before
    )
      return step;
    undo[step.id] = {
      label: step.label ?? '',
      text: step.text ?? '',
      ...(before ? { claudeQuestion: before } : {}),
    };
    if (w.question) asked++;
    else wrote++;
    return next;
  });
  return { set: { ...set, steps }, undo, wrote, asked };
}

/** Puts back the words a run replaced; steps deleted since are skipped. */
export function undoWriting(
  set: GuidedLearningSet,
  undo: WritingUndo
): GuidedLearningSet {
  return {
    ...set,
    steps: set.steps.map((step) => {
      const was = undo[step.id];
      if (!was || !step.web) return step;
      const { claudeQuestion: _q, ...web } = step.web;
      return {
        ...step,
        label: was.label,
        text: was.text,
        web: was.claudeQuestion
          ? { ...web, claudeQuestion: was.claudeQuestion }
          : web,
      };
    }),
  };
}

/** Asks Claude for the steps' words, a batch at a time. */
export async function requestWebTourWriting(
  setId: string,
  steps: readonly WritingRequestStep[]
): Promise<WrittenStep[]> {
  const call = httpsCallable<
    { setId: string; steps: WritingRequestStep[] },
    { steps: WrittenStep[] }
  >(functions, 'writeWebTourTextV1', { timeout: 190_000 });
  const out: WrittenStep[] = [];
  for (let i = 0; i < steps.length; i += WRITE_BATCH) {
    const res = await call({ setId, steps: steps.slice(i, i + WRITE_BATCH) });
    out.push(...res.data.steps);
  }
  return out;
}
