// A modification group's printed version of a device quiz (`paper-printed-versions`).
import type { QuizData, QuizQuestion, QuizSupport } from '@/types';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
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

/** What the print dialog needs for one printed group. */
export function printedGroupForPrint(pick: PrintedGroupPick): {
  label: string;
  students: Record<string, string[]>;
  supports: PrintedSupport[];
} {
  const students: Record<string, string[]> = {};
  for (const s of pick.students)
    (students[s.rosterId] ??= []).push(s.studentId);
  return {
    label: `Group ${pick.number}`,
    students,
    supports: printedSupports(pick.group.supports),
  };
}
