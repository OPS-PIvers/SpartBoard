/**
 * The AI reader's matching section, numbered items over a lettered bank, comes in as one Matching question (E6).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  readQuizDocumentWithAi,
  type AiExtractedQuiz,
} from '@/utils/quizDocumentImport/aiReader';
import type { DocLine } from '@/utils/quizDocumentImport/types';

vi.mock('@/utils/quizDocumentImport/docxReader', () => ({
  readDocx: vi.fn(),
}));
import { readDocx } from '@/utils/quizDocumentImport/docxReader';

const docxFile = () =>
  new Blob(['PK'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

const LETTERS = 'ABCDEFGHIJKL'.split('');
const TERMS = LETTERS.map((l) => `Term ${l}`);
const DEFINITIONS = Array.from(
  { length: 10 },
  (_, i) => `Definition number ${i + 1}.`
);
const KEY = ['C', 'A', 'L', 'B', 'D', 'K', 'E', 'F', 'G', 'H'];
const termFor = (letter: string) => TERMS[LETTERS.indexOf(letter)];

const DOC: DocLine[] = [
  'Part 1: Matching',
  'Match each definition with the correct term.',
  ...DEFINITIONS.map((d, i) => `${i + 1}. _____ ${d}`),
  ...TERMS.map((t, i) => `${LETTERS[i]}. ${t}`),
  'Part 2: Multiple Choice',
  '11. Which is right?',
  'A. Yes',
  'B. No',
].map((text) => ({ text }));

const KEY_LINES: DocLine[] = [
  'Answer Key',
  ...KEY.map((k, i) => `${i + 1}. ${k}`),
  '11. A',
].map((text) => ({ text }));

/** What the model returns: one MC per item over the whole bank. */
const aiRead = (answers: readonly string[]): AiExtractedQuiz => ({
  title: 'Unit Test',
  questions: [
    ...DEFINITIONS.map((d, i) => ({
      number: i + 1,
      section: 'Part 1: Matching',
      label: String(i + 1),
      text: d,
      type: 'MC' as const,
      options: TERMS.map((t, j) => ({ letter: LETTERS[j], text: t })),
      correctAnswer: answers[i] ?? '',
      warnings: [],
    })),
    {
      number: 11,
      section: 'Part 2: Multiple Choice',
      label: '11',
      text: 'Which is right?',
      type: 'MC' as const,
      options: [
        { letter: 'A', text: 'Yes' },
        { letter: 'B', text: 'No' },
      ],
      correctAnswer: 'Yes',
      warnings: [],
    },
  ],
  warnings: [],
});

const PAIRS = DEFINITIONS.map((d, i) => `${d}:${termFor(KEY[i])}`).join('|');

describe('an AI-read matching section with a bank past F', () => {
  it('combines the keyed items into one Matching question', async () => {
    vi.mocked(readDocx).mockResolvedValue({
      lines: [...DOC, ...KEY_LINES],
      images: [],
    });
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'Unit.docx',
      extract: () => Promise.resolve(aiRead(KEY.map(termFor))),
    });
    expect(quiz.questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
    expect(quiz.questions[0].correctAnswer).toBe(PAIRS);
    expect(quiz.questions[0].matchingDistractors).toEqual(['Term I', 'Term J']);
    expect(quiz.questions[0].points).toBe(10);
    expect(quiz.questions[1].correctAnswer).toBe('Yes');
  });

  it('combines on the model’s answers when no printed key is found', async () => {
    vi.mocked(readDocx).mockResolvedValue({ lines: DOC, images: [] });
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'Unit.docx',
      extract: () => Promise.resolve(aiRead(KEY.map(termFor))),
    });
    expect(quiz.questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
    expect(quiz.questions[0].correctAnswer).toBe(PAIRS);
  });

  it('combines when the Word file can’t be opened for pictures', async () => {
    vi.mocked(readDocx).mockImplementation(() =>
      Promise.reject(new Error('bad zip'))
    );
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'Unit.docx',
      extract: () => Promise.resolve(aiRead(KEY.map(termFor))),
    });
    expect(quiz.questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
  });

  it('leaves unkeyed items as multiple choice, like the plain reader', async () => {
    vi.mocked(readDocx).mockResolvedValue({ lines: DOC, images: [] });
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'Unit.docx',
      extract: () => Promise.resolve(aiRead([])),
    });
    expect(quiz.questions).toHaveLength(11);
    expect(quiz.questions[0].type).toBe('MC');
    expect(quiz.questions[0].options).toHaveLength(12);
  });
});
