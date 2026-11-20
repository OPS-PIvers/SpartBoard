import { describe, it, expect } from 'vitest';
import { inferRandomRosterId, randomRosterId } from './widgetRoster';

const roster = (id: string, studentIds: string[]) => ({
  id,
  students: studentIds.map((sid) => ({
    id: sid,
    firstName: sid,
    lastName: '',
    pin: '00',
  })),
});

describe('randomRosterId', () => {
  const rosters = [{ id: 'a' }, { id: 'b' }];

  it("uses the widget's own class over the board's", () => {
    expect(randomRosterId({ rosterId: 'a' }, rosters, 'b')).toBe('a');
  });

  it("follows the board's class when the widget has none", () => {
    expect(randomRosterId({}, rosters, 'b')).toBe('b');
  });

  it('keeps its own class while classes are still loading', () => {
    expect(randomRosterId({ rosterId: 'a' }, [], 'b')).toBe('a');
  });

  it("falls back to the board's class when its own class is gone", () => {
    expect(randomRosterId({ rosterId: 'gone' }, rosters, 'b')).toBe('b');
  });
});

describe('inferRandomRosterId', () => {
  const rosters = [roster('a', ['a1', 'a2', 'a3']), roster('b', ['b1', 'b2'])];

  it('finds the class the groups came from', () => {
    expect(
      inferRandomRosterId(
        {
          lastResult: [
            { names: ['x', 'y'], studentIds: ['a1', 'a2'] },
            { names: ['z'], studentIds: ['a3'] },
          ],
        },
        rosters
      )
    ).toBe('a');
  });

  it('reads jigsaw home groups too', () => {
    expect(
      inferRandomRosterId(
        { jigsawHomeGroups: [{ names: ['x'], studentIds: ['b1'] }] },
        rosters
      )
    ).toBe('b');
  });

  it('tolerates a student who has since left the class', () => {
    expect(
      inferRandomRosterId(
        {
          lastResult: [
            { names: ['x', 'y', 'z'], studentIds: ['a1', 'a2', 'gone'] },
          ],
        },
        rosters
      )
    ).toBe('a');
  });

  it('returns null for typed names or an unknown class', () => {
    expect(inferRandomRosterId({ lastResult: 'Sam' }, rosters)).toBeNull();
    expect(
      inferRandomRosterId(
        { lastResult: [{ names: ['x'], studentIds: ['zz'] }] },
        rosters
      )
    ).toBeNull();
  });
});
