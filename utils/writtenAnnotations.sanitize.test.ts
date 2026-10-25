import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import {
  annotatedSnapshotSegments,
  parseSnapshotRoot,
  renderAnnotatedSnapshot,
  type AnnotatedSegment,
} from './writtenAnnotations';

const tags = (segments: AnnotatedSegment[]): string[] =>
  segments.flatMap((s) =>
    s.kind === 'element' ? [s.tag, ...tags(s.children)] : []
  );

describe('stored gradingSnapshot is re-sanitized before rendering', () => {
  it('strips svg, script and style from a hand-written snapshot', () => {
    const root = parseSnapshotRoot(
      '<p>ok</p><svg><script>alert(1)</script></svg><style>body{}</style>'
    );
    expect(root).not.toBeNull();
    expect(tags(annotatedSnapshotSegments(root as Element, []))).toEqual(['p']);
  });

  it('renders no script or svg element in the React tree', () => {
    const { container } = render(
      React.createElement(
        'div',
        null,
        renderAnnotatedSnapshot({
          html: '<p><b>hi</b></p><svg><script>window.__x=1</script></svg>',
          annotations: [],
        })
      )
    );
    expect(container.querySelector('script, svg, style')).toBeNull();
    expect(container.querySelector('p b')?.textContent).toBe('hi');
  });

  it('keeps a legitimate snapshot unchanged', () => {
    const html =
      '<p>one <strong>two</strong></p><ul><li>three</li></ul><span data-quote="s1" data-quote-text="x">x</span>';
    const root = parseSnapshotRoot(html);
    expect(root?.innerHTML).toBe(html);
  });
});
