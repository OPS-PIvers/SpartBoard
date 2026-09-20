// PlcTeammatePrintModal — the teammate picker and the "what would print"
// preview (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §6). Increment 1 writes
// nothing, so the Print button staying disabled is part of the contract.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Plc, PlcMember } from '@/types';
import type { TeammatePrintContext } from '@/hooks/usePlcTeammatePrintContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
  }),
}));

let mockState: {
  context: TeammatePrintContext | null;
  loading: boolean;
  error: string | null;
};
const requested = vi.fn();
vi.mock('@/hooks/usePlcTeammatePrintContext', async (importActual) => {
  const actual =
    await importActual<typeof import('@/hooks/usePlcTeammatePrintContext')>();
  return {
    ...actual,
    useTeammatePrintContext: (
      plcId: string,
      plcQuizId: string,
      targetUid: string | null
    ) => {
      requested(plcId, plcQuizId, targetUid);
      return targetUid === null
        ? { context: null, loading: false, error: null }
        : mockState;
    },
  };
});

import { PlcTeammatePrintModal } from '@/components/plc/PlcTeammatePrintModal';

const plc = { id: 'plc-1', name: 'Math 8' } as Plc;

const teammates: PlcMember[] = [
  {
    uid: 'uid-bob',
    email: 'bob@school.edu',
    displayName: 'Bob Teacher',
    role: 'member',
    joinedAt: 1,
    status: 'active',
  },
  {
    uid: 'uid-ann',
    email: 'ann@school.edu',
    displayName: 'Ann Teacher',
    role: 'lead',
    joinedAt: 1,
    status: 'active',
  },
];

function makeContext(
  overrides: Partial<TeammatePrintContext> = {}
): TeammatePrintContext {
  return {
    targetUid: 'uid-bob',
    targetName: 'Bob Teacher',
    hasCopy: true,
    quizId: 'their-quiz',
    driveReachable: true,
    contentSource: 'drive',
    quiz: { id: 'their-quiz', title: 'Unit 3 CFA', questions: [{}, {}, {}] },
    rosters: [
      {
        id: 'r1',
        name: 'Period 1',
        studentCount: 2,
        students: [
          { id: 's1', firstName: 'Ada', lastName: 'Byron' },
          { id: 's2', firstName: 'Alan', lastName: 'Turing' },
        ],
      },
      { id: 'r2', name: 'Period 4', studentCount: 3, students: [] },
    ],
    existingBatches: [],
    blocked: null,
    ...overrides,
  };
}

const open = (context: TeammatePrintContext | null = makeContext()) => {
  mockState = { context, loading: false, error: null };
  render(
    <PlcTeammatePrintModal
      plc={plc}
      plcQuizId="plc-quiz-1"
      quizTitle="Unit 3 CFA"
      teammates={teammates}
      onClose={vi.fn()}
    />
  );
};

const pick = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

beforeEach(() => {
  requested.mockClear();
});

describe('PlcTeammatePrintModal', () => {
  it('lists teammates alphabetically and fetches nothing until one is picked', () => {
    open();
    expect(requested).toHaveBeenCalledWith('plc-1', 'plc-quiz-1', null);
    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((text) => text.includes('@school.edu'));
    expect(names[0]).toContain('Ann Teacher');
    expect(names[1]).toContain('Bob Teacher');
  });

  it('loads the picked teammate and shows what would print', () => {
    open();
    pick('Bob Teacher');
    expect(requested).toHaveBeenLastCalledWith(
      'plc-1',
      'plc-quiz-1',
      'uid-bob'
    );
    expect(screen.getByText('Unit 3 CFA')).toBeInTheDocument();
    expect(screen.getByText('3 questions')).toBeInTheDocument();
    expect(screen.getByText('Period 1')).toBeInTheDocument();
  });

  it('counts sheets as classes and students are picked', () => {
    open();
    pick('Bob Teacher');
    expect(screen.getByText('0 sheets')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
    expect(screen.getByText('2 sheets')).toBeInTheDocument();

    // A class with no names available still prints its full count (D19).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 4' }));
    expect(screen.getByText('5 sheets')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Show students in Period 1/ })
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Byron, Ada' }));
    expect(screen.getByText('4 sheets')).toBeInTheDocument();
  });

  it('never offers to print in this increment', () => {
    open();
    pick('Bob Teacher');
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
  });

  it('explains a spares-only stack when Drive is unreachable', () => {
    open(
      makeContext({
        driveReachable: false,
        contentSource: 'synced-group',
        rosters: [
          {
            id: 'r1',
            name: 'Period 1',
            studentCount: 2,
            students: [],
            loadError: 'no-drive-access',
          },
        ],
      })
    );
    pick('Bob Teacher');
    expect(
      screen.getByText(/cannot reach Bob Teacher’s Google Drive/)
    ).toBeInTheDocument();
    expect(screen.getByText('2 unnamed sheets')).toBeInTheDocument();
  });

  it('names what is missing when nothing can be printed at all', () => {
    open(
      makeContext({
        hasCopy: false,
        quizId: null,
        driveReachable: false,
        contentSource: 'synced-group',
        blocked: 'no-copy-no-drive',
        rosters: [],
      })
    );
    pick('Bob Teacher');
    expect(
      screen.getByText(/has not added this quiz to their library/)
    ).toBeInTheDocument();
    // The blocked banner replaces the spares-only one rather than stacking.
    expect(screen.queryByText(/students write their own names/)).toBeNull();
  });

  it('flags content that came from the PLC copy rather than theirs', () => {
    open(makeContext({ contentSource: 'synced-group' }));
    pick('Bob Teacher');
    expect(
      screen.getByText(/come from the PLC’s shared copy/)
    ).toBeInTheDocument();
  });

  it('warns that a stack already exists for this teacher and quiz', () => {
    open(
      makeContext({
        existingBatches: [
          {
            id: 'b1',
            createdAt: 1,
            sheetCount: 20,
            printedByName: 'Ann Teacher',
          },
        ],
      })
    );
    pick('Bob Teacher');
    expect(
      screen.getByText(/1 stack\(s\) for this quiz already exist/)
    ).toBeInTheDocument();
  });

  it('goes back to the picker and drops the previous selection', () => {
    open();
    pick('Bob Teacher');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
    expect(screen.getByText('2 sheets')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pick a different teacher' })
    );
    pick('Bob Teacher');
    expect(screen.getByText('0 sheets')).toBeInTheDocument();
  });

  it('surfaces a failed load instead of an empty preview', () => {
    mockState = { context: null, loading: false, error: 'Permission denied.' };
    render(
      <PlcTeammatePrintModal
        plc={plc}
        plcQuizId="plc-quiz-1"
        quizTitle="Unit 3 CFA"
        teammates={teammates}
        onClose={vi.fn()}
      />
    );
    pick('Bob Teacher');
    expect(screen.getByText('Permission denied.')).toBeInTheDocument();
  });

  it('says so when the PLC has no other members', () => {
    mockState = { context: null, loading: false, error: null };
    render(
      <PlcTeammatePrintModal
        plc={plc}
        plcQuizId="plc-quiz-1"
        quizTitle="Unit 3 CFA"
        teammates={[]}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText('This PLC has no other members yet.')
    ).toBeInTheDocument();
  });
});
