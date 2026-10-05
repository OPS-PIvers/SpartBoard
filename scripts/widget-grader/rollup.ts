import type {
  DimensionResult,
  GateId,
  LetterGrade,
  RollupResult,
  Rubric,
  Scorecard,
} from './types';

const gateFailures = (card: Scorecard): GateId[] =>
  (Object.keys(card.gates) as GateId[]).filter(
    (id) => card.gates[id]?.pass === false
  );

export function letterFor(rubric: Rubric, score: number): LetterGrade {
  const sorted = [...rubric.letterGrades].sort((a, b) => b.min - a.min);
  return sorted.find((g) => score >= g.min)?.letter ?? 'F';
}

const rank = (rubric: Rubric, letter: LetterGrade): number =>
  rubric.letterGrades.findIndex((g) => g.letter === letter);

/** Dimension = mean of scored non-N/A criteria; overall = weighted mean of scored dimensions; gate failure caps at rubric.gateCap (R4–R6). */
export function rollup(rubric: Rubric, card: Scorecard): RollupResult {
  const dimensions: DimensionResult[] = rubric.dimensions.map((d) => {
    const scores = d.criteria.flatMap((c): number[] => {
      const s = card.criteria[c.id]?.score;
      return typeof s === 'number' ? [s] : [];
    });
    const score = scores.length
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : null;
    return {
      id: d.id,
      name: d.name,
      weight: d.weight,
      score,
      scored: scores.length,
    };
  });

  const scored = dimensions.filter((d) => d.score !== null);
  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  const weighted = totalWeight
    ? scored.reduce((sum, d) => sum + d.weight * (d.score as number), 0) /
      totalWeight
    : null;

  const failures = gateFailures(card);
  const uncappedLetter = weighted === null ? null : letterFor(rubric, weighted);
  const capped =
    uncappedLetter !== null &&
    failures.length > 0 &&
    rank(rubric, uncappedLetter) < rank(rubric, rubric.gateCap);

  return {
    dimensions,
    weighted,
    uncappedLetter,
    letter: capped ? rubric.gateCap : uncappedLetter,
    gateFailures: failures,
    gateCapped: capped,
  };
}

/** R7: every scored dimension at or above the target and no gate failures. */
export function meetsLoopTarget(rubric: Rubric, result: RollupResult): boolean {
  const scored = result.dimensions.filter((d) => d.score !== null);
  return (
    scored.length > 0 &&
    result.gateFailures.length <= rubric.loopTarget.gateFailures &&
    scored.every(
      (d) => (d.score as number) >= rubric.loopTarget.minDimensionScore
    )
  );
}
