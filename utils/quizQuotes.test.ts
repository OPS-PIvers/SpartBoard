import { describe, it, expect } from 'vitest';
import {
  QUOTE_ATTR,
  QUOTE_TEXT_ATTR,
  buildQuoteNodes,
  cleanQuoteText,
  isQuoteEdited,
} from './quizQuotes';

describe('cleanQuoteText', () => {
  it('joins PDF line breaks and hyphenated words into one line', () => {
    expect(
      cleanQuoteText('  the group that re-\nceived\ngroup   therapy ')
    ).toBe('the group that received group therapy');
  });
});

describe('isQuoteEdited', () => {
  it('treats whitespace-only differences as exact', () => {
    expect(isQuoteEdited('not  large', 'not large')).toBe(false);
  });

  it('flags trimmed or changed words', () => {
    expect(isQuoteEdited('not ... large', 'not very large')).toBe(true);
  });
});

describe('buildQuoteNodes', () => {
  it('puts the quotation marks and trailing space outside the tracked span', () => {
    const host = document.createElement('p');
    host.append(
      ...buildQuoteNodes(document, { stimulusId: 's1', text: 'not large' })
    );
    expect(host.innerHTML).toBe(
      `“<span ${QUOTE_ATTR}="s1" ${QUOTE_TEXT_ATTR}="not large">not large</span>”&nbsp;`
    );
  });
});
