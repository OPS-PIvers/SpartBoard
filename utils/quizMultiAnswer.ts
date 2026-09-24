// Choose-all-that-apply ('MA'): key and answers are `|`-joined options; partial credit = right% − wrong%, floored at 0.

/** Right options in authored order, blanks dropped. */
export function multiAnswerCorrectOptions(correctAnswer: string): string[] {
  return (correctAnswer ?? '').split('|').filter((s) => s.trim().length > 0);
}

/** Every option (right then wrong), the order translations index-align against. */
export function multiAnswerOptions(q: {
  correctAnswer: string;
  incorrectAnswers: string[];
}): string[] {
  return [
    ...multiAnswerCorrectOptions(q.correctAnswer),
    ...(q.incorrectAnswers ?? []).filter((s) => s && s.trim().length > 0),
  ];
}

/** Split a stored student answer into its chosen options. */
export function parseMultiAnswer(answer: string): string[] {
  return (answer ?? '').split('|').filter((s) => s.length > 0);
}

/** Encode chosen options in the order they are shown, so the stored value is stable. */
export function encodeMultiAnswer(
  selected: Iterable<string>,
  displayOrder: readonly string[]
): string {
  const chosen = new Set(selected);
  return displayOrder.filter((o) => chosen.has(o)).join('|');
}

export interface MultiAnswerScore {
  /** Fraction of the question's points earned, 0..1. */
  fraction: number;
  /** Exactly the right set was chosen. */
  exact: boolean;
  rightPicked: number;
  wrongPicked: number;
}

/** Score an answer; `normalize` is the caller's comparison normalizer. */
export function scoreMultiAnswer(
  correctAnswer: string,
  incorrectAnswers: readonly string[],
  studentAnswer: string,
  normalize: (s: string) => string
): MultiAnswerScore {
  const right = new Set(
    multiAnswerCorrectOptions(correctAnswer).map(normalize)
  );
  const wrongTotal = new Set(
    (incorrectAnswers ?? [])
      .map(normalize)
      .filter((s) => s.length > 0 && !right.has(s))
  ).size;
  const given = new Set(parseMultiAnswer(studentAnswer).map(normalize));
  given.delete('');
  let rightPicked = 0;
  let wrongPicked = 0;
  for (const g of given) {
    if (right.has(g)) rightPicked++;
    else wrongPicked++;
  }
  if (right.size === 0) {
    return { fraction: 0, exact: false, rightPicked, wrongPicked };
  }
  const exact = rightPicked === right.size && wrongPicked === 0;
  // A pick outside the option list still counts as wrong; the denominator grows so it can't exceed 1.
  const wrongDenominator = Math.max(wrongTotal, wrongPicked);
  const penalty = wrongDenominator === 0 ? 0 : wrongPicked / wrongDenominator;
  const fraction = Math.max(0, rightPicked / right.size - penalty);
  return { fraction: exact ? 1 : fraction, exact, rightPicked, wrongPicked };
}
