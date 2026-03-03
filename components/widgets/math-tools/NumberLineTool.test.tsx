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
