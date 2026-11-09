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
  recordBoardItemPicks,
} from './boardItemPicks';

beforeEach(() => {
  vi.clearAllMocks();
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
