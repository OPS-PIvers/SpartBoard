/** Shared CSV reading for every importer: one RFC 4180 parser and one header-row rule. */

/** RFC 4180 parser: returns rows of fields, handling quoted commas/newlines and "" escapes. */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
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
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
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
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvDataRow {
  /** Trimmed cells. */
  cells: string[];
  /** 1-based record number in the file, header included. */
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
  const rows = parseCsvRecords(text)
    .map((r, i) => ({ cells: r.map((c) => c.trim()), line: i + 1 }))
    .filter((r) => r.cells.some((c) => c !== ''));
  return withoutHeaderRow(rows, (r) => isDataRow(r.cells));
}
