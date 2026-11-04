import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RandomFlash } from './RandomFlash';
import { findFittingFontSize } from './randomFlashFit';

vi.mock('@/context/dashboardCanvasStore', () => ({
  useGlobalStyle: () => ({ fontFamily: 'sans' }),
}));

describe('RandomFlash', () => {
  it('keeps the widget container for a single word', () => {
    render(
      <RandomFlash
        displayResult="Harper"
        isSpinning={false}
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper');
    expect(name.parentElement?.style.containerType).toBe('');
    expect(name.style.fontSize).toBe('min(300px, 20cqmin)');
  });

  it('keeps the widget container for the placeholder', () => {
    render(
      <RandomFlash displayResult={null} isSpinning={false} fontSize="20cqmin" />
    );
    expect(screen.getByText('Ready?').parentElement?.style.containerType).toBe(
      ''
    );
  });

  it('fits a multi-word name to its own box by line count', () => {
    render(
      <RandomFlash
        displayResult="Harper Okafor"
        isSpinning={false}
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper Okafor');
    expect(name.parentElement?.style.containerType).toBe('size');
    expect(name.style.fontSize).toContain('37cqh');
  });

  it('uses the roster-wide size while spinning', () => {
    render(
      <RandomFlash
        displayResult="Harper Okafor"
        isSpinning
        fontSize="20cqmin"
      />
    );
    const name = screen.getByText('Harper Okafor');
    expect(name.parentElement?.style.containerType).toBe('');
    expect(name.style.fontSize).toBe('min(300px, 20cqmin)');
  });
});

describe('findFittingFontSize', () => {
  // Fake text box: each char is 0.8em wide on one line, wrapping to more lines when narrower than the text.
  const fakeMeasurer = (chars: number, longestWord: number) => {
    const el = document.createElement('span');
    Object.defineProperty(el, 'scrollWidth', {
      get: () => parseFloat(el.style.fontSize) * 0.8 * longestWord,
    });
    Object.defineProperty(el, 'offsetHeight', {
      get: () => {
        const px = parseFloat(el.style.fontSize);
        const max = parseFloat(el.style.maxWidth);
        const lines = Math.ceil((px * 0.8 * chars) / max);
        return lines * px * 1.25;
      },
    });
    return el;
  };

  it('grows a short name until the box height limits it', () => {
    const px = findFittingFontSize(fakeMeasurer(3, 3), 600, 200);
    expect(px).toBe(Math.floor(160 * 0.94));
  });

  it('is limited by the longest word in a narrow box', () => {
    const px = findFittingFontSize(fakeMeasurer(20, 10), 200, 1000);
    expect(px).toBeLessThanOrEqual(25);
    expect(px).toBeGreaterThan(20);
  });

  it('returns null for an unmeasured box', () => {
    expect(findFittingFontSize(fakeMeasurer(3, 3), 0, 0)).toBeNull();
  });
});
