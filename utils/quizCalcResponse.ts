// The question as one student was given it: their random numbers attached for grading and display.
import type { QuizResponse } from '@/types';
import { getResponseDocKey } from '@/hooks/quizSession/responseKeys';
import {
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
  return response ? withCalcValues(q, getResponseDocKey(response)) : q;
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
