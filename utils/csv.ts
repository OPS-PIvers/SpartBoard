/** Shared CSV reading for every importer: one RFC 4180 parser and one header-row rule. */

export interface CsvLine {
  /** Unquoted cells, untrimmed. */
  cells: string[];
  /** 1-based physical line the record starts on. */
  line: number;
  /** The record's source text without its line ending, for error messages. */
  raw: string;
}

/** RFC 4180 parser that keeps each record's starting line and raw text. */
export function parseCsvLines(text: string): CsvLine[] {
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  const out: CsvLine[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let startIdx = 0;
  const endRecord = (endIdx: number) => {
    row.push(field);
    out.push({ cells: row, line: startLine, raw: src.slice(startIdx, endIdx) });
    row = [];
    field = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      if (ch === '\n' || (ch === '\r' && src[i + 1] !== '\n')) line += 1;
      field += ch;
      i += 1;
      continue;
    }
    // A quote opens a quoted field only at its start; mid-field it is literal (5" ruler).
    if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      endRecord(i);
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      line += 1;
      startLine = line;
      startIdx = i;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) endRecord(src.length);
  return out;
}

/** RFC 4180 parser: returns rows of fields, handling quoted commas/newlines and "" escapes. */
export function parseCsvRecords(text: string): string[][] {
  return parseCsvLines(text).map((r) => r.cells);
}

/** True when every cell is blank. */
export const isBlankCsvLine = (cells: string[]): boolean =>
  cells.every((c) => c.trim() === '');

export interface CsvDataRow {
  /** Trimmed cells. */
  cells: string[];
  /** 1-based line the record starts on, header included. */
  line: number;
}

/** The one header rule: drops the first row when `isDataRow` says it is not data. */
export function withoutHeaderRow<T>(
  rows: T[],
  isDataRow: (row: T) => boolean
): T[] {
  return rows.length > 0 && !isDataRow(rows[0]) ? rows.slice(1) : rows;
}

/** Trimmed non-blank records, minus a header row. */
export function csvDataRows(
  text: string,
  isDataRow: (cells: string[]) => boolean
): CsvDataRow[] {
  const rows = parseCsvLines(text)
    .filter((r) => !isBlankCsvLine(r.cells))
    .map((r) => ({ cells: r.cells.map((c) => c.trim()), line: r.line }));
  return withoutHeaderRow(rows, (r) => isDataRow(r.cells));
}
