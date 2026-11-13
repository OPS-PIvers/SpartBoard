/**
 * Quiz sections and "answer any N of these M" (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md
 * E12–E14). A section owns the order entries after it; a session freezes that
 * into question ids so the player and scoring never need the quiz's `order`.
 */

import type {
  QuizCountedChoices,
  QuizData,
  QuizOrderEntry,
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
    ...(section.stopAfter === true ? { stopAfter: true } : {}),
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
  return stripTags(answer.answer ?? '').trim().length > 0;
};

// Repeats until stable so a tag split by another tag can't survive one pass.
const stripTags = (html: string): string => {
  let text = html;
  let prev;
  do {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== prev);
  return text;
};

/** A question counts toward the section's N once it holds a non-empty answer. */
export function isSectionAnswered(
  answers: readonly SectionAnswer[],
  questionId: string
): boolean {
  return answers.some((a) => a.questionId === questionId && hasContent(a));
}

/**
 * The questions that count in a choose-N section (E14): the teacher's picks
 * first, then the answered ones in section order, then unanswered ones, up to N.
 * More than N answered (an older client, a paper sheet) keeps the first N.
 */
export function chosenQuestionIds(
  section: QuizSessionSection,
  answers: readonly SectionAnswer[],
  servedIds?: readonly string[],
  picked?: readonly string[]
): string[] {
  const served = servedSectionQuestionIds(section, servedIds);
  const count = effectiveChooseCount(section, servedIds);
  if (count === undefined) return served;
  const chosen = new Set<string>();
  const add = (ids: readonly string[]) => {
    for (const id of ids) {
      if (chosen.size >= count) return;
      chosen.add(id);
    }
  };
  if (picked) add(served.filter((id) => picked.includes(id)));
  add(served.filter((id) => isSectionAnswered(answers, id)));
  add(served);
  return served.filter((id) => chosen.has(id));
}

/** The teacher's picks for one section, or undefined when none apply to this attempt. */
export function pickedForSection(
  response: {
    countedChoices?: QuizCountedChoices;
    completedAttempts?: number;
  },
  sectionId: string
): string[] | undefined {
  const choices = response.countedChoices;
  if (!choices || choices.attempt !== (response.completedAttempts ?? 0)) {
    return undefined;
  }
  const ids = choices.bySection?.[sectionId];
  return Array.isArray(ids) && ids.length > 0 ? ids : undefined;
}

/** Choose-N sections where this finished response answered more than N, for the teacher to pick from. */
export function overAnsweredResponseSections(
  response: {
    answers?: readonly SectionAnswer[];
    servedQuestionIds?: readonly string[];
    status?: string;
  },
  sections: readonly QuizSessionSection[] | undefined
): { section: QuizSessionSection; count: number; answeredIds: string[] }[] {
  if (response.status !== 'completed') return [];
  const answers = response.answers ?? [];
  return (sections ?? []).flatMap((section) => {
    const count = effectiveChooseCount(section, response.servedQuestionIds);
    if (count === undefined) return [];
    // A passed answer with text still counts as answered here, so the teacher can bring it back.
    const answeredIds = servedSectionQuestionIds(
      section,
      response.servedQuestionIds
    ).filter((id) =>
      answers.some(
        (a) =>
          a.questionId === id &&
          (!a.unresponded || a.unresponded === 'passed') &&
          hasContent({ ...a, unresponded: undefined })
      )
    );
    return answeredIds.length > count ? [{ section, count, answeredIds }] : [];
  });
}

/** Questions a student left out of a choose-N section: out of their total, shown as "Not chosen". */
export function notChosenQuestionIds(
  response: {
    answers?: readonly SectionAnswer[];
    servedQuestionIds?: readonly string[];
    status?: string;
    countedChoices?: QuizCountedChoices;
    completedAttempts?: number;
  },
  sections: readonly QuizSessionSection[] | undefined
): string[] {
  if (!sections?.some((s) => s.chooseCount)) return [];
  const answers = response.answers ?? [];
  return sections.flatMap((section) => {
    // Mid-quiz, a section short of N is still open; only a finished one is topped up.
    const count = effectiveChooseCount(section, response.servedQuestionIds);
    if (
      response.status !== 'completed' &&
      count !== undefined &&
      servedSectionQuestionIds(section, response.servedQuestionIds).filter(
        (id) => isSectionAnswered(answers, id)
      ).length < count
    ) {
      return [];
    }
    const chosen = new Set(
      chosenQuestionIds(
        section,
        answers,
        response.servedQuestionIds,
        pickedForSection(response, section.id)
      )
    );
    return servedSectionQuestionIds(section, response.servedQuestionIds).filter(
      (id) => !chosen.has(id)
    );
  });
}

/** Stamps each response's `_notChosen` for the teacher views; never written back. */
export function withNotChosen<
  R extends {
    answers?: readonly SectionAnswer[];
    status?: string;
    servedQuestionIds?: readonly string[];
    countedChoices?: QuizCountedChoices;
    completedAttempts?: number;
    _notChosen?: string[];
  },
>(
  responses: readonly R[],
  sections: readonly QuizSessionSection[] | undefined
): R[] {
  // Same array when nothing is stamped, so reference-equality consumers stay stable.
  if (!sections?.some((s) => s.chooseCount)) return responses as R[];
  return responses.map((r) => {
    const ids = notChosenQuestionIds(r, sections);
    return ids.length > 0 ? { ...r, _notChosen: ids } : r;
  });
}

/** False for a question outside the student's served set or left out of a choose-N section. */
export function isCountedFor(
  response: {
    servedQuestionIds?: readonly string[];
    _notChosen?: readonly string[];
  },
  questionId: string
): boolean {
  if (response._notChosen?.includes(questionId)) return false;
  const served = response.servedQuestionIds;
  return !served || served.length === 0 || served.includes(questionId);
}

/** The static max a quiz can score: a choose-N section adds only its N highest point values (E14). */
export function sectionAwareMaxPoints(
  questions: readonly { id: string; points?: number }[],
  sections: readonly QuizSessionSection[] | undefined
): number {
  const pts = (q: { points?: number }) => q.points ?? 1;
  const inCounted = new Map<string, QuizSessionSection>();
  for (const s of sections ?? []) {
    if (s.chooseCount && s.chooseCount < s.questionIds.length) {
      for (const id of s.questionIds) inCounted.set(id, s);
    }
  }
  let total = 0;
  const bySection = new Map<string, number[]>();
  for (const q of questions) {
    const section = inCounted.get(q.id);
    if (!section) {
      total += pts(q);
      continue;
    }
    bySection.set(section.id, [...(bySection.get(section.id) ?? []), pts(q)]);
  }
  for (const [id, values] of bySection) {
    const count =
      (sections ?? []).find((s) => s.id === id)?.chooseCount ?? values.length;
    total += [...values]
      .sort((a, b) => b - a)
      .slice(0, count)
      .reduce((a, b) => a + b, 0);
  }
  return total;
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

/** Sections where a paper sheet answered more than N; the first N in order count (E15). */
export function overAnsweredSections(
  sections: readonly QuizSessionSection[] | undefined,
  answeredIds: ReadonlySet<string>
): { section: QuizSessionSection; answered: number }[] {
  return (sections ?? []).flatMap((section) => {
    const count = effectiveChooseCount(section);
    if (count === undefined) return [];
    const answered = section.questionIds.filter((id) =>
      answeredIds.has(id)
    ).length;
    return answered > count ? [{ section, answered }] : [];
  });
}

/** "Answer any 2 of these 3 questions.", or null for a section students answer in full. */
export function chooseLineFor(
  section: QuizSessionSection,
  servedIds?: readonly string[]
): string | null {
  const count = effectiveChooseCount(section, servedIds);
  const total = servedSectionQuestionIds(section, servedIds).length;
  return count === undefined
    ? null
    : `Answer any ${count} of these ${total} questions.`;
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

/** Questions each section row owns in `order`: fixed questions plus each bank slot's draw count. */
export function sectionQuestionCounts(
  order: readonly { kind: string; id: string }[],
  slotCounts: ReadonlyMap<string, number>
): Map<string, number> {
  const counts = new Map<string, number>();
  let current: string | null = null;
  for (const entry of order) {
    if (entry.kind === 'section') {
      current = entry.id;
      counts.set(current, 0);
    } else if (current) {
      const add = entry.kind === 'slot' ? (slotCounts.get(entry.id) ?? 0) : 1;
      counts.set(current, (counts.get(current) ?? 0) + add);
    }
  }
  return counts;
}

/** `order` and `sections` cut down to the questions kept, dropping a section left with none. */
export function sectionsForQuestions(
  quiz: Pick<QuizData, 'questions' | 'order' | 'sections'>
): Pick<QuizData, 'order' | 'sections'> {
  if (!quiz.sections?.length || !quiz.order) {
    return { order: quiz.order, sections: quiz.sections };
  }
  const kept = new Set(quiz.questions.map((q) => q.id));
  const order: QuizOrderEntry[] = [];
  let heading: QuizOrderEntry | null = null;
  for (const entry of quiz.order) {
    if (entry.kind === 'section') heading = entry;
    else if (entry.kind === 'slot' || kept.has(entry.id)) {
      if (heading) order.push(heading);
      heading = null;
      order.push(entry);
    }
  }
  const placed = new Set(
    order.filter((e) => e.kind === 'section').map((e) => e.id)
  );
  const sections = quiz.sections.filter((s) => placed.has(s.id));
  return {
    order:
      sections.length > 0 || order.some((e) => e.kind === 'slot')
        ? order
        : undefined,
    sections: sections.length > 0 ? sections : undefined,
  };
}
