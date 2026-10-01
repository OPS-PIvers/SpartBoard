import { describe, expect, it } from 'vitest';
import { countWords } from './wordCount';

describe('countWords inline formatting', () => {
  it('does not split a word formatted mid-way', () => {
    expect(countWords('un<b>believ</b>able')).toBe(1);
    expect(countWords('<p>He<i>llo</i> <span style="x">wor</span>ld</p>')).toBe(
      2
    );
  });

  it('still splits at block boundaries and line breaks', () => {
    expect(countWords('<div>one</div><div>two</div>')).toBe(2);
    expect(countWords('one<br>two<br/>three')).toBe(3);
    expect(countWords('<ul><li>a</li><li>b</li></ul>')).toBe(2);
  });
});
