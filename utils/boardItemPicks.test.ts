import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  arrayUnion: vi.fn((...items: unknown[]) => ({ arrayUnion: items })),
  doc: vi.fn((...parts: unknown[]) => ({ path: parts.slice(1).join('/') })),
}));
vi.mock('firebase/firestore', () => fs);
vi.mock('@/config/firebase', () => ({ db: {} }));

import {
  boardItemPickFromPatch,
  boardItemPickOf,
  isBoardItemPicked,
  ownBoardItemPicks,
  readBoardItemPicks,
  recordBoardItemPicks,
  resetBoardItemPickSeeds,
  seedLegacyBoardItemPicks,
} from './boardItemPicks';

beforeEach(() => {
  vi.clearAllMocks();
  resetBoardItemPickSeeds();
});

const snap = (data: unknown) => ({
  exists: () => data !== null,
  data: () => data,
});

describe('boardItemPickOf', () => {
  it('names the library item each widget shows', () => {
    expect(boardItemPickOf('quiz', { selectedQuizId: 'q' })).toBe('quiz_q');
    expect(boardItemPickOf('video-activity', { selectedActivityId: 'v' })).toBe(
      'videoActivity_v'
    );
    expect(boardItemPickOf('guided-learning', { playerSetId: 'g' })).toBe(
      'guidedLearning_g'
    );
    expect(boardItemPickOf('flashcards', { presentSetId: 'f' })).toBe(
      'flashcards_f'
    );
    expect(boardItemPickOf('smartNotebook', { activeNotebookId: 'n' })).toBe(
      'notebook_n'
    );
    expect(boardItemPickOf('projects', { projectId: 'p' })).toBe('project_p');
  });

  it('is null for other widgets and empty selections', () => {
    expect(boardItemPickOf('clock', { selectedQuizId: 'q' })).toBeNull();
    expect(boardItemPickOf('quiz', { selectedQuizId: null })).toBeNull();
    expect(boardItemPickOf('quiz', undefined)).toBeNull();
  });
});

describe('boardItemPickFromPatch', () => {
  it('is the item a patch newly selects', () => {
    expect(
      boardItemPickFromPatch(
        'quiz',
        { selectedQuizId: 'old' },
        { selectedQuizId: 'new' }
      )
    ).toBe('quiz_new');
    expect(
      boardItemPickFromPatch('quiz', undefined, { selectedQuizId: 'q' })
    ).toBe('quiz_q');
  });

  it('ignores a spread config that keeps the current item, and patches without it', () => {
    const config = { selectedQuizId: 'planted', view: 'manager' };
    expect(
      boardItemPickFromPatch('quiz', config, { ...config, view: 'editor' })
    ).toBeNull();
    expect(
      boardItemPickFromPatch('quiz', config, { view: 'editor' })
    ).toBeNull();
    expect(
      boardItemPickFromPatch('quiz', config, { selectedQuizId: null })
    ).toBeNull();
  });
});

describe('recording and reading picks', () => {
  it('adds picks to the teacher’s own doc for the share', async () => {
    fs.setDoc.mockResolvedValue(undefined);
    await recordBoardItemPicks('me', 'share-1', ['quiz_q']);
    expect(fs.setDoc).toHaveBeenCalledWith(
      { path: 'users/me/board_item_picks/share-1' },
      { items: { arrayUnion: ['quiz_q'] } },
      { merge: true }
    );
  });

  it('writes nothing for no picks and never throws', async () => {
    await recordBoardItemPicks('me', 'share-1', []);
    expect(fs.setDoc).not.toHaveBeenCalled();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fs.setDoc.mockRejectedValue(new Error('offline'));
    await expect(
      recordBoardItemPicks('me', 'share-1', ['quiz_q'])
    ).resolves.toBeUndefined();
  });

  it('reads whether an item was picked', async () => {
    fs.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ items: ['quiz_q'] }),
    });
    await expect(isBoardItemPicked('me', 'share-1', 'quiz_q')).resolves.toBe(
      true
    );
    await expect(isBoardItemPicked('me', 'share-1', 'quiz_x')).resolves.toBe(
      false
    );
    fs.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(isBoardItemPicked('me', 'share-1', 'quiz_q')).resolves.toBe(
      false
    );
  });
});

describe('ownBoardItemPicks', () => {
  it('keeps unstamped items and the teacher’s own, never another teacher’s', () => {
    expect(
      ownBoardItemPicks(
        [
          { type: 'quiz', config: { selectedQuizId: 'mine' } },
          {
            type: 'quiz',
            config: { selectedQuizId: 'stamped', selectedQuizOwnerUid: 'me' },
          },
          {
            type: 'video-activity',
            config: {
              selectedActivityId: 'theirs',
              selectedActivityOwnerUid: 'co',
            },
          },
          { type: 'quiz', config: { selectedQuizId: 'mine' } },
          { type: 'clock', config: {} },
        ],
        'me'
      )
    ).toEqual(['quiz_mine', 'quiz_stamped']);
  });
});

describe('readBoardItemPicks', () => {
  it('tells a missing picks doc from an empty one', async () => {
    fs.getDoc.mockResolvedValue(snap(null));
    await expect(readBoardItemPicks('me', 'old')).resolves.toBeNull();
    fs.getDoc.mockResolvedValue(snap({ items: [] }));
    await expect(readBoardItemPicks('me', 'old')).resolves.toEqual([]);
  });
});

describe('seedLegacyBoardItemPicks', () => {
  const PICKS = 'users/me/board_item_picks/share-1';
  const SHARE = 'shared_boards/share-1';
  let stored: Record<string, unknown> = {};
  beforeEach(() => {
    stored = {
      [SHARE]: {
        sharedAt: Date.UTC(2026, 9, 1),
        widgets: [
          { type: 'quiz', config: { selectedQuizId: 'q1' } },
          {
            type: 'flashcards',
            config: { presentSetId: 'f1', presentSetOwnerUid: 'co' },
          },
        ],
      },
    };
    fs.getDoc.mockImplementation((ref: { path: string }) =>
      Promise.resolve(snap(stored[ref.path] ?? null))
    );
    fs.setDoc.mockResolvedValue(undefined);
  });

  it('picks the teacher’s own board items once a session when the share has no picks doc', async () => {
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(true);
    expect(fs.setDoc).toHaveBeenCalledWith(
      { path: PICKS },
      { items: { arrayUnion: ['quiz_q1'] }, legacySeeded: true },
      { merge: true }
    );
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(true);
    expect(fs.getDoc).toHaveBeenCalledTimes(2);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });

  it('still seeds a legacy share whose picks doc holds only a later pick', async () => {
    stored[PICKS] = { items: ['quiz_new'] };
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(true);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });

  it('never reseeds a share it already seeded', async () => {
    stored[PICKS] = { items: [], legacySeeded: true };
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(
      false
    );
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('never seeds a share made after picks existed, even with no picks doc', async () => {
    (stored[SHARE] as Record<string, unknown>).sharedAt = Date.UTC(
      2026,
      10,
      11
    );
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(
      false
    );
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('tries again after a failed seed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fs.setDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(
      false
    );
    await expect(seedLegacyBoardItemPicks('me', 'share-1')).resolves.toBe(true);
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });
});
