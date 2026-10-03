import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparty } from './Sparty';
import {
  buildSpartyKeyframes,
  firstFrame,
  gridToEdgeRuns,
  gridToRuns,
} from './spartyRender';
import {
  SPARTY_GRID,
  SPARTY_PALETTE,
  SPARTY_POSES,
  SPARTY_POSE_IDS,
} from './spartyFrames';

describe('spartyFrames', () => {
  it.each(SPARTY_POSE_IDS)('%s has square grids in the palette', (pose) => {
    const { frames, gesture, loop } = SPARTY_POSES[pose];
    expect(frames.length).toBeGreaterThan(0);
    expect(loop.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame).toHaveLength(SPARTY_GRID);
      for (const row of frame) {
        expect(row).toHaveLength(SPARTY_GRID);
        for (const char of row) {
          expect(char === '.' || char in SPARTY_PALETTE).toBe(true);
        }
      }
    }
    for (const [frame, ms] of [...gesture, ...loop]) {
      expect(frame).toBeLessThan(frames.length);
      expect(ms).toBeGreaterThan(0);
    }
  });

  it.each(SPARTY_POSE_IDS)('%s uses every frame it stores', (pose) => {
    const { frames, gesture, loop } = SPARTY_POSES[pose];
    const used = new Set([...gesture, ...loop].map(([f]) => f));
    expect(used.size).toBe(frames.length);
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

  it('outlines only the transparent pixels touching the sprite', () => {
    expect(gridToEdgeRuns(['...', '.o.', '...'])).toEqual([
      { x: 1, y: 0, width: 1, color: 'edge' },
      { x: 0, y: 1, width: 1, color: 'edge' },
      { x: 2, y: 1, width: 1, color: 'edge' },
      { x: 1, y: 2, width: 1, color: 'edge' },
    ]);
  });
});

describe('buildSpartyKeyframes', () => {
  const css = buildSpartyKeyframes();

  it('plays gestures twice, ending hidden, then starts the loop after them', () => {
    const { gesture } = SPARTY_POSES.wave;
    const gestureMs = gesture.reduce((sum, [, ms]) => sum + ms, 0);
    const first = gesture[0][0];
    expect(css).toMatch(
      new RegExp(
        `@keyframes sparty-wave-g${first}\\{[^}]*\\}[^@]*100%\\{visibility:hidden\\}`
      )
    );
    expect(css).toContain(
      `sparty-wave-g${first} ${gestureMs}ms step-end 2 forwards`
    );
    expect(css).toMatch(
      new RegExp(
        `sparty-wave-l\\d+ \\d+ms step-end ${gestureMs * 2}ms infinite`
      )
    );
  });

  it('loops poses without a gesture from the start', () => {
    expect(css).toMatch(/sparty-idle-l\d+ \d+ms step-end 0ms infinite/);
    expect(css).not.toContain('sparty-idle-g');
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
    const shown = firstFrame('wave');
    groups.forEach((g, i) =>
      i === shown
        ? expect(g).not.toHaveAttribute('visibility')
        : expect(g).toHaveAttribute('visibility', 'hidden')
    );
  });

  it('shares one keyframes stylesheet across instances', () => {
    render(
      <>
        <Sparty pose="idle" />
        <Sparty pose="cheer" />
      </>
    );
    expect(
      document.querySelectorAll('style[data-href="sparty-keyframes"]')
    ).toHaveLength(1);
    expect(document.querySelector('svg style')).toBeNull();
  });

  it('adds the light edge only on dark surfaces', () => {
    const plain = render(<Sparty decorative />).container;
    const dark = render(<Sparty decorative onDark />).container;
    const edge = (c: HTMLElement) =>
      c.querySelectorAll('rect[fill^="rgba"]').length;
    expect(edge(plain)).toBe(0);
    expect(edge(dark)).toBeGreaterThan(0);
  });

  it('mirrors when flipped', () => {
    const { container } = render(<Sparty decorative flip />);
    expect(container.querySelector('svg')).toHaveStyle({
      transform: 'scaleX(-1)',
    });
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
