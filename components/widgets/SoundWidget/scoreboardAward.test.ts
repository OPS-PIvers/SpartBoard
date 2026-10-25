import { describe, expect, it } from 'vitest';
import type { ScoreboardConfig, WidgetData } from '@/types';
import { awardPoint, findTeamScoreboard } from './scoreboardAward';

const teams = [
  { id: 'a', name: 'Team A', score: 2 },
  { id: 'b', name: 'Team B', score: 0 },
];
const board = (config: ScoreboardConfig): WidgetData =>
  ({ id: 'sb', type: 'scoreboard', config }) as unknown as WidgetData;

describe('quiet time goal Scoreboard point', () => {
  it('adds one point and records it in history when asked', () => {
    const next = awardPoint({ teams }, 'a', true);
    expect(next.teams?.[0].score).toBe(3);
    expect(next.history?.[0].changes).toEqual([
      { teamId: 'a', from: 2, to: 3 },
    ]);
    expect(awardPoint({ teams }, 'a', false).history).toBeUndefined();
  });

  it('leaves a missing team alone', () => {
    const config = { teams };
    expect(awardPoint(config, 'gone', true)).toBe(config);
  });

  it('finds the Scoreboard holding the team, skipping live quiz boards', () => {
    expect(findTeamScoreboard([board({ teams })], null, 'b')?.id).toBe('sb');
    expect(
      findTeamScoreboard([board({ teams, liveQuizWidgetId: 'q' })], null, 'b')
    ).toBeUndefined();
  });

  it('matches the saved Scoreboard when team ids repeat', () => {
    const second = { ...board({ teams }), id: 'sb2' };
    expect(findTeamScoreboard([board({ teams }), second], 'sb2', 'a')?.id).toBe(
      'sb2'
    );
  });
});
