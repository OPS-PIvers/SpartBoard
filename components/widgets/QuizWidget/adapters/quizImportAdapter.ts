/**
 * quizImportAdapter — wires the shared `ImportWizard` primitive to Quiz's
 * existing parse/save pipeline.
 *
 * This adapter is presentational-agnostic: it does not own any state. The
 * consumer (Widget) creates the adapter per-render with closures over the
 * `useQuiz()` callbacks (`importFromSheet`, `importFromCSV`, `saveQuiz`,
 * `createQuizTemplate`).
 *
 * Behavior:
 *   - Google Sheet (chosen via the Drive Picker, `drive.file`) → `importFromSheet`
 *   - CSV upload → `importFromCSV`
 *   - AI-assist → `generateQuiz` (plus optional file context)
 *   - Template helper → `createQuizTemplate` (Drive, `drive.file`) + TSV instructions
 *
 * Sheets operations use the non-sensitive `drive.file` scope (picking a sheet
 * grants per-file access; the template is a new app-owned file), so the import
 * never needs the sensitive `spreadsheets` scope.
 */

import React from 'react';
import type { ImportAdapter } from '@/components/common/library';
import type { QuizData, QuizQuestion } from '@/types';
import { generateQuiz, type GeneratedQuestion } from '@/utils/ai';
import {
  extractedToQuizData,
  readQuizDocument,
  rowWarnings,
  type ExtractedImage,
} from '@/utils/quizDocumentImport';
import { browserPdfDeps } from '@/utils/quizDocumentImport/pdfBrowserDeps';
import { QuizDocumentReview } from '../components/QuizDocumentReview';
import { QuizDriveService } from '@/utils/quizDriveService';

export interface QuizImportAdapterDeps {
  /** Wizard copy label; defaults to 'Quiz'. */
  widgetLabel?: string;
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
   * Acquires a usable `drive.file` access token for the adapter's Sheets-API
   * operations: reading a Picker-selected sheet (the picked file is
   * drive.file-readable) and creating the template sheet (a new app-owned
   * file). `drive.file` is the login scope, so this is silent (no popup) for
   * every signed-in user — and needs NO sensitive `spreadsheets` scope.
   * Resolving to `null` means the user has no Google access; the adapter then
   * throws a clear error the wizard surfaces.
   *
   * CSV import does NOT call this (no Drive/Sheets API involved).
   */
  ensureDriveScope: () => Promise<string | null>;
  /**
   * Opens the Google Picker to choose a Sheet from Drive. Wired straight to the
   * adapter's `pickSheet` (see `ImportAdapter.pickSheet`). Picking grants the
   * app per-file `drive.file` access to the chosen sheet.
   */
  pickSheet: () => Promise<{ url: string } | null>;
  /**
   * Opens the Google Picker to choose a printed test from Drive, returning its
   * bytes. A Google Doc arrives already exported as .docx so it takes the Word
   * path (docs/plans/QUIZ_DOCUMENT_IMPORT.md D4). Omitted when the teacher
   * can't use the feature, which also hides the Drive button.
   */
  pickDocument?: () => Promise<{ file: Blob; fileName: string } | null>;
  /**
   * True when the document-import rollout switch AND the per-user permission
   * are both on (D21). False keeps the import wizard exactly as it was.
   */
  canImportDocuments?: boolean;
  /**
   * Uploads a read document's pictures to the teacher's Drive and links them
   * to the questions that use them (D13). Called at save, not at read, so a
   * teacher who backs out of the wizard leaves nothing behind. Omitted when
   * the consumer cannot reach Drive; the quiz is then created without them.
   */
  attachDocumentImages?: (quiz: QuizData) => Promise<QuizData>;
  /**
   * Handed the pictures a read document carried, so the consumer can hold
   * them until `attachDocumentImages` runs. The adapter owns no state of its
   * own, and `ImportParseResult` carries only the parsed quiz.
   */
  onDocumentImages?: (images: readonly ExtractedImage[]) => void;
}

const DRIVE_ACCESS_ERROR =
  'Google Drive access is required. Please sign in again and try again.';

/** Stand-in title; Quiz's services need one before the wizard's Confirm step. */
const PLACEHOLDER_TITLE = '__quiz_import__';

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
    widgetLabel: deps.widgetLabel ?? 'Quiz',
    supportedSources: deps.canImportDocuments
      ? ['sheet', 'csv', 'document']
      : ['sheet', 'csv'],
    pickSheet: deps.pickSheet,
    ...(deps.canImportDocuments && deps.pickDocument
      ? { pickDocument: deps.pickDocument }
      : {}),
    templateHelper: {
      createTemplate: async () => {
        // The template is a NEW app-owned Sheet → the non-sensitive `drive.file`
        // login scope suffices (no `spreadsheets`). Acquire a fresh token and
        // thread it into the create call so it isn't useQuiz's stale
        // render-time closure token (which would 403 on the first attempt).
        const token = await deps.ensureDriveScope();
        if (!token) throw new Error(DRIVE_ACCESS_ERROR);
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
      if (source.kind === 'sheet') {
        // The sheet was just chosen via the Google Picker, which granted this
        // app per-file `drive.file` access to it — so reading it needs only the
        // non-sensitive `drive.file` token (no `spreadsheets`). Acquire a fresh
        // token and thread it in so it isn't useQuiz's stale closure token.
        const token = await deps.ensureDriveScope();
        if (!token) throw new Error(DRIVE_ACCESS_ERROR);
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
      if (source.kind === 'document') {
        // pdf.js and tesseract are only loaded when the file is a PDF, so a
        // Word import never pays for them.
        const isPdf =
          source.file.type === 'application/pdf' ||
          source.fileName.toLowerCase().endsWith('.pdf');
        const extracted = await readQuizDocument(source.file, {
          fileName: source.fileName,
          ...(isPdf ? { pdf: await browserPdfDeps(source.file) } : {}),
        });
        deps.onDocumentImages?.(extracted.images);
        return {
          data: extractedToQuizData(extracted),
          // Row notes ride the wizard's own warnings list, numbered so they
          // line up with the review rows (D10).
          warnings: [...extracted.warnings, ...rowWarnings(extracted)],
        };
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
        if (!q.correctAnswer?.trim() && q.type !== 'FIB' && !q.needsKey) {
          // FIB without correctAnswer is unusual but not structurally invalid,
          // and `needsKey` is a document import saying so on purpose (D7) —
          // Assign, live start and PLC share are that question's gate.
          errors.push(`Question ${i + 1} is missing a correct answer.`);
        }
      }
      return { ok: errors.length === 0, errors };
    },
    renderPreview: renderQuizPreview,
    // The read of a test document is never certain, so the teacher checks and
    // corrects it before anything is created (D10). Only offered when the
    // feature is on; otherwise the wizard keeps its read-only preview.
    ...(deps.canImportDocuments
      ? {
          renderReview: (data: QuizData, onChange: (next: QuizData) => void) =>
            React.createElement(QuizDocumentReview, { data, onChange }),
        }
      : {}),
    // A document import names the quiz after the file (D11); sheet and CSV
    // imports carry the placeholder, so they keep the wizard's own title box.
    suggestTitle: (data) =>
      data.title && data.title !== PLACEHOLDER_TITLE ? data.title : undefined,
    save: async (data, title) => {
      const finalTitle = title.trim() || data.title || 'Untitled Quiz';
      const now = Date.now();
      // Pictures become real stimuli only now, once the teacher has settled
      // which questions they are keeping.
      const withImages = deps.attachDocumentImages
        ? await deps.attachDocumentImages(data)
        : data;
      await deps.saveQuiz({
        ...withImages,
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
