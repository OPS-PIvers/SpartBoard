import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useQuizPlcShare } from '@/hooks/useQuizPlcShare';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { endTourSandbox, startTourSandbox } from '@/utils/tourSandbox';
import type {
  Plc,
  QuizAssignment,
  QuizBehaviorSettings,
  QuizData,
  QuizMetadata,
} from '@/types';

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/functions')>()),
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __db: true },
  functions: { __functions: true },
  auth: {},
  storage: {},
  isAuthBypass: false,
  isConfigured: true,
}));

const mockDoc = doc as Mock;
const mockSetDoc = setDoc as Mock;
const mockHttpsCallable = httpsCallable as Mock;

type Args = Parameters<typeof useQuizPlcShare>[0];
type User = NonNullable<Args['user']>;

const teacher = (over: Partial<User> = {}): User =>
  ({
    uid: 'teacher-1',
    email: 'Teacher@School.org',
    displayName: 'Ms. T',
    ...over,
  }) as User;

const plc = (id: string, name: string, memberEmail?: string): Plc =>
  ({
    id,
    name,
    leadUid: 'teacher-1',
    memberUids: ['teacher-1'],
    memberEmails: memberEmail ? { 'teacher-1': memberEmail } : {},
    members: {},
  }) as unknown as Plc;

const meta = (id: string, over: Partial<QuizMetadata> = {}): QuizMetadata =>
  ({
    id,
    driveFileId: `drive-${id}`,
    title: `Title ${id}`,
    ...over,
  }) as QuizMetadata;

const quizData = (id: string, over: Partial<QuizData> = {}): QuizData =>
  ({
    id,
    title: `Data ${id}`,
    questions: [{ id: `${id}-q1` }, { id: `${id}-q2` }],
    ...over,
  }) as unknown as QuizData;

const assignment = (over: Partial<QuizAssignment> = {}): QuizAssignment =>
  ({
    id: 'asg-1',
    quizId: 'q1',
    quizTitle: 'Fractions',
    ...over,
  }) as QuizAssignment;

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('useQuizPlcShare', () => {
  const calls: string[] = [];
  const addToast = vi.fn<Args['addToast']>((msg, type) => {
    calls.push(`toast:${type}:${msg}`);
  });
  const showConfirm = vi.fn<Args['showConfirm']>();
  const loadQuizData = vi.fn<Args['loadQuizData']>();
  const saveQuiz = vi.fn<Args['saveQuiz']>();
  const attachSyncLinkage = vi.fn<Args['attachSyncLinkage']>();
  const loadSyncedTranslations = vi.fn<Args['loadSyncedTranslations']>();
  const shareAssignmentWithPlc = vi.fn<Args['shareAssignmentWithPlc']>();
  const stopSharingAssignmentWithPlc =
    vi.fn<Args['stopSharingAssignmentWithPlc']>();
  const setSharePlcResultsTarget = vi.fn<Args['setSharePlcResultsTarget']>();
  const leaveCallable = vi.fn();
  let uuidCount = 0;
  let consoleError: MockInstance<typeof console.error>;

  const baseArgs = (over: Partial<Args> = {}): Args => ({
    user: teacher(),
    plcs: [plc('plc-1', 'Math Team')],
    banks: [],
    sharedBankSources: [],
    loadQuizData,
    saveQuiz,
    attachSyncLinkage,
    loadSyncedTranslations,
    addToast,
    showConfirm,
    shareAssignmentWithPlc,
    stopSharingAssignmentWithPlc,
    setSharePlcResultsTarget,
    ...over,
  });

  const setDocPayload = (path: string): unknown =>
    mockSetDoc.mock.calls.find(
      ([ref]) => (ref as { path: string }).path === path
    )?.[1];

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    uuidCount = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        `uuid-${++uuidCount}` as `${string}-${string}-${string}-${string}-${string}`
    );
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) => ({
      path: segs.join('/'),
    }));
    mockSetDoc.mockImplementation((ref: { path: string }) => {
      calls.push(`setDoc:${ref.path}`);
      return Promise.resolve();
    });
    leaveCallable.mockImplementation((payload: { groupId: string }) => {
      calls.push(`leave:${payload.groupId}`);
      return Promise.resolve({ data: { ok: true } });
    });
    mockHttpsCallable.mockImplementation(
      (_fns: unknown, name: string) => (payload: { groupId: string }) => {
        calls.push(`callable:${name}`);
        return leaveCallable(payload) as Promise<unknown>;
      }
    );
    loadQuizData.mockImplementation((driveFileId: string) => {
      calls.push(`loadQuizData:${driveFileId}`);
      return Promise.resolve(quizData(driveFileId.replace('drive-', '')));
    });
    saveQuiz.mockImplementation((_data, driveFileId) => {
      calls.push(`saveQuiz:${driveFileId}`);
      return Promise.resolve({} as never);
    });
    attachSyncLinkage.mockImplementation((quizId, linkage) => {
      calls.push(`attachSyncLinkage:${quizId}:${linkage.groupId}`);
      return Promise.resolve();
    });
    loadSyncedTranslations.mockImplementation((quizMeta) => {
      calls.push(`loadSyncedTranslations:${quizMeta.id}`);
      return Promise.resolve({ complete: false, translations: {} });
    });
    shareAssignmentWithPlc.mockImplementation((id) => {
      calls.push(`shareAssignmentWithPlc:${id}`);
      return Promise.resolve();
    });
    stopSharingAssignmentWithPlc.mockImplementation((id) => {
      calls.push(`stopSharingAssignmentWithPlc:${id}`);
      return Promise.resolve();
    });
    showConfirm.mockResolvedValue(true);
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    endTourSandbox();
    vi.restoreAllMocks();
  });

  describe('onShareWithPlc / onBulkShareWithPlc', () => {
    it('toasts and opens nothing when the teacher has no team', () => {
      const { result } = renderHook(() =>
        useQuizPlcShare(baseArgs({ plcs: [] }))
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      act(() => result.current.onBulkShareWithPlc([meta('q1'), meta('q2')]));
      expect(addToast.mock.calls).toEqual([
        [
          'Join a team under My Teams in the sidebar to share quizzes with teammates.',
          'info',
        ],
        [
          'Join a team under My Teams in the sidebar to share quizzes with teammates.',
          'info',
        ],
      ]);
      expect(result.current.shareWithPlcTargets).toEqual([]);
    });

    it('opens the picker on one quiz or on every selected quiz', () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() => result.current.onShareWithPlc(meta('q1')));
      expect(result.current.shareWithPlcTargets).toEqual([meta('q1')]);
      act(() => result.current.onBulkShareWithPlc([meta('q2'), meta('q3')]));
      expect(result.current.shareWithPlcTargets).toEqual([
        meta('q2'),
        meta('q3'),
      ]);
      act(() => result.current.setShareWithPlcTargets([]));
      expect(result.current.shareWithPlcTargets).toEqual([]);
      expect(addToast).not.toHaveBeenCalled();
    });
  });

  describe('onConfirmShareWithPlc', () => {
    it('mints a group, links it, then writes the PLC header, in that order', async () => {
      const behavior: QuizBehaviorSettings = {
        ...DEFAULT_QUIZ_BEHAVIOR,
        sessionMode: 'student',
        attemptLimit: 2,
      };
      const { result } = renderHook(() =>
        useQuizPlcShare(
          baseArgs({ plcs: [plc('plc-1', 'Math Team', ' Lead@School.org ')] })
        )
      );
      act(() => result.current.onShareWithPlc(meta('q1', { behavior })));
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));

      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'loadSyncedTranslations:q1',
        'setDoc:synced_quizzes/uuid-1',
        'attachSyncLinkage:q1:uuid-1',
        'setDoc:plcs/plc-1/quizzes/uuid-2',
        'toast:success:Shared with Math Team.',
      ]);
      expect(loadSyncedTranslations).toHaveBeenCalledWith(
        meta('q1', { behavior }),
        {
          title: 'Data q1',
          questions: quizData('q1').questions,
          stimuli: undefined,
          behavior,
        }
      );
      expect(attachSyncLinkage).toHaveBeenCalledWith('q1', {
        groupId: 'uuid-1',
        lastSyncedVersion: 1,
      });
      expect(setDocPayload('synced_quizzes/uuid-1')).toEqual({
        id: 'uuid-1',
        version: 1,
        title: 'Data q1',
        questions: quizData('q1').questions,
        participants: { 'teacher-1': { joinedAt: 5000 } },
        plcId: 'plc-1',
        behavior,
        createdAt: 5000,
        updatedAt: 5000,
        updatedBy: 'teacher-1',
      });
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-2')).toEqual({
        id: 'uuid-2',
        title: 'Data q1',
        questionCount: 2,
        syncGroupId: 'uuid-1',
        sharedBy: 'teacher-1',
        sharedByEmail: 'lead@school.org',
        sharedByName: 'Ms. T',
        sharedAt: 5000,
        updatedAt: 5000,
        sessionMode: 'student',
        sessionOptions: behavior.sessionOptions,
        attemptLimit: 2,
        quizId: 'q1',
      });
      expect(result.current.shareWithPlcTargets).toEqual([]);
    });

    it('seeds complete translations and falls back to the account email and default behavior', async () => {
      loadSyncedTranslations.mockResolvedValue({
        complete: true,
        translations: { es: { title: 'Hola' } as never },
      });
      const { result } = renderHook(() =>
        useQuizPlcShare(baseArgs({ user: teacher({ displayName: null }) }))
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));

      expect(setDocPayload('synced_quizzes/uuid-1')).toMatchObject({
        translations: { es: { title: 'Hola' } },
      });
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-2')).toMatchObject({
        sharedByEmail: 'teacher@school.org',
        sharedByName: '',
        sessionMode: DEFAULT_QUIZ_BEHAVIOR.sessionMode,
        sessionOptions: DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
        attemptLimit: DEFAULT_QUIZ_BEHAVIOR.attemptLimit,
      });
    });

    it('sends an empty email when neither the PLC nor the account has one', async () => {
      const { result } = renderHook(() =>
        useQuizPlcShare(baseArgs({ user: teacher({ email: null }) }))
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-2')).toMatchObject({
        sharedByEmail: '',
      });
    });

    it('reuses an existing sync group and writes only the header', async () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() =>
        result.current.onShareWithPlc(
          meta('q1', { sync: { groupId: 'g-old', lastSyncedVersion: 4 } })
        )
      );
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));
      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'setDoc:plcs/plc-1/quizzes/uuid-1',
        'toast:success:Shared with Math Team.',
      ]);
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-1')).toMatchObject({
        syncGroupId: 'g-old',
      });
    });

    it('shares several quizzes one after another and counts them', async () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() =>
        result.current.onBulkShareWithPlc([
          meta('q1', { sync: { groupId: 'g1', lastSyncedVersion: 1 } }),
          meta('q2', { sync: { groupId: 'g2', lastSyncedVersion: 1 } }),
        ])
      );
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));
      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'setDoc:plcs/plc-1/quizzes/uuid-1',
        'loadQuizData:drive-q2',
        'setDoc:plcs/plc-1/quizzes/uuid-2',
        'toast:success:Shared 2 quizzes with Math Team.',
      ]);
      expect(result.current.shareWithPlcTargets).toEqual([]);
    });

    it('reports a partial failure with a warning, then throws the failed titles', async () => {
      loadQuizData.mockImplementation((driveFileId: string) => {
        calls.push(`loadQuizData:${driveFileId}`);
        if (driveFileId === 'drive-q2') {
          return Promise.reject(new Error('Drive down'));
        }
        return Promise.resolve(quizData(driveFileId.replace('drive-', '')));
      });
      const targets = [
        meta('q1', { sync: { groupId: 'g1', lastSyncedVersion: 1 } }),
        meta('q2', { title: '' }),
        meta('q3', { sync: { groupId: 'g3', lastSyncedVersion: 1 } }),
      ];
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() => result.current.onBulkShareWithPlc(targets));
      let thrown: unknown;
      await act(async () => {
        await result.current.onConfirmShareWithPlc('plc-1').catch((e) => {
          thrown = e;
        });
      });
      expect(thrown).toEqual(
        new Error('Failed to share: Untitled. Try again.')
      );
      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'setDoc:plcs/plc-1/quizzes/uuid-1',
        'loadQuizData:drive-q2',
        'loadQuizData:drive-q3',
        'setDoc:plcs/plc-1/quizzes/uuid-2',
        'toast:warning:Shared 2 of 3 quizzes with Math Team.',
      ]);
      expect(consoleError).toHaveBeenCalled();
      expect(result.current.shareWithPlcTargets).toEqual(targets);
    });

    it('throws without a warning when every quiz fails, naming a missing PLC as "your PLC"', async () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() => result.current.onBulkShareWithPlc([meta('q1'), meta('q2')]));
      let thrown: unknown;
      await act(async () => {
        await result.current.onConfirmShareWithPlc('gone').catch((e) => {
          thrown = e;
        });
      });
      expect(thrown).toEqual(
        new Error('Failed to share: Title q1, Title q2. Try again.')
      );
      expect(calls).toEqual([]);
      expect(addToast).not.toHaveBeenCalled();
    });

    it('fails when signed out', async () => {
      const { result } = renderHook(() =>
        useQuizPlcShare(baseArgs({ user: null }))
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      await expect(
        result.current.onConfirmShareWithPlc('plc-1')
      ).rejects.toThrow('Failed to share: Title q1. Try again.');
      expect(loadQuizData).not.toHaveBeenCalled();
    });

    it('writes nothing for a tour sandbox quiz but still reports success', async () => {
      startTourSandbox();
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() => result.current.onShareWithPlc(meta('q1')));
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));
      expect(calls).toEqual(['toast:success:Shared with Math Team.']);
    });

    it('leaves the new group when linking fails and logs a failed leave', async () => {
      attachSyncLinkage.mockRejectedValue(new Error('link failed'));
      leaveCallable.mockImplementation((payload: { groupId: string }) => {
        calls.push(`leave:${payload.groupId}`);
        return Promise.reject(new Error('leave failed'));
      });
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      act(() => result.current.onShareWithPlc(meta('q1')));
      await expect(
        result.current.onConfirmShareWithPlc('plc-1')
      ).rejects.toThrow('Failed to share: Title q1. Try again.');
      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'loadSyncedTranslations:q1',
        'setDoc:synced_quizzes/uuid-1',
        'callable:leaveSyncedQuizGroup',
        'leave:uuid-1',
      ]);
      const scopes = consoleError.mock.calls.map((c) => String(c[0]));
      expect(scopes.some((s) => s.includes('shareWithPlc.rollbackLeave'))).toBe(
        true
      );
    });

    it('blocks a bank slot whose bank is not shared with the PLC', async () => {
      loadQuizData.mockResolvedValue(
        quizData('q1', {
          bankSlots: [
            {
              id: 's1',
              mode: 'random',
              bankId: 'bank-1',
              bankTitle: 'Unit 1',
              count: 3,
            },
          ],
        })
      );
      const { result } = renderHook(() =>
        useQuizPlcShare(
          baseArgs({
            banks: [{ id: 'bank-1', title: 'Unit 1' } as never],
          })
        )
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      await act(async () => {
        await result.current
          .onConfirmShareWithPlc('plc-1')
          .catch(() => undefined);
      });
      const logged = consoleError.mock.calls.flat().map(String).join(' ');
      expect(logged).toContain(
        'Share the bank "Unit 1" with this PLC first (Banks tab → Share with PLC).'
      );
      expect(saveQuiz).not.toHaveBeenCalled();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('saves reconciled bank slots before minting the group', async () => {
      loadQuizData.mockImplementation((driveFileId: string) => {
        calls.push(`loadQuizData:${driveFileId}`);
        return Promise.resolve(
          quizData('q1', {
            bankSlots: [
              {
                id: 's1',
                mode: 'random',
                bankId: 'bank-1',
                bankTitle: 'Unit 1',
                count: 3,
              },
            ],
          })
        );
      });
      const { result } = renderHook(() =>
        useQuizPlcShare(
          baseArgs({
            banks: [
              {
                id: 'bank-1',
                title: 'Unit 1',
                sync: { groupId: 'bg-1', plcIds: ['plc-1'] },
              } as never,
            ],
          })
        )
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      await act(() => result.current.onConfirmShareWithPlc('plc-1'));
      expect(calls.slice(0, 3)).toEqual([
        'loadQuizData:drive-q1',
        'saveQuiz:drive-q1',
        'loadSyncedTranslations:q1',
      ]);
      expect(saveQuiz.mock.calls[0][0].bankSlots).toEqual([
        {
          id: 's1',
          mode: 'random',
          bankId: 'bank-1',
          bankTitle: 'Unit 1',
          count: 3,
          syncGroupId: 'bg-1',
          syncOwnerUid: 'teacher-1',
        },
      ]);
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-2')).toMatchObject({
        questionCount: 5,
      });
    });

    it('keeps the targets, PLCs and user of the render it came from across a change', async () => {
      const gate = deferred<QuizData>();
      loadQuizData.mockImplementation((driveFileId: string) => {
        calls.push(`loadQuizData:${driveFileId}`);
        return gate.promise;
      });
      const { result, rerender } = renderHook(
        (args: Args) => useQuizPlcShare(args),
        { initialProps: baseArgs() }
      );
      act(() => result.current.onShareWithPlc(meta('q1')));
      const confirm = result.current.onConfirmShareWithPlc;
      let done!: Promise<void>;
      act(() => {
        done = confirm('plc-1');
      });
      act(() => result.current.onShareWithPlc(meta('q9')));
      rerender(
        baseArgs({
          user: teacher({ uid: 'teacher-2', displayName: 'Other' }),
          plcs: [plc('plc-1', 'Renamed Team')],
        })
      );
      await act(async () => {
        gate.resolve(quizData('q1'));
        await done;
      });
      expect(calls).toEqual([
        'loadQuizData:drive-q1',
        'loadSyncedTranslations:q1',
        'setDoc:synced_quizzes/uuid-1',
        'attachSyncLinkage:q1:uuid-1',
        'setDoc:plcs/plc-1/quizzes/uuid-2',
        'toast:success:Shared with Math Team.',
      ]);
      expect(setDocPayload('plcs/plc-1/quizzes/uuid-2')).toMatchObject({
        sharedBy: 'teacher-1',
        sharedByName: 'Ms. T',
      });
      expect(result.current.shareWithPlcTargets).toEqual([]);
    });
  });

  describe('handleStopSharingPlc', () => {
    it('asks first, then clears the link and toasts', async () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      await act(() =>
        result.current.handleStopSharingPlc(
          assignment({ plc: { name: 'Math Team' } as never })
        )
      );
      expect(showConfirm).toHaveBeenCalledWith(
        'Stop sharing "Fractions" results with Math Team? Its responses leave the team\'s pooled view.',
        {
          title: 'Stop sharing results',
          variant: 'warning',
          confirmLabel: 'Stop sharing',
        }
      );
      expect(calls).toEqual([
        'stopSharingAssignmentWithPlc:asg-1',
        'toast:success:No longer sharing results with Math Team.',
      ]);
    });

    it('does nothing when the teacher cancels', async () => {
      showConfirm.mockResolvedValue(false);
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      await act(() => result.current.handleStopSharingPlc(assignment()));
      expect(showConfirm.mock.calls[0][0]).toBe(
        'Stop sharing "Fractions" results with your PLC? Its responses leave the team\'s pooled view.'
      );
      expect(calls).toEqual([]);
    });

    it('toasts the error message, or a fallback for a non-Error', async () => {
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      stopSharingAssignmentWithPlc.mockRejectedValueOnce(new Error('denied'));
      await act(() => result.current.handleStopSharingPlc(assignment()));
      stopSharingAssignmentWithPlc.mockRejectedValueOnce('nope');
      await act(() => result.current.handleStopSharingPlc(assignment()));
      expect(addToast.mock.calls).toEqual([
        ['denied', 'error'],
        ['Could not stop sharing.', 'error'],
      ]);
    });

    it('keeps its identity until a dependency changes', () => {
      const args = baseArgs();
      const { result, rerender } = renderHook((a: Args) => useQuizPlcShare(a), {
        initialProps: args,
      });
      const first = result.current.handleStopSharingPlc;
      rerender({ ...args, plcs: [], user: teacher({ uid: 'x' }) });
      expect(result.current.handleStopSharingPlc).toBe(first);
      rerender({ ...args, showConfirm: vi.fn() });
      expect(result.current.handleStopSharingPlc).not.toBe(first);
    });
  });

  describe('onConfirmSharePlcResults', () => {
    it('pools the results, toasts and closes the modal', async () => {
      const team = plc('plc-1', 'Math Team');
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      await act(() =>
        result.current.onConfirmSharePlcResults(assignment(), team, 'pool-1')
      );
      expect(shareAssignmentWithPlc).toHaveBeenCalledWith('asg-1', {
        plc: team,
        poolSyncGroupId: 'pool-1',
      });
      expect(calls).toEqual([
        'shareAssignmentWithPlc:asg-1',
        'toast:success:Results now pool with Math Team.',
      ]);
      expect(setSharePlcResultsTarget).toHaveBeenCalledWith(null);
    });

    it('rethrows a failure and leaves the modal open', async () => {
      shareAssignmentWithPlc.mockRejectedValue(new Error('rules'));
      const { result } = renderHook(() => useQuizPlcShare(baseArgs()));
      await expect(
        result.current.onConfirmSharePlcResults(
          assignment(),
          plc('plc-1', 'Math Team'),
          'pool-1'
        )
      ).rejects.toThrow('rules');
      expect(addToast).not.toHaveBeenCalled();
      expect(setSharePlcResultsTarget).not.toHaveBeenCalled();
    });
  });
});
