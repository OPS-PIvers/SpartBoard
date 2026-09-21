// PlcTeammatePrintModal — the teammate picker, the "what would print" preview
// and the print itself (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §6).
//
// What matters here is that the browser sends SELECTIONS and prints the seat
// map it is handed back (D16): it never plans a batch of its own.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Plc, PlcMember } from '@/types';
import type { PaperPrintJob } from '@/utils/paperSheetPrint';
import { driveImageUrl } from '@/utils/quizStimuli';
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

/**
 * Sheet stimuli reach a teammate only through the link-shared URL, so the
 * resolver is driven here by which URLs an <img> agrees to load.
 */
let loadableUrls = new Set<string>();
const getDriveFileAsBlob = vi.fn(() => Promise.resolve(null));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob }),
}));

let mockState: {
  context: TeammatePrintContext | null;
  loading: boolean;
  error: string | null;
};
const requested = vi.fn();
const createBatch = vi.fn();
const withdrawBatch = vi.fn();
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
    createTeammatePaperBatch: (request: unknown) =>
      createBatch(request) as unknown,
    withdrawTeammatePaperBatch: (request: unknown) =>
      withdrawBatch(request) as unknown,
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

const print = vi.fn<(job: PaperPrintJob) => void>();
const printTest = vi.fn();

const open = (
  context: TeammatePrintContext | null = makeContext(),
  ownerName?: string
) => {
  mockState = { context, loading: false, error: null };
  render(
    <PlcTeammatePrintModal
      plc={plc}
      plcQuizId="plc-quiz-1"
      quizTitle="Unit 3 CFA"
      teammates={teammates}
      onClose={vi.fn()}
      print={print}
      printTest={printTest}
      {...(ownerName ? { ownerName } : {})}
    />
  );
};

const PRINTED = {
  batch: {
    id: 'batch-99',
    quizId: 'their-quiz',
    questionCount: 3,
    choiceCount: 4,
    rosterIds: ['r1'],
    seats: {},
    spareSeats: [],
    pagesPerSheet: 1,
    createdAt: 1,
  },
  sheets: [{ seat: 1 }],
  quizTitle: 'Unit 3 CFA',
  printedForTeacherName: 'Bob Teacher',
  testPaper: [{ row: 1, text: 'Q1', choices: ['a', 'b'] }],
  createdCopy: false,
};

const pick = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

beforeEach(() => {
  loadableUrls = new Set<string>();
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        queueMicrotask(() =>
          loadableUrls.has(value) ? this.onload?.() : this.onerror?.()
        );
      }
    }
  );
  requested.mockClear();
  print.mockReset();
  printTest.mockReset();
  createBatch.mockReset();
  createBatch.mockResolvedValue(PRINTED);
  withdrawBatch.mockReset();
  withdrawBatch.mockResolvedValue(undefined);
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
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/), {
      target: { value: '0' },
    });
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

  it('cannot print when nothing is selected or the teammate is blocked', () => {
    open();
    pick('Bob Teacher');
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/), {
      target: { value: '0' },
    });
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
    // Two students plus the two spares the modal defaults to.
    expect(screen.getByText('4 sheets')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pick a different teacher' })
    );
    pick('Bob Teacher');
    expect(screen.getByText('2 sheets')).toBeInTheDocument();
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

describe('PlcTeammatePrintModal — printing', () => {
  const printBobsPeriod1 = async () => {
    open();
    pick('Bob Teacher');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(createBatch).toHaveBeenCalled());
  };

  it('sends selections, never a seat map', async () => {
    open();
    pick('Bob Teacher');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Show students in Period 1/ })
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Byron, Ada' }));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));

    await waitFor(() => expect(createBatch).toHaveBeenCalled());
    expect(createBatch).toHaveBeenCalledWith({
      plcId: 'plc-1',
      targetUid: 'uid-bob',
      plcQuizId: 'plc-quiz-1',
      selections: [{ rosterId: 'r1', studentIds: ['s2'] }],
      spareCount: 2,
    });
    const sent = createBatch.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('seats');
  });

  it('prints the stack the server planned, named for the teacher it is for', async () => {
    await printBobsPeriod1();
    await waitFor(() =>
      expect(print).toHaveBeenCalledWith({
        batchId: 'batch-99',
        quizTitle: 'Unit 3 CFA',
        questionCount: 3,
        choiceCount: 4,
        sheets: PRINTED.sheets,
        printedForTeacherName: 'Bob Teacher',
      })
    );
  });

  it('offers the matching test paper once the sheets are out', async () => {
    await printBobsPeriod1();
    fireEvent.click(
      await screen.findByRole('button', { name: /Print test paper/ })
    );
    expect(printTest).toHaveBeenCalledWith({
      quizTitle: 'Unit 3 CFA',
      questions: PRINTED.testPaper,
    });
  });

  it('says so when it had to add the quiz to their library', async () => {
    createBatch.mockResolvedValue({ ...PRINTED, createdCopy: true });
    await printBobsPeriod1();
    expect(
      await screen.findByText(/was not in Bob Teacher’s library yet/)
    ).toBeInTheDocument();
  });

  it('lets the helper take back a stack they just printed', async () => {
    await printBobsPeriod1();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove this stack' })
    );
    await waitFor(() =>
      expect(withdrawBatch).toHaveBeenCalledWith({
        plcId: 'plc-1',
        targetUid: 'uid-bob',
        plcQuizId: 'plc-quiz-1',
        batchId: 'batch-99',
      })
    );
    expect(
      await screen.findByText('That print run has been removed')
    ).toBeInTheDocument();
  });

  it('surfaces a refused print and leaves nothing to take back', async () => {
    createBatch.mockRejectedValue(new Error('This PLC has turned it off.'));
    open();
    pick('Bob Teacher');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    expect(
      await screen.findByText('This PLC has turned it off.')
    ).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Remove this stack' })
    ).toBeNull();
  });

  it('still offers to take the stack back when the print window is blocked', async () => {
    print.mockImplementation(() => {
      throw new Error('Allow pop-ups to print.');
    });
    await printBobsPeriod1();
    expect(
      await screen.findByText('Allow pop-ups to print.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove this stack' })
    ).toBeInTheDocument();
  });

  it('refuses to print for a teammate nothing can be printed for', () => {
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
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
  });

  describe('sheet stimuli the owner may not have shared', () => {
    const shared = {
      id: 'stim-shared',
      label: 'Unit 3 graph',
      source: 'image' as const,
      driveFileId: 'drive-shared',
    };
    const priv = {
      id: 'stim-private',
      label: "Amelia's map",
      source: 'image' as const,
      driveFileId: 'drive-private',
    };
    const withStimuli = (...paperSheetStimuli: (typeof shared)[]) =>
      makeContext({
        quiz: {
          id: 'their-quiz',
          title: 'Unit 3 CFA',
          questions: [{}, {}, {}],
          paperSheetStimuli,
        },
      });

    it('prints the ones the owner shared', async () => {
      loadableUrls.add(driveImageUrl('drive-shared'));
      open(withStimuli(shared));
      pick('Bob Teacher');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Print$/ })).toBeEnabled()
      );
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(print.mock.calls[0][0]).toMatchObject({
        sheetStimuli: [shared],
        stimulusImageSrc: { 'stim-shared': driveImageUrl('drive-shared') },
      });
    });

    it('names an unshared one and says who to ask, rather than blocking', async () => {
      loadableUrls.add(driveImageUrl('drive-shared'));
      open(withStimuli(shared, priv), 'Amelia Ruiz');
      pick('Bob Teacher');
      const banner = await screen.findByText(/Not shared with the PLC/);
      expect(banner).toHaveTextContent("Amelia's map");
      expect(banner).toHaveTextContent('Ask Amelia Ruiz to share them');
      // The one the owner did share is not named as a problem.
      expect(banner).not.toHaveTextContent('Unit 3 graph');

      fireEvent.click(screen.getByRole('checkbox', { name: 'Period 1' }));
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      // The sheet still prints; the image the teammate cannot open is left out.
      expect(print.mock.calls[0][0].sheetStimuli).toEqual([shared]);
    });

    it('falls back to naming nobody when the sharer is unknown', async () => {
      open(withStimuli(priv));
      pick('Bob Teacher');
      expect(
        await screen.findByText(/Whoever added them can share them/)
      ).toBeInTheDocument();
    });

    it('says nothing when the quiz has no sheet images at all', async () => {
      await printBobsPeriod1();
      expect(screen.queryByText(/Not shared with the PLC/)).toBeNull();
      expect(print.mock.calls[0][0]).not.toHaveProperty('sheetStimuli');
    });
  });
});
