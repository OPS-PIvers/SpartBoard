import { describe, it, expect } from 'vitest';
import {
  annotatedSnapshotSegments,
  parseSnapshotRoot,
  type AnnotatedSegment,
} from './writtenAnnotations';

const quoteStates = (segments: AnnotatedSegment[]): string[] =>
  segments.flatMap((s) =>
    s.kind === 'element'
      ? [...(s.quote ? [s.quote] : []), ...quoteStates(s.children)]
      : []
  );

describe('annotatedSnapshotSegments passage quotes', () => {
  it('marks a quote exact when its words match the passage and edited otherwise', () => {
    const root = parseSnapshotRoot(
      '<p>“<span data-quote="s1" data-quote-text="was not large">was not large</span>” and “<span data-quote="s1" data-quote-text="the group that did not">the group … not</span>”</p>'
    );
    expect(root).not.toBeNull();
    expect(quoteStates(annotatedSnapshotSegments(root as Element, []))).toEqual(
      ['exact', 'edited']
    );
  });
});
