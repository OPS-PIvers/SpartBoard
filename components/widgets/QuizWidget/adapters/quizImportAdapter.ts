/**
 * quizImportAdapter — wires the shared `ImportWizard` primitive to Quiz's
 * existing parse/save pipeline.
 *
 * This adapter is presentational-agnostic: it does not own any state. The
 * consumer (Widget) creates the adapter per-render with closures over the
 * `useQuiz()` callbacks (`importFromSheet`, `importFromCSV`, `saveQuiz`,
 * `createQuizTemplate`).
 *
 * Behavior is preserved 1:1 from the old `QuizImporter`:
 *   - Google Sheet URL → `importFromSheet`
 *   - CSV upload → `importFromCSV`
 *   - AI-assist → `generateQuiz` (plus optional file context)
 *   - Template helper → `createQuizTemplate` (Drive) + TSV instructions
 */

import React from 'react';
import type { ImportAdapter } from '@/components/common/library';
import type { QuizData, QuizQuestion } from '@/types';
import { generateQuiz, type GeneratedQuestion } from '@/utils/ai';
import { QuizDriveService } from '@/utils/quizDriveService';

export interface QuizImportAdapterDeps {
  /** Uploads the supplied data to Drive + mirrors metadata into Firestore. */
  saveQuiz: (data: QuizData) => Promise<void>;
  /**
   * Parses a Google Sheet. `token` (when supplied) is the fresh Sheets-capable
   * union token from `ensureSheetsScope()` — threaded explicitly so the Sheets
   * API call uses it rather than `useQuiz`'s stale render-time closure token,
   * which would 403 on the first import for an already-granted user.
   */
  importFromSheet: (
    sheetUrl: string,
    title: string,
    token?: string | null
  ) => Promise<QuizData>;
  importFromCSV: (csvContent: string, title: string) => Promise<QuizData>;
  /**
   * Creates a new Quiz template Sheet in the user's Drive. `token` carries the
   * same Sheets-capable-token semantics as `importFromSheet`.
   */
  createQuizTemplate: (token?: string | null) => Promise<string>;
  /**
   * Path B on-demand Sheets-scope gate. Called from the user gesture that
   * triggers a Sheets-API operation (parsing a Google Sheet URL or creating
   * the template Sheet). Must resolve to a usable access token; resolving to
   * `null` means the user declined consent or has no Google access — the
   * adapter then throws a clear error the wizard surfaces. Silent (no popup)
   * for users who already granted the scope.
   *
   * CSV import does NOT call this (no Sheets API involved).
   */
  ensureSheetsScope: () => Promise<string | null>;
}

const SHEETS_ACCESS_ERROR =
  'Google Sheets access is required. Please grant access and try again.';

/* ─── Template instructions (rendered in the wizard's "Format help" block) ─ */

const TEMPLATE_INSTRUCTIONS: React.ReactNode = React.createElement(
  'div',
  { className: 'space-y-2' },
  React.createElement(
    'p',
    { className: 'font-bold text-slate-700' },
    'Column layout (left to right):'
  ),
  React.createElement(
    'div',
    {
      className:
        'space-y-1 font-mono bg-white/60 p-2 rounded-lg border border-slate-200',
    },
    React.createElement(
      'p',
      null,
      React.createElement(
        'span',
        { className: 'font-bold text-brand-red-primary' },
        'A:'
      ),
      ' Time Limit (seconds)'
    ),
    React.createElement(
      'p',
      null,
      React.createElement(
        'span',
        { className: 'font-bold text-brand-red-primary' },
        'B:'
      ),
      ' Question Text'
    ),
    React.createElement(
      'p',
      null,
      React.createElement(
        'span',
        { className: 'font-bold text-brand-red-primary' },
        'C:'
      ),
      ' Type (MC, FIB, Matching, Ordering)'
    ),
    React.createElement(
      'p',
      null,
      React.createElement(
        'span',
        { className: 'font-bold text-brand-red-primary' },
        'D:'
      ),
      ' Correct Answer'
    ),
    React.createElement(
      'p',
      null,
      React.createElement(
        'span',
        { className: 'font-bold text-brand-red-primary' },
        'E–H:'
      ),
      ' Incorrect 1–4 (MC only)'
    )
  ),
  React.createElement(
    'p',
    { className: 'text-slate-500 italic' },
    React.createElement('strong', null, 'Tip:'),
    ' Use “Create template” to get a ready-to-fill Google Sheet with example rows.'
  )
);

/* ─── AI-assist plumbing ──────────────────────────────────────────────────── */

const QUESTION_TYPES: ReadonlyArray<QuizQuestion['type']> = [
  'MC',
  'FIB',
  'Matching',
  'Ordering',
];

function coerceGeneratedQuestion(q: GeneratedQuestion): QuizQuestion {
  const rawType = q.type ?? 'MC';
  const type = (
    QUESTION_TYPES.includes(rawType as QuizQuestion['type']) ? rawType : 'MC'
  ) as QuizQuestion['type'];
  return {
    id: crypto.randomUUID(),
    text: q.text,
    timeLimit: q.timeLimit ?? 30,
    type,
    correctAnswer: q.correctAnswer ?? '',
    incorrectAnswers: q.incorrectAnswers ?? [],
  };
}

/* ─── Preview rendering ───────────────────────────────────────────────────── */

const BADGE_COLORS: Record<string, string> = {
  MC: 'bg-blue-100 text-blue-700 border-blue-200',
  FIB: 'bg-amber-100 text-amber-700 border-amber-200',
  Matching: 'bg-purple-100 text-purple-700 border-purple-200',
  Ordering: 'bg-teal-100 text-teal-700 border-teal-200',
};

function renderQuizPreview(data: QuizData): React.ReactNode {
  return React.createElement(
    'div',
    { className: 'space-y-3' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement(
        'p',
        { className: 'font-bold text-slate-700' },
        `${data.questions.length} question${data.questions.length === 1 ? '' : 's'} ready`
      ),
      data.title
        ? React.createElement(
            'p',
            {
              className:
                'text-xs font-semibold uppercase tracking-widest text-slate-400 truncate max-w-[60%]',
            },
            data.title
          )
        : null
    ),
    React.createElement(
      'div',
      {
        className: 'space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar',
      },
      ...data.questions.map((q, i) =>
        React.createElement(
          'div',
          {
            key: q.id,
            className:
              'flex items-start gap-3 p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm',
          },
          React.createElement(
            'span',
            {
              className: 'font-bold text-slate-300 shrink-0 text-[11px] pt-0.5',
            },
            `${i + 1}.`
          ),
          React.createElement(
            'div',
            { className: 'flex-1 min-w-0' },
            React.createElement(
              'p',
              {
                className: 'font-bold text-slate-800 truncate text-xs',
              },
              q.text
            ),
            React.createElement(
              'div',
              { className: 'flex items-center gap-2 mt-1' },
              React.createElement(
                'span',
                {
                  className: `font-black rounded-md border tracking-wider text-[9px] px-1.5 uppercase ${
                    BADGE_COLORS[q.type] ?? ''
                  }`,
                },
                q.type
              ),
              q.timeLimit > 0
                ? React.createElement(
                    'span',
                    {
                      className: 'font-bold text-slate-500 text-[10px]',
                    },
                    `⏱ ${q.timeLimit}s`
                  )
                : null
            )
          )
        )
      )
    )
  );
}

/* ─── Adapter factory ─────────────────────────────────────────────────────── */

export function createQuizImportAdapter(
  deps: QuizImportAdapterDeps
): ImportAdapter<QuizData> {
  return {
    widgetLabel: 'Quiz',
    supportedSources: ['sheet', 'csv'],
    templateHelper: {
      createTemplate: async () => {
        // Creating the template writes a new Google Sheet → needs the Sheets
        // scope. Acquire it on demand (Path B) before the Drive call, then
        // thread the fresh union token into the Sheets call so it uses the
        // Sheets-capable token rather than useQuiz's stale closure token (which
        // would 403 on the first attempt for an already-granted user).
        const token = await deps.ensureSheetsScope();
        if (!token) throw new Error(SHEETS_ACCESS_ERROR);
        const url = await deps.createQuizTemplate(token);
        return { url };
      },
      instructions: TEMPLATE_INSTRUCTIONS,
    },
    aiAssist: {
      promptPlaceholder:
        'e.g. A 5-question quiz about the solar system for 3rd graders.',
      generate: async ({ prompt }) => {
        // The quiz import wizard has only a free-form prompt textarea — no
        // type-mix picker — so default to 5 MC questions. The richer
        // per-type stepper UX lives in the QuizEditor's "Draft with AI"
        // overlay where the teacher has the full editor open.
        const result = await generateQuiz(prompt, { MC: 5 });
        return {
          id: crypto.randomUUID(),
          title: result.title,
          questions: result.questions.map(coerceGeneratedQuestion),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    },
    parse: async (source) => {
      // Defer the title to the Confirm step; Quiz's services need a title up
      // front, so use a placeholder that the wizard will overwrite on save.
      const PLACEHOLDER_TITLE = '__quiz_import__';
      if (source.kind === 'sheet') {
        // Reading a Google Sheet needs the Sheets scope. Acquire on demand
        // (Path B) before the import — silent for already-granted users. Thread
        // the fresh union token into the Sheets call so it uses the
        // Sheets-capable token rather than useQuiz's stale closure token (which
        // would 403 on the first attempt for an already-granted user).
        const token = await deps.ensureSheetsScope();
        if (!token) throw new Error(SHEETS_ACCESS_ERROR);
        const data = await deps.importFromSheet(
          source.url,
          PLACEHOLDER_TITLE,
          token
        );
        return { data, warnings: [] };
      }
      if (source.kind === 'csv') {
        const data = await deps.importFromCSV(source.text, PLACEHOLDER_TITLE);
        return { data, warnings: [] };
      }
      throw new Error(
        `Unsupported source kind for Quiz import: ${source.kind}`
      );
    },
    validate: (data) => {
      const errors: string[] = [];
      if (!data.questions || data.questions.length === 0) {
        errors.push('Quiz must contain at least one question.');
      }
      for (const [i, q] of data.questions.entries()) {
        if (!q.text?.trim()) {
          errors.push(`Question ${i + 1} is missing text.`);
        }
        if (!q.correctAnswer?.trim() && q.type !== 'FIB') {
          // FIB without correctAnswer is unusual but not structurally invalid.
          errors.push(`Question ${i + 1} is missing a correct answer.`);
        }
      }
      return { ok: errors.length === 0, errors };
    },
    renderPreview: renderQuizPreview,
    save: async (data, title) => {
      const finalTitle = title.trim() || data.title || 'Untitled Quiz';
      const now = Date.now();
      await deps.saveQuiz({
        ...data,
        title: finalTitle,
        updatedAt: now,
      });
    },
  };
}

/* ─── Template TSV helper (preserved for consumers that want clipboard) ───── */

/**
 * TSV-formatted quiz import template. Useful if the Widget wants to expose a
 * "Copy TSV" affordance outside the wizard (the wizard itself uses the Sheets
 * template flow). Kept here so callers don't need to reach into
 * `QuizDriveService` directly.
 */
export function getQuizTemplateTSV(): string {
  return QuizDriveService.getQuizTemplateTSV();
}
