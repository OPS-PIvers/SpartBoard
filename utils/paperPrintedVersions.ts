// A modification group's printed version of a device quiz.
import type {
  PaperBatch,
  PaperCopyGroupPlan,
  PaperPrintedGroupRecord,
  QuestionTranslation,
  QuizData,
  QuizQuestion,
  QuizSupport,
  StudentOverride,
} from '@/types';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
import { multiAnswerOptions } from '@/utils/quizMultiAnswer';
import { matchingPairs } from '@/utils/paperSheetPlan';
import type { ResolvedQuizAssignment } from '@/utils/questionBanks';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import {
  hiddenOptionIdsForRule,
  type ModificationGroup,
  type PrintedGroupPick,
} from '@/components/common/library/assignStepper/modificationGroups';

const INCORRECT_ID = /-incorrect-(\d+)$/;

/** The quiz as this group's students see it: fewer answer choices, modified wording and stimuli. */
export function printedGroupQuiz(
  quiz: QuizData,
  group: Pick<
    ModificationGroup,
    'answerChoices' | 'modifiedQuestions' | 'questionIds'
  >,
  copy?: StudentCopyRules
): QuizData {
  const hiddenChoices = copy?.hiddenChoices;
  const onlyIds = copy?.questionIds ?? group.questionIds;
  const only = onlyIds?.length ? new Set(onlyIds) : null;
  const hidden =
    hiddenOptionIdsForRule(
      toOverrideEditorQuestions(quiz),
      group.answerChoices
    ) ?? {};
  const questions = quiz.questions.map((q): QuizQuestion => {
    let next = q;
    const modified = q.modifiedText?.trim();
    if (group.modifiedQuestions && modified) next = { ...next, text: modified };
    if (group.modifiedQuestions && q.modifiedStimulusIds?.length)
      next = { ...next, stimulusIds: q.modifiedStimulusIds };
    // The teacher's own test paper letters every option, so its rows stay whole.
    const ids = q.paperOwnTest ? undefined : hidden[q.id];
    if (ids?.length) {
      const drop = new Set(
        ids.flatMap((id) => {
          const m = INCORRECT_ID.exec(id);
          return m ? [Number(m[1])] : [];
        })
      );
      const { optionOrder: _order, ...rest } = next;
      next = {
        ...rest,
        incorrectAnswers: next.incorrectAnswers.filter((_, i) => !drop.has(i)),
      };
    }
    const hiddenText = q.paperOwnTest ? undefined : hiddenChoices?.[q.id];
    if (hiddenText?.length) {
      const drop = new Set(hiddenText);
      // One wrong answer always stays, as on the student's device.
      const kept = next.incorrectAnswers.filter((a) => !drop.has(a));
      if (kept.length > 0 && kept.length < next.incorrectAnswers.length) {
        const { optionOrder: _order, ...rest } = next;
        next = { ...rest, incorrectAnswers: kept };
      }
    }
    return next;
  });
  return {
    ...quiz,
    questions: only ? questions.filter((q) => only.has(q.id)) : questions,
  };
}

/** A student copy's own rules beyond its group's: hidden option text and a question subset. */
export type StudentCopyRules = Pick<
  PaperPrintedGroupRecord,
  'hiddenChoices' | 'questionIds'
>;

/** The assignment's bank pools as this group's students see them. */
export function printedGroupResolved(
  resolved: ResolvedQuizAssignment,
  quiz: QuizData,
  group: Pick<
    ModificationGroup,
    'answerChoices' | 'modifiedQuestions' | 'questionIds'
  >,
  hiddenChoices?: StudentCopyRules['hiddenChoices']
): ResolvedQuizAssignment {
  return {
    ...resolved,
    // A bank draw replaces a question subset, as on devices.
    questions: printedGroupQuiz(
      { ...quiz, questions: resolved.questions, stimuli: resolved.stimuli },
      { ...group, questionIds: undefined },
      hiddenChoices ? { hiddenChoices } : undefined
    ).questions,
  };
}

/** Supports printed at the end of the test paper; a link or Drive file prints as its title and address. */
export interface PrintedSupport {
  title: string;
  body: string;
}

export function printedSupports(
  supports: readonly QuizSupport[] | undefined
): PrintedSupport[] {
  return (supports ?? []).map((s) => {
    if (s.kind === 'text') return { title: s.title, body: s.text };
    if (s.kind === 'link') return { title: s.title, body: s.url };
    return {
      title: s.title,
      body: `https://drive.google.com/file/d/${s.fileId}/view`,
    };
  });
}

/** "Group 2 · Spanish", or "Group 2 · English" when that language has nothing reviewed to print. */
export function printedGroupLabel(
  number: number,
  language: string | undefined,
  translated: boolean,
  single?: boolean
): string {
  const base = single ? STUDENT_COPY_LABEL : `Group ${number}`;
  const name = QUIZ_TRANSLATION_LANGUAGES.find(
    (l) => l.code === language
  )?.label;
  if (!name) return base;
  return `${base} · ${translated ? name : 'English'}`;
}

/** What a stack printed for one student from the monitor is called. */
export const STUDENT_COPY_LABEL = 'Student copy';

/** What the print dialog needs for one printed group. */
export function printedGroupForPrint(
  pick: PrintedGroupPick,
  translation?: PrintedTranslation
): {
  label: string;
  students: Record<string, string[]>;
  supports: PrintedSupport[];
  translation?: PrintedTranslation;
} {
  const students: Record<string, string[]> = {};
  for (const s of pick.students)
    (students[s.rosterId] ??= []).push(s.studentId);
  return {
    label: printedGroupLabel(
      pick.number,
      pick.group.language,
      !!translation,
      pick.single
    ),
    students,
    supports: printedSupports(pick.group.supports),
    ...(translation ? { translation } : {}),
  };
}

/** What a printed group's stack records about its version. */
export function printedGroupRecord(
  pick: PrintedGroupPick
): PaperPrintedGroupRecord {
  const { answerChoices, modifiedQuestions, supports, language } = pick.group;
  const questionIds = pick.questionIds ?? pick.group.questionIds;
  return {
    number: pick.number,
    answerChoices,
    ...(modifiedQuestions ? { modifiedQuestions: true } : {}),
    ...(supports?.length ? { supports } : {}),
    ...(language ? { language } : {}),
    ...(pick.single ? { single: true as const } : {}),
    ...(pick.hiddenChoices && Object.keys(pick.hiddenChoices).length
      ? { hiddenChoices: pick.hiddenChoices }
      : {}),
    ...(questionIds?.length ? { questionIds: [...questionIds] } : {}),
  };
}

/** One student's paper copy from the monitor, carrying their own modifications. */
export function studentCopyPick(
  student: { rosterId: string; studentId: string },
  override: StudentOverride | undefined
): PrintedGroupPick {
  const hidden = override?.hiddenOptionIdsByQuestion;
  const questionIds = override?.questionIds;
  return {
    number: 0,
    single: true,
    students: [student],
    ...(hidden && Object.keys(hidden).length ? { hiddenChoices: hidden } : {}),
    ...(questionIds?.length ? { questionIds } : {}),
    group: {
      id: 'student-copy',
      studentKeys: [],
      answerChoices: 'all',
      time: 'standard',
      readAloud: false,
      speechToText: false,
      printed: true,
      ...(override?.modifiedQuestions ? { modifiedQuestions: true } : {}),
      ...(override?.supports?.length ? { supports: override.supports } : {}),
      ...(override?.language ? { language: override.language } : {}),
    },
  };
}

/** What the assignment keeps about a printed group, so it can print later. */
export function printedCopyPlan(pick: PrintedGroupPick): PaperCopyGroupPlan {
  return { ...printedGroupRecord(pick), students: pick.students };
}

/** Planned groups with no stack yet, as picks for the print dialog. */
export function unprintedCopyPicks(
  plans: readonly PaperCopyGroupPlan[] | undefined,
  batches: readonly Pick<PaperBatch, 'printedGroup'>[]
): PrintedGroupPick[] {
  const printed = new Set(
    batches.flatMap((b) =>
      b.printedGroup && !b.printedGroup.single ? [b.printedGroup.number] : []
    )
  );
  return (plans ?? [])
    .filter((p) => !printed.has(p.number))
    .map((p) => recordPick(p, p.students));
}

/** A saved group record back as a pick, for the print dialog or its translation. */
export function recordPick(
  record: PaperPrintedGroupRecord,
  students: PrintedGroupPick['students'] = []
): PrintedGroupPick {
  const {
    number,
    answerChoices,
    modifiedQuestions,
    supports,
    language,
    single,
    hiddenChoices,
    questionIds,
  } = record;
  return {
    number,
    students,
    ...(single ? { single } : {}),
    ...(hiddenChoices ? { hiddenChoices } : {}),
    ...(questionIds ? { questionIds } : {}),
    group: {
      id: `printed-${number}`,
      studentKeys: [],
      answerChoices,
      time: 'standard',
      readAloud: false,
      speechToText: false,
      printed: true,
      ...(modifiedQuestions ? { modifiedQuestions } : {}),
      ...(supports?.length ? { supports } : {}),
      ...(language ? { language } : {}),
    },
  };
}

/** A device assignment's printed stacks in group order, each with the quiz version it printed. */
export function printedReprintGroups(
  quiz: QuizData,
  batches: readonly PaperBatch[],
  translations: readonly (PrintedTranslation | undefined)[] = []
): {
  label: string;
  quiz: QuizData;
  batch: PaperBatch;
  translation?: PrintedTranslation;
}[] {
  return printedStackOrder(batches).map((batch, i) => {
    const record = batch.printedGroup;
    const translation = translations[i];
    return {
      label: printedGroupLabel(
        record?.number ?? i + 1,
        record?.language,
        !!translation,
        record?.single
      ),
      quiz: printedGroupQuiz(quiz, record ?? { answerChoices: 'all' }, record),
      batch,
      ...(translation ? { translation } : {}),
    };
  });
}

/** Printed stacks in group order; `printedReprintGroups` translations follow this order. */
export const printedStackOrder = (
  batches: readonly PaperBatch[]
): PaperBatch[] =>
  [...batches].sort(
    (a, b) => (a.printedGroup?.number ?? 0) - (b.printedGroup?.number ?? 0)
  );

/** A group's language for the printed test paper: display text only, so the answer sheet and its import stay in English. */
export interface PrintedTranslation {
  title?: string;
  /** Language code, for the fixed words printed around stimuli. */
  language?: string;
  questions: Record<
    string,
    {
      text?: string;
      choices?: Record<string, string>;
      /** Matching terms, English to localized. */
      terms?: Record<string, string>;
    }
  >;
}

/** English to localized, only when both lists line up one to one. */
const zipWords = (
  english: readonly string[],
  localized: readonly string[] | undefined
): Record<string, string> | undefined =>
  localized?.length === english.length &&
  new Set(english).size === english.length
    ? Object.fromEntries(english.map((e, i) => [e, localized[i]]))
    : undefined;

/** Matching and ordering: their printed options and terms, from the translation's own fields. */
const groupWords = (
  q: QuizQuestion,
  tr: QuestionTranslation
): { choices?: Record<string, string>; terms?: Record<string, string> } => {
  if (q.type === 'Ordering') {
    const choices = zipWords(q.correctAnswer.split('|'), tr.orderingItems);
    return choices ? { choices } : {};
  }
  if (q.type !== 'Matching') return {};
  const pairs = matchingPairs(q.correctAnswer);
  const rights = zipWords(
    pairs.map(([, right]) => right),
    tr.matchingRight
  );
  const extras = zipWords(
    (q.matchingDistractors ?? []).filter(Boolean),
    tr.matchingDistractors
  );
  const terms = zipWords(
    pairs.map(([left]) => left),
    tr.matchingLeft
  );
  const choices = rights ? { ...rights, ...(extras ?? {}) } : undefined;
  return { ...(choices ? { choices } : {}), ...(terms ? { terms } : {}) };
};

const englishChoices = (q: QuizQuestion): string[] | null => {
  if (q.type === 'MC')
    return [q.correctAnswer, ...q.incorrectAnswers.filter(Boolean)];
  if (q.type === 'MA') return multiAnswerOptions(q);
  return null;
};

/** The printed test paper's strings in one language, from reviewed and current translations only. */
export function printedTranslation(
  quiz: QuizData,
  entries: Readonly<Record<string, QuestionTranslation>>,
  group: Pick<ModificationGroup, 'modifiedQuestions'>,
  title?: string
): PrintedTranslation | undefined {
  const questions: PrintedTranslation['questions'] = {};
  for (const q of quiz.questions) {
    const tr = entries[q.id];
    if (!tr) continue;
    const out: PrintedTranslation['questions'][string] = {};
    // A group's modified wording is the teacher's own text, so it prints as written.
    const modified = group.modifiedQuestions && !!q.modifiedText?.trim();
    if (!modified && tr.text) out.text = tr.text;
    const english = englishChoices(q);
    const localized = tr.choices;
    if (
      english &&
      localized?.length === english.length &&
      new Set(english).size === english.length
    )
      out.choices = Object.fromEntries(
        english.map((e, i) => [e, localized[i]])
      );
    Object.assign(out, groupWords(q, tr));
    if (out.text || out.choices || out.terms) questions[q.id] = out;
  }
  if (Object.keys(questions).length === 0) return undefined;
  return { ...(title ? { title } : {}), questions };
}
