// The question as one student was given it: their random numbers attached for grading and display.
import type { QuizResponse } from '@/types';
import { getResponseDocKey } from '@/hooks/quizSession/responseKeys';
import {
  calcAttemptKey,
  calcSeed,
  drawCalcValues,
  fillCalcPrompt,
  withCalcValues,
  type CalcSpec,
  type CalcVariable,
} from '@/utils/quizCalculated';

export function questionForResponse<
  Q extends { id: string; type: string; calc?: CalcSpec },
>(
  q: Q,
  response: QuizResponse | undefined
): Q & { calcValues?: Record<string, number> } {
  return response
    ? withCalcValues(q, calcAttemptKey(getResponseDocKey(response), response))
    : q;
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
