/**
 * Which reader the quiz import uses (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1).
 * A teacher who has AI access gets the reader that handles a key in a table;
 * one who doesn't, or whose call fails, still gets a quiz to fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuizData } from '@/types';
import type { ExtractedQuiz } from '@/utils/quizDocumentImport/types';

vi.mock('@/utils/quizDocumentImport', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/quizDocumentImport')
  >('@/utils/quizDocumentImport');
  return {
    ...actual,
    readQuizDocument: vi.fn(),
    readQuizDocumentWithAi: vi.fn(),
  };
});
vi.mock('@/utils/quizDocumentImport/pdfBrowserDeps', () => ({
  browserPdfDeps: vi.fn(() => Promise.resolve({})),
}));

import {
  readQuizDocument,
  readQuizDocumentWithAi,
} from '@/utils/quizDocumentImport';
import { createQuizImportAdapter } from '@/components/widgets/QuizWidget/adapters/quizImportAdapter';

const extracted = (title: string): ExtractedQuiz => ({
  title,
  questions: [
    {
      number: 1,
      text: 'Q1',
      type: 'free-response',
      options: [],
      correctAnswer: '',
      imageIds: [],
      warnings: [],
    },
  ],
  images: [],
  warnings: [],
});

function adapter(over: Record<string, unknown> = {}) {
  return createQuizImportAdapter({
    saveQuiz: () => Promise.resolve(),
    importFromSheet: () => Promise.resolve({} as QuizData),
    importFromCSV: () => Promise.resolve({} as QuizData),
    createQuizTemplate: () => Promise.resolve(''),
    ensureDriveScope: () => Promise.resolve('token'),
    pickSheet: () => Promise.resolve(null),
    canImportDocuments: true,
    ...over,
  });
}

const source = {
  kind: 'document' as const,
  file: new Blob(['%PDF'], { type: 'application/pdf' }),
  fileName: 'test.pdf',
};

describe('quiz import reader selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readQuizDocument).mockResolvedValue(extracted('browser'));
    vi.mocked(readQuizDocumentWithAi).mockResolvedValue(extracted('ai'));
  });

  it('reads in the browser when the teacher has no AI access', async () => {
    const result = await adapter().parse(source);
    expect(readQuizDocument).toHaveBeenCalled();
    expect(readQuizDocumentWithAi).not.toHaveBeenCalled();
    expect(result.data.title).toBe('browser');
  });

  it('uses the AI reader when one is supplied', async () => {
    const aiExtract = vi.fn();
    const result = await adapter({ aiExtract }).parse(source);
    expect(readQuizDocumentWithAi).toHaveBeenCalledWith(source.file, {
      fileName: 'test.pdf',
      extract: aiExtract,
    });
    expect(readQuizDocument).not.toHaveBeenCalled();
    expect(result.data.title).toBe('ai');
  });

  it('falls back to the browser reader when the AI call fails', async () => {
    vi.mocked(readQuizDocumentWithAi).mockRejectedValue(
      new Error('unavailable')
    );

    const result = await adapter({ aiExtract: vi.fn() }).parse(source);

    // A teacher mid-import wants a quiz to fix, not an error screen.
    expect(result.data.title).toBe('browser');
    expect(result.warnings.join(' ')).toContain('read the simple way');
  });

  it('still reports the pictures a fallback read found', async () => {
    vi.mocked(readQuizDocumentWithAi).mockRejectedValue(new Error('down'));
    const images = [
      {
        id: 'img-1',
        blob: new Blob(['a']),
        contentType: 'image/png',
        name: 'a',
      },
    ];
    vi.mocked(readQuizDocument).mockResolvedValue({
      ...extracted('browser'),
      images,
    });
    const onDocumentImages = vi.fn();

    await adapter({ aiExtract: vi.fn(), onDocumentImages }).parse(source);

    expect(onDocumentImages).toHaveBeenCalledWith(images);
  });
});
