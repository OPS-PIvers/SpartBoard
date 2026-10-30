/** Balanced bank slots on paper: print-time dealing and self-contained written pages (QUIZ_IMPORT_VERSIONS.md V24-V25). */

import type {
  PaperBatch,
  PaperBatchVersion,
  PaperBoxSize,
  PaperPageMap,
  PaperSheetStimulus,
  QuizData,
  QuizQuestion,
  QuizStimulus,
} from '@/types';
import {
  drawServedQuestionIds,
  type ResolvedQuizAssignment,
} from './questionBanks';
import {
  dealFromRotation,
  isBalancedSlot,
  servedVersionLabels,
} from './quizBalancedDeal';
import {
  analyzePaperQuiz,
  type AnalyzePaperQuizOptions,
  type PaperQuizAnalysis,
} from './paperSheetPlan';
import { promptHeaderRows } from './paperPageMap';
import { isPaperBoxSize, paperBoxLines } from './paperWritten';
import type { PaperPrintVersion, PaperPromptPage } from './paperSheetPrint';

/** Most distinct versions one stack prints; past it the slots stay off paper. */
export const MAX_PAPER_VERSIONS = 26;

/** A stem this long, or with a line break, has more than a written header can show. */
const LONG_PROMPT_CHARS = 200;

/** One version's questions in print order, before the analysis lays them out. */
export interface PaperVersionDraft {
  label: string;
  servedQuestionIds: string[];
  quiz: QuizData;
  analysis: PaperQuizAnalysis;
}

export interface PaperVersionPlan {
  /** Version 0's analysis, its written boxes widened to the largest any version needs. */
  template: PaperQuizAnalysis;
  versions: PaperVersionDraft[];
  /** Batch records, in the same order as `versions`. */
  records: PaperBatchVersion[];
  /** Every question any version prints, by id. */
  questionsById: Map<string, QuizQuestion>;
  /** Template question ids whose box prints the whole prompt above it, because some version's question needs it. */
  promptIds: Set<string>;
  stimuli: QuizStimulus[];
}

/** True when the question should print its prompt and figures on a page of their own (V25). */
export function needsPromptPage(
  question: Pick<QuizQuestion, 'type' | 'text' | 'stimulusIds' | 'recording'>,
  stimuli: readonly Pick<QuizStimulus, 'id' | 'type'>[]
): boolean {
  if (question.type !== 'free-response' || question.recording) return false;
  const text = question.text ?? '';
  if (text.includes('\n') || text.length > LONG_PROMPT_CHARS) return true;
  const ids = new Set(question.stimulusIds ?? []);
  return stimuli.some((s) => ids.has(s.id) && s.type === 'image');
}

/** The question's image stimuli as sheet stimuli, so the print can lay them out like the band. */
export function promptStimuliFor(
  question: Pick<QuizQuestion, 'stimulusIds'>,
  stimuli: readonly QuizStimulus[]
): PaperSheetStimulus[] {
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  return (question.stimulusIds ?? []).flatMap((id) => {
    const s = byId.get(id);
    if (!s || s.type !== 'image' || (!s.driveFileId && !s.url)) return [];
    return [
      {
        id: s.id,
        label: s.label,
        source: 'image' as const,
        ...(s.driveFileId ? { driveFileId: s.driveFileId } : {}),
        ...(s.url ? { url: s.url } : {}),
      },
    ];
  });
}

/** Written questions that print their whole prompt, raised to Full unless the teacher picked a size. */
function withPromptBoxes(
  analysis: PaperQuizAnalysis,
  questionsById: ReadonlyMap<string, QuizQuestion>,
  stimuli: readonly QuizStimulus[]
): PaperQuizAnalysis {
  const prompted = new Set(
    analysis.written
      .filter((w) => {
        const q = questionsById.get(w.questionId);
        return (
          !!q && needsPromptPage(q, stimuli) && !isPaperBoxSize(q.paperBoxSize)
        );
      })
      .map((w) => w.questionId)
  );
  if (prompted.size === 0) return analysis;
  const full = <T extends { questionId: string }>(x: T): T =>
    prompted.has(x.questionId) ? { ...x, size: 'full' as const } : x;
  return {
    ...analysis,
    written: analysis.written.map(full),
    entries: analysis.entries.map((e) => (e.kind === 'written' ? full(e) : e)),
  };
}

/** Prompt pages for a quiz without versions (a split FRQ), or `analysis` unchanged when none qualify. */
export function promptAnalysis(
  quiz: QuizData,
  analysis: PaperQuizAnalysis
): PaperQuizAnalysis {
  return withPromptBoxes(
    analysis,
    new Map((quiz.questions ?? []).map((q) => [q.id, q])),
    quiz.stimuli ?? []
  );
}

const sameShape = (a: PaperQuizAnalysis, b: PaperQuizAnalysis): boolean =>
  a.entries.length === b.entries.length &&
  a.entries.every((e, i) => e.kind === b.entries[i].kind) &&
  a.exclusions.length === b.exclusions.length &&
  a.writtenRefusals.length === b.writtenRefusals.length;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Turns until every balanced slot is back where it started. */
function rotationPeriod(slots: ResolvedQuizAssignment['sessionSlots']): number {
  let period = 1;
  for (const slot of slots) {
    const n = slot.poolQuestionIds.length;
    const own = n / gcd(n, slot.count % n || n);
    period = (period * own) / gcd(period, own);
    if (period > MAX_PAPER_VERSIONS) return period;
  }
  return period;
}

/**
 * Deal each balanced slot in turn, one version per turn, until the rotation
 * repeats. Null when the quiz has no balanced slot, a slot that still draws at
 * random, too many versions, or versions that would not share one layout.
 */
export function planPaperVersions(
  quiz: QuizData,
  resolved: ResolvedQuizAssignment,
  options: AnalyzePaperQuizOptions = {}
): PaperVersionPlan | null {
  const slots = resolved.sessionSlots;
  if (slots.length === 0 || !slots.every(isBalancedSlot)) return null;
  const period = rotationPeriod(slots);
  if (period > MAX_PAPER_VERSIONS) return null;

  const questionsById = new Map(resolved.questions.map((q) => [q.id, q]));
  const publicIds = resolved.questions.map((q) => q.id);
  const versions: PaperVersionDraft[] = [];
  for (let turn = 0; turn < period; turn += 1) {
    const dealt = new Map(
      slots.map((slot) => [
        slot.id,
        dealFromRotation(slot.poolQuestionIds, slot.count, turn, new Set()),
      ])
    );
    const servedQuestionIds = drawServedQuestionIds(
      publicIds,
      slots,
      undefined,
      dealt
    );
    const versionQuiz: QuizData = {
      ...quiz,
      questions: servedQuestionIds.flatMap((id) => {
        const q = questionsById.get(id);
        return q ? [q] : [];
      }),
      stimuli: resolved.stimuli,
      bankSlots: undefined,
      order: undefined,
    };
    const analysis = withPromptBoxes(
      analyzePaperQuiz(versionQuiz, options),
      questionsById,
      resolved.stimuli
    );
    versions.push({
      label: servedVersionLabels(slots, servedQuestionIds).join(', '),
      servedQuestionIds,
      quiz: versionQuiz,
      analysis,
    });
  }
  const first = versions[0].analysis;
  if (!versions.every((v) => sameShape(first, v.analysis))) return null;

  // One layout serves every version, so each box is as large as its largest version needs.
  const sizeAt = (i: number): PaperBoxSize =>
    versions.reduce<PaperBoxSize>((size, v) => {
      const e = v.analysis.entries[i];
      return e.kind === 'written' && paperBoxLines(e.size) > paperBoxLines(size)
        ? e.size
        : size;
    }, 'S');
  const entries = first.entries.map((e, i) =>
    e.kind === 'written' ? { ...e, size: sizeAt(i) } : e
  );
  const sizeById = new Map(
    entries.flatMap((e) =>
      e.kind === 'written' ? [[e.questionId, e.size]] : []
    )
  );
  const sheetChoiceCount = Math.max(
    ...versions.map((v) => v.analysis.sheetChoiceCount)
  );
  const template: PaperQuizAnalysis = {
    ...first,
    entries,
    written: first.written.map((w) => ({
      ...w,
      size: sizeById.get(w.questionId) ?? w.size,
    })),
    sheetChoiceCount,
    shortRows: first.rows
      .filter((r) => r.choiceCount < sheetChoiceCount)
      .map((r) => r.row),
  };

  const records: PaperBatchVersion[] = versions.map((v) => {
    const swaps: Record<string, string> = {};
    v.analysis.entries.forEach((e, i) => {
      const at = entries[i].questionId;
      if (e.questionId !== at) swaps[at] = e.questionId;
    });
    return {
      label: v.label,
      servedQuestionIds: v.servedQuestionIds,
      swaps,
    };
  });
  const promptIds = new Set(
    entries.flatMap((e, i) =>
      e.kind === 'written' &&
      versions.some((v) => {
        const q = questionsById.get(v.analysis.entries[i].questionId);
        return !!q && needsPromptPage(q, resolved.stimuli);
      })
        ? [e.questionId]
        : []
    )
  );
  return {
    template,
    versions,
    records,
    questionsById,
    promptIds,
    stimuli: resolved.stimuli,
  };
}

/** The question id a seat's sheet printed where the page maps say `questionId`. */
export function seatQuestionId(
  batch: Pick<PaperBatch, 'versions' | 'seatVersions'>,
  seat: number,
  questionId: string
): string {
  const version = batch.versions?.[batch.seatVersions?.[seat] ?? 0];
  return version?.swaps[questionId] ?? questionId;
}

/** The batch's page maps as one seat's sheet printed them. */
export function pageMapsForSeat(
  batch: Pick<PaperBatch, 'pageMaps' | 'versions' | 'seatVersions'>,
  seat: number
): PaperPageMap[] | undefined {
  if (!batch.pageMaps || !batch.versions) return batch.pageMaps;
  return batch.pageMaps.map((map) => ({
    ...map,
    items: map.items.map((item) => ({
      ...item,
      questionId: seatQuestionId(batch, seat, item.questionId),
    })),
    ...(map.prompt ? { prompt: seatQuestionId(batch, seat, map.prompt) } : {}),
  }));
}

/** The version a turn of the rotation prints. */
export const versionForTurn = (turn: number, versionCount: number): number =>
  versionCount > 0 ? turn % versionCount : 0;

/** Header rows each prompted question needs, the most any version's prompt takes. */
export function promptRowsFor(
  promptSets: readonly Readonly<Record<string, PaperPromptPage>>[],
  labelled: boolean
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const prompts of promptSets) {
    for (const [id, page] of Object.entries(prompts)) {
      const rows = promptHeaderRows(page.text, page.stimuli.length, labelled);
      out[id] = Math.max(out[id] ?? 0, rows);
    }
  }
  return out;
}

/** Ids of the written questions in `analysis` that print their whole prompt above the box. */
export function promptQuestionIds(
  analysis: Pick<PaperQuizAnalysis, 'written'>,
  questionsById: ReadonlyMap<string, QuizQuestion>,
  stimuli: readonly QuizStimulus[]
): Set<string> {
  return new Set(
    analysis.written
      .filter((w) => {
        const q = questionsById.get(w.questionId);
        return !!q && needsPromptPage(q, stimuli);
      })
      .map((w) => w.questionId)
  );
}

/** Prompt page content by question id. */
export function promptPagesFor(
  ids: ReadonlySet<string>,
  questionsById: ReadonlyMap<string, QuizQuestion>,
  stimuli: readonly QuizStimulus[]
): Record<string, PaperPromptPage> {
  const out: Record<string, PaperPromptPage> = {};
  for (const id of ids) {
    const q = questionsById.get(id);
    if (q) out[id] = { text: q.text, stimuli: promptStimuliFor(q, stimuli) };
  }
  return out;
}

/** What each version prints, keyed by the template's ids so one set of page maps serves all of them. */
export function printVersionsFor(
  plan: PaperVersionPlan,
  choiceOrder: Readonly<Record<string, readonly string[]>>,
  questionText: boolean
): PaperPrintVersion[] {
  const template = plan.template.entries;
  return plan.versions.map((v) => {
    const writtenTexts: Record<string, string> = {};
    const prompts: Record<string, PaperPromptPage> = {};
    v.analysis.entries.forEach((e, i) => {
      const at = template[i].questionId;
      const q = plan.questionsById.get(e.questionId);
      if (!q || e.kind !== 'written') return;
      // A box after a prompt page leaves its header to the number alone.
      if (q.text && !plan.promptIds.has(at)) writtenTexts[at] = q.text;
      if (plan.promptIds.has(at))
        prompts[at] = {
          text: q.text,
          stimuli: promptStimuliFor(q, plan.stimuli),
        };
    });
    const rows = v.analysis.rows;
    return {
      label: v.label,
      writtenTexts,
      prompts,
      ...(questionText
        ? {
            questionTexts: rows.map((r) => ({
              text: plan.questionsById.get(r.questionId)?.text ?? '',
              choices: choiceOrder[r.questionId] ?? [],
            })),
          }
        : {}),
      ...(rows.some((r) => r.sourceLabel)
        ? { rowLabels: rows.map((r) => r.sourceLabel) }
        : {}),
    };
  });
}

/** Every MC question any version bubbles, so the batch records each one's printed order. */
export function versionSheetQuestions(plan: PaperVersionPlan): QuizQuestion[] {
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const v of plan.versions) {
    for (const r of v.analysis.rows) {
      const q = plan.questionsById.get(r.questionId);
      if (q && !seen.has(q.id)) {
        seen.add(q.id);
        out.push(q);
      }
    }
  }
  return out;
}

/** Printed stem lines per template row, as tall as the tallest version's stem. */
export function versionStemLines(
  plan: PaperVersionPlan,
  linesOf: (questions: readonly QuizQuestion[]) => Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const templateRows = plan.template.rows;
  for (const v of plan.versions) {
    const questions = v.analysis.rows.flatMap((r) => {
      const q = plan.questionsById.get(r.questionId);
      return q ? [q] : [];
    });
    const lines = linesOf(questions);
    v.analysis.rows.forEach((r, i) => {
      const at = templateRows[i]?.questionId;
      const n = lines[r.questionId];
      if (at && n !== undefined) out[at] = Math.max(out[at] ?? 0, n);
    });
  }
  return out;
}
