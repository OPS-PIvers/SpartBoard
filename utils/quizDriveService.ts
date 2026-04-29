/**
 * Quiz Drive Service
 *
 * Handles all Google Drive and Google Sheets API interactions for the quiz widget:
 * - Saving quiz JSON files to Google Drive ("SpartBoard/Quizzes/" folder)
 * - Loading quiz data from Drive
 * - Deleting quiz files from Drive
 * - Importing questions from a Google Sheet (using the Sheets API)
 * - Exporting quiz results to a new Google Sheet
 */

import {
  QuizData,
  QuizQuestion,
  QuizQuestionType,
  QuizResponse,
} from '../types';
import { gradeAnswer } from '../hooks/useQuizSession';
import { APP_NAME } from '../config/constants';
import { authError } from './driveAuthErrors';
import { resolvePinName } from '../components/widgets/QuizWidget/utils/quizScoreboard';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Column indices in the teacher's Google Sheet (0-based) */
const COL_TIME_LIMIT = 0;
const COL_QUESTION_TEXT = 1;
const COL_QUESTION_TYPE = 2;
const COL_CORRECT_ANSWER = 3;
const COL_INCORRECT_1 = 4;
const COL_INCORRECT_4 = 7;

const QUIZ_FOLDER_NAME = 'Quizzes';

/** Escape single quotes in Drive API q-string values (single-quote is the delimiter). */
function driveQueryEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Sanitize a title for use as a Drive file name.
 * Drive disallows `/` and some OS-reserved characters; replace them with underscores.
 */
function sanitizeDriveFileName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}

interface DriveFileCreateResponse {
  id: string;
  name: string;
}

interface DriveFileListResponse {
  files?: { id: string; name: string }[];
}

interface SheetsValueRange {
  values?: string[][];
}

/**
 * One parsed row out of a shared PLC results sheet, returned by
 * `readPlcSheet`. Mirrors the column layout written by
 * `buildResultsSheetData`'s PLC branch: identity columns first, then
 * per-question correctness as `questionAnswers[i]`. Each question cell
 * is either '' (unanswered), '0' (incorrect), or a positive number
 * string (correct).
 */
export interface PlcSheetRow {
  timestamp: string;
  teacher: string;
  classPeriod: string;
  student: string;
  pin: string;
  status: string;
  scorePercent: string;
  pointsEarned: string;
  maxPoints: string;
  warnings: string;
  submittedAt: string;
  questionAnswers: string[];
}

interface DrivePermission {
  id: string;
  type?: string;
  role?: string;
  emailAddress?: string;
}

interface DrivePermissionsListResponse {
  permissions?: DrivePermission[];
}

/**
 * Thrown by `appendToExistingSheet` when the shared PLC sheet is either
 * missing (404) or the caller has lost access (403). Callers catch this
 * to clear the cached `sharedSheetUrl` on `plcs/{id}` and regenerate a
 * fresh sheet before retrying the append, rather than surfacing the
 * raw API error to students mid-submission.
 */
export class PlcSheetMissingError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'PlcSheetMissingError';
  }
}

/**
 * Thrown by `appendToExistingSheet` when the existing sheet's header row
 * does not match the headers the current code produces. This prevents
 * silently appending column-shifted rows underneath an old-schema header
 * (the most likely cause: a sheet created before the "Period" column was
 * dropped). Carries the `existingHeaders` and `expectedHeaders` so the
 * caller can render a precise message telling the teacher to recreate
 * the sheet.
 */
export class PlcSheetSchemaMismatchError extends Error {
  constructor(
    message: string,
    public readonly existingHeaders: string[],
    public readonly expectedHeaders: string[]
  ) {
    super(message);
    this.name = 'PlcSheetSchemaMismatchError';
  }
}

export class QuizDriveService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get authHeaders() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  private get jsonHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  // ─── Folder helpers ────────────────────────────────────────────────────────

  private async getOrCreateFolder(
    folderName: string,
    parentId?: string
  ): Promise<string> {
    let q = `name = '${driveQueryEscape(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const listRes = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
      { headers: this.authHeaders }
    );
    if (!listRes.ok) throw new Error('Failed to list Drive folders');
    const listData = (await listRes.json()) as DriveFileListResponse;
    if (listData.files && listData.files.length > 0)
      return listData.files[0].id;

    const body: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) body.parents = [parentId];

    const createRes = await fetch(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify(body),
    });
    if (!createRes.ok)
      throw new Error(`Failed to create folder: ${folderName}`);
    const created = (await createRes.json()) as DriveFileCreateResponse;
    return created.id;
  }

  private async getQuizFolderId(): Promise<string> {
    const appFolderId = await this.getOrCreateFolder(APP_NAME);
    return this.getOrCreateFolder(QUIZ_FOLDER_NAME, appFolderId);
  }

  // ─── Quiz CRUD ──────────────────────────────────────────────────────────────

  /**
   * Save a quiz to Google Drive.
   * If quizData.id already has a driveFileId (passed separately), updates that file.
   * Returns the Drive file ID.
   */
  async saveQuiz(quiz: QuizData, existingFileId?: string): Promise<string> {
    const folderId = await this.getQuizFolderId();
    // Embed a stable quiz ID prefix so two quizzes with the same title never
    // fall back to the same Drive file.
    const fileName = `${sanitizeDriveFileName(quiz.title)}.${quiz.id.slice(0, 8)}.quiz.json`;
    const content = JSON.stringify(quiz, null, 2);

    // Try to update existing file
    if (existingFileId) {
      const updateRes = await fetch(
        `${UPLOAD_API_URL}/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
          body: content,
        }
      );
      if (updateRes.ok) return existingFileId;
      // Fall through to create if update fails (e.g., file deleted from Drive)
    }

    // Check if a file with the same name already exists in the folder
    const existingRes = await fetch(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(
        `name = '${driveQueryEscape(fileName)}' and '${folderId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: this.authHeaders }
    );
    if (existingRes.ok) {
      const existing = (await existingRes.json()) as DriveFileListResponse;
      if (existing.files && existing.files.length > 0) {
        const fileId = existing.files[0].id;
        const patchRes = await fetch(
          `${UPLOAD_API_URL}/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              ...this.authHeaders,
              'Content-Type': 'application/json',
            },
            body: content,
          }
        );
        if (patchRes.ok) return fileId;
        // Fall through to create a new file if the patch fails
      }
    }

    // Create new file
    const metaRes = await fetch(`${DRIVE_API_URL}/files`, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      }),
    });
    if (!metaRes.ok) throw new Error('Failed to create quiz file in Drive');
    const meta = (await metaRes.json()) as DriveFileCreateResponse;

    const uploadRes = await fetch(
      `${UPLOAD_API_URL}/files/${meta.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
        body: content,
      }
    );
    if (!uploadRes.ok)
      throw new Error('Failed to upload quiz content to Drive');
    return meta.id;
  }

  /** Load full quiz data from a Drive file */
  async loadQuiz(fileId: string): Promise<QuizData> {
    const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
      headers: this.authHeaders,
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Quiz file not found in Drive');
      throw new Error('Failed to download quiz from Drive');
    }
    return (await res.json()) as QuizData;
  }

  /** Delete a quiz file from Google Drive */
  async deleteQuizFile(fileId: string): Promise<void> {
    const res = await fetch(`${DRIVE_API_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.authHeaders,
    });
    if (!res.ok && res.status !== 404) {
      throw new Error('Failed to delete quiz file from Drive');
    }
  }

  // ─── Google Sheet import ────────────────────────────────────────────────────

  /**
   * Extract the Google Sheet ID from a sheet URL.
   * Supports /spreadsheets/d/{id}, /spreadsheets/u/0/d/{id}, and /edit variants.
   */
  static extractSheetId(url: string): string | null {
    const match = url.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Import questions from a Google Sheet.
   * Expected column layout (1-based in UI, 0-based here):
   *   A: Time Limit (seconds, blank = no limit)
   *   B: Question Text
   *   C: Question Type (MC | FIB | Matching | Ordering)
   *   D: Correct Answer
   *   E-H: Incorrect 1-4 (MC only)
   *
   * For Matching: D = "term1:def1|term2:def2|term3:def3"
   * For Ordering: D = "item1|item2|item3" (in correct order)
   */
  async importFromGoogleSheet(
    sheetId: string,
    sheetName?: string
  ): Promise<QuizQuestion[]> {
    const range = sheetName ? `${sheetName}!A:H` : 'A:H';
    const url = `${SHEETS_API_URL}/${sheetId}/values/${encodeURIComponent(range)}`;

    const res = await fetch(url, { headers: this.authHeaders });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          'Access denied. Make sure the sheet is shared or sign in again to grant Sheets access.'
        );
      }
      if (res.status === 404) {
        throw new Error('Sheet not found. Check the URL and try again.');
      }
      throw new Error(`Failed to read Google Sheet (${res.status})`);
    }

    const data = (await res.json()) as SheetsValueRange;
    const rows = data.values ?? [];

    // Skip header row if present (detect by checking if row 0 col C is not a valid question type)
    let startRow = 0;
    if (rows.length > 0) {
      const firstCell = (rows[0][COL_QUESTION_TYPE] ?? '').toUpperCase().trim();
      if (!['MC', 'FIB', 'MATCHING', 'ORDERING'].includes(firstCell)) {
        startRow = 1;
      }
    }

    const questions: QuizQuestion[] = [];
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const timeLimitRaw = (row[COL_TIME_LIMIT] ?? '').trim();
      const questionText = (row[COL_QUESTION_TEXT] ?? '').trim();
      const typeRaw = (row[COL_QUESTION_TYPE] ?? '').toUpperCase().trim();
      const correctAnswer = (row[COL_CORRECT_ANSWER] ?? '').trim();

      if (!questionText || !typeRaw) continue;

      const typeMap: Record<string, QuizQuestionType> = {
        MC: 'MC',
        FIB: 'FIB',
        MATCHING: 'Matching',
        ORDERING: 'Ordering',
      };
      const questionType: QuizQuestionType = typeMap[typeRaw] ?? 'MC';

      const incorrectAnswers: string[] = [];
      for (let c = COL_INCORRECT_1; c <= COL_INCORRECT_4; c++) {
        const val = (row[c] ?? '').trim();
        if (val) incorrectAnswers.push(val);
      }

      questions.push({
        id: crypto.randomUUID(),
        timeLimit: timeLimitRaw ? parseInt(timeLimitRaw, 10) || 0 : 0,
        text: questionText,
        type: questionType,
        correctAnswer,
        incorrectAnswers,
      });
    }

    if (questions.length === 0) {
      throw new Error(
        'No valid questions found. Check the sheet format: Column A=Time Limit, B=Question, C=Type (MC/FIB/Matching/Ordering), D=Correct Answer, E-H=Incorrect Answers.'
      );
    }

    return questions;
  }

  // ─── CSV import ────────────────────────────────────────────────────────────

  /**
   * Parse a raw CSV string into an array of QuizQuestion objects.
   * Matches the Google Sheet column layout (A=Time, B=Text, C=Type, D=Correct, E-H=Incorrect).
   */
  static parseCSVQuestions(csvContent: string): QuizQuestion[] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    // Simple robust CSV parser that handles quoted strings and newlines within quotes
    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      const nextChar = csvContent[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n' || char === '\r') {
          if (char === '\r' && nextChar === '\n') i++;
          currentRow.push(currentCell.trim());
          if (currentRow.some((c) => c)) rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c)) rows.push(currentRow);
    }

    // Skip header row if present (detect by checking if row 0 col C is not a valid question type)
    let startRow = 0;
    if (rows.length > 0) {
      const typeMap = ['MC', 'FIB', 'MATCHING', 'ORDERING'];
      const firstCell = (rows[0][COL_QUESTION_TYPE] ?? '').toUpperCase().trim();
      if (!typeMap.includes(firstCell)) {
        startRow = 1;
      }
    }

    const questions: QuizQuestion[] = [];
    const questionTypeMap: Record<string, QuizQuestionType> = {
      MC: 'MC',
      FIB: 'FIB',
      MATCHING: 'Matching',
      ORDERING: 'Ordering',
    };

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const timeLimitRaw = (row[COL_TIME_LIMIT] ?? '').trim();
      const questionText = (row[COL_QUESTION_TEXT] ?? '').trim();
      const typeRaw = (row[COL_QUESTION_TYPE] ?? '').toUpperCase().trim();
      const correctAnswer = (row[COL_CORRECT_ANSWER] ?? '').trim();

      if (!questionText || !typeRaw) continue;

      const questionType: QuizQuestionType = questionTypeMap[typeRaw] ?? 'MC';

      const incorrectAnswers: string[] = [];
      for (let c = COL_INCORRECT_1; c <= COL_INCORRECT_4; c++) {
        const val = (row[c] ?? '').trim();
        if (val) incorrectAnswers.push(val);
      }

      questions.push({
        id: crypto.randomUUID(),
        timeLimit: timeLimitRaw ? parseInt(timeLimitRaw, 10) || 0 : 0,
        text: questionText,
        type: questionType,
        correctAnswer,
        incorrectAnswers,
      });
    }

    if (questions.length === 0) {
      throw new Error(
        'No valid questions found in CSV. Expected columns: Time Limit, Question, Type (MC/FIB/Matching/Ordering), Correct Answer, Incorrect 1-4.'
      );
    }

    return questions;
  }

  // ─── Results export ─────────────────────────────────────────────────────────

  /**
   * Build the headers + data rows for the results sheet WITHOUT touching
   * the network. Shared between `exportResultsToSheet` (initial export +
   * append) and `regeneratePlcSheet` (clear-then-rewrite) so the column
   * shape stays in lock-step across all three flows. Side-effect-free.
   */
  private buildResultsSheetData(
    responses: QuizResponse[],
    questions: QuizQuestion[],
    options?: {
      pinToName?: Record<string, string>;
      byStudentUid?: Map<string, { givenName: string; familyName: string }>;
      teacherName?: string;
    }
  ): { headers: string[]; dataRows: string[][] } {
    const pinToName = options?.pinToName ?? {};
    const byStudentUid = options?.byStudentUid;
    const teacherName =
      (options?.teacherName?.trim() ? options.teacherName.trim() : null) ??
      'Unknown Teacher';
    const timestamp = new Date().toISOString();

    const resolveStudent = (r: QuizResponse): string => {
      const sso = byStudentUid?.get(r.studentUid);
      if (sso) {
        const full = `${sso.givenName ?? ''} ${sso.familyName ?? ''}`.trim();
        if (full) return full;
      }
      if (r.pin) {
        const name = resolvePinName(pinToName, r.classPeriod, r.pin);
        return name ?? `Student (PIN: ${r.pin})`;
      }
      return 'Student';
    };

    const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
    const headers = [
      'Timestamp',
      'Teacher',
      'Class Period',
      'Student',
      'PIN',
      'Status',
      'Score (%)',
      'Points Earned',
      'Max Points',
      'Warnings',
      'Submitted At',
      ...questions.map(
        (q, i) => `Q${i + 1} (${q.points ?? 1}pt): ${q.text.substring(0, 40)}`
      ),
    ];

    const dataRows = responses.map((r) => {
      const submitted = r.submittedAt
        ? new Date(r.submittedAt).toLocaleString()
        : '';
      const warnings = r.tabSwitchWarnings?.toString() ?? '0';
      const answerMap = new Map(r.answers.map((a) => [a.questionId, a]));
      const answerCols = questions.map((q) => {
        const ans = answerMap.get(q.id);
        if (!ans) return '';
        const isCorrect = gradeAnswer(q, ans.answer);
        return isCorrect ? String(q.points ?? 1) : '0';
      });
      const earnedPoints = questions.reduce((sum, q) => {
        const ans = answerMap.get(q.id);
        if (!ans) return sum;
        return sum + (gradeAnswer(q, ans.answer) ? (q.points ?? 1) : 0);
      }, 0);
      const scoreDisplay =
        r.status === 'completed' && maxPoints > 0
          ? `${Math.round((earnedPoints / maxPoints) * 100)}%`
          : '';
      return [
        timestamp,
        teacherName,
        r.classPeriod ?? '',
        resolveStudent(r),
        r.pin ?? '',
        r.status,
        scoreDisplay,
        String(earnedPoints),
        String(maxPoints),
        warnings,
        submitted,
        ...answerCols,
      ];
    });

    dataRows.sort((a, b) => a[3].localeCompare(b[3]));
    return { headers, dataRows };
  }

  /**
   * Clear-and-rewrite a PLC sheet with all responses. Used by the
   * Re-export Sheet button when there's no append-delta — gives the
   * teacher a way to force a clean rebuild without abandoning the
   * canonical sheet URL.
   */
  async regeneratePlcSheet(
    sheetUrl: string,
    responses: QuizResponse[],
    questions: QuizQuestion[],
    options?: {
      pinToName?: Record<string, string>;
      byStudentUid?: Map<string, { givenName: string; familyName: string }>;
      teacherName?: string;
    }
  ): Promise<string> {
    const { headers, dataRows } = this.buildResultsSheetData(
      responses,
      questions,
      options
    );
    return this.clearAndRewritePlcSheet(sheetUrl, headers, dataRows);
  }

  /**
   * Export quiz results to a Google Sheet.
   * In solo mode (default), creates a new spreadsheet.
   * In PLC mode, appends rows to the shared sheet at plcSheetUrl.
   * Returns the URL of the spreadsheet.
   */
  async exportResultsToSheet(
    quizTitle: string,
    responses: QuizResponse[],
    questions: QuizQuestion[],
    options?: {
      pinToName?: Record<string, string>;
      /**
       * ClassLink name lookup for SSO `studentRole` joiners (no PIN). Keyed
       * by `response.studentUid`. Optional — when omitted (legacy code+PIN
       * sessions), SSO rows fall back to the generic `Student` label.
       */
      byStudentUid?: Map<string, { givenName: string; familyName: string }>;
      teacherName?: string;
      plcMode?: boolean;
      plcSheetUrl?: string;
    }
  ): Promise<string> {
    const { headers, dataRows } = this.buildResultsSheetData(
      responses,
      questions,
      options
    );

    // PLC mode: append to existing shared sheet
    if (options?.plcMode) {
      if (!options.plcSheetUrl) {
        throw new Error(
          'No shared sheet URL configured. Please add one in Quiz settings.'
        );
      }
      return this.appendToExistingSheet(options.plcSheetUrl, headers, dataRows);
    }

    // Solo mode: create a new spreadsheet with full results + stats

    // Question-level stats
    const statsRows: string[][] = [];
    statsRows.push([]);
    statsRows.push(['Question Analysis']);
    statsRows.push([
      'Question',
      'Type',
      'Points',
      'Correct Answer',
      '# Correct',
      '# Answered',
      '% Correct',
    ]);
    const statsMap = new Map<string, { answered: number; correct: number }>();
    for (const q of questions) {
      statsMap.set(q.id, { answered: 0, correct: 0 });
    }

    const questionMap = new Map<string, QuizQuestion>(
      questions.map((q) => [q.id, q])
    );

    for (const r of responses) {
      const answeredSet = new Set<string>();
      const correctSet = new Set<string>();

      for (const a of r.answers) {
        const q = questionMap.get(a.questionId);
        if (!q) continue;

        answeredSet.add(a.questionId);
        if (gradeAnswer(q, a.answer)) {
          correctSet.add(a.questionId);
        }
      }

      for (const qId of answeredSet) {
        const stats = statsMap.get(qId);
        if (stats) stats.answered++;
      }
      for (const qId of correctSet) {
        const stats = statsMap.get(qId);
        if (stats) stats.correct++;
      }
    }

    for (const q of questions) {
      const stats = statsMap.get(q.id) ?? { answered: 0, correct: 0 };
      const pct =
        stats.answered > 0
          ? Math.round((stats.correct / stats.answered) * 100)
          : 0;
      statsRows.push([
        q.text.substring(0, 60),
        q.type,
        String(q.points ?? 1),
        q.correctAnswer.substring(0, 40),
        String(stats.correct),
        String(stats.answered),
        `${pct}%`,
      ]);
    }

    const allRows = [headers, ...dataRows, ...statsRows];

    // Create the spreadsheet
    const createRes = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        properties: { title: `${quizTitle} – Results` },
        sheets: [
          {
            properties: { title: 'Results' },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: allRows.map((row) => ({
                  values: row.map((cell) => ({
                    userEnteredValue: { stringValue: cell },
                  })),
                })),
              },
            ],
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Sheets create error:', err);
      throw new Error('Failed to create results spreadsheet');
    }

    const sheet = (await createRes.json()) as { spreadsheetUrl: string };
    return sheet.spreadsheetUrl;
  }

  /**
   * Read every data row out of an existing PLC results sheet for the
   * cross-teacher aggregation tab. Pulls the FIRST tab's full range and
   * parses rows into a typed shape that mirrors `buildResultsSheetData`'s
   * column layout. Question columns are exposed as a parallel string
   * array keyed by `questionAnswers[i]` — the consumer maps positionally
   * against `quiz.questions` (the columns are written in question order
   * by the export path; new questions added after the sheet was created
   * appear as missing trailing cells, which is fine).
   *
   * Cell semantics for question columns (matching buildResultsSheetData):
   *   - empty string → unanswered
   *   - '0' → answered, incorrect
   *   - any positive number string → answered, correct (value = points
   *     awarded; consumer treats anything non-empty and non-'0' as correct)
   *
   * Throws `PlcSheetMissingError` for 404/403 so callers can clear the
   * cached URL and regenerate, mirroring `appendToExistingSheet`'s
   * recovery contract.
   */
  async readPlcSheet(sheetUrl: string): Promise<{
    headers: string[];
    rows: PlcSheetRow[];
  }> {
    const spreadsheetId = QuizDriveService.extractSheetId(sheetUrl);
    if (!spreadsheetId) throw new Error('Invalid Google Sheets URL');

    let sheetTitle = 'Sheet1';
    try {
      const metaRes = await fetch(
        `${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties.title`,
        { headers: this.authHeaders }
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as {
          sheets?: { properties?: { title?: string } }[];
        };
        const firstTitle = meta.sheets?.[0]?.properties?.title;
        if (firstTitle) sheetTitle = firstTitle;
      }
    } catch {
      // Fall back to 'Sheet1' if metadata lookup fails — the read below
      // will surface a clearer error if even that range is unreachable.
    }

    const encodedTitle = encodeURIComponent(sheetTitle);
    const res = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}`,
      { headers: this.authHeaders }
    );

    if (!res.ok) {
      if (res.status === 404 || res.status === 403) {
        throw new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          res.status
        );
      }
      const err = await res.text();
      console.error('PLC sheet read error:', err);
      throw new Error(
        'Failed to read the shared PLC sheet. Check that the URL is correct and the sheet is shared with you.'
      );
    }

    const data = (await res.json()) as SheetsValueRange;
    const rows = data.values ?? [];
    if (rows.length === 0) return { headers: [], rows: [] };

    const headers = rows[0] ?? [];
    const dataRows: PlcSheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      // Defensive padding — Sheets API trims trailing empty cells.
      dataRows.push({
        timestamp: r[0] ?? '',
        teacher: r[1] ?? '',
        classPeriod: r[2] ?? '',
        student: r[3] ?? '',
        pin: r[4] ?? '',
        status: r[5] ?? '',
        scorePercent: r[6] ?? '',
        pointsEarned: r[7] ?? '',
        maxPoints: r[8] ?? '',
        warnings: r[9] ?? '',
        submittedAt: r[10] ?? '',
        questionAnswers: r.slice(11).map((c) => c ?? ''),
      });
    }

    return { headers, rows: dataRows };
  }

  /**
   * Clear every data row on an existing PLC sheet and write a fresh set
   * from scratch. Preserves the sheet URL (so PLC peers keep their
   * bookmarks) but replaces all content. Used by the "Re-export Sheet"
   * button on the Results page when the teacher wants to regenerate the
   * sheet without going through the create-new-sheet recovery path.
   *
   * Throws `PlcSheetMissingError` for 404/403 — same recovery contract as
   * `appendToExistingSheet` so the caller can fall through to creating
   * a fresh sheet if the original is gone entirely.
   */
  async clearAndRewritePlcSheet(
    sheetUrl: string,
    headers: string[],
    dataRows: string[][]
  ): Promise<string> {
    const spreadsheetId = QuizDriveService.extractSheetId(sheetUrl);
    if (!spreadsheetId) throw new Error('Invalid Google Sheets URL');

    let sheetTitle = 'Sheet1';
    try {
      const metaRes = await fetch(
        `${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties.title`,
        { headers: this.authHeaders }
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as {
          sheets?: { properties?: { title?: string } }[];
        };
        const firstTitle = meta.sheets?.[0]?.properties?.title;
        if (firstTitle) sheetTitle = firstTitle;
      }
    } catch {
      // Fall back to 'Sheet1' if metadata lookup fails.
    }

    const encodedTitle = encodeURIComponent(sheetTitle);

    // Step 1: clear the entire range. `values:clear` is range-scoped, so
    // we use the bare tab name to wipe every row including headers — we
    // re-write them in step 2. Body-less POST: use `authHeaders` (no
    // Content-Type) rather than `jsonHeaders`, because some proxies and
    // strict API implementations reject a Content-Type: application/json
    // declaration on a request with no body.
    const clearRes = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}:clear`,
      { method: 'POST', headers: this.authHeaders }
    );
    if (!clearRes.ok) {
      if (clearRes.status === 404 || clearRes.status === 403) {
        throw new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          clearRes.status
        );
      }
      const err = await clearRes.text();
      console.error('PLC sheet clear error:', err);
      throw new Error(
        'Failed to clear the shared PLC sheet for re-export. The sheet may be locked or you may not have edit access.'
      );
    }

    // Step 2: write headers + data in one update call. Using
    // `values:update` with `valueInputOption=RAW` so cells render exactly
    // what we send (matching the original export path's escaping rules).
    const allRows = [headers, ...dataRows];
    const writeRes = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: this.jsonHeaders,
        body: JSON.stringify({ values: allRows }),
      }
    );
    if (!writeRes.ok) {
      // Mirror the clear-step's 404/403 handling: if the sheet was
      // deleted or access revoked between clear and write, the caller
      // needs `PlcSheetMissingError` to fall through to the
      // create-fresh-sheet recovery path. Bubbling a generic Error here
      // would strand the teacher with an unrecoverable state.
      if (writeRes.status === 404 || writeRes.status === 403) {
        throw new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          writeRes.status
        );
      }
      const err = await writeRes.text();
      console.error('PLC sheet rewrite error:', err);
      throw new Error('Failed to rewrite the shared PLC sheet.');
    }

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  }

  /**
   * Append rows to an existing Google Sheet (used for PLC mode).
   * If the sheet is empty, writes headers first, then appends data rows.
   * If the sheet already has data, appends only data rows (skips headers).
   */
  private async appendToExistingSheet(
    sheetUrl: string,
    headers: string[],
    dataRows: string[][]
  ): Promise<string> {
    const spreadsheetId = QuizDriveService.extractSheetId(sheetUrl);
    if (!spreadsheetId) throw new Error('Invalid Google Sheets URL');

    // Discover the first sheet's actual title (handles renamed tabs)
    let sheetTitle = 'Sheet1';
    try {
      const metaRes = await fetch(
        `${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties.title`,
        { headers: this.authHeaders }
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as {
          sheets?: { properties?: { title?: string } }[];
        };
        const firstTitle = meta.sheets?.[0]?.properties?.title;
        if (firstTitle) sheetTitle = firstTitle;
      }
    } catch {
      // Fall back to 'Sheet1' if metadata lookup fails
    }

    const encodedTitle = encodeURIComponent(sheetTitle);

    // Read row 1 (header row) to (a) detect whether the sheet is empty and
    // (b) if not, validate that its existing schema matches what we're
    // about to append. Without this guard, dropping or reordering a column
    // in the export would silently shift every subsequent column on PLC
    // sheets created with an older schema — wrong student names, wrong
    // PINs, wrong answers — with no API error.
    const checkRes = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}!1:1`,
      { headers: this.authHeaders }
    );

    if (!checkRes.ok) {
      const err = await checkRes.text();
      console.error('Sheets read error:', err);
      // 404 = sheet was deleted in Drive. 403 = caller lost access (e.g.
      // the creator revoked the share, or the sheet's owner transferred
      // ownership to a domain that refuses external writers). Either way,
      // signal the caller to clear the cached URL and regenerate rather
      // than bubbling a raw API failure to a student mid-submission.
      if (checkRes.status === 404 || checkRes.status === 403) {
        throw new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          checkRes.status
        );
      }
      throw new Error(
        'Failed to access the shared sheet. Check that the URL is correct and the sheet is shared with you.'
      );
    }

    const checkData = (await checkRes.json()) as {
      values?: (string | null | undefined)[][];
    };
    const existingHeaderRow = checkData.values?.[0] ?? [];

    // Trim trailing empties — the Sheets API can pad with `''`, `null`, or
    // `undefined` depending on how a cell was last cleared. Treat all three
    // as "no value here" so a sheet whose last column was deleted in the
    // UI doesn't trigger a false-positive schema mismatch.
    const trimmed: string[] = existingHeaderRow.map((c) => c ?? '');
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
      trimmed.pop();
    }
    // After trimming, an effectively-empty header row (`[]` or `['']`)
    // means the sheet was never written. Append cleanly with our headers.
    const sheetIsEmpty = trimmed.length === 0;

    if (!sheetIsEmpty) {
      const matches =
        trimmed.length === headers.length &&
        trimmed.every((cell, i) => cell === headers[i]);
      if (!matches) {
        throw new PlcSheetSchemaMismatchError(
          "This PLC sheet was created with an older schema and can't be appended to safely. " +
            'Ask the PLC lead to recreate the shared sheet (the next export will create a fresh one).',
          trimmed,
          headers
        );
      }
    }

    // Build rows to append: include headers if sheet is empty
    const rowsToAppend = sheetIsEmpty ? [headers, ...dataRows] : dataRows;

    // Append via Sheets API
    const appendRes = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: this.jsonHeaders,
        body: JSON.stringify({
          values: rowsToAppend,
        }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.text();
      console.error('Sheets append error:', err);
      if (appendRes.status === 404 || appendRes.status === 403) {
        throw new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          appendRes.status
        );
      }
      throw new Error(
        'Failed to append results to the shared sheet. Check your permissions.'
      );
    }

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  }

  // ─── PLC shared-sheet provisioning ─────────────────────────────────────────

  /**
   * Create a new Google Sheet owned by the caller as the per-assignment
   * shared export destination for a PLC quiz, and grant `writer` permission
   * to every email in `memberEmailsToShareWith`. The caller's own email
   * must NOT appear in the list — they already own the sheet.
   *
   * Each PLC assignment gets its own fresh sheet — this is no longer
   * cached on the PLC doc. Permission-grant failures are logged and
   * swallowed individually so that one teammate with an invalid email
   * doesn't block the sheet from being created — reconciliation on
   * invite-accept will retry missing grants.
   */
  async createPlcSheetAndShare(args: {
    plcName: string;
    quizTitle: string;
    memberEmailsToShareWith: string[];
  }): Promise<{ url: string; spreadsheetId: string }> {
    const title = `${args.plcName} – ${args.quizTitle} – Results`;
    const createRes = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        properties: { title },
        // Start with a blank Results tab — headers are written on the
        // first appendToExistingSheet call when dataRows arrive.
        sheets: [{ properties: { title: 'Results' } }],
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('PLC sheet create error:', err);
      if (createRes.status === 401 || createRes.status === 403) {
        throw authError(
          'Google Sheets access is not granted. Sign in again to enable PLC sharing.'
        );
      }
      throw new Error('Failed to create the PLC shared sheet.');
    }
    const sheet = (await createRes.json()) as {
      spreadsheetId: string;
      spreadsheetUrl: string;
    };

    // Grant writer permission to every teammate email. Best-effort: we
    // don't let a single failed grant abort the whole flow, since the
    // sheet itself is already created and usable by the owner.
    const unique = new Set(
      args.memberEmailsToShareWith
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@'))
    );
    for (const email of unique) {
      try {
        await this.grantSheetWriterPermission(sheet.spreadsheetId, email);
      } catch (err) {
        console.error(`Failed to share PLC sheet with ${email}:`, err);
      }
    }

    return { url: sheet.spreadsheetUrl, spreadsheetId: sheet.spreadsheetId };
  }

  /**
   * Ensure every email in `memberEmailsToShareWith` has writer access on
   * the PLC sheet. Called from the invite-accept path so a teammate
   * admitted after the sheet was created still gets access automatically.
   *
   * Silent no-op when the caller is not the sheet owner (listing
   * permissions returns 403) — the actual owner will reconcile next time
   * they assign something. A 404 is treated the same way; the caller
   * should clear `plcs/{id}.sharedSheetUrl` if it can be confirmed
   * elsewhere that the sheet is truly gone.
   */
  async reconcilePlcSheetPermissions(args: {
    sheetUrl: string;
    memberEmailsToShareWith: string[];
  }): Promise<{ granted: string[]; skipped: boolean }> {
    const spreadsheetId = QuizDriveService.extractSheetId(args.sheetUrl);
    if (!spreadsheetId) return { granted: [], skipped: true };

    const wanted = new Set(
      args.memberEmailsToShareWith
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@'))
    );
    if (wanted.size === 0) return { granted: [], skipped: false };

    // List existing permissions so we only grant what's missing. fields=
    // restricts the payload to the keys we consume.
    const listRes = await fetch(
      `${DRIVE_API_URL}/files/${spreadsheetId}/permissions?fields=permissions(id,type,role,emailAddress)`,
      { headers: this.authHeaders }
    );
    if (!listRes.ok) {
      // 403 = caller isn't the owner (so can't list permissions); 404 =
      // sheet gone. Either way we can't do anything here — the actual
      // owner (or the next assignment create) will reconcile.
      if (listRes.status === 403 || listRes.status === 404) {
        return { granted: [], skipped: true };
      }
      throw new Error(
        `Failed to list PLC sheet permissions (${listRes.status})`
      );
    }
    const listData = (await listRes.json()) as DrivePermissionsListResponse;
    const existing = new Set(
      (listData.permissions ?? [])
        .map((p) => (p.emailAddress ?? '').toLowerCase())
        .filter((e) => e.length > 0)
    );

    const granted: string[] = [];
    for (const email of wanted) {
      if (existing.has(email)) continue;
      try {
        await this.grantSheetWriterPermission(spreadsheetId, email);
        granted.push(email);
      } catch (err) {
        console.error(`Failed to grant PLC sheet access to ${email}:`, err);
      }
    }
    return { granted, skipped: false };
  }

  /**
   * Low-level helper: grant a single `writer` permission on a Drive file
   * by email. Extracted so `createPlcSheetAndShare` and
   * `reconcilePlcSheetPermissions` share one code path.
   *
   * `sendNotificationEmail=false` because the sheet URL is surfaced inside
   * SpartBoard — a separate Drive-generated email would be noise. Drive
   * rejects the argument silently when the caller lacks the scope, so we
   * still rely on the response check below to detect failure.
   */
  private async grantSheetWriterPermission(
    spreadsheetId: string,
    email: string
  ): Promise<void> {
    const res = await fetch(
      `${DRIVE_API_URL}/files/${spreadsheetId}/permissions?sendNotificationEmail=false`,
      {
        method: 'POST',
        headers: this.jsonHeaders,
        body: JSON.stringify({
          role: 'writer',
          type: 'user',
          emailAddress: email,
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Drive permission grant failed (${res.status}): ${body.slice(0, 200)}`
      );
    }
  }

  /**
   * Create a template Google Sheet for Video Activity imports.
   * Returns the URL of the newly created spreadsheet.
   */
  async createVideoActivityTemplate(title: string): Promise<string> {
    const headers = [
      'Timestamp (MM:SS)',
      'Question Text',
      'Correct Answer',
      'Incorrect 1',
      'Incorrect 2',
      'Incorrect 3',
      'Time Limit (seconds)',
    ];

    const exampleRow = ['01:30', 'What is 2+2?', '4', '1', '2', '3', '30'];

    const allRows = [headers, exampleRow];

    const createRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: this.jsonHeaders,
        body: JSON.stringify({
          properties: { title: `${title} Template` },
          sheets: [
            {
              properties: { title: 'Video Activity Template' },
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: allRows.map((row) => ({
                    values: row.map((cell) => ({
                      userEnteredValue: { stringValue: cell },
                    })),
                  })),
                },
              ],
            },
          ],
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Sheets create template error:', err);
      throw new Error('Failed to create template spreadsheet');
    }

    const sheet = (await createRes.json()) as { spreadsheetUrl: string };
    return sheet.spreadsheetUrl;
  }

  // ─── Quiz template ──────────────────────────────────────────────────────────

  private static readonly QUIZ_TEMPLATE_HEADERS = [
    'Time Limit (seconds)',
    'Question Text',
    'Type',
    'Correct Answer',
    'Incorrect 1',
    'Incorrect 2',
    'Incorrect 3',
    'Incorrect 4',
  ];

  private static readonly QUIZ_TEMPLATE_EXAMPLES = [
    [
      '30',
      'What is the capital of France?',
      'MC',
      'Paris',
      'London',
      'Berlin',
      'Madrid',
      'Rome',
    ],
    [
      '20',
      'The powerhouse of the cell is the ___.',
      'FIB',
      'mitochondria',
      '',
      '',
      '',
      '',
    ],
    [
      '45',
      'Match the country to its capital.',
      'Matching',
      'France:Paris|Germany:Berlin|Japan:Tokyo',
      '',
      '',
      '',
      '',
    ],
    [
      '40',
      'Put these events in chronological order.',
      'Ordering',
      'Declaration of Independence|Civil War|World War I|Moon Landing',
      '',
      '',
      '',
      '',
    ],
  ];

  /**
   * Return a TSV string of the quiz import template (headers + example rows).
   * Static — no auth or Drive access needed. Suitable for clipboard copy.
   */
  static getQuizTemplateTSV(): string {
    return [
      QuizDriveService.QUIZ_TEMPLATE_HEADERS,
      ...QuizDriveService.QUIZ_TEMPLATE_EXAMPLES,
    ]
      .map((row) => row.join('\t'))
      .join('\n');
  }

  /**
   * Create a template Google Sheet for quiz imports in the user's Drive.
   * Returns the URL of the newly created spreadsheet.
   */
  async createQuizTemplate(): Promise<string> {
    const allRows = [
      QuizDriveService.QUIZ_TEMPLATE_HEADERS,
      ...QuizDriveService.QUIZ_TEMPLATE_EXAMPLES,
    ];

    const createRes = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify({
        properties: { title: 'Quiz Import Template' },
        sheets: [
          {
            properties: { title: 'Quiz Template' },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: allRows.map((row) => ({
                  values: row.map((cell) => ({
                    userEnteredValue: { stringValue: cell },
                  })),
                })),
              },
            ],
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Sheets create quiz template error:', err);
      throw new Error('Failed to create quiz template spreadsheet');
    }

    const sheet = (await createRes.json()) as { spreadsheetUrl: string };
    return sheet.spreadsheetUrl;
  }
}
