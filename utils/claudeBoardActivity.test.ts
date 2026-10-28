import { describe, it, expect } from 'vitest';
import type { Dashboard } from '@/types';
import {
  CLAUDE_EDIT_FRESH_MS,
  claudeBadgeFor,
  claudeEditStamps,
  findNewClaudeEdits,
} from './claudeBoardActivity';

const NOW = 1_000_000_000;

const board = (id: string, extra: Partial<Dashboard> = {}): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1,
  ...extra,
});

describe('findNewClaudeEdits', () => {
  it('finds a board whose Claude stamp moved', () => {
    const before = [board('a', { claudeEditedAt: NOW - 5000 }), board('b')];
    const after = [board('a', { claudeEditedAt: NOW - 10 }), board('b')];

    const found = findNewClaudeEdits(claudeEditStamps(before), after, 'b', NOW);

    expect(found.map((b) => b.id)).toEqual(['a']);
  });

  it('finds a board Claude just made', () => {
    const after = [board('b'), board('new', { claudeEditedAt: NOW - 10 })];

    const found = findNewClaudeEdits(
      claudeEditStamps([board('b')]),
      after,
      'b',
      NOW
    );

    expect(found.map((b) => b.id)).toEqual(['new']);
  });

  it('skips the board on screen', () => {
    const after = [board('a', { claudeEditedAt: NOW - 10 })];

    expect(
      findNewClaudeEdits(claudeEditStamps([board('a')]), after, 'a', NOW)
    ).toEqual([]);
  });

  it('skips an unchanged stamp and a teacher edit', () => {
    const before = [board('a', { claudeEditedAt: NOW - 10 })];
    const after = [board('a', { claudeEditedAt: NOW - 10, updatedAt: NOW })];

    expect(
      findNewClaudeEdits(claudeEditStamps(before), after, 'x', NOW)
    ).toEqual([]);
  });

  it('skips stale stamps so a late load never announces old edits', () => {
    const after = [board('a', { claudeEditedAt: NOW - CLAUDE_EDIT_FRESH_MS })];

    expect(findNewClaudeEdits(new Map(), after, 'x', NOW)).toEqual([]);
  });

  it('lists the newest edit first', () => {
    const after = [
      board('a', { claudeEditedAt: NOW - 30 }),
      board('b', { claudeEditedAt: NOW - 10 }),
    ];

    expect(
      findNewClaudeEdits(new Map(), after, 'x', NOW).map((b) => b.id)
    ).toEqual(['b', 'a']);
  });
});

describe('claudeBadgeFor', () => {
  it('shows the action until the board is opened', () => {
    expect(
      claudeBadgeFor(
        board('a', { claudeAction: 'created', claudeUnseen: true })
      )
    ).toBe('created');
    expect(
      claudeBadgeFor(board('a', { claudeAction: 'edited', claudeUnseen: true }))
    ).toBe('edited');
    expect(claudeBadgeFor(board('a', { claudeAction: 'edited' }))).toBeNull();
    expect(claudeBadgeFor(board('a', { claudeUnseen: true }))).toBeNull();
  });
});
