/**
 * Quiz sections and "answer any N of these M" (docs/plans/QUIZ_EXAMVIEW_IMPORT.md
 * E12–E14). A section owns the order entries after it; a session freezes that
 * into question ids so the player and scoring never need the quiz's `order`.
 */

import type {
  QuizData,
  QuizResponseAnswer,
  QuizSection,
  QuizSessionBankSlot,
  QuizSessionSection,
} from '@/types';

type SectionAnswer = Pick<
  QuizResponseAnswer,
  'questionId' | 'answer' | 'unresponded' | 'artifacts'
>;

/** Sections in `order`, each with the question ids after it; slot entries bring their whole pool. */
export function sessionSectionsFor(
  quiz: Pick<QuizData, 'questions'> &
    Partial<Pick<QuizData, 'order' | 'sections'>>,
  sessionSlots: readonly Pick<
    QuizSessionBankSlot,
    'id' | 'poolQuestionIds'
  >[] = []
): QuizSessionSection[] {
  const records = new Map((quiz.sections ?? []).map((s) => [s.id, s]));
  if (records.size === 0) return [];
  const questionIds = new Set(quiz.questions.map((q) => q.id));
  const pools = new Map(sessionSlots.map((s) => [s.id, s.poolQuestionIds]));
  const out: QuizSessionSection[] = [];
  const claimed = new Set<string>();
  let current: QuizSessionSection | null = null;
  const claim = (id: string) => {
    if (!current || claimed.has(id) || !questionIds.has(id)) return;
    claimed.add(id);
    current.questionIds.push(id);
  };
  for (const entry of quiz.order ?? []) {
    if (entry.kind === 'section') {
      const record = records.get(entry.id);
      current = record ? { ...cleanSection(record), questionIds: [] } : null;
      if (current) out.push(current);
    } else if (entry.kind === 'question') {
      claim(entry.id);
    } else {
      for (const id of pools.get(entry.id) ?? []) claim(id);
    }
  }
  return out.filter((s) => s.questionIds.length > 0);
}

/** A section record with a count that can't exceed its questions, and no empty fields. */
function cleanSection(section: QuizSection): QuizSection {
  const count = section.chooseCount;
  return {
    id: section.id,
    title: section.title.trim(),
    ...(section.directions?.trim()
      ? { directions: section.directions.trim() }
      : {}),
    ...(count !== undefined && Number.isInteger(count) && count > 0
      ? { chooseCount: count }
      : {}),
  };
}

export function sectionOfQuestion(
  sections: readonly QuizSessionSection[] | undefined,
  questionId: string
): QuizSessionSection | undefined {
  return sections?.find((s) => s.questionIds.includes(questionId));
}

/** The section's questions this student was served, in section order. */
export function servedSectionQuestionIds(
  section: QuizSessionSection,
  servedIds?: readonly string[]
): string[] {
  if (!servedIds || servedIds.length === 0) return [...section.questionIds];
  const served = new Set(servedIds);
  return section.questionIds.filter((id) => served.has(id));
}

/** The count a student must answer, never more than they were served. */
export function effectiveChooseCount(
  section: QuizSessionSection,
  servedIds?: readonly string[]
): number | undefined {
  const total = servedSectionQuestionIds(section, servedIds).length;
  const count = section.chooseCount;
  return count !== undefined && count < total ? count : undefined;
}

const hasContent = (answer: SectionAnswer): boolean => {
  if (answer.unresponded) return false;
  if (answer.artifacts?.some((a) => a?.uploadState !== 'failed')) return true;
  return (answer.answer ?? '').replace(/<[^>]*>/g, '').trim().length > 0;
};

/** A question counts toward the section's N once it holds a non-empty answer. */
export function isSectionAnswered(
  answers: readonly SectionAnswer[],
  questionId: string
): boolean {
  return answers.some((a) => a.questionId === questionId && hasContent(a));
}

/**
 * The questions that count in a choose-N section: the answered ones, first N
 * in section order. More than N (an older client, a paper sheet) keeps the first N.
 */
export function chosenQuestionIds(
  section: QuizSessionSection,
  answers: readonly SectionAnswer[],
  servedIds?: readonly string[]
): string[] {
  const served = servedSectionQuestionIds(section, servedIds);
  const count = effectiveChooseCount(section, servedIds);
  const answered = served.filter((id) => isSectionAnswered(answers, id));
  return count === undefined ? served : answered.slice(0, count);
}

export interface SectionProgress {
  section: QuizSessionSection;
  /** Questions the student was served in this section. */
  total: number;
  /** How many they must answer; equals `total` without a count. */
  required: number;
  answered: number;
}

export function sectionProgress(
  section: QuizSessionSection,
  answers: readonly SectionAnswer[],
  servedIds?: readonly string[]
): SectionProgress {
  const served = servedSectionQuestionIds(section, servedIds);
  return {
    section,
    total: served.length,
    required: effectiveChooseCount(section, servedIds) ?? served.length,
    answered: served.filter((id) => isSectionAnswered(answers, id)).length,
  };
}

/** True when the student has already answered N others in this question's section (E13). */
export function isLockedByChooseCount(
  sections: readonly QuizSessionSection[] | undefined,
  answers: readonly SectionAnswer[],
  questionId: string,
  servedIds?: readonly string[]
): boolean {
  const section = sectionOfQuestion(sections, questionId);
  if (!section) return false;
  const count = effectiveChooseCount(section, servedIds);
  if (count === undefined || isSectionAnswered(answers, questionId)) {
    return false;
  }
  const answered = servedSectionQuestionIds(section, servedIds).filter((id) =>
    isSectionAnswered(answers, id)
  ).length;
  return answered >= count;
}

/** Shuffles questions inside each section and leaves sectionless runs to shuffle among themselves. */
export function shuffleWithinSections<T extends { id: string }>(
  questions: readonly T[],
  sections: readonly QuizSessionSection[] | undefined,
  shuffle: (items: T[], key: string) => T[]
): T[] {
  if (!sections || sections.length === 0) return shuffle([...questions], '');
  const groups: { key: string; items: T[] }[] = [];
  for (const q of questions) {
    const key = sectionOfQuestion(sections, q.id)?.id ?? '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(q);
    else groups.push({ key, items: [q] });
  }
  return groups.flatMap((g, i) => shuffle(g.items, `${g.key}:${i}`));
}
