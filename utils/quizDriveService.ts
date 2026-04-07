/**
 * Quiz Drive Service
 *
 * Handles all Google Drive and Google Sheets API interactions for the quiz widget:
 * - Saving quiz JSON files to Google Drive ("SPART Board/Quizzes/" folder)
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

const APP_FOLDER_NAME = 'SPART Board';
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
    const appFolderId = await this.getOrCreateFolder(APP_FOLDER_NAME);
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
      teacherName?: string;
      periodName?: string;
      plcMode?: boolean;
      plcSheetUrl?: string;
    }
  ): Promise<string> {
    const pinToName = options?.pinToName ?? {};
    const teacherName = options?.teacherName ?? 'Unknown Teacher';
    const periodName = options?.periodName ?? 'Unknown Period';
    const timestamp = new Date().toISOString();

    const resolveStudent = (pin: string): string =>
      pinToName[pin] ?? `Student (PIN: ${pin})`;

    // Build header row
    const headers = [
      'Timestamp',
      'Teacher',
      'Period',
      'Student',
      'PIN',
      'Status',
      'Score (%)',
      'Warnings',
      'Submitted At',
      ...questions.map((q, i) => `Q${i + 1}: ${q.text.substring(0, 40)}`),
    ];

    // Build data rows
    const dataRows = responses.map((r) => {
      const submitted = r.submittedAt
        ? new Date(r.submittedAt).toLocaleString()
        : '';
      const warnings = r.tabSwitchWarnings?.toString() ?? '0';
      const answerCols = questions.map((q) => {
        const ans = r.answers.find((a) => a.questionId === q.id);
        if (!ans) return '';
        const isCorrect = gradeAnswer(q, ans.answer);
        return `${ans.answer}${isCorrect ? ' ✓' : ' ✗'}`;
      });
      const correct = r.answers.filter((a) => {
        const q = questions.find((qn) => qn.id === a.questionId);
        return q ? gradeAnswer(q, a.answer) : false;
      }).length;
      const scoreDisplay =
        r.status === 'completed' && questions.length > 0
          ? `${Math.round((correct / questions.length) * 100)}%`
          : '';
      return [
        timestamp,
        teacherName,
        periodName,
        resolveStudent(r.pin),
        r.pin,
        r.status,
        scoreDisplay,
        warnings,
        submitted,
        ...answerCols,
      ];
    });

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
      'Correct Answer',
      '# Correct',
      '# Answered',
      '% Correct',
    ]);
    for (const q of questions) {
      const answered = responses.filter((r) =>
        r.answers.some((a) => a.questionId === q.id)
      ).length;
      const correct = responses.filter((r) =>
        r.answers.some((a) => a.questionId === q.id && gradeAnswer(q, a.answer))
      ).length;
      const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
      statsRows.push([
        q.text.substring(0, 60),
        q.type,
        q.correctAnswer.substring(0, 40),
        String(correct),
        String(answered),
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

    // Check if sheet already has content by reading A1
    const checkRes = await fetch(
      `${SHEETS_API_URL}/${spreadsheetId}/values/${encodedTitle}!A1`,
      { headers: this.authHeaders }
    );

    if (!checkRes.ok) {
      const err = await checkRes.text();
      console.error('Sheets read error:', err);
      throw new Error(
        'Failed to access the shared sheet. Check that the URL is correct and the sheet is shared with you.'
      );
    }

    const checkData = (await checkRes.json()) as {
      values?: string[][];
    };
    const sheetIsEmpty = !checkData.values || checkData.values.length === 0;

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
      throw new Error(
        'Failed to append results to the shared sheet. Check your permissions.'
      );
    }

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
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
}
