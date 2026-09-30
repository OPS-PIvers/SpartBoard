import { describe, expect, it } from 'vitest';
import { getAssignmentWidgetKind } from '@/utils/quizWidgetKind';

describe('getAssignmentWidgetKind', () => {
  it('trusts an explicit tag over the mode', () => {
    expect(
      getAssignmentWidgetKind({ widgetKind: 'quiz', sessionMode: 'teacher' })
    ).toBe('quiz');
    expect(
      getAssignmentWidgetKind({ widgetKind: 'review', sessionMode: 'student' })
    ).toBe('review');
  });

  it('classifies untagged legacy docs by mode (D3)', () => {
    expect(getAssignmentWidgetKind({ sessionMode: 'teacher' })).toBe('review');
    expect(getAssignmentWidgetKind({ sessionMode: 'auto' })).toBe('review');
    expect(getAssignmentWidgetKind({ sessionMode: 'game' })).toBe('review');
    expect(getAssignmentWidgetKind({ sessionMode: 'student' })).toBe('quiz');
    expect(getAssignmentWidgetKind({})).toBe('quiz');
  });

  it('keeps legacy view-only shares in Quiz', () => {
    expect(
      getAssignmentWidgetKind({ sessionMode: 'teacher', mode: 'view-only' })
    ).toBe('quiz');
  });
});
