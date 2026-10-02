import { describe, expect, it } from 'vitest';
import {
  parseDelimitedRows,
  parseFlashcardClipboard,
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

  it('keeps a lone header-like row as a card instead of dropping it silently', () => {
    const result = parseFlashcardText('Question\tAnswer');

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      term: 'Question',
      definition: 'Answer',
    });
  });

  it('notes (does not warn) when a stripped first row might have been a real card', () => {
    // "Term"/"Answer" happens to read like a header, but here it's the
    // user's real first card, followed by a second real card.
    const result = parseFlashcardText('Term\tAnswer\nCat\tFeline');

    expect(
      result.cards.map(({ term, definition }) => [term, definition])
    ).toEqual([['Cat', 'Feline']]);
    // A neutral `note`, not an amber `warnings` alert — a real header row is
    // this file's primary supported case, so stripping one must not read as
    // something going wrong on every ordinary import.
    expect(result.note).toMatch(/header/i);
    expect(result.warnings).toEqual([]);
  });

  it('also notes (not warns) for a genuine header row, the common case', () => {
    const result = parseFlashcardText('Term\tDefinition\nCat\tFeline');

    expect(result.warnings).toEqual([]);
    expect(result.note).toMatch(/header/i);
  });
});

describe('parseFlashcardClipboard', () => {
  const terms = (cards: ReturnType<typeof parseFlashcardClipboard>) =>
    cards?.map(({ term, definition }) => [term, definition]);

  it('reads a Quizlet export or spreadsheet copy as tab-separated cards', () => {
    expect(
      terms(parseFlashcardClipboard('hola\thello\nadiós\tgoodbye\n', ''))
    ).toEqual([
      ['hola', 'hello'],
      ['adiós', 'goodbye'],
    ]);
  });

  it('keeps a lone inch mark that would unbalance quoted parsing', () => {
    expect(
      terms(parseFlashcardClipboard('ruler\t12" long\nyard\t3 feet', ''))
    ).toEqual([
      ['ruler', '12" long'],
      ['yard', '3 feet'],
    ]);
  });

  it('reads a two-column Google Docs table from the HTML flavor', () => {
    const html =
      '<meta charset="utf-8"><b><div><table><tbody>' +
      '<tr><td><p><span>Term</span></p></td><td><p><span>Definition</span></p></td></tr>' +
      '<tr><td><p><span>cell</span></p></td><td><p><span>basic unit</span></p><p><span>of life</span></p></td></tr>' +
      '<tr><td><p><span>atom</span></p></td><td><p><span>smallest&nbsp;particle</span></p></td></tr>' +
      '</tbody></table></div></b>';
    expect(
      terms(parseFlashcardClipboard('Term\nDefinition\ncell', html))
    ).toEqual([
      ['cell', 'basic unit\nof life'],
      ['atom', 'smallest particle'],
    ]);
  });

  it('reads a Google Sheets table', () => {
    const html =
      '<google-sheets-html-origin><table><tbody>' +
      '<tr><td>sun</td><td>a star</td></tr><tr><td>moon</td><td>a satellite<br>of Earth</td></tr>' +
      '</tbody></table>';
    expect(terms(parseFlashcardClipboard('sun\ta star', html))).toEqual([
      ['sun', 'a star'],
      ['moon', 'a satellite\nof Earth'],
    ]);
  });

  it('leaves plain text, single columns and wider tables to the board', () => {
    expect(parseFlashcardClipboard('one\ntwo\nthree', '')).toBeNull();
    expect(parseFlashcardClipboard('just one\tcard', '')).toBeNull();
    expect(parseFlashcardClipboard('a\tb\tc\nd\te\tf', '')).toBeNull();
    expect(
      parseFlashcardClipboard(
        'a\tb',
        '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr></table>'
      )
    ).toBeNull();
    expect(
      parseFlashcardClipboard(
        'a',
        '<table><tr><td>a</td></tr><tr><td>b</td></tr></table>'
      )
    ).toBeNull();
    expect(
      parseFlashcardClipboard(
        'Some <b>bold</b> prose',
        '<p>Some <b>bold</b> prose</p>'
      )
    ).toBeNull();
  });
});
