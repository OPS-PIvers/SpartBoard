import type {
  QuizCountedChoices,
  QuizData,
  QuizResponse,
  QuizResponseAnswer,
  QuizSessionSection,
} from '@/types';
import {
  notChosenQuestionIds,
  overAnsweredResponseSections,
} from '@/utils/quizSections';

/** The new picks and answers for one section, or null when the pick doesn't fit the section. */
export function countedChoicesPatch(
  response: Pick<
    QuizResponse,
    | 'answers'
    | 'servedQuestionIds'
    | 'status'
    | 'countedChoices'
    | 'completedAttempts'
  >,
  sections: readonly QuizSessionSection[] | undefined,
  sectionId: string,
  /** Question ids that count; null goes back to the first N in order. */
  picked: readonly string[] | null
): {
  countedChoices: QuizCountedChoices | null;
  answers: QuizResponseAnswer[];
} | null {
  const over = overAnsweredResponseSections(response, sections).find(
    (o) => o.section.id === sectionId
  );
  if (!over) return null;
  const attempt = response.completedAttempts ?? 0;
  const current =
    response.countedChoices?.attempt === attempt
      ? response.countedChoices
      : undefined;
  const kept = { ...(current?.bySection ?? {}) };
  delete kept[sectionId];
  let ids: string[] = [];
  if (picked !== null) {
    ids = over.answeredIds.filter((id) => picked.includes(id));
    if (ids.length !== over.count || new Set(picked).size !== ids.length) {
      return null;
    }
  }
  // A picked answer that was set aside as passed is a real answer again; unpicking sets it aside again.
  const inSection = new Set(over.section.questionIds);
  const pickedSet = new Set(ids);
  const revived = new Set(current?.revived ?? []);
  const answers = (response.answers ?? []).map((a) => {
    if (!inSection.has(a.questionId)) return a;
    if (pickedSet.has(a.questionId) && a.unresponded === 'passed') {
      revived.add(a.questionId);
      const { unresponded: _passed, ...rest } = a;
      void _passed;
      return rest;
    }
    if (!pickedSet.has(a.questionId) && revived.has(a.questionId)) {
      revived.delete(a.questionId);
      return { ...a, unresponded: 'passed' as const };
    }
    return a;
  });
  const bySection = picked === null ? kept : { ...kept, [sectionId]: ids };
  const empty = Object.keys(bySection).length === 0 && revived.size === 0;
  return {
    countedChoices: empty
      ? null
      : {
          attempt,
          bySection,
          ...(revived.size > 0 ? { revived: [...revived] } : {}),
        },
    answers,
  };
}

/** Section ids whose saved pick changes the default first-N choice. */
export function sectionsWithTeacherPick(
  response: Pick<QuizResponse, 'countedChoices' | 'completedAttempts'>
): string[] {
  const choices = response.countedChoices;
  if (!choices || choices.attempt !== (response.completedAttempts ?? 0)) {
    return [];
  }
  return Object.keys(choices.bySection ?? {});
}

export type SaveCountedChoices = (
  responseKey: string,
  sectionId: string,
  picked: string[] | null
) => Promise<void>;

/** Each over-answered section of a finished response, ready for the picker. */
export function countedChoiceSections(
  response: Pick<
    QuizResponse,
    | 'answers'
    | 'servedQuestionIds'
    | 'status'
    | 'countedChoices'
    | 'completedAttempts'
  >,
  sections: readonly QuizSessionSection[] | undefined,
  questions: readonly { id: string; text: string }[]
): {
  sectionId: string;
  title: string;
  count: number;
  options: { questionId: string; number: number; text: string }[];
  counted: string[];
  teacherPicked: boolean;
}[] {
  const numberOf = new Map(questions.map((q, i) => [q.id, i + 1]));
  const textOf = new Map(questions.map((q) => [q.id, q.text]));
  const notChosen = new Set(notChosenQuestionIds(response, sections));
  const picked = new Set(sectionsWithTeacherPick(response));
  return overAnsweredResponseSections(response, sections).map((o) => ({
    sectionId: o.section.id,
    title: o.section.title,
    count: o.count,
    options: o.answeredIds.map((id) => ({
      questionId: id,
      number: numberOf.get(id) ?? 0,
      text: textOf.get(id) ?? '',
    })),
    counted: o.answeredIds.filter((id) => !notChosen.has(id)),
    teacherPicked: picked.has(o.section.id),
  }));
}

/** Section id to its new count (undefined = answer all), for sections whose count the teacher changed. */
export function chooseCountChanges(
  before: Pick<QuizData, 'sections'> | null | undefined,
  after: Pick<QuizData, 'sections'> | null | undefined
): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  const old = new Map((before?.sections ?? []).map((s) => [s.id, s]));
  for (const s of after?.sections ?? []) {
    const prev = old.get(s.id);
    if (prev && prev.chooseCount !== s.chooseCount)
      out.set(s.id, s.chooseCount);
  }
  return out;
}

/** The session's sections with the new counts, or null when none of them change. */
export function sectionsWithCounts(
  sections: readonly QuizSessionSection[] | undefined,
  changes: ReadonlyMap<string, number | undefined>
): QuizSessionSection[] | null {
  let changed = false;
  const next = (sections ?? []).map((s) => {
    if (!changes.has(s.id)) return s;
    const want = changes.get(s.id);
    const count =
      want !== undefined && Number.isInteger(want) && want > 0
        ? want
        : undefined;
    if (count === s.chooseCount) return s;
    changed = true;
    const { chooseCount: _old, ...rest } = s;
    void _old;
    return count === undefined ? rest : { ...rest, chooseCount: count };
  });
  return changed ? next : null;
}
