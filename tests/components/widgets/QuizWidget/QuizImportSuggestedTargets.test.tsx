import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuizDocumentReview } from '@/components/widgets/QuizWidget/components/QuizDocumentReview';
import type { LearningTargetSource } from '@/hooks/useLearningTargets';
import type { LearningTargetList, Plc, QuizData, QuizQuestion } from '@/types';
import type { SuggestedTarget } from '@/utils/quizDocumentImport/suggestedTargets';

const personalSave = vi.fn<(list: LearningTargetList) => Promise<void>>();
const plcSave = vi.fn<(list: LearningTargetList) => Promise<void>>();
const plcIdsSeen: (string | null)[] = [];
let sources: LearningTargetSource[] = [];
let plcs: Plc[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs, loading: false }),
}));
vi.mock('@/hooks/useLearningTargets', () => ({
  useLearningTargetSources: () => ({ sources, loading: false }),
  usePersonalLearningTargets: () => ({
    list: null,
    loading: false,
    save: personalSave,
  }),
  usePlcLearningTargets: (plcId: string | null) => {
    plcIdsSeen.push(plcId);
    return { list: null, loading: false, save: plcSave };
  },
}));

const plc = (id: string, name: string, role: 'member' | 'viewer'): Plc =>
  ({
    id,
    name,
    leadUid: 'someone',
    memberUids: ['me', 'someone'],
    members: {
      me: {
        uid: 'me',
        email: 'me@x.org',
        displayName: 'Me',
        role,
        joinedAt: 1,
        status: 'active',
      },
    },
  }) as unknown as Plc;

const q = (id: string, over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id,
  text: `Question ${id}`,
  timeLimit: 0,
  type: 'MC',
  correctAnswer: 'Blue',
  incorrectAnswers: ['Green'],
  ...over,
});

const data = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz',
  title: 'Test',
  questions,
  createdAt: 1,
  updatedAt: 1,
});

const water: SuggestedTarget = {
  code: 'ELT 1.1',
  label: 'explain the water cycle',
};
const evap: SuggestedTarget = {
  code: 'ELT 1.2',
  label: 'describe evaporation',
};

function setup(
  questions: QuizQuestion[],
  suggestions?: Map<string, SuggestedTarget>
) {
  const onChange = vi.fn();
  render(
    <QuizDocumentReview
      data={data(questions)}
      onChange={onChange}
      suggestedTargets={suggestions}
    />
  );
  const latest = (): QuizData =>
    onChange.mock.calls[onChange.mock.calls.length - 1][0] as QuizData;
  return { onChange, latest };
}

beforeEach(() => {
  personalSave.mockReset().mockResolvedValue(undefined);
  plcSave.mockReset().mockResolvedValue(undefined);
  plcIdsSeen.length = 0;
  plcs = [];
  sources = [
    {
      kind: 'personal',
      name: 'My learning targets',
      list: { targets: [], updatedAt: 0 },
    },
  ];
});

describe('suggested targets in the import review', () => {
  it('shows nothing when the flag is off (no suggestions passed)', () => {
    setup([q('a')]);
    expect(screen.queryByText(/Suggested target/)).toBeNull();
    expect(screen.queryByText(/Add all/)).toBeNull();
  });

  it('tags a row with an existing target matched by code', () => {
    sources[0].list = {
      targets: [
        {
          id: 't1',
          code: 'ELT-1.1',
          label: 'Explain the water cycle',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      updatedAt: 1,
    };
    const { latest } = setup([q('a')], new Map([['a', water]]));
    expect(screen.getByText(/Suggested target:/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Add target ELT 1.1.*question 1/ })
    );
    expect(latest().questions[0].targets).toEqual([
      expect.objectContaining({ id: 't1', kind: 'personal', code: 'ELT-1.1' }),
    ]);
    expect(personalSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Target added:/)).toBeTruthy();
  });

  it('"Add all" creates each distinct target once and tags every row', async () => {
    const { latest } = setup(
      [q('a'), q('b'), q('c')],
      new Map([
        ['a', water],
        ['b', { ...water, code: 'ELT-1.1' }],
        ['c', evap],
      ])
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add all 2 suggested targets' })
    );
    await waitFor(() => expect(personalSave).toHaveBeenCalledTimes(1));
    const saved = personalSave.mock.calls[0][0];
    expect(saved.targets.map((t) => t.code)).toEqual(['ELT 1.1', 'ELT 1.2']);
    await waitFor(() =>
      expect(latest().questions.map((x) => x.targets?.[0]?.code)).toEqual([
        'ELT 1.1',
        'ELT 1.1',
        'ELT 1.2',
      ])
    );
    expect(latest().questions[0].targets?.[0]?.id).toBe(saved.targets[0].id);
    expect(screen.getByText(/Suggested targets added to all 3/)).toBeTruthy();
  });

  it('skips the destination menu when only My targets is available', () => {
    plcs = [plc('p1', 'Math PLC', 'viewer')];
    sources.push({
      kind: 'plc',
      ownerId: 'p1',
      name: 'Math PLC',
      list: { targets: [], updatedAt: 0 },
    });
    setup([q('a')], new Map([['a', water]]));
    expect(screen.queryByText(/New targets go in/)).toBeNull();
  });

  it('lists editable PLCs, not viewer ones, and creates in the chosen PLC', async () => {
    plcs = [
      plc('p1', 'Science PLC', 'member'),
      plc('p2', 'Math PLC', 'viewer'),
    ];
    sources.push(
      {
        kind: 'plc',
        ownerId: 'p1',
        name: 'Science PLC',
        list: { targets: [], updatedAt: 0 },
      },
      {
        kind: 'plc',
        ownerId: 'p2',
        name: 'Math PLC',
        list: { targets: [], updatedAt: 0 },
      }
    );
    const { latest } = setup([q('a')], new Map([['a', water]]));
    const menu = screen.getByLabelText(/New targets go in/);
    const options = Array.from(menu.querySelectorAll('option')).map(
      (o) => o.textContent
    );
    expect(options).toEqual(['My learning targets', 'Science PLC']);
    fireEvent.change(menu, { target: { value: '1' } });
    expect(plcIdsSeen).toContain('p1');
    fireEvent.click(
      screen.getByRole('button', { name: /Create target ELT 1.1/ })
    );
    await waitFor(() => expect(plcSave).toHaveBeenCalledTimes(1));
    expect(personalSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(latest().questions[0].targets?.[0]).toMatchObject({
        kind: 'plc',
        ownerId: 'p1',
      })
    );
  });

  it('says so when saving the new targets fails', async () => {
    personalSave.mockRejectedValue(new Error('offline'));
    setup([q('a')], new Map([['a', water]]));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add all 1 suggested target' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn.t save the new targets/
    );
  });
});
