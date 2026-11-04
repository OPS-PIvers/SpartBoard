import { describe, it, expect } from 'vitest';
import {
  GEAR_LINE_HEIGHT,
  estimateTextWidth,
  fitFontSize,
  layoutRecessGear,
  toParagraphs,
} from './recessGearLayout';

const LONG = 'Jacket, hat, mittens, boots, & snow pants';
const SIZES: [number, number][] = [
  [150, 150],
  [200, 220],
  [250, 280],
  [340, 300],
  [480, 260],
  [420, 520],
  [220, 420],
  [700, 450],
];
const layout = (width: number, height: number, text = LONG, textScale = 1) =>
  layoutRecessGear({
    width,
    height,
    text,
    measure: estimateTextWidth,
    textScale,
  });

describe('fitFontSize', () => {
  it('returns a size whose wrapped lines fit the box', () => {
    const paragraphs = toParagraphs(LONG);
    const font = fitFontSize(paragraphs, 200, 80, 60, estimateTextWidth);
    expect(font).toBeGreaterThan(10);
    expect(fitFontSize(paragraphs, 200, 80, font, estimateTextWidth)).toBe(
      font
    );
  });

  it('stops at the cap when the box is roomy', () => {
    expect(
      fitFontSize(toParagraphs('Coat'), 1000, 1000, 40, estimateTextWidth)
    ).toBe(40);
  });

  it('counts hard line breaks', () => {
    const one = fitFontSize(
      toParagraphs('Wear a coat'),
      400,
      60,
      99,
      estimateTextWidth
    );
    const two = fitFontSize(
      toParagraphs('Wear\na coat'),
      400,
      60,
      99,
      estimateTextWidth
    );
    expect(two).toBeLessThan(one);
    expect(two * 2 * GEAR_LINE_HEIGHT).toBeLessThanOrEqual(60);
  });
});

describe('layoutRecessGear', () => {
  it.each(SIZES)('keeps everything inside a %ix%i widget', (width, height) => {
    const l = layout(width, height);
    expect(l.headlineWidth + l.pad * 2).toBeLessThanOrEqual(width + 0.5);
    expect(l.headlineHeight + l.rowHeight + l.pad * 3).toBeLessThanOrEqual(
      height + 0.5
    );
    const rowW =
      l.row === 'side' ? l.image + l.tempWidth + l.pad * 0.5 : l.tempWidth;
    expect(rowW).toBeLessThanOrEqual(l.headlineWidth + 0.5);
    expect(l.fontSize).toBeGreaterThanOrEqual(9);
    expect(l.image).toBeGreaterThan(0);
  });

  it('grows the headline and picture with the widget', () => {
    const small = layout(250, 280);
    const large = layout(700, 450);
    expect(large.fontSize).toBeGreaterThan(small.fontSize * 1.5);
    expect(large.image).toBeGreaterThan(small.image * 1.5);
  });

  it('stacks the picture over the temperature on a tall window', () => {
    expect(layout(220, 420).row).toBe('stacked');
    expect(layout(340, 300).row).toBe('side');
  });

  it('gives a short message its own height back', () => {
    const short = layout(420, 520, 'Coat');
    const long = layout(420, 520);
    expect(short.headlineHeight).toBeLessThan(long.headlineHeight);
  });

  it('scales the text cap with the window text size', () => {
    expect(layout(700, 450, 'Coat', 1.25).fontSize).toBeGreaterThan(
      layout(700, 450, 'Coat').fontSize
    );
  });
});
