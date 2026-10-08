import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, FlashcardSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from './utils/flashcardAssign';
import type { FlashcardAssignSubmission } from './utils/flashcardAssign';
import type { FlashcardAssignRules } from '@/hooks/useLastFlashcardAssignSettings';
import { FlashcardAssignModal } from './FlashcardAssignModal';

const lastUsed = vi.hoisted(() => ({
  value: null as FlashcardAssignRules | null,
  save: vi.fn(),
}));

vi.mock('@/hooks/useLastFlashcardAssignSettings', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/hooks/useLastFlashcardAssignSettings')
    >();
  return {
    ...actual,
    useLastFlashcardAssignSettings: () => ({
      lastUsed: lastUsed.value,
      loaded: true,
      save: lastUsed.save,
    }),
  };
});

const makeSet = (cardCount = 12): FlashcardSet => ({
  id: 'set-1',
  title: 'Spanish verbs',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: Array.from({ length: cardCount }, (_, i) => ({
    id: `c${i}`,
    term: `term ${i}`,
    definition: `def ${i}`,
  })),
  createdAt: 0,
  updatedAt: 0,
});

const roster = (id: string, name: string, classId?: string): ClassRoster => ({
  id,
  name,
  driveFileId: `f-${id}`,
  studentCount: 2,
  createdAt: 0,
  ...(classId ? { classlinkClassId: classId } : {}),
  bellPeriod: { buildingId: 'b', periodId: id },
  students: [
    {
      id: `${id}-a`,
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: `SID-${id}-a`,
    },
    {
      id: `${id}-b`,
      firstName: 'Alan',
      lastName: 'Turing',
      pin: '02',
      classLinkSourcedId: `SID-${id}-b`,
    },
  ],
});

const ROSTERS = [
  roster('r1', 'Period 1', 'CL-1'),
  roster('r2', 'Period 2', 'CL-2'),
];

const PERIOD_CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => ({ start: 1_000, end: 2_000 }),
  onTagRoster: () => undefined,
};

const renderStepper = ({
  stepper = true,
  rosterIds = ['r1'],
  periodAccess,
}: {
  stepper?: boolean;
  rosterIds?: string[];
  periodAccess?: AssignPeriodAccessContext;
} = {}) => {
  const onAssign = vi.fn((_submission: FlashcardAssignSubmission) =>
    Promise.resolve(true)
  );
  const auth = {
    user: { uid: 'teacher-1' },
    canAccessFeature: (id: string) => stepper && id === 'assign-stepper',
  } as unknown as React.ContextType<typeof AuthContext>;
  render(
    <AuthContext.Provider value={auth}>
      <FlashcardAssignModal
        isOpen
        set={makeSet()}
        rosters={ROSTERS}
        initialRosterIds={rosterIds}
        onClose={vi.fn()}
        onAssign={onAssign}
        periodAccess={periodAccess}
      />
    </AuthContext.Provider>
  );
  return { onAssign };
};

const assign = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

const lastSubmission = (onAssign: ReturnType<typeof vi.fn>) =>
  onAssign.mock.calls[0][0] as FlashcardAssignSubmission;

describe('FlashcardAssignStepper', () => {
  beforeEach(() => {
    lastUsed.value = null;
    lastUsed.save.mockClear();
  });

  it('keeps the old dialog while the flag is off', () => {
    renderStepper({ stepper: false });
    expect(screen.getByText('Collect a submission')).toBeTruthy();
    expect(screen.queryByText('How students are checked')).toBeNull();
  });

  it('opens on Students submit work with the check step', () => {
    renderStepper();
    expect(screen.queryByText('Collect a submission')).toBeNull();
    expect(
      screen.getByRole('radio', { name: /Students submit work/ })
    ).toHaveProperty('ariaChecked', 'true');
    expect(screen.getByText('Classes')).toBeTruthy();
    expect(screen.getByText('When')).toBeTruthy();
    expect(screen.getByText('How students are checked')).toBeTruthy();
  });

  it('drops the check step and saves no rules for a study resource', async () => {
    const { onAssign } = renderStepper();
    fireEvent.click(screen.getByRole('radio', { name: /Study resource/ }));
    expect(screen.queryByText('How students are checked')).toBeNull();
    expect(screen.getByText('Available')).toBeTruthy();
    assign();
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    const { input } = lastSubmission(onAssign);
    expect(input.kind).toBe('study');
    expect(input.workKind).toBe('resource');
    expect(lastUsed.save).not.toHaveBeenCalled();
  });

  it('assigns a check with the last-used rules and saves them', async () => {
    lastUsed.value = {
      ...DEFAULT_FLASHCARD_ASSIGN_FORM,
      checkMode: 'write',
      strict: true,
      scoreVisibility: 'none',
    };
    const { onAssign } = renderStepper();
    expect(screen.getByText('Write, hide until I publish')).toBeTruthy();
    assign();
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    const { input } = lastSubmission(onAssign);
    expect(input.kind).toBe('check');
    expect(input.checkMode).toBe('write');
    expect(input.lockedSettings?.strict).toBe(true);
    expect(input.workKind).toBe('work');
    await waitFor(() =>
      expect(lastUsed.save).toHaveBeenCalledWith(
        expect.objectContaining({ checkMode: 'write', strict: true })
      )
    );
  });

  it('does not save rules when the assign fails', async () => {
    const { onAssign } = renderStepper();
    onAssign.mockResolvedValueOnce(false);
    assign();
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    expect(lastUsed.save).not.toHaveBeenCalled();
  });

  it('starts every class paused on Manual, one class included', async () => {
    const { onAssign } = renderStepper({ periodAccess: PERIOD_CTX });
    fireEvent.click(screen.getByText('When'));
    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }));
    assign();
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    const { input } = lastSubmission(onAssign);
    expect(input.periodGate?.accessMode).toBe('assessment');
    expect(input.dueAt).toBeNull();
    expect(input.openAt).toBeNull();
    expect(input.closeAt).toBeNull();
  });

  it('narrows a class to its picked students', async () => {
    const { onAssign } = renderStepper({ rosterIds: ['r1', 'r2'] });
    fireEvent.click(screen.getAllByRole('button', { name: /All students/ })[0]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ada Lovelace/ }));
    assign();
    await waitFor(() => expect(onAssign).toHaveBeenCalled());
    const submission = lastSubmission(onAssign);
    expect(submission.studentTargetClassIds).toEqual(['CL-1']);
    expect(submission.expandedTargeting.targetStudents).toEqual([
      { kind: 'classlink', sourcedId: 'SID-r1-a' },
    ]);
    expect(submission.input.classIds).toEqual(['CL-1', 'CL-2']);
  });

  it('blocks Assign without a ClassLink class', () => {
    render(
      <AuthContext.Provider
        value={
          {
            user: { uid: 't' },
            canAccessFeature: () => true,
          } as unknown as React.ContextType<typeof AuthContext>
        }
      >
        <FlashcardAssignModal
          isOpen
          set={makeSet()}
          rosters={[roster('r9', 'Club')]}
          initialRosterIds={['r9']}
          onClose={vi.fn()}
          onAssign={vi.fn()}
        />
      </AuthContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Assign' }).disabled).toBe(true);
  });
});
