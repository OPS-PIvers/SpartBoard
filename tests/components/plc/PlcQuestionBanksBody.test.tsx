import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlcQuestionBanksBody } from '@/components/plc/bodies/PlcQuestionBanksBody';
import type {
  Plc,
  PlcQuestionBankEntry,
  QuestionBankMetadata,
  LearningTargetList,
} from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      opts?: { defaultValue?: string; [k: string]: unknown }
    ) => {
      const dv = opts?.defaultValue ?? _key;
      return dv.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
        const v = opts?.[name];
        return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
      });
    },
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1', displayName: 'Ms. T' } }),
}));
const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));
const showConfirm = vi.fn().mockResolvedValue(true);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));
let canEdit = true;
vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => canEdit,
}));

const saveBank = vi.fn().mockResolvedValue(undefined);
const shareBankWithPlc = vi.fn().mockResolvedValue(undefined);
const unshareBankFromPlc = vi.fn().mockResolvedValue(undefined);
let banks: QuestionBankMetadata[] = [];
vi.mock('@/hooks/useQuestionBanks', () => ({
  BANKS_COLLECTION: 'question_banks',
  useQuestionBanks: () => ({
    banks,
    saveBank,
    shareBankWithPlc,
    unshareBankFromPlc,
    isDriveConnected: true,
  }),
}));

let entries: PlcQuestionBankEntry[] = [];
vi.mock('@/hooks/usePlcQuestionBanks', () => ({
  usePlcQuestionBankEntries: () => ({ entries, loading: false, error: null }),
}));

const targetList: LearningTargetList = {
  targets: [
    {
      id: 't1',
      code: 'RL.1',
      label: 'Cite evidence',
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  updatedAt: 0,
};
vi.mock('@/hooks/useLearningTargets', () => ({
  usePlcLearningTargets: () => ({ list: targetList, loading: false }),
}));

const loadSyncedBankContent = vi.fn<(id: string) => Promise<unknown>>();
vi.mock('@/hooks/useBankSources', () => ({
  loadSyncedBankContent: (id: string): Promise<unknown> =>
    loadSyncedBankContent(id),
}));

vi.mock('@/components/plc/PlcSharePickerModal', () => ({
  PlcSharePickerModal: ({
    items,
    onPick,
  }: {
    items: { id: string; title: string; alreadyShared?: boolean }[];
    onPick: (id: string) => Promise<void>;
  }) => (
    <div data-testid="picker">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          disabled={i.alreadyShared}
          onClick={() => void onPick(i.id)}
        >
          pick {i.title}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/plc/viewer/PlcViewerReadOnlyBadge', () => ({
  PlcViewerReadOnlyBadge: ({ note }: { note: string }) => <div>{note}</div>,
}));

const plc = { id: 'plc-1', name: 'ELA 9' } as unknown as Plc;

function entry(over: Partial<PlcQuestionBankEntry>): PlcQuestionBankEntry {
  return {
    id: 'e1',
    title: 'Poetry bank',
    questionCount: 12,
    syncGroupId: 'grp-1',
    targetIds: ['t1', 'missing'],
    sharedBy: 'teacher-2',
    sharedByEmail: 'two@example.com',
    sharedByName: 'Mr. Two',
    sharedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  canEdit = true;
  banks = [];
  entries = [];
});

describe('PlcQuestionBanksBody', () => {
  it('lists shared banks with attribution, counts and resolvable target chips', () => {
    entries = [entry({})];
    render(<PlcQuestionBanksBody plc={plc} />);
    expect(screen.getByText('Poetry bank')).toBeInTheDocument();
    expect(screen.getByText('shared by Mr. Two')).toBeInTheDocument();
    expect(screen.getByText('12 question')).toBeInTheDocument();
    expect(screen.getByText('RL.1')).toBeInTheDocument();
    expect(screen.getByText('1 bank')).toBeInTheDocument();
  });

  it("copies a teammate's bank into the personal library with a fresh id", async () => {
    entries = [entry({})];
    loadSyncedBankContent.mockResolvedValue({
      id: 'grp-1',
      title: 'Poetry bank',
      questions: [{ id: 'q1' }],
      targets: [{ id: 't1', label: 'Cite evidence' }],
    });
    render(<PlcQuestionBanksBody plc={plc} />);
    fireEvent.click(screen.getByRole('button', { name: /copy to my banks/i }));
    await waitFor(() => expect(saveBank).toHaveBeenCalledTimes(1));
    const saved = saveBank.mock.calls[0][0] as { id: string; title: string };
    expect(loadSyncedBankContent).toHaveBeenCalledWith('grp-1');
    expect(saved.id).not.toBe('grp-1');
    expect(saved.title).toBe('Poetry bank');
    expect(addToast).toHaveBeenCalledWith(
      expect.stringContaining('added to your question banks'),
      'success'
    );
  });

  it('shows Stop sharing only to the owner and unshares through the bank hook', async () => {
    entries = [entry({ sharedBy: 'teacher-1' })];
    banks = [
      {
        id: 'b1',
        title: 'Poetry bank',
        sync: { groupId: 'grp-1', plcIds: ['plc-1'] },
      } as unknown as QuestionBankMetadata,
    ];
    render(<PlcQuestionBanksBody plc={plc} />);
    expect(
      screen.queryByRole('button', { name: /copy to my banks/i })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /stop sharing/i }));
    await waitFor(() =>
      expect(unshareBankFromPlc).toHaveBeenCalledWith(banks[0], 'plc-1')
    );
  });

  it('shares a personal bank from the picker and disables already-shared ones', async () => {
    banks = [
      { id: 'b1', title: 'Fresh', questionCount: 3 },
      {
        id: 'b2',
        title: 'Old',
        questionCount: 4,
        sync: { groupId: 'g', plcIds: ['plc-1'] },
      },
    ] as unknown as QuestionBankMetadata[];
    render(<PlcQuestionBanksBody plc={plc} />);
    fireEvent.click(screen.getByRole('button', { name: /share a bank/i }));
    expect(screen.getByRole('button', { name: 'pick Old' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'pick Fresh' }));
    await waitFor(() =>
      expect(shareBankWithPlc).toHaveBeenCalledWith(banks[0], 'plc-1')
    );
  });

  it('hides the share CTA for viewers and shows the read-only note', () => {
    canEdit = false;
    render(<PlcQuestionBanksBody plc={plc} />);
    expect(screen.queryByRole('button', { name: /share a bank/i })).toBeNull();
    expect(
      screen.getByText(/viewers can browse and copy/i)
    ).toBeInTheDocument();
  });
});
