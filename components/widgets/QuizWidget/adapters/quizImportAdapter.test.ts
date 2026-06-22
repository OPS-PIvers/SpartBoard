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

const FRESH_SHEETS_TOKEN = 'fresh-union-token-with-sheets-scope';

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
 * Builds a deps object with sensible spies. By default `ensureSheetsScope`
 * resolves to a fresh Sheets-capable token (the already-granted Orono user
 * case); individual tests override it.
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
    ensureSheetsScope: vi.fn().mockResolvedValue(FRESH_SHEETS_TOKEN),
    ...overrides,
  };
}

describe('createQuizImportAdapter — Path B Sheets token threading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parse (Google Sheet source)', () => {
    it('threads the fresh ensureSheetsScope token into importFromSheet', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      const result = await adapter.parse({
        kind: 'sheet',
        url: 'https://docs.google.com/spreadsheets/d/abc/edit',
      });

      expect(deps.ensureSheetsScope).toHaveBeenCalledTimes(1);
      // The EXACT fresh token must reach the Sheets call — not undefined and
      // not the stale closure token — so the first import uses the
      // Sheets-capable union token (the Orono zero-change regression).
      expect(deps.importFromSheet).toHaveBeenCalledTimes(1);
      expect(deps.importFromSheet).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/abc/edit',
        expect.any(String),
        FRESH_SHEETS_TOKEN
      );
      expect(result.data).toBe(SAMPLE_QUIZ);
    });

    it('degrades to the error path WITHOUT calling the Sheets API when scope is declined', async () => {
      const deps = makeDeps({
        ensureSheetsScope: vi.fn().mockResolvedValue(null),
      });
      const adapter = createQuizImportAdapter(deps);

      await expect(
        adapter.parse({
          kind: 'sheet',
          url: 'https://docs.google.com/spreadsheets/d/abc/edit',
        })
      ).rejects.toThrow(/Google Sheets access is required/i);

      expect(deps.ensureSheetsScope).toHaveBeenCalledTimes(1);
      // Critically: the Sheets API must NOT be invoked with a bad/absent token.
      expect(deps.importFromSheet).not.toHaveBeenCalled();
    });

    it('does NOT acquire the Sheets scope for CSV sources', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      await adapter.parse({ kind: 'csv', text: 'a,b,c' });

      expect(deps.ensureSheetsScope).not.toHaveBeenCalled();
      expect(deps.importFromCSV).toHaveBeenCalledTimes(1);
      expect(deps.importFromSheet).not.toHaveBeenCalled();
    });
  });

  describe('templateHelper.createTemplate', () => {
    it('threads the fresh ensureSheetsScope token into createQuizTemplate', async () => {
      const deps = makeDeps();
      const adapter = createQuizImportAdapter(deps);

      const { templateHelper } = adapter;
      if (!templateHelper) throw new Error('templateHelper should be defined');
      const result = await templateHelper.createTemplate();

      expect(deps.ensureSheetsScope).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).toHaveBeenCalledWith(FRESH_SHEETS_TOKEN);
      expect(result.url).toBe('https://docs.google.com/spreadsheets/d/new');
    });

    it('degrades to the error path WITHOUT calling the Sheets API when scope is declined', async () => {
      const deps = makeDeps({
        ensureSheetsScope: vi.fn().mockResolvedValue(null),
      });
      const adapter = createQuizImportAdapter(deps);

      const { templateHelper } = adapter;
      if (!templateHelper) throw new Error('templateHelper should be defined');
      await expect(templateHelper.createTemplate()).rejects.toThrow(
        /Google Sheets access is required/i
      );

      expect(deps.ensureSheetsScope).toHaveBeenCalledTimes(1);
      expect(deps.createQuizTemplate).not.toHaveBeenCalled();
    });
  });
});
