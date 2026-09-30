import { downloadCsv } from '@/utils/quizResultsCsv';
import { quoteCsvCell } from '@/utils/quizTargetStats';
import type { ExportCell } from './gradebookExport';

const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export function gradebookRowsToCsv(rows: ExportCell[][]): string {
  return rows
    .map((row) => row.map((cell) => quoteCsvCell(String(cell))).join(','))
    .join('\r\n');
}

export function downloadGradebookCsv(rows: ExportCell[][], title: string) {
  downloadCsv(gradebookRowsToCsv(rows), title);
}

const sheetValue = (cell: ExportCell) =>
  typeof cell === 'number' ? { numberValue: cell } : { stringValue: cell };

/** Creates a new Sheet (drive.file scope) with a frozen header row and name column. */
export async function createGradebookSheet(
  accessToken: string,
  rows: ExportCell[][],
  title: string
): Promise<string> {
  const res = await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: 'Grades',
            gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: rows.map((row, i) => ({
                values: row.map((cell) => ({
                  userEnteredValue: sheetValue(cell),
                  ...(i === 0
                    ? { userEnteredFormat: { textFormat: { bold: true } } }
                    : {}),
                })),
              })),
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new Error('Google access expired. Sign in again to export.');
    throw new Error(`Could not create the sheet (${res.status}).`);
  }
  const sheet = (await res.json()) as { spreadsheetUrl: string };
  return sheet.spreadsheetUrl;
}
