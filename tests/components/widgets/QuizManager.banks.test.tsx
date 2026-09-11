import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuestionBankMetadata, QuizConfig } from '@/types';
import type { BankSource } from '@/hooks/useBankSources';

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [{ id: 'plc-1', name: 'Grade 7 Science' }] }),
}));

vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({ quizzes: [], loading: false, error: null }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: [] }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
  }),
}));

const CONFIG = {
  view: 'manager',
  managerTab: 'banks',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

const BANK: QuestionBankMetadata = {
  id: 'bank-1',
  title: 'Cells Bank',
  driveFileId: 'drive-bank-1',
  questionCount: 12,
  targetIds: ['t1', 't2', 't3'],
  targetCounts: { t1: 4, t2: 4, t3: 4 },
  sync: { groupId: 'g1', plcIds: ['plc-1'] },
  createdAt: 1000,
  updatedAt: 2000,
};

const SHARED: BankSource = {
  key: 'g9',
  kind: 'plc',
  bankId: 'their-bank',
  syncGroupId: 'g9',
  title: 'Genetics Bank',
  questionCount: 30,
  targetIds: [],
  targetCounts: {},
  plcId: 'plc-1',
  plcName: 'Grade 7 Science',
  sharedByName: 'Pat Teacher',
};

function renderBanks(
  overrides: Partial<React.ComponentProps<typeof QuizManager>> = {}
) {
  const onNewBank = vi.fn();
  const onEditBank = vi.fn();
  render(
    <QuizManager
      userId="teacher-1"
      quizzes={[]}
      loading={false}
      error={null}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onPreview={vi.fn()}
      onAssign={vi.fn()}
      onResults={vi.fn()}
      onDelete={vi.fn()}
      onShare={vi.fn()}
      rosters={[]}
      config={CONFIG}
      managerTab="banks"
      banks={[BANK]}
      sharedBankSources={[SHARED]}
      onNewBank={onNewBank}
      onEditBank={onEditBank}
      {...overrides}
    />
  );
  return { onNewBank, onEditBank };
}

describe('QuizManager — Banks tab', () => {
  it('renders the Banks tab with a count, bank cards and shared banks', () => {
    renderBanks();
    expect(screen.getByRole('tab', { name: /Banks/ })).toBeInTheDocument();
    expect(screen.getByText('Cells Bank')).toBeInTheDocument();
    expect(
      screen.getByText(/12 questions · 3 targets · updated/)
    ).toBeInTheDocument();
    expect(screen.getByText('Shared · Grade 7 Science')).toBeInTheDocument();
    expect(screen.getByText('Genetics Bank')).toBeInTheDocument();
    expect(
      screen.getByText(/30 questions · Shared by Pat Teacher · Grade 7 Science/)
    ).toBeInTheDocument();
  });

  it('routes the header action to onNewBank', () => {
    const { onNewBank } = renderBanks();
    fireEvent.click(screen.getByRole('button', { name: 'New bank' }));
    expect(onNewBank).toHaveBeenCalledTimes(1);
  });

  it('hides the Banks tab when no banks prop is provided', () => {
    renderBanks({ banks: undefined, managerTab: 'library' });
    expect(screen.queryByRole('tab', { name: /Banks/ })).toBeNull();
  });
});
