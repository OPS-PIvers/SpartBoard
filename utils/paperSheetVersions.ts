/** Balanced bank slots on paper: print-time dealing and self-contained written pages (QUIZ_IMPORT_VERSIONS.md V24-V25). */

import { promptLabelOf } from '@/utils/quizPromptText';
import { choicePictureFields } from '@/utils/quizAnswerImages';
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
  secureShuffle,
  type ResolvedQuizAssignment,
} from './questionBanks';
import {
  dealFromRotation,
  isBalancedSlot,
  servedVersionLabels,
} from './quizBalancedDeal';
import {
  analyzePaperQuiz,
  matchingPairs,
  paperGroupOrder,
  seededRandom,
  type AnalyzePaperQuizOptions,
  type PaperQuizAnalysis,
} from './paperSheetPlan';
import { splitBlanks } from './quizFibBlanks';
import { promptHeaderRows } from './paperPageMap';
import { isPaperBoxSize, paperBoxRoom } from './paperWritten';
import type {
  PaperGroupText,
  PaperPrintVersion,
  PaperPromptPage,
} from './paperSheetPrint';

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
  /** Versions are random forms, dealt one per sheet across the whole stack rather than per class. */
  dealBySheet: boolean;
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

const entryShape = (e: PaperQuizAnalysis['entries'][number]): string =>
  e.kind === 'written'
    ? `written:${e.blanks ?? 0}:${e.style ?? 'lines'}`
    : e.group
      ? `mc:${e.group}:${e.parts ?? 1}:${e.choices ?? 0}`
      : e.kind;

const sameShape = (a: PaperQuizAnalysis, b: PaperQuizAnalysis): boolean =>
  a.entries.length === b.entries.length &&
  a.entries.every((e, i) => entryShape(e) === entryShape(b.entries[i])) &&
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

/** How many sheets a stack with random bank pulls draws for, and the seed that keeps each draw stable. */
export interface PaperRandomForms {
  /** Sheets to draw for; one form each, up to {@link MAX_PAPER_VERSIONS}. */
  count: number;
  seed: string;
}

/** A pool question's printed shape: `mc`, `written:<blanks>:<style>`, or `off` when it cannot print. */
type PaperKind = string;

/** What a pool question prints as on its own: a bubble row, a written box, or nothing. */
function paperKindOf(
  quiz: QuizData,
  question: QuizQuestion,
  options: AnalyzePaperQuizOptions
): PaperKind {
  const one = analyzePaperQuiz(
    {
      ...quiz,
      questions: [question],
      bankSlots: undefined,
      order: undefined,
      sections: undefined,
    },
    options
  );
  const entry = one.entries[0];
  return entry ? entryShape(entry) : 'off';
}

/**
 * Each form's draw for one random slot. Questions that print are drawn first,
 * and every form keeps the first form's mix of bubble rows and written boxes
 * so one sheet layout serves the whole stack.
 */
function drawRandomForms(
  pool: readonly string[],
  count: number,
  kindOf: (id: string) => PaperKind,
  formCount: number,
  rng: (form: number) => (n: number) => number
): string[][] {
  const byKind = new Map<PaperKind, string[]>();
  for (const id of pool) {
    const kind = kindOf(id);
    byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
  }
  const printable = pool.filter((id) => kindOf(id) !== 'off');
  const off = byKind.get('off') ?? [];
  const first = rng(0);
  const firstDraw = secureShuffle(
    printable.length >= count
      ? secureShuffle(printable, first).slice(0, count)
      : [
          ...printable,
          ...secureShuffle(off, first).slice(0, count - printable.length),
        ],
    first
  );
  const pattern = firstDraw.map(kindOf);
  const forms = [firstDraw];
  for (let k = 1; k < formCount; k += 1) {
    const next = rng(k);
    const drawn = new Map(
      [...byKind].map(([kind, ids]) => [kind, secureShuffle(ids, next)])
    );
    forms.push(pattern.map((kind) => drawn.get(kind)?.shift() ?? ''));
  }
  return forms;
}

/**
 * Deal each balanced slot in turn, one version per turn, until the rotation
 * repeats. Random slots draw one form per sheet instead (`forms`). Null when
 * the quiz has no slot, random slots with no `forms`, too many balanced
 * versions, or versions that would not share one layout.
 */
export function planPaperVersions(
  quiz: QuizData,
  resolved: ResolvedQuizAssignment,
  options: AnalyzePaperQuizOptions = {},
  forms?: PaperRandomForms
): PaperVersionPlan | null {
  const plan = planVersions(quiz, resolved, options, forms);
  if (plan || !forms) return plan;
  // Balanced pools that would not share one layout fall back to a random draw per sheet.
  return planVersions(
    quiz,
    {
      ...resolved,
      sessionSlots: resolved.sessionSlots.map(
        ({ dealing: _dealing, ...slot }) => slot
      ),
    },
    options,
    forms
  );
}

function planVersions(
  quiz: QuizData,
  resolved: ResolvedQuizAssignment,
  options: AnalyzePaperQuizOptions,
  forms: PaperRandomForms | undefined
): PaperVersionPlan | null {
  const slots = resolved.sessionSlots;
  if (slots.length === 0) return null;
  const random = slots.filter((s) => !isBalancedSlot(s));
  const randomDraws = random.some(
    (s) => s.count > 0 && s.poolQuestionIds.length > 0
  );
  if (randomDraws && !forms) return null;
  const rotation = rotationPeriod(slots);
  // A rotation too long for one stack deals its turns one per sheet instead.
  const dealBySheet = randomDraws || (rotation > MAX_PAPER_VERSIONS && !!forms);
  const period = dealBySheet
    ? Math.min(Math.max(1, Math.floor(forms?.count ?? 1)), MAX_PAPER_VERSIONS)
    : rotation;
  if (period > MAX_PAPER_VERSIONS) return null;

  const questionsById = new Map(resolved.questions.map((q) => [q.id, q]));
  const publicIds = resolved.questions.map((q) => q.id);
  const kinds = new Map<string, PaperKind>();
  const kindOf = (id: string): PaperKind => {
    let kind = kinds.get(id);
    if (!kind) {
      const q = questionsById.get(id);
      kind = q ? paperKindOf(quiz, q, options) : 'off';
      kinds.set(id, kind);
    }
    return kind;
  };
  const randomForms = new Map(
    random.map((slot) => [
      slot.id,
      drawRandomForms(
        slot.poolQuestionIds,
        Math.min(slot.count, slot.poolQuestionIds.length),
        kindOf,
        period,
        (form) => {
          const next = seededRandom(`${forms?.seed ?? ''}:${slot.id}:${form}`);
          return (n) => Math.floor(next() * n);
        }
      ),
    ])
  );
  const versions: PaperVersionDraft[] = [];
  for (let turn = 0; turn < period; turn += 1) {
    const dealt = new Map(
      slots.map((slot) => [
        slot.id,
        isBalancedSlot(slot)
          ? dealFromRotation(slot.poolQuestionIds, slot.count, turn, new Set())
          : (randomForms.get(slot.id)?.[turn] ?? []),
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
    const labels = servedVersionLabels(slots, servedQuestionIds);
    // Random forms are numbered so each sheet, test paper and key can be matched.
    if (randomDraws && period > 1) labels.push(`Version ${turn + 1}`);
    versions.push({
      label: labels.join(', '),
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
      return e.kind === 'written' && paperBoxRoom(e.size) > paperBoxRoom(size)
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
    dealBySheet,
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
      const rows = promptHeaderRows(
        page.text,
        page.stimuli.length,
        labelled,
        page.block?.heightMm ?? 0
      );
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

/** Question id per sheet row for multiple choice rows; null for each row a grouped question takes. */
export function sheetRowSlots(
  analysis: Pick<PaperQuizAnalysis, 'entries'>
): (string | null)[] {
  return analysis.entries.flatMap((e) =>
    e.kind !== 'mc'
      ? []
      : e.group
        ? Array.from<null>({ length: e.parts ?? 1 }).fill(null)
        : [e.questionId]
  );
}

/** Text around each grouped question's rows, keyed by `at` (the page maps' id) for each of `analysis`'s groups. */
export function groupTextsFor(
  analysis: Pick<PaperQuizAnalysis, 'groups'>,
  questionsById: ReadonlyMap<string, QuizQuestion>,
  choiceOrder: Readonly<Record<string, readonly string[]>>,
  at: (questionId: string, index: number) => string = (id) => id
): Record<string, PaperGroupText> {
  const out: Record<string, PaperGroupText> = {};
  analysis.groups.forEach((g, i) => {
    const q = questionsById.get(g.questionId);
    if (!q) return;
    out[at(g.questionId, i)] = {
      text: promptLabelOf(q),
      options: [...(choiceOrder[q.id] ?? paperGroupOrder(q))],
      ...(g.group === 'match'
        ? { terms: matchingPairs(q.correctAnswer).map(([left]) => left) }
        : {}),
    };
  });
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
    const blankAnswers: Record<string, string[]> = {};
    v.analysis.entries.forEach((e, i) => {
      const at = template[i].questionId;
      const q = plan.questionsById.get(e.questionId);
      if (!q || e.kind !== 'written') return;
      if (q.type === 'FIB') blankAnswers[at] = splitBlanks(q.correctAnswer);
      // A box after a prompt page leaves its header to the number alone.
      if (q.text && !plan.promptIds.has(at)) writtenTexts[at] = q.text;
      if (plan.promptIds.has(at))
        prompts[at] = {
          text: q.text,
          stimuli: promptStimuliFor(q, plan.stimuli),
        };
    });
    const rows = v.analysis.rows;
    const rowById = new Map(rows.map((r) => [r.questionId, r]));
    const slots = sheetRowSlots(v.analysis);
    const templateGroups = plan.template.groups;
    return {
      label: v.label,
      writtenTexts,
      groupTexts: groupTextsFor(
        v.analysis,
        plan.questionsById,
        choiceOrder,
        (_, i) => templateGroups[i]?.questionId ?? ''
      ),
      prompts,
      // Always set, so a version's key never falls back to the first version's answers.
      blankAnswers,
      ...(questionText
        ? {
            questionTexts: slots.map((id) =>
              id
                ? {
                    text: promptLabelOf(plan.questionsById.get(id)),
                    choices: choiceOrder[id] ?? [],
                    ...choicePictureFields(
                      plan.questionsById.get(id),
                      choiceOrder[id] ?? []
                    ),
                  }
                : { text: '', choices: [] }
            ),
          }
        : {}),
      ...(rows.some((r) => r.sourceLabel)
        ? {
            rowLabels: slots.map((id) =>
              id ? rowById.get(id)?.sourceLabel : undefined
            ),
          }
        : {}),
    };
  });
}

/** Every MC question any version bubbles, so the batch records each one's printed order. */
export function versionSheetQuestions(plan: PaperVersionPlan): QuizQuestion[] {
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const v of plan.versions) {
    for (const r of [...v.analysis.rows, ...v.analysis.groups]) {
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
