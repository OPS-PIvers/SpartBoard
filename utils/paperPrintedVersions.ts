// A modification group's printed version of a device quiz (`paper-printed-versions`).
import type {
  PaperBatch,
  PaperCopyGroupPlan,
  PaperPrintedGroupRecord,
  QuestionTranslation,
  QuizData,
  QuizQuestion,
  QuizSupport,
} from '@/types';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
import { multiAnswerOptions } from '@/utils/quizMultiAnswer';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import {
  hiddenOptionIdsForRule,
  type ModificationGroup,
  type PrintedGroupPick,
} from '@/components/common/library/assignStepper/modificationGroups';

export const PAPER_PRINTED_VERSIONS_FEATURE = 'paper-printed-versions';

const INCORRECT_ID = /-incorrect-(\d+)$/;

/** The quiz as this group's students see it: fewer answer choices and modified wording. */
export function printedGroupQuiz(
  quiz: QuizData,
  group: Pick<ModificationGroup, 'answerChoices' | 'modifiedQuestions'>
): QuizData {
  const hidden =
    hiddenOptionIdsForRule(
      toOverrideEditorQuestions(quiz),
      group.answerChoices
    ) ?? {};
  const questions = quiz.questions.map((q): QuizQuestion => {
    let next = q;
    const modified = q.modifiedText?.trim();
    if (group.modifiedQuestions && modified) next = { ...next, text: modified };
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
    return next;
  });
  return { ...quiz, questions };
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
  translated: boolean
): string {
  const name = QUIZ_TRANSLATION_LANGUAGES.find(
    (l) => l.code === language
  )?.label;
  if (!name) return `Group ${number}`;
  return `Group ${number} · ${translated ? name : 'English'}`;
}

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
    label: printedGroupLabel(pick.number, pick.group.language, !!translation),
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
  return {
    number: pick.number,
    answerChoices,
    ...(modifiedQuestions ? { modifiedQuestions: true } : {}),
    ...(supports?.length ? { supports } : {}),
    ...(language ? { language } : {}),
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
  const printed = new Set(batches.map((b) => b.printedGroup?.number));
  return (plans ?? [])
    .filter((p) => !printed.has(p.number))
    .map((p) => recordPick(p, p.students));
}

/** A saved group record back as a pick, for the print dialog or its translation. */
export function recordPick(
  record: PaperPrintedGroupRecord,
  students: PrintedGroupPick['students'] = []
): PrintedGroupPick {
  const { number, answerChoices, modifiedQuestions, supports, language } =
    record;
  return {
    number,
    students,
    group: {
      id: `printed-${number}`,
      studentKeys: [],
      answerChoices,
      time: 'standard',
      readAloud: false,
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
        !!translation
      ),
      quiz: printedGroupQuiz(quiz, record ?? { answerChoices: 'all' }),
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
  questions: Record<
    string,
    { text?: string; choices?: Record<string, string> }
  >;
}

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
    const out: { text?: string; choices?: Record<string, string> } = {};
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
    if (out.text || out.choices) questions[q.id] = out;
  }
  if (Object.keys(questions).length === 0) return undefined;
  return { ...(title ? { title } : {}), questions };
}
