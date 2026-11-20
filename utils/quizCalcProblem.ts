// Editor and assign checks for a random-number question's formula.
import {
  calcModifiedNeedsAnswer,
  calcModifiedValue,
  evaluateFormula,
  formulaVariables,
  type CalcSpec,
} from '@/utils/quizCalculated';

/** Why a random-number formula can't grade yet, as a lowercase phrase; null when it can. */
export function calcFormulaProblem(calc: CalcSpec): string | null {
  if (!calc.formula.trim()) return 'add a formula';
  let names: string[];
  try {
    names = formulaVariables(calc.formula);
  } catch {
    return "the formula can't be read";
  }
  const known = new Set(calc.variables.map((v) => v.name));
  const unknown = names.find((n) => !known.has(n));
  if (unknown) return `there is no number named ${unknown}`;
  const mid = Object.fromEntries(
    calc.variables.map((v) => [v.name, (v.min + v.max) / 2 || 1])
  );
  return evaluateFormula(calc.formula, mid) === null
    ? "the formula can't be worked out"
    : null;
}

/** Why the modified version can't grade yet, as a lowercase phrase; null when it can or isn't needed. */
export function calcModifiedProblem(
  calc: CalcSpec,
  modifiedText: string | undefined,
  text?: string
): string | null {
  if (!calcModifiedNeedsAnswer(modifiedText, calc, text)) return null;
  if (!calc.modifiedAnswer?.trim()) return 'add the modified answer';
  return calcModifiedValue(calc) === null
    ? "the modified answer isn't a number"
    : null;
}
