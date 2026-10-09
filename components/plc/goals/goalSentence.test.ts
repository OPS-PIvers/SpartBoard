import { describe, expect, it } from 'vitest';
import { buildGoalSentence, formatGoalDate, joinList } from './goalSentence';

describe('buildGoalSentence', () => {
  it('needs an outcome', () => {
    expect(buildGoalSentence({ students: '7th graders' })).toBeNull();
    expect(buildGoalSentence({ outcome: '  ' })).toBeNull();
  });

  it('builds the full frame', () => {
    expect(
      buildGoalSentence({
        dueDate: '2027-05-14',
        students: 'our 7th graders',
        outcome: 'write a claim with two pieces of evidence',
        baseline: 45,
        target: 80,
        measure: 'the Unit 3 argument CFA',
        practices: ['using Think-Pair-Share', 'daily exit tickets'],
      })
    ).toBe(
      'By May 14, 2027, 80% of our 7th graders will write a claim with two pieces of evidence, up from 45%, as measured by the Unit 3 argument CFA, by using Think-Pair-Share and daily exit tickets.'
    );
  });

  it('fills gaps with plain defaults', () => {
    expect(buildGoalSentence({ outcome: 'read 20 minutes a day.' })).toBe(
      'Students will read 20 minutes a day.'
    );
    expect(buildGoalSentence({ outcome: 'read', baseline: 40 })).toBe(
      'Students will read.'
    );
  });

  it('drops a typed lead word so it is not doubled', () => {
    expect(
      buildGoalSentence({
        outcome: 'will read',
        measure: 'as measured by STAR',
        practices: ['by modeling'],
      })
    ).toBe('Students will read, as measured by STAR, by modeling.');
  });
});

describe('joinList', () => {
  it('uses a serial comma for three or more', () => {
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b, and c');
  });
});

describe('formatGoalDate', () => {
  it('rejects malformed keys', () => {
    expect(formatGoalDate('2027-5-1')).toBeNull();
    expect(formatGoalDate('2027-01-09')).toBe('January 9, 2027');
  });
});
