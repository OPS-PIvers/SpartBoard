// Editor helpers for random-number questions: naming and adding a number.
import type { CalcSpec, CalcVariable, QuizQuestion } from '@/types';
import { CALC_MAX_VARIABLES } from '@/utils/quizCalculated';

const NAMES = 'abcdfghkmnpqrstuvwxyz'.split('');

const newSeed = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The next unused one-letter name, or null when the question is full. */
export function nextCalcName(calc: CalcSpec | undefined): string | null {
  const used = new Set(calc?.variables.map((v) => v.name));
  if (used.size >= CALC_MAX_VARIABLES) return null;
  return NAMES.find((n) => !used.has(n)) ?? null;
}

/** The question update that adds one random number named `name`. */
export function addCalcVariableUpdate(
  q: QuizQuestion,
  name: string
): Partial<QuizQuestion> {
  const variable: CalcVariable = { name, min: 1, max: 10, decimals: 0 };
  const calc: CalcSpec = q.calc
    ? { ...q.calc, variables: [...q.calc.variables, variable] }
    : {
        seed: newSeed(),
        variables: [variable],
        formula: '',
        tolerance: { kind: 'relative', percent: 1 },
      };
  return {
    calc,
    // A typed answer key doesn't apply once the formula grades.
    correctAnswer: calc.formula,
    alternateAnswers: undefined,
    blankAlternates: undefined,
  };
}
