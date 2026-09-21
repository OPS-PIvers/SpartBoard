import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuizData } from '@/types';
import {
  createQuizImportAdapter,
  type QuizImportAdapterDeps,
} from './quizImportAdapter';

// Keep the adapter module's eager imports cheap + side-effect-free. We never
// exercise the AI-assist path or the static QuizDriveService TSV helper here,
// but importing the adapter pulls these in transitively (and `@/utils/*` reach
// for `@/config/firebase`), so stub them to isolate the unit under test.
vi.mock('@/utils/ai', () => ({
  generateQuiz: vi.fn(),
}));
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: { getQuizTemplateTSV: vi.fn(() => '') },
}));

// The readers are covered in tests/utils/quizDocumentImport; here we only care
// that the adapter routes a document to them and forwards what they say.
const readQuizDocument = vi.fn();
vi.mock('@/utils/quizDocumentImport', () => ({
  readQuizDocument: (...args: unknown[]): unknown =>
    readQuizDocument(...args) as unknown,
  extractedToQuizData: (extracted: { title: string }) => ({
    ...SAMPLE_QUIZ,
    title: extracted.title,
  }),
  rowWarnings: () => ['Question 2: two answers were marked'],
}));
const browserPdfDeps = vi.fn().mockResolvedValue({ pdf: 'deps' });
vi.mock('@/utils/quizDocumentImport/pdfBrowserDeps', () => ({
  browserPdfDeps: (...args: unknown[]): unknown =>
    browserPdfDeps(...args) as unknown,
}));

// The non-sensitive drive.file token the wizard threads into every Sheets call
// (the Picker-selected sheet read + the template create). After the drive.file
// refactor NO path requests the sensitive `spreadsheets` scope.
const FRESH_DRIVE_TOKEN = 'fresh-drive-file-token';
const PICKED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/picked/edit';

const SAMPLE_QUIZ: QuizData = {
  id: 'quiz-1',
  title: '__quiz_import__',
  questions: [
    {
      id: 'q1',
      text: 'What is 2 + 2?',
      type: 'MC',
      timeLimit: 30,
      correctAnswer: '4',
      incorrectAnswers: ['3', '5'],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

/**
 * Builds a deps object with sensible spies. By default `ensureDriveScope`
 * resolves to a fresh drive.file token (the common already-signed-in case);
 * individual tests override it. `pickSheet` resolves to a picked sheet URL.
 */
function makeDeps(
  overrides: Partial<QuizImportAdapterDeps> = {}
): QuizImportAdapterDeps {
  return {
    saveQuiz: vi.fn().mockResolvedValue(undefined),
    importFromSheet: vi.fn().mockResolvedValue(SAMPLE_QUIZ),
    importFromCSV: vi.fn().mockResolvedValue(SAMPLE_QUIZ),
    createQuizTemplate: vi
      .fn()
      .mockResolvedValue('https://docs.google.com/spreadsheets/d/new'),
    ensureDriveScope: vi.fn().mockResolvedValue(FRESH_DRIVE_TOKEN),
    pickSheet: vi.fn().mockResolvedValue({ url: PICKED_SHEET_URL }),
    ...overrides,
  };
}

describe('createQuizImportAdapter — drive.file token threading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires pickSheet through so the wizard opens the Drive Picker (drive.file, no spreadsheets)', () => {
    const deps = makeDeps();
    const adapter = createQuizImportAdapter(deps);
    // The wizard renders its Picker button when adapter.pickSheet is present —
    // this is what swaps the sensitive paste-URL flow for the drive.file Picker.
    expect(adapter.pickSheet).toBe(deps.pickSheet);
    expect(adapter.supportedSources).toContain('sheet');
  });

  describe('parse (Google Sheet source)', () => {
    it('threads the fresh ensureDriveScope token into importFromSheet', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      const result = await adapter.parse({
        kind: 'sheet',
        url: 'https://docs.google.com/spreadsheets/d/abc/edit',
      });

      expect(deps.ensureDriveScope).toHaveBeenCalledTimes(1);
      // The EXACT fresh drive.file token must reach the Sheets call — not
      // undefined and not the stale closure token — so the read of the
      // Picker-opened sheet uses a valid per-file token.
      expect(deps.importFromSheet).toHaveBeenCalledTimes(1);
      expect(deps.importFromSheet).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/abc/edit',
        expect.any(String),
        FRESH_DRIVE_TOKEN
      );
      expect(result.data).toBe(SAMPLE_QUIZ);
    });

    it('degrades to the error path WITHOUT calling the Sheets API when no token is available', async () => {
      const deps = makeDeps({
        ensureDriveScope: vi.fn().mockResolvedValue(null),
      });
      const adapter = createQuizImportAdapter(deps);

      await expect(
        adapter.parse({
          kind: 'sheet',
          url: 'https://docs.google.com/spreadsheets/d/abc/edit',
        })
      ).rejects.toThrow(/Google Drive access is required/i);

      expect(deps.ensureDriveScope).toHaveBeenCalledTimes(1);
      // Critically: the Sheets API must NOT be invoked with a bad/absent token.
      expect(deps.importFromSheet).not.toHaveBeenCalled();
    });

    it('does NOT acquire a Drive token for CSV sources', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      await adapter.parse({ kind: 'csv', text: 'a,b,c' });

      expect(deps.ensureDriveScope).not.toHaveBeenCalled();
      expect(deps.importFromCSV).toHaveBeenCalledTimes(1);
      expect(deps.importFromSheet).not.toHaveBeenCalled();
    });
  });

  describe('templateHelper.createTemplate', () => {
    it('threads the fresh ensureDriveScope token into createQuizTemplate', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      const { templateHelper } = adapter;
      if (!templateHelper) throw new Error('templateHelper should be defined');
      const result = await templateHelper.createTemplate();

      expect(deps.ensureDriveScope).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).toHaveBeenCalledWith(FRESH_DRIVE_TOKEN);
      expect(result.url).toBe('https://docs.google.com/spreadsheets/d/new');
    });

    it('degrades to the error path WITHOUT calling the Sheets API when no token is available', async () => {
      const deps = makeDeps({
        ensureDriveScope: vi.fn().mockResolvedValue(null),
      });
      const adapter = createQuizImportAdapter(deps);

      const { templateHelper } = adapter;
      if (!templateHelper) throw new Error('templateHelper should be defined');
      await expect(templateHelper.createTemplate()).rejects.toThrow(
        /Google Drive access is required/i
      );

      expect(deps.ensureDriveScope).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).not.toHaveBeenCalled();
    });
  });

  // docs/plans/QUIZ_DOCUMENT_IMPORT.md D5/D7: a document import that read the
  // question but not its key must still reach the editor.
  describe('validate — questions imported without an answer key', () => {
    const quizWith = (
      question: Partial<QuizData['questions'][number]>
    ): QuizData => ({
      ...SAMPLE_QUIZ,
      questions: [{ ...SAMPLE_QUIZ.questions[0], ...question }],
    });

    it('rejects a keyless question nothing flagged', () => {
      const adapter = createQuizImportAdapter(makeDeps());
      const result = adapter.validate(quizWith({ correctAnswer: '' }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        'Question 1 is missing a correct answer.'
      );
    });

    it('accepts a keyless question the reader flagged as needing one', () => {
      const adapter = createQuizImportAdapter(makeDeps());
      const result = adapter.validate(
        quizWith({ correctAnswer: '', needsKey: true })
      );
      expect(result).toEqual({ ok: true, errors: [] });
    });

    it('still rejects a flagged question with no text', () => {
      const adapter = createQuizImportAdapter(makeDeps());
      const result = adapter.validate(
        quizWith({ text: '', correctAnswer: '', needsKey: true })
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Question 1 is missing text.');
    });
  });
});

/* ─── Test documents (docs/plans/QUIZ_DOCUMENT_IMPORT.md D9, D10, D11) ────── */

describe('createQuizImportAdapter — test document source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserPdfDeps.mockResolvedValue({ pdf: 'deps' });
    readQuizDocument.mockResolvedValue({
      title: 'Unit 3 Test',
      questions: [],
      images: [],
      warnings: ['Pictures in a PDF aren’t brought in'],
    });
  });

  it('offers no document source while the feature is off', () => {
    const adapter = createQuizImportAdapter(
      makeDeps({ pickDocument: vi.fn(), canImportDocuments: false })
    );
    expect(adapter.supportedSources).not.toContain('document');
    // The Drive button and the review pane hang off these, so both must be
    // absent or the wizard would show a feature the teacher cannot use.
    expect(adapter.pickDocument).toBeUndefined();
    expect(adapter.renderReview).toBeUndefined();
  });

  it('offers the document source and the review pane when the feature is on', () => {
    const pickDocument = vi.fn();
    const adapter = createQuizImportAdapter(
      makeDeps({ pickDocument, canImportDocuments: true })
    );
    expect(adapter.supportedSources).toContain('document');
    expect(adapter.pickDocument).toBe(pickDocument);
    expect(adapter.renderReview).toBeTypeOf('function');
  });

  it('reads a Word file without loading the PDF machinery', async () => {
    const adapter = createQuizImportAdapter(
      makeDeps({ canImportDocuments: true })
    );
    const file = new Blob([new Uint8Array([1])]);
    await adapter.parse({
      kind: 'document',
      file,
      fileName: 'Unit 3 Test.docx',
    });
    expect(browserPdfDeps).not.toHaveBeenCalled();
    expect(readQuizDocument).toHaveBeenCalledWith(file, {
      fileName: 'Unit 3 Test.docx',
    });
  });

  it('loads the PDF machinery for a PDF', async () => {
    const adapter = createQuizImportAdapter(
      makeDeps({ canImportDocuments: true })
    );
    const file = new Blob([new Uint8Array([1])], { type: 'application/pdf' });
    await adapter.parse({ kind: 'document', file, fileName: 'Unit 3 Test' });
    expect(browserPdfDeps).toHaveBeenCalledWith(file);
    expect(readQuizDocument).toHaveBeenCalledWith(file, {
      fileName: 'Unit 3 Test',
      pdf: { pdf: 'deps' },
    });
  });

  it('shows the document-wide notes and the per-row ones together', async () => {
    const adapter = createQuizImportAdapter(
      makeDeps({ canImportDocuments: true })
    );
    const result = await adapter.parse({
      kind: 'document',
      file: new Blob([new Uint8Array([1])]),
      fileName: 'Unit 3 Test.docx',
    });
    expect(result.warnings).toEqual([
      'Pictures in a PDF aren’t brought in',
      'Question 2: two answers were marked',
    ]);
  });

  it('names the quiz after the document but leaves a sheet import untitled', async () => {
    const adapter = createQuizImportAdapter(
      makeDeps({ canImportDocuments: true })
    );
    const { data } = await adapter.parse({
      kind: 'document',
      file: new Blob([new Uint8Array([1])]),
      fileName: 'Unit 3 Test.docx',
    });
    // D11 — the file name becomes the title the wizard prefills.
    expect(adapter.suggestTitle?.(data)).toBe('Unit 3 Test');
    // A sheet or CSV import carries the placeholder, which must never show.
    expect(adapter.suggestTitle?.(SAMPLE_QUIZ)).toBeUndefined();
  });
});
