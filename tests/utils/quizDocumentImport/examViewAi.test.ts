/**
 * The AI reader's questions go through the same ExamView steps when the
 * document is ExamView (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E17), and key
 * standards match the catalog exactly or not at all (E10).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  readQuizDocumentWithAi,
  type AiExtractedQuiz,
} from '@/utils/quizDocumentImport/aiReader';
import {
  matchStandardCodes,
  normalizeStandardCode,
  unmatchedStandardsNote,
} from '@/utils/quizDocumentImport/keyStandards';
import type { StandardBenchmark } from '@/types';

vi.mock('@/utils/quizDocumentImport/docxReader', () => ({
  readDocx: vi.fn(),
}));
import { readDocx } from '@/utils/quizDocumentImport/docxReader';

const docxFile = () =>
  new Blob(['PK'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

const line = (text: string) => ({ text });

describe('AI output under the ExamView profile (E17)', () => {
  it('types, keys and scores the AI read like the plain one', async () => {
    vi.mocked(readDocx).mockResolvedValue({
      lines: [
        line('True/False'),
        line('____ 1. Producers make their own food.'),
        line('Short Answer-3 points each'),
        line('2. Explain a food web.'),
        line('Answer Section'),
        line('TRUE/FALSE'),
        line('1. ANS: T PTS: 1'),
        line('SHORT ANSWER'),
        line('2. ANS: who eats whom PTS: 1'),
      ],
      images: [],
    });
    const ai: AiExtractedQuiz = {
      title: 'Ecology',
      questions: [
        {
          number: 1,
          section: 'True/False',
          text: 'Producers make their own food.',
          type: 'free-response',
          options: [],
          correctAnswer: '',
          warnings: [],
        },
        {
          number: 2,
          section: 'Short Answer-3 points each',
          text: 'Explain a food web.',
          type: 'FIB',
          options: [],
          correctAnswer: 'who eats whom',
          warnings: [],
        },
      ],
      warnings: [],
    };
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'Ecology.docx',
      extract: () => Promise.resolve(ai),
    });
    expect(quiz.questions.map((q) => q.type)).toEqual(['MC', 'free-response']);
    expect(quiz.questions[0].correctAnswer).toBe('True');
    expect(quiz.questions[1].correctAnswer).toBe('');
    expect(quiz.questions[1].points).toBe(3);
    expect(quiz.questions[1].warnings).toContain(
      'Key’s sample answer: who eats whom'
    );
  });
});

const benchmark = (set: string, code: string): StandardBenchmark => ({
  id: `${set}:${code}`,
  set,
  subject: 'ela',
  code,
  grade: '9',
  strand: '',
  standard: '',
  text: `Benchmark ${code}`,
  searchText: code,
});

describe('key standards (E10)', () => {
  it('normalizes a state prefix, spacing and a trailing point', () => {
    expect(normalizeStandardCode('MN 9.4.2.1.')).toBe('9.4.2.1');
    expect(normalizeStandardCode(' 9.4.2.1')).toBe('9.4.2.1');
  });

  it('matches exact codes and lists the rest', () => {
    const catalog = [
      benchmark('mn-ela', '9.4.2.1'),
      benchmark('mn-ela', '9.4.2.2'),
    ];
    const result = matchStandardCodes(
      ['MN 9.4.2.1', 'UCP.1', '9.4.2'],
      catalog
    );
    expect(result.matched.map((b) => b.code)).toEqual(['9.4.2.1']);
    expect(result.unmatched).toEqual(['UCP.1', '9.4.2']);
    expect(unmatchedStandardsNote(['UCP.1'])).toBe(
      'Key lists standard UCP.1, which isn’t in the standards list.'
    );
  });

  it('refuses a code two sets share', () => {
    const catalog = [
      benchmark('mn-ela', '6.1.1.1'),
      benchmark('mn-ss', '6.1.1.1'),
    ];
    expect(matchStandardCodes(['6.1.1.1'], catalog).matched).toEqual([]);
  });
});
