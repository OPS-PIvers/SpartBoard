import { describe, expect, it } from 'vitest';
import { parsePlcGoal, sortPlcGoals } from '@/hooks/usePlcGoals';

describe('parsePlcGoal', () => {
  it('keeps routine and free-text practices and drops malformed ones', () => {
    const goal = parsePlcGoal('g1', {
      title: 'Reading stamina',
      measure: '80% at 20 minutes',
      practices: [
        { id: 'a', routineId: 'chalk-talk', text: '' },
        { id: 'b', text: 'Daily reading' },
        { id: 'c', text: '   ' },
        { text: 'no id' },
        'junk',
      ],
      order: 2,
      createdBy: 'u1',
      createdAt: 5,
      updatedAt: 6,
    });
    expect(goal).toEqual({
      id: 'g1',
      title: 'Reading stamina',
      measure: '80% at 20 minutes',
      practices: [
        { id: 'a', routineId: 'chalk-talk', text: '' },
        { id: 'b', text: 'Daily reading' },
      ],
      order: 2,
      createdBy: 'u1',
      createdAt: 5,
      updatedAt: 6,
    });
  });

  it('rejects a doc without a title or author and omits a blank measure', () => {
    expect(parsePlcGoal('x', { createdBy: 'u1' })).toBeNull();
    expect(parsePlcGoal('x', { title: 'T' })).toBeNull();
    expect(
      parsePlcGoal('x', { title: 'T', createdBy: 'u', measure: ' ' })
    ).not.toHaveProperty('measure');
  });

  it('keeps the SMART frame pieces and drops blank or non-string ones', () => {
    const g = parsePlcGoal('x', {
      title: 'T',
      createdBy: 'u',
      dueDate: '2027-05-14',
      students: 'our 7th graders',
      outcome: ' ',
    });
    expect(g?.dueDate).toBe('2027-05-14');
    expect(g?.students).toBe('our 7th graders');
    expect(g).not.toHaveProperty('outcome');
  });

  it('keeps whole-percent progress numbers and drops bad ones', () => {
    const g = parsePlcGoal('x', {
      title: 'T',
      createdBy: 'u',
      baseline: 58,
      current: 64.5,
      target: 120,
    });
    expect(g?.baseline).toBe(58);
    expect(g).not.toHaveProperty('current');
    expect(g).not.toHaveProperty('target');
  });
});

describe('sortPlcGoals', () => {
  it('orders by order, then creation time', () => {
    const base = { title: 't', practices: [], createdBy: 'u', updatedAt: 0 };
    const sorted = sortPlcGoals([
      { ...base, id: 'b', order: 1, createdAt: 1 },
      { ...base, id: 'c', order: 0, createdAt: 9 },
      { ...base, id: 'a', order: 0, createdAt: 3 },
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['a', 'c', 'b']);
  });
});
