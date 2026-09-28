// LMS question HTML to readable plain text.

import { describe, it, expect } from 'vitest';
import { readableText } from '@/utils/quizDocumentImport/cartridgeHtml';

const read = (markup: string): string =>
  readableText(new DOMParser().parseFromString(markup, 'text/html').body);

describe('readableText', () => {
  it('puts each paragraph on its own line and keeps inline runs together', () => {
    expect(
      read(
        '<p><span style="x">Which was </span><strong>NOT</strong> a cause?</p><p>Pick one.</p>'
      )
    ).toBe('Which was NOT a cause?\nPick one.');
  });

  it('reads a table one row per line', () => {
    expect(
      read(
        '<table><tr><th>Year</th><th>Event</th></tr><tr><td><p>1789</p></td><td>Revolution</td></tr></table>'
      )
    ).toBe('Year | Event\n1789 | Revolution');
  });

  it('turns breaks and list items into lines and folds non-breaking spaces', () => {
    expect(read('a<br>b&nbsp;&nbsp;c<ul><li>one</li><li>two</li></ul>')).toBe(
      'a\nb c\n- one\n- two'
    );
  });
});
