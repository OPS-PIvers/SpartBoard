import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlashcardAssignment, Plc } from '@/types';
import { useFlashcardPlcSharing } from '@/components/widgets/Flashcards/useFlashcardPlcSharing';

const plc = { id: 'plc1', name: 'Team' } as Plc;
const mocks = vi.hoisted(() => ({
  writeResult: vi.fn(() => Promise.resolve()),
  deleteResult: vi.fn(() => Promise.resolve()),
  loadSummary: vi.fn(() => Promise.resolve({})),
  writeSet: vi.fn(),
  updateShared: vi.fn((_title: string, run: () => Promise<unknown>) =>
    run().then<boolean>(() => true)
  ),
  flagOn: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'T', email: 't@x.org' },
    canAccessFeature: (id: string) =>
      id === 'plc-update-shared-copy' && mocks.flagOn,
  }),
}));
vi.mock('@/hooks/usePlcLibraryActions', () => ({
  usePlcSharedCopyUpdate: () => mocks.updateShared,
}));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [plc] }) }));
vi.mock('@/utils/plc', () => ({
  canEditPlcContent: () => true,
  getPlcMemberEmail: () => 't@x.org',
}));
vi.mock('@/hooks/usePlcFlashcards', () => ({
  deletePlcFlashcardResult: mocks.deleteResult,
  loadFlashcardResultSummary: mocks.loadSummary,
  writePlcFlashcardResult: mocks.writeResult,
  writePlcFlashcardSetEntry: mocks.writeSet,
}));

const assignment = (over: Partial<FlashcardAssignment>) =>
  ({
    id: 'a1',
    sessionId: 'a1',
    setId: 's1',
    setTitle: 'Set',
    kind: 'check',
    plcShare: { plcId: 'plc1', sharedAt: 1 },
    ...over,
  }) as FlashcardAssignment;

const setup = () => {
  const setPlcShare = vi.fn(() => Promise.resolve());
  const linkCheck = vi.fn(() => Promise.resolve());
  const { result } = renderHook(() =>
    useFlashcardPlcSharing({
      enabled: true,
      addToast: vi.fn(),
      setPlcShare,
      linkCheck,
    })
  );
  return { result, setPlcShare, linkCheck };
};

describe('useFlashcardPlcSharing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links a student check instead of writing a results doc', async () => {
    const { result, linkCheck, setPlcShare } = setup();
    await act(async () => {
      await result.current.shareNewAssignmentResults(assignment({}), plc);
    });
    expect(linkCheck).toHaveBeenCalledWith(expect.anything(), plc);
    expect(mocks.writeResult).not.toHaveBeenCalled();
    expect(setPlcShare).toHaveBeenCalled();
  });

  it('unlinks when saving the share fails', async () => {
    const { result, linkCheck, setPlcShare } = setup();
    setPlcShare.mockRejectedValueOnce(new Error('nope'));
    let ok = true;
    await act(async () => {
      ok = await result.current.shareNewAssignmentResults(assignment({}), plc);
    });
    expect(ok).toBe(false);
    expect(linkCheck).toHaveBeenLastCalledWith(expect.anything(), null);
  });

  it('keeps the results doc for staff checks', async () => {
    const { result, linkCheck } = setup();
    await act(async () => {
      await result.current.shareNewAssignmentResults(
        assignment({ audience: 'staff' }),
        plc
      );
    });
    expect(linkCheck).not.toHaveBeenCalled();
    expect(mocks.writeResult).toHaveBeenCalled();
  });

  it('stopping a check share unlinks and removes any older results doc', async () => {
    const { result, linkCheck } = setup();
    await act(async () => {
      await result.current.stopSharingResults(assignment({}));
    });
    expect(linkCheck).toHaveBeenCalledWith(expect.anything(), null);
    expect(mocks.deleteResult).toHaveBeenCalledWith('plc1', 'a1');
  });

  it('stopping a study share only removes the results doc', async () => {
    const { result, linkCheck } = setup();
    await act(async () => {
      await result.current.stopSharingResults(assignment({ kind: 'study' }));
    });
    expect(linkCheck).not.toHaveBeenCalled();
    expect(mocks.deleteResult).toHaveBeenCalled();
  });

  const shareSetTo = async (
    result: ReturnType<typeof setup>['result']
  ): Promise<void> => {
    act(() => {
      result.current.shareSet({ id: 's1', title: 'Vocab' } as never);
    });
    const modal = result.current.modal as {
      props: { onConfirm: (plcId: string) => Promise<void> };
    };
    await act(async () => {
      await modal.props.onConfirm('plc1');
    });
  };

  it('offers Update the shared copy for an already-shared set when the flag is on', async () => {
    mocks.flagOn = true;
    mocks.writeSet.mockResolvedValueOnce('already-shared');
    mocks.writeSet.mockResolvedValueOnce('updated');
    const { result } = setup();
    await shareSetTo(result);
    expect(mocks.updateShared).toHaveBeenCalledWith(
      'Vocab',
      expect.any(Function)
    );
    expect(mocks.writeSet).toHaveBeenLastCalledWith(
      'plc1',
      'u1',
      expect.objectContaining({ update: true })
    );
  });

  it('keeps the already-shared notice when the flag is off', async () => {
    mocks.flagOn = false;
    mocks.writeSet.mockResolvedValueOnce('already-shared');
    const { result } = setup();
    await shareSetTo(result);
    expect(mocks.updateShared).not.toHaveBeenCalled();
    expect(mocks.writeSet).toHaveBeenCalledTimes(1);
  });
});
