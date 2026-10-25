import { describe, it, expect } from 'vitest';
import {
  SCOREBOARD_HISTORY_LIMIT,
  appendScoreHistory,
  formatScoreDelta,
  teamScoreHistory,
  undoLastScoreChange,
} from './history';
import type { ScoreboardTeam } from '@/types';

const teams: ScoreboardTeam[] = [
  { id: 'a', name: 'A', score: 3 },
  { id: 'b', name: 'B', score: 5 },
];

describe('scoreboard history', () => {
  it('skips a step that changed nothing', () => {
    expect(appendScoreHistory([], [{ teamId: 'a', from: 0, to: 0 }])).toEqual(
      []
    );
  });

  it('caps the history and keeps the newest steps', () => {
    let history = appendScoreHistory(undefined, [
      { teamId: 'a', from: 0, to: 1 },
    ]);
    for (let i = 1; i < SCOREBOARD_HISTORY_LIMIT + 10; i++) {
      history = appendScoreHistory(history, [
        { teamId: 'a', from: i, to: i + 1 },
      ]);
    }
    expect(history).toHaveLength(SCOREBOARD_HISTORY_LIMIT);
    expect(history[history.length - 1].changes[0].to).toBe(
      SCOREBOARD_HISTORY_LIMIT + 10
    );
  });

  it('undoes the newest step by its delta and pops it', () => {
    const history = appendScoreHistory(
      appendScoreHistory([], [{ teamId: 'a', from: 2, to: 3 }]),
      [{ teamId: 'b', from: 4, to: 5 }]
    );
    const result = undoLastScoreChange(teams, history);
    expect(result?.teams.map((t) => t.score)).toEqual([3, 4]);
    expect(result?.history).toHaveLength(1);
  });

  it('keeps a change made elsewhere since the step', () => {
    const history = appendScoreHistory([], [{ teamId: 'a', from: 1, to: 2 }]);
    // A remote added one more point after this step (2 -> 3).
    const result = undoLastScoreChange(teams, history);
    expect(result?.teams[0].score).toBe(2);
  });

  it('restores every team on a reset step and never goes below zero', () => {
    const history = appendScoreHistory(
      [],
      [
        { teamId: 'a', from: 7, to: 0 },
        { teamId: 'gone', from: 2, to: 0 },
      ],
      { kind: 'reset' }
    );
    const result = undoLastScoreChange(
      [{ id: 'a', name: 'A', score: 0 }],
      history
    );
    expect(result?.teams).toEqual([{ id: 'a', name: 'A', score: 7 }]);
    expect(
      undoLastScoreChange(
        [{ id: 'a', name: 'A', score: 0 }],
        appendScoreHistory([], [{ teamId: 'a', from: 0, to: 4 }])
      )?.teams[0].score
    ).toBe(0);
  });

  it('returns null with nothing to undo', () => {
    expect(undoLastScoreChange(teams, [])).toBeNull();
    expect(undoLastScoreChange(teams, undefined)).toBeNull();
  });

  it('lists one team newest first', () => {
    let history = appendScoreHistory([], [{ teamId: 'a', from: 0, to: 1 }]);
    history = appendScoreHistory(history, [{ teamId: 'b', from: 0, to: 5 }]);
    history = appendScoreHistory(history, [{ teamId: 'a', from: 1, to: 0 }]);
    expect(teamScoreHistory(history, 'a', 8).map((i) => i.delta)).toEqual([
      -1, 1,
    ]);
    expect(formatScoreDelta(5)).toBe('+5');
    expect(formatScoreDelta(-1)).toBe('−1');
  });
});
