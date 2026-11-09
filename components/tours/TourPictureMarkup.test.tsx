import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TourPictureMarkup } from './TourPictureMarkup';

describe('TourPictureMarkup', () => {
  it('draws each shape in the picture’s own pixel space, so it scales with the picture', () => {
    const { container } = render(
      <TourPictureMarkup
        width={800}
        height={400}
        shapes={[
          { id: 'b', kind: 'box', x: 0.1, y: 0.2, w: 0.5, h: 0.25 },
          { id: 'a', kind: 'arrow', x1: 0, y1: 0, x2: 0.5, y2: 0.5 },
          { id: 'n', kind: 'number', x: 0.5, y: 0.5, n: 3 },
        ]}
      />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
    const rect = container.querySelector('rect');
    expect(rect?.getAttribute('x')).toBe('80');
    expect(rect?.getAttribute('width')).toBe('400');
    expect(container.querySelector('line')?.getAttribute('x2')).toBe('400');
    expect(container.querySelector('text')?.textContent).toBe('3');
  });

  it('draws nothing without shapes', () => {
    const { container } = render(
      <TourPictureMarkup width={800} height={400} shapes={[]} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
