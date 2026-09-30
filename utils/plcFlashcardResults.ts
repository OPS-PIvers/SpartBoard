// Class-level summary of a flashcard assignment for sharing with a PLC; no student ids.
import type {
  FlashcardAssignment,
  FlashcardSession,
  PlcFlashcardCardTally,
  PlcFlashcardResultEntry,
} from '@/types';
import {
  aggregateStudyRows,
  buildCheckRows,
  buildStudyRows,
  checkCardAccuracy,
  type FlashcardResultRecord,
} from './flashcardResults';

export type PlcFlashcardResultSummary = Pick<
  PlcFlashcardResultEntry,
  'kind' | 'students' | 'completed' | 'averagePercent' | 'cards'
>;

const round1 = (value: number): number => Math.round(value * 10) / 10;

export const buildPlcFlashcardResultSummary = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): PlcFlashcardResultSummary => {
  if (session.kind === 'check') {
    const submitted = buildCheckRows(session, results).filter(
      (row) => row.submittedAt !== null
    );
    const average =
      submitted.length === 0
        ? 0
        : submitted.reduce((sum, row) => sum + (row.percent ?? 0), 0) /
          submitted.length;
    const accuracy = new Map(
      checkCardAccuracy(session, results).map((a) => [a.card.id, a])
    );
    return {
      kind: 'check',
      students: results.length,
      completed: submitted.length,
      averagePercent: round1(average),
      cards: session.cards.map((card) => ({
        term: card.term,
        definition: card.definition,
        correct: accuracy.get(card.id)?.correct ?? 0,
        answered: accuracy.get(card.id)?.answered ?? 0,
      })),
    };
  }
  const aggregate = aggregateStudyRows(buildStudyRows(session, results));
  const cards: PlcFlashcardCardTally[] = session.cards.map((card) => {
    let correct = 0;
    let wrong = 0;
    for (const result of results) {
      correct += result.cards?.[card.id]?.c ?? 0;
      wrong += result.cards?.[card.id]?.w ?? 0;
    }
    return {
      term: card.term,
      definition: card.definition,
      correct,
      answered: correct + wrong,
    };
  });
  return {
    kind: 'study',
    students: aggregate.students,
    completed: aggregate.started,
    averagePercent: round1(aggregate.averageMasteredPercent),
    cards,
  };
};

export const flashcardAssignmentClassLabel = (
  assignment: Pick<FlashcardAssignment, 'periodNames'>
): string => (assignment.periodNames ?? []).join(', ');

/** Stable comparison key so an unchanged summary isn't rewritten. */
export const plcFlashcardSummaryKey = (
  summary: PlcFlashcardResultSummary
): string => JSON.stringify(summary);
