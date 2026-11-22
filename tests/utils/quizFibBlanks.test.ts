import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import {
  cleanBlankAnswer,
  displayFibAnswer,
  FIB_BLANK_SEP as S,
  fibBlankCount,
  fibKeyFromSheetCell,
  reshapeFibBlanks,
  revealedBlanksMatch,
} from '@/utils/quizFibBlanks';
import {
  formatRevealedAnswer,
  revealValueFor,
} from '@/utils/quizFibAlternates';
import {
  gradeAnswer,
  hasSubmittedContent,
  normalizeAnswer,
  toPublicQuestion,
} from '@/hooks/useQuizSession';
import { questionNeedsKey } from '@/utils/quizNeedsKey';
import { fibTranslationIssue } from '@/utils/quizFibTranslation';
import { formatQuizAnswerText } from '@/utils/assignmentExportShared';

const fib = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Roses are ___ and violets are ___.',
  type: 'FIB',
  correctAnswer: `red${S}blue`,
  incorrectAnswers: [],
  blankAlternates: [{ answers: [] }, { answers: ['navy'] }],
  points: 2,
  ...overrides,
});

describe('multi-blank fill in the blank', () => {
  it('leaves single-blank questions exactly as before', () => {
    const single = fib({
      correctAnswer: 'color',
      blankAlternates: undefined,
      alternateAnswers: ['colour'],
    });
    expect(fibBlankCount(single)).toBe(1);
    expect(gradeAnswer(single, ' Colour ').isCorrect).toBe(true);
    expect(revealValueFor(single)).toBe('color\ncolour');
    expect(toPublicQuestion(single).blankCount).toBeUndefined();
  });

  it('grades every blank, accepting that blank’s alternates only', () => {
    expect(gradeAnswer(fib(), `Red${S} navy`)).toMatchObject({
      isCorrect: true,
      pointsEarned: 2,
    });
    expect(gradeAnswer(fib(), `navy${S}red`).isCorrect).toBe(false);
    expect(gradeAnswer(fib(), `red${S}green`).pointsEarned).toBe(0);
  });

  it('gives a share of the points per blank with partial credit', () => {
    const q = fib({ allowPartialCredit: true });
    expect(gradeAnswer(q, `red${S}green`)).toMatchObject({
      isCorrect: false,
      pointsEarned: 1,
    });
  });

  it('accepts a translated key per blank', () => {
    expect(
      gradeAnswer(fib(), `rojo${S}azul`, undefined, [`rojo${S}azul`]).isCorrect
    ).toBe(true);
  });

  it('treats a submission with every blank empty as not attempted', () => {
    expect(hasSubmittedContent(S)).toBe(false);
    expect(gradeAnswer(fib(), S).state).toBe('not-attempted');
    expect(cleanBlankAnswer(` ${S} `)).toBe('');
    expect(cleanBlankAnswer(` red ${S} `)).toBe(`red${S}`);
  });

  it('tells students how many blanks without sending the key', () => {
    const pub = toPublicQuestion(fib());
    expect(pub.blankCount).toBe(2);
    expect(JSON.stringify(pub)).not.toContain('red');
  });

  it('reveals and checks each blank’s accepted answers', () => {
    const revealed = revealValueFor(fib());
    expect(revealed).toBe(`red${S}blue\nnavy`);
    expect(formatRevealedAnswer(revealed)).toBe(
      'red · blue (also accepted: navy)'
    );
    expect(revealedBlanksMatch(revealed, `red${S}NAVY`, normalizeAnswer)).toBe(
      true
    );
    expect(revealedBlanksMatch(revealed, `red${S}`, normalizeAnswer)).toBe(
      false
    );
  });

  it('shows stored answers as one line per question', () => {
    expect(displayFibAnswer(`red${S}`)).toBe('red · —');
    expect(formatQuizAnswerText(fib(), { answer: `red${S}blue` })).toBe(
      'red · blue'
    );
  });

  it('reshapes the key when blanks are added or removed', () => {
    const single = { correctAnswer: 'red', alternateAnswers: ['crimson'] };
    const two = reshapeFibBlanks(single, 2);
    expect(two).toEqual({
      correctAnswer: `red${S}`,
      alternateAnswers: undefined,
      blankAlternates: [{ answers: ['crimson'] }, { answers: [] }],
    });
    expect(reshapeFibBlanks(two, 1)).toEqual({
      correctAnswer: 'red',
      alternateAnswers: ['crimson'],
      blankAlternates: undefined,
    });
  });

  it('needs every blank filled before the key is complete', () => {
    expect(
      questionNeedsKey(fib({ needsKey: true, correctAnswer: `red${S}` }))
    ).toBe(true);
    expect(questionNeedsKey(fib({ needsKey: true }))).toBe(false);
  });

  it('needs a translated answer for every blank', () => {
    const entry = { text: 'Las rosas son ___ y las violetas ___.' };
    expect(fibTranslationIssue(fib(), { ...entry, answer: `rojo${S}` })).toBe(
      'missingAnswer'
    );
    expect(
      fibTranslationIssue(fib(), { ...entry, answer: `rojo${S}azul` })
    ).toBeNull();
  });

  it('reads one sheet answer per blank from a pipe-separated cell', () => {
    const text = 'Roses are ___ and violets are ___.';
    expect(fibKeyFromSheetCell(text, 'red | blue')).toBe(`red${S}blue`);
    expect(fibKeyFromSheetCell(text, 'red')).toBe('red');
    expect(fibKeyFromSheetCell('Pick ___.', 'a|b')).toBe('a|b');
  });
});

describe('hasSubmittedContent on hostile input', () => {
  const oldFixpoint = (s: string): string => {
    let cur = s;
    let prev: string;
    do {
      prev = cur;
      cur = cur.replace(/<[^<>]*>/g, '');
    } while (cur !== prev);
    return cur;
  };

  it('finishes quickly on a huge run of nested brackets', () => {
    const n = 500_000;
    const nested = '<'.repeat(n) + '>'.repeat(n);
    const start = Date.now();
    expect(hasSubmittedContent(nested)).toBe(false);
    expect(hasSubmittedContent('<'.repeat(2 * n))).toBe(true);
    expect(hasSubmittedContent(`${nested}x`)).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('gives the same verdict as the markup-stripping fixpoint on editor output', () => {
    const samples = [
      '',
      '<p><br></p>',
      '<p>hi</p>',
      '<<p>>',
      '<a<b>c>',
      'a > b < c',
      '<a>>',
      '<p>&nbsp;</p>',
      '1 < 2',
      '<<<>',
      '>>><<<',
    ];
    for (const s of samples) {
      expect(hasSubmittedContent(s)).toBe(
        oldFixpoint(s)
          .replace(/&nbsp;/gi, ' ')
          .trim().length > 0
      );
    }
  });
});
