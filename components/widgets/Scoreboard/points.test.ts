import { describe, it, expect } from 'vitest';
import {
  scoreboardLeaders,
  scoreboardPointPresetId,
  scoreboardPointValues,
  scoreboardRank,
} from './points';

const team = (id: string, score: number) => ({ id, name: id, score });

describe('scoreboard points', () => {
  it('uses a preset only when the flag is on and the saved values match one', () => {
    expect(scoreboardPointValues({ pointValues: [1, 5, 10] }, true)).toEqual([
      1, 5, 10,
    ]);
    expect(scoreboardPointValues({ pointValues: [1, 5, 10] }, false)).toEqual([
      1,
    ]);
    expect(scoreboardPointValues({ pointValues: [7, 8] }, true)).toEqual([1]);
    expect(scoreboardPointPresetId({ pointValues: [5, 10, 25] })).toBe(
      '5-10-25'
    );
    expect(scoreboardPointPresetId({})).toBe('1');
  });

  it('marks one leader, several tied teams, or nobody at zero', () => {
    expect([...scoreboardLeaders([team('a', 3), team('b', 1)])]).toEqual([
      ['a', 'leader'],
    ]);
    expect([...scoreboardLeaders([team('a', 3), team('b', 3)])]).toEqual([
      ['a', 'tied'],
      ['b', 'tied'],
    ]);
    expect(scoreboardLeaders([team('a', 0), team('b', 0)]).size).toBe(0);
    expect(scoreboardLeaders([team('a', 4)]).size).toBe(0);
  });

  it('gives tied scores the same rank', () => {
    const teams = [team('a', 5), team('b', 5), team('c', 2)];
    expect(teams.map((t) => scoreboardRank(teams, t))).toEqual([1, 1, 3]);
  });
});
