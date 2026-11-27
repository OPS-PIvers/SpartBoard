// PLC updates, goals, links and mentoring tasks write through plcTeamItemsV1, not straight to Firestore.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlcUpdates } from '@/hooks/usePlcUpdates';
import { usePlcGoals } from '@/hooks/usePlcGoals';
import { usePlcLinks } from '@/hooks/usePlcLinks';
import { deleteMentoringTask, postMentoringTask } from '@/hooks/useMentoring';
import { callPlcTeamItems } from '@/utils/plcTeamItemsClient';
import type { Plc } from '@/types';

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => 'col'),
  doc: vi.fn(() => 'doc'),
  query: vi.fn(() => 'query'),
  onSnapshot: vi.fn(() => () => undefined),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', displayName: 'U', email: 'u@x' } }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/utils/plcTeamItemsClient', () => ({
  PLC_TODO_ARCHIVE_CHUNK: 100,
  callPlcTeamItems: vi.fn(),
}));

const call = callPlcTeamItems as Mock;
const draft = {
  title: ' Hi ',
  body: ' Body ',
  requiresAck: true,
  inDigest: false,
};

beforeEach(() => {
  call.mockReset();
  call.mockResolvedValue({ id: 'new-id' });
});

describe('usePlcUpdates writes', () => {
  it('posts, edits, pins and deletes on the server', async () => {
    const { result } = renderHook(() => usePlcUpdates('p'));
    await act(async () => {
      await result.current.postUpdate({ ...draft, linkUrl: 'https://a.b' });
      await result.current.editUpdate('u1', draft);
      await result.current.setPinned('u1', true);
      await result.current.removeUpdate('u1');
    });
    expect(call.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      {
        action: 'postUpdate',
        plcId: 'p',
        draft: {
          title: 'Hi',
          body: 'Body',
          linkUrl: 'https://a.b',
          requiresAck: true,
          inDigest: false,
        },
      },
      {
        action: 'editUpdate',
        plcId: 'p',
        updateId: 'u1',
        draft: {
          title: 'Hi',
          body: 'Body',
          requiresAck: true,
          inDigest: false,
        },
      },
      { action: 'pinUpdate', plcId: 'p', updateId: 'u1', pinned: true },
      { action: 'deleteUpdate', plcId: 'p', updateId: 'u1' },
    ]);
  });
});

describe('usePlcGoals writes', () => {
  it('creates, updates with progress and deletes on the server', async () => {
    const { result } = renderHook(() => usePlcGoals('p'));
    let created = '';
    await act(async () => {
      created = await result.current.saveGoal({
        title: ' Goal ',
        measure: '  ',
        practices: [{ id: 'x', text: ' read ' }],
        order: 2,
      });
      await result.current.saveGoal({
        id: 'g1',
        title: 'Goal',
        practices: [],
        order: 0,
        progress: { baseline: 10, current: 140 },
      });
      await result.current.deleteGoal('g1');
    });
    expect(created).toBe('new-id');
    expect(call.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      {
        action: 'saveGoal',
        plcId: 'p',
        goal: {
          title: 'Goal',
          practices: [{ id: 'x', text: 'read' }],
          order: 2,
        },
      },
      {
        action: 'saveGoal',
        plcId: 'p',
        goalId: 'g1',
        goal: {
          title: 'Goal',
          progress: { baseline: 10 },
          practices: [],
          order: 0,
        },
      },
      { action: 'deleteGoal', plcId: 'p', goalId: 'g1' },
    ]);
  });
});

describe('usePlcLinks writes', () => {
  it('adds an https link and deletes on the server', async () => {
    const { result } = renderHook(() => usePlcLinks('p'));
    await act(async () => {
      await result.current.addLink({
        title: ' Site ',
        url: 'http://a.b',
        note: ' ',
      });
      await result.current.removeLink('l1');
    });
    expect(call.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      {
        action: 'addLink',
        plcId: 'p',
        link: { title: 'Site', url: 'https://a.b', note: '' },
      },
      { action: 'deleteLink', plcId: 'p', linkId: 'l1' },
    ]);
  });
});

describe('mentoring task writes', () => {
  it('posts and deletes tasks on the server', async () => {
    const input = {
      title: 'Observe',
      instructions: '',
      dueDate: '2026-12-01',
      submitter: 'mentee' as const,
      templateDoc: null,
    };
    const res = await postMentoringTask(
      { id: 'p' } as Plc,
      input,
      'u1',
      [],
      null
    );
    await deleteMentoringTask('p', 't1');
    expect(res).toEqual({ taskId: 'new-id', failedPairs: [] });
    expect(call.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      { action: 'postTask', plcId: 'p', task: input },
      { action: 'deleteTask', plcId: 'p', taskId: 't1' },
    ]);
  });
});
