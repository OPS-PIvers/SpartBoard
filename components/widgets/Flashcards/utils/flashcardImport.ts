import type { FlashcardCard } from '@/types';

export type FlashcardImportSeparator =
  | 'auto'
  | 'tab'
  | 'comma'
  | 'dash'
  | 'custom';

export interface FlashcardImportResult {
  cards: FlashcardCard[];
  warnings: string[];
  detectedSeparator: string;
}

interface ParseOptions {
  separator?: FlashcardImportSeparator;
  customSeparator?: string;
}

const TERM_HEADERS = new Set(['term', 'word', 'front', 'prompt', 'question']);
const DEFINITION_HEADERS = new Set([
  'definition',
  'meaning',
  'back',
  'answer',
  'response',
]);

const separatorValue = (
  source: string,
  options: ParseOptions
): { value: string; label: string } => {
  const requested = options.separator ?? 'auto';
  if (requested === 'tab') return { value: '\t', label: 'tab' };
  if (requested === 'comma') return { value: ',', label: 'comma' };
  if (requested === 'dash') return { value: ' - ', label: 'space-dash-space' };
  if (requested === 'custom') {
    const custom = options.customSeparator ?? '';
    if (!custom) throw new Error('Enter a custom separator.');
    return { value: custom, label: `“${custom}”` };
  }

  const firstLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return { value: '\t', label: 'tab' };
  const candidates = [
    { value: '\t', label: 'tab' },
    { value: ',', label: 'comma' },
    { value: ' - ', label: 'space-dash-space' },
  ];
  const detected = candidates
    .map((candidate) => ({
      ...candidate,
      count: firstLine.split(candidate.value).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0];
  if (!detected || detected.count === 0) {
    throw new Error(
      'No separator was detected. Try Tab, Comma, Space – dash – space, or Custom.'
    );
  }
  return detected;
};

/** RFC-4180-style tokenizer that also supports multi-character separators. */
export function parseDelimitedRows(
  source: string,
  separator: string
): string[][] {
  if (!separator) throw new Error('A separator is required.');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushCell = (): void => {
    row.push(cell.trim());
    cell = '';
  };
  const pushRow = (): void => {
    pushCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && source.startsWith(separator, index)) {
      pushCell();
      index += separator.length - 1;
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRow();
      continue;
    }
    cell += character;
  }
  if (cell !== '' || row.length > 0) pushRow();
  return rows;
}

export function flashcardsFromRows(
  sourceRows: ReadonlyArray<ReadonlyArray<string>>
): Omit<FlashcardImportResult, 'detectedSeparator'> {
  const warnings: string[] = [];
  const rows = sourceRows.map((row) => row.map((cell) => String(cell).trim()));
  const first = rows[0];
  // Only strip row 0 as a header when there's a row after it — otherwise a
  // lone card whose term/definition happen to read like "Question"/"Answer"
  // would be stripped down to zero cards with no warning shown.
  const hasHeader =
    rows.length > 1 &&
    first != null &&
    TERM_HEADERS.has((first[0] ?? '').toLowerCase()) &&
    DEFINITION_HEADERS.has((first[1] ?? '').toLowerCase());
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (hasHeader && first != null) {
    // Header-sniffing is lexical and can false-positive on a genuine first
    // card — warn so a stripped real card isn't lost with no trace.
    warnings.push(
      `The first row ("${first[0] ?? ''}" / "${first[1] ?? ''}") looked like a column header and was not imported as a card. If that was meant to be a card, add it back manually.`
    );
  }

  let incompleteRows = 0;
  let extraColumnRows = 0;
  let truncatedTerms = 0;
  let truncatedDefinitions = 0;
  let overflowRows = 0;
  const cards: FlashcardCard[] = [];

  for (const row of dataRows) {
    const term = row[0] ?? '';
    const definition = row[1] ?? '';
    if (!term && !definition) continue;
    if (!term || !definition) {
      incompleteRows += 1;
      continue;
    }
    if (row.slice(2).some(Boolean)) extraColumnRows += 1;
    if (cards.length >= 500) {
      overflowRows += 1;
      continue;
    }
    if (term.length > 500) truncatedTerms += 1;
    if (definition.length > 1000) truncatedDefinitions += 1;
    cards.push({
      id: crypto.randomUUID(),
      term: term.slice(0, 500),
      definition: definition.slice(0, 1000),
    });
  }

  if (overflowRows > 0) {
    warnings.push(`Only the first 500 complete cards were imported.`);
  }
  if (incompleteRows > 0) {
    warnings.push(
      `${incompleteRows} incomplete row${incompleteRows === 1 ? ' was' : 's were'} skipped.`
    );
  }
  if (extraColumnRows > 0) {
    warnings.push(
      `Extra columns were ignored in ${extraColumnRows} row${extraColumnRows === 1 ? '' : 's'}.`
    );
  }
  if (truncatedTerms > 0) {
    warnings.push(
      `${truncatedTerms} term${truncatedTerms === 1 ? ' was' : 's were'} shortened to 500 characters.`
    );
  }
  if (truncatedDefinitions > 0) {
    warnings.push(
      `${truncatedDefinitions} definition${truncatedDefinitions === 1 ? ' was' : 's were'} shortened to 1,000 characters.`
    );
  }

  return { cards, warnings };
}

export function parseFlashcardText(
  source: string,
  options: ParseOptions = {}
): FlashcardImportResult {
  if (!source.trim()) {
    return { cards: [], warnings: [], detectedSeparator: 'none' };
  }
  const separator = separatorValue(source, options);
  const parsed = flashcardsFromRows(
    parseDelimitedRows(source, separator.value)
  );
  return { ...parsed, detectedSeparator: separator.label };
}

export function parseFlashcardSheetRows(
  rows: ReadonlyArray<ReadonlyArray<string>>
): FlashcardImportResult {
  return {
    ...flashcardsFromRows(rows),
    detectedSeparator: 'Google Sheets columns',
  };
}
