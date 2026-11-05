import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import {
  answerImagesFromRows,
  imagesForLabels,
  pastedImage,
} from './quizAnswerImages';
import {
  alignToPreviousOrder,
  reindexChoiceArray,
} from './quizLocalizedArrays';
import { shuffleQuestionForStudent } from './quizShuffle';

const url = (name: string) => `https://lh3.googleusercontent.com/d/${name}`;

const base: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Pick',
  timeLimit: 30,
  correctAnswer: 'Right',
  incorrectAnswers: ['Wrong', 'Other'],
};

const pairedWith = (labels: string[], images: string[] | undefined) =>
  Object.fromEntries(labels.map((label, i) => [label, images?.[i]]));

describe('imagesForLabels', () => {
  it('aligns with the labels, ignoring spacing and unsafe urls', () => {
    expect(
      imagesForLabels(
        ['A', ' B ', 'C'],
        [
          { text: 'B', url: url('b') },
          { text: 'C', url: 'javascript:x' },
        ]
      )
    ).toEqual(['', url('b'), '']);
  });

  it('is undefined when no label has a picture', () => {
    expect(
      imagesForLabels(['A'], [{ text: 'gone', url: url('x') }])
    ).toBeUndefined();
  });
});

describe('answerImagesFromRows', () => {
  it('skips rows with no text or no picture', () => {
    expect(
      answerImagesFromRows([
        { text: 'A', image: url('a') },
        { text: ' ', image: url('blank') },
        { text: 'C' },
      ])
    ).toEqual([{ text: 'A', url: url('a') }]);
  });

  it('is undefined when nothing is saved', () => {
    expect(answerImagesFromRows([{ text: 'A' }])).toBeUndefined();
  });
});

describe('toPublicQuestion answer pictures', () => {
  it('keeps each MC picture on its option through the shuffle', () => {
    const pub = toPublicQuestion({
      ...base,
      answerImages: [
        { text: 'Right', url: url('r') },
        { text: 'Other', url: url('o') },
      ],
    });
    expect(pairedWith(pub.choices ?? [], pub.choiceImages)).toEqual({
      Right: url('r'),
      Wrong: '',
      Other: url('o'),
    });
  });

  it('keeps each choose-all picture on its option', () => {
    const pub = toPublicQuestion({
      ...base,
      type: 'MA',
      correctAnswer: 'Right|Also',
      answerImages: [{ text: 'Also', url: url('a') }],
    });
    const paired = pairedWith(pub.choices ?? [], pub.choiceImages);
    expect(paired.Also).toBe(url('a'));
    expect(paired.Right).toBe('');
  });

  it('pictures both sides of a Matching question, extras included', () => {
    const pub = toPublicQuestion({
      ...base,
      type: 'Matching',
      correctAnswer: 'Dog:Mammal|Frog:Amphibian',
      incorrectAnswers: [],
      matchingDistractors: ['Reptile'],
      matchingTermImages: [{ text: 'Frog', url: url('frog') }],
      answerImages: [
        { text: 'Mammal', url: url('mammal') },
        { text: 'Reptile', url: url('reptile') },
      ],
    });
    expect(pairedWith(pub.matchingLeft ?? [], pub.matchingLeftImages)).toEqual({
      Dog: '',
      Frog: url('frog'),
    });
    expect(
      pairedWith(pub.matchingRight ?? [], pub.matchingRightImages)
    ).toEqual({
      Mammal: url('mammal'),
      Amphibian: '',
      Reptile: url('reptile'),
    });
  });

  it('leaves the fields off a question with no pictures', () => {
    expect(toPublicQuestion(base)).not.toHaveProperty('choiceImages');
  });

  it('never carries the teacher-side lists to students', () => {
    const pub = toPublicQuestion({
      ...base,
      answerImages: [{ text: 'Right', url: url('r') }],
    });
    expect(pub).not.toHaveProperty('answerImages');
  });
});

describe('answer pictures through reorders', () => {
  const withPicture: QuizQuestion = {
    ...base,
    answerImages: [{ text: 'Right', url: url('r') }],
  };
  const pub = toPublicQuestion(withPicture);

  it('follow their option through the per-student shuffle', () => {
    const shuffled = shuffleQuestionForStudent(pub, 'student-7');
    expect(
      pairedWith(shuffled.choices ?? [], shuffled.choiceImages).Right
    ).toBe(url('r'));
  });

  it('drop with a hidden option', () => {
    const kept = (pub.choices ?? [])
      .map((c, i) => (c === 'Right' ? -1 : i))
      .filter((i) => i >= 0);
    expect(reindexChoiceArray(pub, 'choices', kept).choiceImages).toEqual([
      '',
      '',
    ]);
  });

  it('follow a re-sync back to the order already served', () => {
    const aligned = alignToPreviousOrder(toPublicQuestion(withPicture), pub);
    expect(aligned.choices).toEqual(pub.choices);
    expect(aligned.choiceImages).toEqual(pub.choiceImages);
  });
});

describe('pastedImage', () => {
  const png = new File(['x'], 'shot.png', { type: 'image/png' });
  const paste = (files: File[], types: string[]) =>
    pastedImage({ files: files as unknown as FileList, types });

  it('takes a copied picture', () => {
    expect(paste([png], ['Files'])).toBe(png);
  });

  it('lets copied text with a picture paste as text', () => {
    expect(paste([png], ['text/plain', 'Files'])).toBeNull();
  });

  it('ignores other files', () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(paste([pdf], ['Files'])).toBeNull();
  });
});
