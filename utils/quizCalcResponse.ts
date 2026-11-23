// The question as one student was given it: their random numbers attached for grading and display.
import type { QuizResponse } from '@/types';
import { getResponseDocKey } from '@/hooks/quizSession/responseKeys';
import {
  calcAttemptKey,
  calcModifiedNeedsAnswer,
  calcSeed,
  drawCalcValues,
  fillCalcPrompt,
  formatCalcAnswer,
  withCalcValues,
  type CalcSpec,
  type CalcVariable,
} from '@/utils/quizCalculated';

/** Per-student overrides from the assignment doc; only "modified questions" matters here, read by uid as the server grades it. */
export interface ModifiedSource {
  overridesByStudentUid?: Record<
    string,
    { modifiedQuestions?: boolean }
  > | null;
  /** Only a student-paced session shows the modified prompt. */
  sessionMode?: string;
}

/** True when the teacher gave this student the modified version of each question. */
export function isModifiedStudent(
  response: Pick<QuizResponse, 'studentUid'>,
  source: ModifiedSource | null | undefined
): boolean {
  if (source?.sessionMode !== 'student') return false;
  return (
    source.overridesByStudentUid?.[response.studentUid]?.modifiedQuestions ===
    true
  );
}

export function questionForResponse<
  Q extends {
    id: string;
    type: string;
    calc?: CalcSpec;
    modifiedText?: string;
    text?: string;
  },
>(
  q: Q,
  response: QuizResponse | undefined,
  modified?: ModifiedSource | null
): Q & { calcValues?: Record<string, number> } {
  if (!response) return q;
  const fixed =
    !!q.calc &&
    calcModifiedNeedsAnswer(q.modifiedText, q.calc, q.text) &&
    isModifiedStudent(response, modified);
  return withCalcValues(
    q,
    calcAttemptKey(getResponseDocKey(response), response),
    fixed
  );
}

/** A student's public question with their own numbers written into its prompt; other questions unchanged. */
export function fillCalcPublicQuestion<
  Q extends {
    id: string;
    text: string;
    modifiedText?: string;
    calcVariables?: CalcVariable[];
    calcSeed?: string;
    localized?: Record<string, { text: string }>;
  },
>(q: Q, responseKey: string | undefined): Q {
  if (!q.calcVariables?.length || !q.calcSeed || !responseKey) return q;
  const spec = { variables: q.calcVariables };
  const values = drawCalcValues(spec, calcSeed(q.calcSeed, responseKey, q.id));
  const fill = (text: string) => fillCalcPrompt(text, spec, values);
  return {
    ...q,
    calcUnfilled: q,
    text: fill(q.text),
    ...(q.modifiedText ? { modifiedText: fill(q.modifiedText) } : {}),
    ...(q.localized
      ? {
          localized: Object.fromEntries(
            Object.entries(q.localized).map(([loc, strings]) => [
              loc,
              { ...strings, text: fill(strings.text) },
            ])
          ),
        }
      : {}),
  };
}

/** A published key with each random-number answer swapped for an earlier attempt's own, or dropped. */
export function withAttemptCalcAnswers(
  revealed: Record<string, string> | undefined,
  questions: { id: string; calcVariables?: CalcVariable[] }[] | undefined,
  calcAnswers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!revealed) return revealed;
  const out = { ...revealed };
  for (const q of questions ?? []) {
    if (!q.calcVariables?.length) continue;
    if (calcAnswers?.[q.id]) out[q.id] = calcAnswers[q.id];
    else delete out[q.id];
  }
  return out;
}

/** A random-number question as one sample student sees it: numbers in the prompt, its own answer as the key. */
export function sampleCalcQuestion<
  Q extends {
    id: string;
    type: string;
    text: string;
    correctAnswer: string;
    calc?: CalcSpec;
  },
>(q: Q, sampleKey = 'preview'): Q & { calcValues?: Record<string, number> } {
  if (!q.calc) return q;
  const withValues = withCalcValues(q, sampleKey);
  const values = withValues.calcValues;
  if (!values) return q;
  return {
    ...withValues,
    text: fillCalcPrompt(q.text, q.calc, values),
    correctAnswer: formatCalcAnswer(q.calc, values),
  };
}
