import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Plc, QuizData, QuizMetadata } from '@/types';
import {
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
} from '@/hooks/useSyncedQuizGroups';
import { resolveQuizPlcLinkageForAssign } from './plcLinkage';

vi.mock('@/hooks/useSyncedQuizGroups', async (importActual) => ({
  ...(await importActual<typeof import('@/hooks/useSyncedQuizGroups')>()),
  createSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

const plc = {
  id: 'plc-1',
  name: 'Bio Team',
  memberUids: [],
  memberEmails: {},
} as unknown as Plc;
const data: QuizData = {
  id: 'quiz-1',
  title: 'Cells',
  questions: [],
  createdAt: 0,
  updatedAt: 0,
};
const library = [
  { title: 'Cells', syncGroupId: 'team-group' },
  { title: 'Other', syncGroupId: 'other-group' },
];

function run(
  overrides: Partial<Parameters<typeof resolveQuizPlcLinkageForAssign>[0]> = {}
) {
  return resolveQuizPlcLinkageForAssign({
    plc,
    uid: 'teacher-1',
    meta: { id: 'quiz-1', title: 'Cells' } as QuizMetadata,
    data,
    plcLibrary: library,
    canPromote: true,
    attachSyncLinkage: vi.fn().mockResolvedValue(undefined),
    loadSyncedTranslations: vi.fn().mockResolvedValue({
      translations: { es: { title: 'Células' } },
      complete: true,
    }),
    logScope: 'test',
    ...overrides,
  });
}

describe('resolveQuizPlcLinkageForAssign', () => {
  beforeEach(() => {
    vi.mocked(createSyncedQuizGroup).mockClear();
    vi.mocked(callLeaveSyncedQuizGroup).mockClear();
  });

  it('shares nothing without a PLC', async () => {
    const result = await run({
      plc: undefined,
      meta: {
        id: 'quiz-1',
        title: 'Cells',
        sync: { groupId: 'g', lastSyncedVersion: 1 },
      } as QuizMetadata,
    });
    expect(result.plcLinkage).toBeUndefined();
    expect(result.plcPoolSyncGroupId).toBeUndefined();
    expect(result.plcTemplateSyncGroupId).toBe('g');
    expect(createSyncedQuizGroup).not.toHaveBeenCalled();
  });

  it('pools a teacher copy with the PLC library quiz of the same title and mints a template group', async () => {
    const attach = vi.fn().mockResolvedValue(undefined);
    const result = await run({ attachSyncLinkage: attach });
    expect(result.plcLinkage).toMatchObject({ id: 'plc-1', name: 'Bio Team' });
    expect(result.plcPoolSyncGroupId).toBe('team-group');
    expect(result.mintedSyncGroupId).toBeDefined();
    expect(result.plcTemplateSyncGroupId).toBe(result.mintedSyncGroupId);
    expect(createSyncedQuizGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        plcId: 'plc-1',
        uid: 'teacher-1',
        translations: { es: { title: 'Células' } },
      })
    );
    expect(attach).toHaveBeenCalledWith('quiz-1', {
      groupId: result.mintedSyncGroupId,
      lastSyncedVersion: 1,
    });
  });

  it('keeps an already synced quiz on its own group', async () => {
    const result = await run({
      meta: {
        id: 'quiz-1',
        title: 'Cells',
        sync: { groupId: 'other-group', lastSyncedVersion: 3 },
      } as QuizMetadata,
    });
    expect(result.plcPoolSyncGroupId).toBe('other-group');
    expect(result.plcTemplateSyncGroupId).toBe('other-group');
    expect(createSyncedQuizGroup).not.toHaveBeenCalled();
  });

  it('leaves the minted group when linking it fails', async () => {
    const result = await run({
      attachSyncLinkage: vi.fn().mockRejectedValue(new Error('offline')),
    });
    expect(result.plcTemplateSyncGroupId).toBeUndefined();
    expect(result.mintedSyncGroupId).toBeUndefined();
    expect(callLeaveSyncedQuizGroup).toHaveBeenCalled();
    expect(result.plcLinkage).toBeDefined();
  });

  it('never promotes a District library copy', async () => {
    const result = await run({ canPromote: false });
    expect(createSyncedQuizGroup).not.toHaveBeenCalled();
    expect(result.plcTemplateSyncGroupId).toBeUndefined();
  });
});
