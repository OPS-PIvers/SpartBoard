import { describe, expect, it } from 'vitest';
import { soundLabelFontSize } from './labelFit';

describe('soundLabelFontSize', () => {
  it('caps the label at the old 18px tile size', () => {
    expect(soundLabelFontSize('Ding')).toMatch(/^min\(18px, 16cqmin, max\(/);
  });

  it('offers one fit per line count for a long label', () => {
    const css = soundLabelFontSize('Transition song number 12');
    expect(css.match(/calc\(\(100cqw - 10cqmin\) \//g)?.length).toBeGreaterThan(
      2
    );
  });

  it('never produces NaN or Infinity for an empty label', () => {
    expect(soundLabelFontSize('')).not.toMatch(/NaN|Infinity/);
  });
});
