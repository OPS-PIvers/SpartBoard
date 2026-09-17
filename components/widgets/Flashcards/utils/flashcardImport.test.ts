import { describe, expect, it } from 'vitest';
import {
  parseDelimitedRows,
  parseFlashcardSheetRows,
  parseFlashcardText,
} from './flashcardImport';

describe('flashcard import', () => {
  it('auto-detects Quizlet-style tab-separated paste and skips a header', () => {
    const result = parseFlashcardText(
      'Term\tDefinition\nhola\thello\nadiós\tgoodbye'
    );

    expect(result.detectedSeparator).toBe('tab');
    expect(
      result.cards.map(({ term, definition }) => [term, definition])
    ).toEqual([
      ['hola', 'hello'],
      ['adiós', 'goodbye'],
    ]);
  });

  it('keeps commas and newlines inside quoted CSV cells', () => {
    const rows = parseDelimitedRows(
      'term,definition\n"hello, friend","line one\nline two"',
      ','
    );

    expect(rows[1]).toEqual(['hello, friend', 'line one\nline two']);
  });

  it('supports space-dash-space and custom separators', () => {
    expect(parseFlashcardText('uno - one\ndos - two').cards).toHaveLength(2);
    expect(
      parseFlashcardText('chat::cat', {
        separator: 'custom',
        customSeparator: '::',
      }).cards[0]
    ).toMatchObject({ term: 'chat', definition: 'cat' });
  });

  it('enforces row and field limits with warnings', () => {
    const rows = Array.from({ length: 502 }, (_, index) => [
      `term ${index}${index === 0 ? 'x'.repeat(600) : ''}`,
      `definition ${index}${index === 0 ? 'y'.repeat(1100) : ''}`,
    ]);
    const result = parseFlashcardSheetRows(rows);

    expect(result.cards).toHaveLength(500);
    expect(result.cards[0]?.term).toHaveLength(500);
    expect(result.cards[0]?.definition).toHaveLength(1000);
    expect(result.warnings.join(' ')).toContain('first 500');
    expect(result.warnings.join(' ')).toContain('500 characters');
    expect(result.warnings.join(' ')).toContain('1,000 characters');
  });
});
