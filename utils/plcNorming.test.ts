import { describe, expect, it } from 'vitest';
import type { PlcNormingCopy } from '@/types';
import {
  groupNormingCopies,
  normingLabelFor,
  parseNormingCopy,
  parseNormingLevelLabels,
} from './plcNorming';

const copy = (over: Partial<PlcNormingCopy>): PlcNormingCopy => ({
  id: 'c',
  assessmentId: 'a',
  questionId: 'q1',
  questionIndex: 1,
  questionText: 'Q one',
  level: 'high',
  kind: 'text',
  answerText: 'x',
  flaggedByUid: 'u',
  flaggedByName: 'T',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('plcNorming utils', () => {
  it('keeps only non-empty renameable labels and caps their length', () => {
    expect(
      parseNormingLevelLabels({
        high: ' Exceeds ',
        medium: '',
        review: 'Nope',
        low: 'x'.repeat(60),
      })
    ).toEqual({
      high: 'Exceeds',
      low: 'x'.repeat(40),
    });
    expect(parseNormingLevelLabels({ high: 3 })).toBeUndefined();
    expect(parseNormingLevelLabels('High')).toBeUndefined();
  });

  it('falls back to default names and never renames Review', () => {
    expect(normingLabelFor('medium', { high: 'Exceeds' })).toBe('Medium');
    expect(normingLabelFor('high', { high: 'Exceeds' })).toBe('Exceeds');
    expect(normingLabelFor('review', undefined)).toBe('Review');
  });

  it('drops malformed copies', () => {
    expect(parseNormingCopy('x', { level: 'top', kind: 'text' })).toBeNull();
    expect(parseNormingCopy('x', { level: 'low', kind: 'video' })).toBeNull();
    expect(
      parseNormingCopy('x', { level: 'low', kind: 'audio', audioPath: 'p' })
    ).toMatchObject({ id: 'x', audioPath: 'p' });
  });

  it('groups by question order, then High, Medium, Low, Review', () => {
    const groups = groupNormingCopies([
      copy({ id: 'r', level: 'review' }),
      copy({ id: 'h2', level: 'high', createdAt: 5 }),
      copy({ id: 'z', questionId: 'q0', questionIndex: 0, level: 'low' }),
      copy({ id: 'h1', level: 'high', createdAt: 2 }),
    ]);
    expect(groups.map((g) => g.questionId)).toEqual(['q0', 'q1']);
    expect(groups[1].byLevel.map((b) => b.level)).toEqual(['high', 'review']);
    expect(groups[1].byLevel[0].copies.map((c) => c.id)).toEqual(['h1', 'h2']);
  });
});
