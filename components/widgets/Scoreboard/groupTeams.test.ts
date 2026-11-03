import { describe, expect, it } from 'vitest';
import type { RandomConfig, ScoreboardTeam } from '@/types';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';
import { randomizerGroups, sameTeams, teamsFromGroups } from './groupTeams';

const name = (n: number) => `Group ${n}`;
const groups = (...ids: string[]) =>
  ids.map((id) => ({ id, names: ['Ana', 'Ben'] }));

describe('randomizerGroups', () => {
  it('returns groups only when the last result is a list of groups', () => {
    const cfg = (lastResult: RandomConfig['lastResult']) =>
      ({ lastResult }) as RandomConfig;
    expect(randomizerGroups(cfg('Ana'))).toBeNull();
    expect(randomizerGroups(cfg(['Ana', 'Ben']))).toBeNull();
    expect(randomizerGroups(cfg([]))).toBeNull();
    expect(randomizerGroups(cfg(null))).toBeNull();
    expect(randomizerGroups(undefined)).toBeNull();
    expect(randomizerGroups(cfg(groups('a', 'b')))).toHaveLength(2);
  });
});

describe('teamsFromGroups', () => {
  it('makes one team per group with shared names and colors', () => {
    const teams = teamsFromGroups(
      groups('a', 'b'),
      [{ id: 'b', name: 'Owls', color: 'bg-red-500' }],
      [],
      name
    );
    expect(teams).toEqual([
      {
        id: 'group-a',
        name: 'Group 1',
        score: 0,
        color: SCOREBOARD_COLORS[0],
        linkedGroupId: 'a',
      },
      {
        id: 'group-b',
        name: 'Owls',
        score: 0,
        color: 'bg-red-500',
        linkedGroupId: 'b',
      },
    ]);
  });

  it('keeps each group slot score when regrouping drops a group', () => {
    const before = teamsFromGroups(groups('a', 'b', 'c'), [], [], name).map(
      (team, i) => ({ ...team, score: i + 1 })
    );
    const after = teamsFromGroups(groups('a', 'b'), [], before, name);
    expect(after.map((team) => [team.id, team.score])).toEqual([
      ['group-a', 1],
      ['group-b', 2],
    ]);
  });

  it('carries a slot score over when the group id changes', () => {
    const before = teamsFromGroups(groups('a', 'b'), [], [], name).map(
      (team) => ({ ...team, score: 5 })
    );
    const after = teamsFromGroups(groups('x', 'b'), [], before, name);
    expect(after[0]).toMatchObject({
      id: 'group-a',
      score: 5,
      linkedGroupId: 'x',
    });
    expect(after[1]).toMatchObject({ id: 'group-b', score: 5 });
  });

  it('replaces hand-made teams instead of reusing their scores', () => {
    const manual: ScoreboardTeam[] = [
      { id: 'team-a', name: 'Team A', score: 9 },
    ];
    const teams = teamsFromGroups(groups('a'), [], manual, name);
    expect(teams[0]).toMatchObject({ id: 'group-a', score: 0 });
  });

  it('never writes undefined fields for a group without an id', () => {
    const [team] = teamsFromGroups([{ names: ['Ana'] }], [], [], name);
    expect(team).not.toHaveProperty('linkedGroupId');
    expect(Object.values(team)).not.toContain(undefined);
  });

  it('is stable, so a synced board writes nothing more', () => {
    const once = teamsFromGroups(groups('a', 'b'), [], [], name);
    const twice = teamsFromGroups(groups('a', 'b'), [], once, name);
    expect(sameTeams(once, twice)).toBe(true);
  });
});
