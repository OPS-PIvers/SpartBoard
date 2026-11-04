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
    const l = layoutRecessGear({
      width,
      height,
      text: LONG,
      measure: estimateTextWidth,
    });
    const sumW =
      l.orientation === 'row'
        ? l.tempWidth + l.panelWidth + l.pad * 3
        : l.panelWidth + l.pad * 2;
    const sumH =
      l.orientation === 'row'
        ? l.panelHeight + l.pad * 2
        : l.tempHeight + l.panelHeight + l.pad * 3;
    expect(sumW).toBeLessThanOrEqual(width + 0.5);
    expect(sumH).toBeLessThanOrEqual(height + 0.5);
    expect(l.textWidth).toBeLessThanOrEqual(l.panelWidth);
    expect(l.fontSize).toBeGreaterThanOrEqual(10);
  });

  it('grows the message and picture with the widget', () => {
    const small = layoutRecessGear({
      width: 250,
      height: 280,
      text: LONG,
      measure: estimateTextWidth,
    });
    const large = layoutRecessGear({
      width: 700,
      height: 450,
      text: LONG,
      measure: estimateTextWidth,
    });
    expect(large.fontSize).toBeGreaterThan(small.fontSize * 1.5);
    expect(large.image).toBeGreaterThan(small.image * 1.5);
  });

  it('puts the gear beside the temperature on a wide widget', () => {
    expect(
      layoutRecessGear({
        width: 600,
        height: 250,
        text: LONG,
        measure: estimateTextWidth,
      }).orientation
    ).toBe('row');
  });

  it('scales the text cap with the window text size', () => {
    const base = layoutRecessGear({
      width: 700,
      height: 450,
      text: 'Coat',
      measure: estimateTextWidth,
    });
    const big = layoutRecessGear({
      width: 700,
      height: 450,
      text: 'Coat',
      measure: estimateTextWidth,
      textScale: 1.25,
    });
    expect(big.fontSize).toBeGreaterThan(base.fontSize);
  });
});
