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
    readAnswerKeyFile: vi.fn(),
  };
});
vi.mock('@/utils/quizDocumentImport/pdfBrowserDeps', () => ({
  browserPdfDeps: vi.fn(() => Promise.resolve({})),
}));

import {
  readAnswerKeyFile,
  readQuizDocument,
  readQuizDocumentWithAi,
} from '@/utils/quizDocumentImport';
import { browserPdfCropper } from '@/utils/quizDocumentImport/pdfCropBrowser';
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
      // Without a cropper the reader drops every figure silently (D13).
      cropper: browserPdfCropper,
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

describe('the separate answer key file (D8)', () => {
  const keyFile = {
    file: new Blob(['1. B'], { type: 'application/pdf' }),
    fileName: 'key.pdf',
  };
  const withChoices = () => ({
    ...extracted('browser'),
    questions: [
      {
        number: 1,
        text: 'Q1',
        type: 'MC' as const,
        options: [
          { letter: 'A', text: 'First' },
          { letter: 'B', text: 'Second' },
        ],
        correctAnswer: '',
        imageIds: [],
        warnings: [],
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readQuizDocument).mockResolvedValue(withChoices());
  });

  it('fills the answer the key names', async () => {
    vi.mocked(readAnswerKeyFile).mockResolvedValue(new Map([[1, 'B']]));

    const result = await adapter().parse({ ...source, keyFile });

    expect(result.data.questions[0].correctAnswer).toBe('Second');
  });

  it('weighs the test and the key against one budget (D18)', async () => {
    const huge = { size: 20 * 1024 * 1024 } as Blob;

    await expect(
      adapter().parse({
        ...source,
        file: huge,
        keyFile: { file: huge, fileName: 'key.pdf' },
      })
    ).rejects.toThrow(/together/);

    // Refused before either file is opened, so an oversized pair costs nothing.
    expect(readQuizDocument).not.toHaveBeenCalled();
    expect(readAnswerKeyFile).not.toHaveBeenCalled();
  });

  it('does not read a key when none was attached', async () => {
    await adapter().parse(source);
    expect(readAnswerKeyFile).not.toHaveBeenCalled();
  });

  it('keeps the questions when the key file cannot be read', async () => {
    vi.mocked(readAnswerKeyFile).mockRejectedValue(new Error('scanned'));

    const result = await adapter().parse({ ...source, keyFile });

    // Losing a whole read because the key was a photo would be worse than
    // creating the quiz with the answers the test itself printed.
    expect(result.data.questions).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('answer key file couldn');
  });
});
