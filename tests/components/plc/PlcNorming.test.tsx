import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlcNormingCopy } from '@/types';

const { callSetPlcNormingFlag, copiesState, getBlob } = vi.hoisted(() => ({
  callSetPlcNormingFlag: vi.fn(),
  copiesState: { copies: [] as PlcNormingCopy[], loading: false, error: false },
  getBlob: vi.fn(),
}));

vi.mock('@/hooks/usePlcNorming', () => ({
  callSetPlcNormingFlag,
  usePlcNormingCopies: () => copiesState,
}));
vi.mock('@/config/firebase', () => ({ storage: {} }));
const { authState, updatePlcNormingLabels } = vi.hoisted(() => ({
  authState: { uid: 'lead' },
  updatePlcNormingLabels: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: authState.uid } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ updatePlcNormingLabels }),
}));
vi.mock('firebase/storage', () => ({
  getBlob,
  ref: (_s: unknown, p: string) => p,
}));

import { PlcNormingFlagControl } from '@/components/plc/norming/PlcNormingFlagControl';
import { PlcNormingSection } from '@/components/plc/norming/PlcNormingSection';
import { PlcNormingLevelsSection } from '@/components/plc/norming/PlcNormingLevelsSection';
import type { Plc } from '@/types';

const base = {
  sessionId: 's1',
  responseKey: 'k1',
  questionId: 'q1',
  slot: 'primary' as const,
};

describe('PlcNormingFlagControl', () => {
  beforeEach(() => callSetPlcNormingFlag.mockReset().mockResolvedValue({}));

  it('flags at a level and shows the privacy note, with the voice warning only for audio', async () => {
    const { rerender } = render(
      <PlcNormingFlagControl {...base} level={null} isAudio={false} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Flag for PLC norming' })
    );
    expect(screen.getByText(/without the student's name/)).toBeInTheDocument();
    expect(
      screen.queryByText('Your PLC will hear this recording.')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    await waitFor(() =>
      expect(callSetPlcNormingFlag).toHaveBeenCalledWith({
        ...base,
        level: 'medium',
      })
    );
    rerender(<PlcNormingFlagControl {...base} level={null} isAudio />);
    fireEvent.click(screen.getByRole('button', { name: /PLC norming/ }));
    expect(
      screen.getByText('Your PLC will hear this recording.')
    ).toBeInTheDocument();
  });

  it('unflags when the active level is picked again, using renamed labels', async () => {
    render(
      <PlcNormingFlagControl
        {...base}
        level="high"
        isAudio={false}
        labels={{ high: 'Exceeds' }}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Flagged for PLC norming: Exceeds' })
    );
    const active = screen.getByRole('button', { name: 'Exceeds' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(active);
    await waitFor(() =>
      expect(callSetPlcNormingFlag).toHaveBeenCalledWith({
        ...base,
        level: null,
      })
    );
  });
});

const copy = (over: Partial<PlcNormingCopy>): PlcNormingCopy => ({
  id: 'c1',
  assessmentId: 'a1',
  questionId: 'q1',
  questionIndex: 0,
  questionText: 'Explain photosynthesis.',
  level: 'high',
  kind: 'text',
  answerText: 'Plants make food from light.',
  flaggedByUid: 'me',
  flaggedByName: 'Ms. Rivera',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('PlcNormingSection', () => {
  it('groups answers by question and level; only the flagger can remove', () => {
    copiesState.copies = [
      copy({}),
      copy({
        id: 'c2',
        level: 'review',
        flaggedByUid: 'other',
        flaggedByName: 'Mr. Lee',
        answerText: 'Not sure',
      }),
    ];
    render(<PlcNormingSection plcId="p1" assessmentId="a1" currentUid="me" />);
    expect(screen.getByText('Q1. Explain photosynthesis.')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Flagged by Mr. Lee')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('loads audio through the rules-checked read only when played', async () => {
    getBlob.mockResolvedValue(new Blob(['a']));
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    copiesState.copies = [
      copy({
        kind: 'audio',
        answerText: undefined,
        audioPath: 'plc_norming_media/p1/c1.m4a',
      }),
    ];
    render(<PlcNormingSection plcId="p1" assessmentId="a1" currentUid="me" />);
    expect(getBlob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play recording' }));
    await waitFor(() =>
      expect(getBlob).toHaveBeenCalledWith('plc_norming_media/p1/c1.m4a')
    );
  });

  it('says so when nothing is flagged', () => {
    copiesState.copies = [];
    render(<PlcNormingSection plcId="p1" assessmentId="a1" currentUid="me" />);
    expect(screen.getByText(/Nothing flagged yet/)).toBeInTheDocument();
  });
});

describe('PlcNormingLevelsSection', () => {
  const plc = {
    id: 'p1',
    leadUid: 'lead',
    memberUids: ['lead', 'member'],
    members: {
      lead: { uid: 'lead', role: 'lead', status: 'active' },
      member: { uid: 'member', role: 'member', status: 'active' },
    },
    normingLevelLabels: { high: 'Exceeds' },
  } as unknown as Plc;

  it('lets a lead rename the levels', async () => {
    authState.uid = 'lead';
    render(<PlcNormingLevelsSection plc={plc} />);
    expect(
      screen.getByText('Exceeds, Medium, Low, Review')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name for Medium' }), {
      target: { value: 'Meets' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save names' }));
    await waitFor(() =>
      expect(updatePlcNormingLabels).toHaveBeenCalledWith('p1', {
        high: 'Exceeds',
        medium: 'Meets',
      })
    );
  });

  it('shows members the names without an editor', () => {
    authState.uid = 'member';
    render(<PlcNormingLevelsSection plc={plc} />);
    expect(
      screen.getByText('Exceeds, Medium, Low, Review')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save names' })).toBeNull();
  });
});
