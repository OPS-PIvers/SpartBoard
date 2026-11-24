import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { LandingRow } from '@/utils/studentLanding';
import { WorkRow } from './LandingRows';
import { formatOpensLabel } from '@/utils/assignmentWindow';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn() }),
}));

const NOW = new Date(2026, 9, 2, 10, 12).getTime();

const base: AssignmentSummary = {
  compositeId: 'quiz:q1',
  kind: 'quiz',
  sessionId: 'q1',
  title: 'Chapter 7 quiz',
  openHref: '/quiz?code=ABC123',
  channel: 'active',
  classIds: ['c1'],
  gradingState: 'not-graded',
  workKind: 'work',
};

const manual = (
  state: 'open' | 'closed' | 'paused',
  over: { periodKeys?: string[]; studentAccess?: Record<string, number> } = {}
): AssignmentSummary => ({
  ...base,
  periodGate: {
    accessMode: 'assessment',
    periodAccess: {
      c1: {
        state,
        openAt: null,
        closeAt: null,
        bellPeriodId: null,
        verified: true,
        label: 'P1',
      },
    },
    periodKeys: over.periodKeys ?? ['c1'],
    studentAccess: over.studentAccess,
  },
});

const renderRow = (row: LandingRow) =>
  render(<WorkRow row={row} nowMs={NOW} pseudonymUid="s1" />);

describe('WorkRow', () => {
  it('shows Open on an available row', () => {
    renderRow({ assignment: base, state: 'open' });
    expect(screen.getByRole('link')).toHaveAttribute('href', base.openHref);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Live')).toBeNull();
  });

  it('marks a started Manual start class Live, with Open', () => {
    renderRow({ assignment: manual('open'), state: 'open' });
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('dims a class not open yet and does not open it', () => {
    const { container } = renderRow({
      assignment: manual('closed'),
      state: 'open',
    });
    expect(screen.getByText('Not open yet')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const row = container.querySelector('[aria-disabled="true"]');
    expect(row?.className).toContain('opacity-60');
  });

  it('says Paused for a paused class and keeps the row listed (D22)', () => {
    renderRow({ assignment: manual('paused'), state: 'open' });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('names the earlier class open over a later own time', () => {
    const classOpen = NOW + 86_400_000;
    const ownFrom = NOW + 5 * 86_400_000;
    const assignment: AssignmentSummary = {
      ...base,
      periodGate: {
        accessMode: 'assessment',
        periodAccess: {
          c1: {
            state: 'open',
            openAt: classOpen,
            closeAt: null,
            bellPeriodId: null,
            verified: true,
            label: 'P1',
          },
        },
        periodKeys: ['c1'],
        studentAccess: { s1: ownFrom + 3_600_000 },
        studentAccessFrom: { s1: ownFrom },
      },
    };
    renderRow({ assignment, state: 'open' });
    expect(screen.getByText(formatOpensLabel(classOpen))).toBeInTheDocument();
  });

  it('says Not open yet for a quiz assigned but not started', () => {
    renderRow({ assignment: { ...base, held: 'not-open' }, state: 'open' });
    expect(screen.getByText('Not open yet')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says Paused for a paused quiz, with no Open or Live (AB-150)', () => {
    renderRow({
      assignment: { ...base, held: 'paused', live: true },
      state: 'open',
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps an upcoming row locked with no Open', () => {
    renderRow({
      assignment: { ...base, openAt: NOW + 86_400_000 },
      state: 'upcoming',
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Open')).toBeNull();
  });

  it('shows In progress and Open on a started attempt', () => {
    renderRow({ assignment: base, state: 'in-progress' });
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('does not call a Let in now pass on a closed class Live', () => {
    renderRow({
      assignment: manual('closed', { studentAccess: { s1: NOW + 60_000 } }),
      state: 'open',
    });
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('keeps a row locked when the student matches no class on the session', () => {
    renderRow({
      assignment: manual('open', { periodKeys: [] }),
      state: 'open',
    });
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
  });

  it('says Ask your teacher for a run outside every class of the student, and does not open', () => {
    renderRow({
      assignment: { ...base, outsideClasses: true },
      state: 'open',
    });
    expect(screen.getByText('Ask your teacher')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('names the activity type in words', () => {
    renderRow({ assignment: base, state: 'open' });
    expect(screen.getByText('Quiz')).toBeInTheDocument();
  });

  it('names a flashcards check', () => {
    renderRow({
      assignment: {
        ...base,
        kind: 'flashcards',
        flashcardKind: 'check',
        compositeId: 'flashcards:f1',
      },
      state: 'open',
    });
    expect(screen.getByText('Flashcards · Check')).toBeInTheDocument();
  });

  it('says Was due for a past due date', () => {
    renderRow({
      assignment: { ...base, dueAt: NOW - 2 * 86_400_000 },
      state: 'open',
    });
    expect(screen.getByText(/^Was due /)).toBeInTheDocument();
    expect(screen.queryByText(/^Due /)).toBeNull();
  });

  it('keeps Due for a future due date', () => {
    renderRow({
      assignment: { ...base, dueAt: NOW + 2 * 86_400_000 },
      state: 'open',
    });
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });

  it('keeps Due today for earlier today', () => {
    renderRow({
      assignment: { ...base, dueAt: new Date(2026, 9, 2, 8, 0).getTime() },
      state: 'open',
    });
    expect(screen.getByText(/^Due today/)).toBeInTheDocument();
  });

  it('shows the missing-open wording with the due date', () => {
    renderRow({
      assignment: { ...base, dueAt: NOW - 2 * 86_400_000 },
      state: 'missing-open',
    });
    expect(screen.getByText('Missing · still open')).toBeInTheDocument();
    expect(screen.getByText(/was due/)).toBeInTheDocument();
  });
});
