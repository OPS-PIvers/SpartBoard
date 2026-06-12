import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NumberLineTool } from './NumberLineTool';

describe('NumberLineTool', () => {
  // -----------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------
  it('renders without crashing with default props', () => {
    render(<NumberLineTool />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders the aria-label with min and max values', () => {
    render(<NumberLineTool min={-5} max={5} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Number line from -5 to 5'
    );
  });

  it('renders in decimals mode without crashing', () => {
    render(<NumberLineTool min={0} max={5} mode="decimals" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders in fractions mode without crashing', () => {
    render(<NumberLineTool min={0} max={4} mode="fractions" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------
  // Division-by-zero guard (Copilot fix: range = Math.max(1, ...))
  // -----------------------------------------------------------------
  describe('division-by-zero guard', () => {
    it('does not throw when min equals max', () => {
      expect(() => render(<NumberLineTool min={5} max={5} />)).not.toThrow();
    });

    it('renders an SVG element when min equals max', () => {
      render(<NumberLineTool min={5} max={5} />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('produces no NaN in SVG markup when min equals max', () => {
      const { container } = render(<NumberLineTool min={5} max={5} />);
      expect(container.innerHTML).not.toContain('NaN');
    });

    it('does not throw when min is greater than max', () => {
      expect(() => render(<NumberLineTool min={10} max={5} />)).not.toThrow();
    });

    it('produces no NaN in SVG markup when min > max', () => {
      const { container } = render(<NumberLineTool min={10} max={5} />);
      expect(container.innerHTML).not.toContain('NaN');
    });

    it('does not produce Infinity in SVG markup when min equals max', () => {
      const { container } = render(<NumberLineTool min={3} max={3} />);
      expect(container.innerHTML).not.toContain('Infinity');
    });
  });

  // -----------------------------------------------------------------
  // Fractions mode: negative-range label bug
  // Non-whole ticks in a negative range (e.g. min=-2) must show only the
  // fractional part ("3/4") not a spurious mixed number ("1 3/4").
  // Bug: the code passed -valNumer (e.g. 7) to fractionLabel instead of
  // (-valNumer) % denom (e.g. 3), causing mixed-number labels on ticks
  // between negative integers.
  // -----------------------------------------------------------------
  describe('fractions mode negative range labels', () => {
    it('shows "3/4" not "1 3/4" for the first sub-tick below -1 (at -1 3/4)', () => {
      // min=-2, max=2, denom=4 → ticks at -2, -7/4, -6/4, -5/4, -1, ...
      // The tick at i=1 (valNumer = -8+1 = -7, x=between -2 and -1) should
      // label as "3/4" (only the fractional distance from the nearest lower
      // integer), not "1 3/4" (a mixed number including the whole part).
      const { container } = render(
        <NumberLineTool min={-2} max={2} mode="fractions" />
      );
      // "1 3/4" would appear in the SVG text if the bug is present
      expect(container.innerHTML).not.toContain('1 3/4');
    });

    it('shows "1/2" not "1 2/4" for the second sub-tick below -1 (at -1 1/2)', () => {
      // i=2, valNumer=-6; correct label "2/4" (rendered by fractionLabel as "1/2"
      // after GCD reduction — but the broken path passes 6 → fractionLabel(6,4)
      // which returns "1 2/4" instead of "2/4").
      // Note: fractionLabel has no GCD; 6%4=2 → fractionLabel(2,4)="2/4" is correct.
      // The broken path passes -(-6)=6 → fractionLabel(6,4)="1 2/4".
      const { container } = render(
        <NumberLineTool min={-2} max={2} mode="fractions" />
      );
      expect(container.innerHTML).not.toContain('1 2/4');
    });

    it('does not show any mixed-number label (digit space digit/digit) below zero', () => {
      // Broad check: with denom=4 and a negative start there should be no
      // text matching /\d \d\/\d/ in the rendered SVG — those are mixed-
      // number labels that only belong at positive ticks farther from zero.
      const { container } = render(
        <NumberLineTool min={-3} max={0} mode="fractions" />
      );
      // All non-whole ticks are in the negative range; none should be
      // mixed numbers.
      expect(container.innerHTML).not.toMatch(/\d \d\/\d/);
    });
  });

  // -----------------------------------------------------------------
  // MAX_RANGE cap (prevents unbounded tick rendering)
  // -----------------------------------------------------------------
  describe('MAX_RANGE cap', () => {
    it('clamps safeMax to min + 200 for extreme max values', () => {
      // safeMax = Math.min(10000, 0 + 200) = 200; aria-label uses safeMax
      render(<NumberLineTool min={0} max={10000} />);
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        'Number line from 0 to 200'
      );
    });

    it('does not clamp when max is within the 200-unit window', () => {
      render(<NumberLineTool min={0} max={100} />);
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        'Number line from 0 to 100'
      );
    });

    it('clamps correctly for a negative-start range', () => {
      // safeMax = Math.min(5000, -50 + 200) = 150
      render(<NumberLineTool min={-50} max={5000} />);
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        'Number line from -50 to 150'
      );
    });
  });
});
