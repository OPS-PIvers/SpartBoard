import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparty } from './Sparty';
import { buildSpartyKeyframes, gridToRuns } from './spartyRender';
import {
  SPARTY_GRID,
  SPARTY_PALETTE,
  SPARTY_POSES,
  SPARTY_POSE_IDS,
} from './spartyFrames';

describe('spartyFrames', () => {
  it.each(SPARTY_POSE_IDS)('%s has square grids in the palette', (pose) => {
    const { frames, durations } = SPARTY_POSES[pose];
    expect(frames.length).toBeGreaterThan(0);
    expect(durations).toHaveLength(frames.length);
    for (const frame of frames) {
      expect(frame).toHaveLength(SPARTY_GRID);
      for (const row of frame) {
        expect(row).toHaveLength(SPARTY_GRID);
        for (const char of row) {
          expect(char === '.' || char in SPARTY_PALETTE).toBe(true);
        }
      }
    }
  });
});

describe('gridToRuns', () => {
  it('merges same-colored neighbors and skips transparent pixels', () => {
    expect(gridToRuns(['..oo.y', 'yy'])).toEqual([
      { x: 2, y: 0, width: 2, color: 'o' },
      { x: 5, y: 0, width: 1, color: 'y' },
      { x: 0, y: 1, width: 2, color: 'y' },
    ]);
  });
});

describe('buildSpartyKeyframes', () => {
  it('gives idle a long open-eye frame and a short blink', () => {
    const css = buildSpartyKeyframes();
    expect(css).toContain(
      '@keyframes sparty-idle-0{0%{visibility:visible}93.75%{visibility:hidden}}'
    );
    expect(css).toContain(
      '@keyframes sparty-idle-1{0%{visibility:hidden}93.75%{visibility:visible}}'
    );
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});

describe('Sparty', () => {
  it('renders a labelled image with one group per frame', () => {
    const { container } = render(<Sparty pose="wave" size={96} />);
    const svg = screen.getByRole('img', { name: 'Sparty' });
    expect(svg).toHaveAttribute('width', '96');
    expect(svg).toHaveClass('sparty-wave');
    const groups = container.querySelectorAll('g');
    expect(groups).toHaveLength(SPARTY_POSES.wave.frames.length);
    expect(groups[0]).not.toHaveAttribute('visibility');
    expect(groups[1]).toHaveAttribute('visibility', 'hidden');
  });

  it('hides from screen readers when decorative', () => {
    const { container } = render(<Sparty decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
