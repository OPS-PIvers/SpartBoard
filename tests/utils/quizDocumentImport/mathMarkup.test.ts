/** Math typed as plain text in a question becomes an equation the quiz draws. */
import { describe, it, expect } from 'vitest';
import { convertAsciiMathToLatex } from 'mathlive';
import {
  markMath,
  mathMarker,
  mathStrength,
} from '@/utils/quizDocumentImport/mathMarkup';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import { splitPromptMath } from '@/utils/promptMath';
import type { ExtractedQuestion } from '@/utils/quizDocumentImport/types';

const all = (text: string): string =>
  markMath(text, { numericFractions: true });

describe('math in a line of text', () => {
  it('marks a fraction with its sum and leaves the sentence around it', () => {
    expect(markMath('Simplify (x + 1)/(2x − 5) + 3.')).toBe(
      'Simplify ⟦(x + 1)/(2x - 5) + 3⟧.'
    );
  });

  it('brackets a fraction’s parts the way the equation box reads them', () => {
    expect(markMath('Simplify (x + 1)/2x .')).toBe('Simplify ⟦(x + 1)/(2x)⟧ .');
    expect(markMath('What is 3x/4 = 6?')).toBe('What is ⟦(3x)/4 = 6⟧?');
    expect(markMath('Evaluate x²/3 when x = 3.')).toBe(
      'Evaluate ⟦(x^2)/3⟧ when x = 3.'
    );
  });

  it('marks typed powers and raised letters in a marked run', () => {
    expect(markMath('Factor x^2 + 5x + 6.')).toBe('Factor ⟦x^2 + 5x + 6⟧.');
    expect(markMath('Simplify 2^10/2^8.')).toBe('Simplify ⟦(2^(10))/(2^8)⟧.');
    expect(markMath('Solve xⁿ⁺¹/x = 8 for n.')).toBe(
      'Solve ⟦(x^(n+1))/(x) = 8⟧ for n.'
    );
  });

  it('marks a root over a bracket', () => {
    expect(markMath('Find √(x + 1) when x = 8.')).toBe(
      'Find ⟦sqrt(x + 1)⟧ when x = 8.'
    );
    expect(markMath('Simplify √x/2.')).toBe('Simplify ⟦(sqrt(x))/2⟧.');
  });

  it('keeps a product and an absolute value in the equation', () => {
    expect(all('Graph y = − 2/3 |x + 3| − 4. Describe it.')).toBe(
      'Graph ⟦y = - 2/3 |x + 3| - 4⟧. Describe it.'
    );
    expect(all('f(x) = − 1/2 (x – 2)² + 6')).toBe(
      '⟦f(x) = - 1/2 (x - 2)^2 + 6⟧'
    );
    expect(all('Plan A (2/3 of the class) won.')).toBe(
      'Plan A (⟦2/3⟧ of the class) won.'
    );
  });

  it('keeps a mixed number together', () => {
    expect(all('Add 2 1/2 + 3/4.')).toBe('Add ⟦2 1/2 + 3/4⟧.');
  });

  it('leaves text that already reads right alone', () => {
    for (const text of [
      'What is 2 + 2?',
      'Solve x² + 3x = 10 for x.',
      'What is the formula for water, H₂O, or CO₂?',
      'The Ca²⁺ ion and/or the Na⁺ ion',
      'Is a/b true (T/F)?',
      'What is √16?',
      'A field is 5 cm² and the answer is ____.',
      'See questions 1–3 (page 2).',
      'What is ∛(x + 1)?',
    ]) {
      expect(markMath(text)).toBe(text);
      expect(all(text)).toBe(text);
    }
  });

  it('never reads a date as a fraction', () => {
    expect(all('What happened on 11/9/2026?')).toBe(
      'What happened on 11/9/2026?'
    );
  });

  it('marks a bare number fraction only when asked', () => {
    expect(markMath('What is 3/4 of 12?')).toBe('What is 3/4 of 12?');
    expect(all('What is 3/4 of 12?')).toBe('What is ⟦3/4⟧ of 12?');
    expect(mathStrength('What is 3/4 of 12?')).toBe('numeric');
    expect(mathStrength('Factor x^2 + 5x + 6.')).toBe('strong');
    expect(mathStrength('Name the capital.')).toBeNull();
  });

  it('leaves text that already holds an equation alone', () => {
    expect(all('Solve ⟦x^2⟧ and 1/2.')).toBe('Solve ⟦x^2⟧ and 1/2.');
  });

  it('drops a sentence’s own bracket from around the math', () => {
    expect(markMath('Simplify (hint: x^2 − 1).')).toBe(
      'Simplify (hint: ⟦x^2 - 1⟧).'
    );
  });

  it('writes math the equation box draws', () => {
    const drawn = (text: string): string[] =>
      splitPromptMath(all(text)).flatMap((p) =>
        p.kind === 'math' ? [convertAsciiMathToLatex(p.math)] : []
      );
    expect(drawn('Simplify (x + 1)/2x .')).toEqual(['\\frac{x+1}{2x}']);
    expect(drawn('Simplify √x/2.')).toEqual(['\\frac{\\sqrt{x}}{2}']);
    expect(drawn('Simplify 2^10/2^8.')).toEqual(['\\frac{2^{10}}{2^{8}}']);
    expect(drawn('Add 2 1/2.')).toEqual(['2\\frac{1}{2}']);
    expect(drawn('Graph y = − 2/3 |x + 3| − 4.')).toEqual([
      'y=-\\frac{2}{3}|x+3|-4',
    ]);
    expect(drawn('Solve xⁿ⁺¹/x = 8.')).toEqual(['\\frac{x^{n+1}}{x}=8']);
  });
});

describe('math across a test', () => {
  it('reads bare number fractions as math once the test shows it is a math test', () => {
    const history = mathMarker(['What happened on 9/11?', 'Who was first?']);
    const math = mathMarker(['What is 1/2 + 1/4?', 'Factor x^2 − 1.']);
    const fractions = mathMarker(['1/2 of 8?', '3/4 of 8?', '1/8 of 8?']);
    expect(history('What happened on 9/11?')).toBe('What happened on 9/11?');
    expect(math('What is 1/2 + 1/4?')).toBe('What is ⟦1/2 + 1/4⟧?');
    expect(fractions('1/2 of 8?')).toBe('⟦1/2⟧ of 8?');
  });

  const question = (text: string, options: string[]): ExtractedQuestion => ({
    text,
    type: 'MC',
    options: options.map((o, i) => ({ letter: 'ABCD'[i], text: o })),
    correctAnswer: options[0],
    imageIds: [],
    warnings: [],
  });
  const quiz = {
    title: 'Fractions',
    questions: [question('What is 1/2 + 1/4?', ['3/4', '(x + 1)/2'])],
    images: [],
    warnings: [],
  };

  it('marks question text only when the import asks for equations', () => {
    const off = extractedToQuizData(quiz);
    const on = extractedToQuizData(quiz, { equations: true });
    expect(off.questions[0].text).toBe('What is 1/2 + 1/4?');
    expect(on.questions[0].text).toBe('What is ⟦1/2 + 1/4⟧?');
    expect(on.questions[0].correctAnswer).toBe('3/4');
    expect(on.questions[0].incorrectAnswers).toEqual(['(x + 1)/2']);
  });
});
