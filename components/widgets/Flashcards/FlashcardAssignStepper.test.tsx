import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, FlashcardSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from './utils/flashcardAssign';
import type { FlashcardAssignSubmission } from './utils/flashcardAssign';
import type { FlashcardAssignRules } from '@/hooks/useLastFlashcardAssignSettings';
import { FlashcardAssignStepper } from './FlashcardAssignStepper';

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
  bellWindow: () => ({ openAt: 1_000, closeAt: 2_000 }),
  onTagRoster: () => undefined,
};

const renderStepper = ({
  rosterIds = ['r1'],
  periodAccess,
  canSpeak = false,
  v2 = false,
  set = makeSet(),
}: {
  rosterIds?: string[];
  periodAccess?: AssignPeriodAccessContext;
  canSpeak?: boolean;
  v2?: boolean;
  set?: FlashcardSet;
} = {}) => {
  const onAssign = vi.fn((_submission: FlashcardAssignSubmission) =>
    Promise.resolve(true)
  );
  const auth = {
    user: { uid: 'teacher-1' },
    canAccessFeature: (id: string) =>
      (canSpeak && id === 'flashcards-speak') ||
      (v2 && id === 'flashcards-assign-v2'),
  } as unknown as React.ContextType<typeof AuthContext>;
  render(
    <AuthContext.Provider value={auth}>
      <FlashcardAssignStepper
        isOpen
        set={set}
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

  describe('Speak step', () => {
    const studyResource = () =>
      fireEvent.click(screen.getByRole('radio', { name: /Study resource/ }));

    it('is hidden without the flag', () => {
      renderStepper();
      studyResource();
      expect(screen.queryByText('Speak')).toBeNull();
    });

    it('is hidden for a language Speak does not support', () => {
      renderStepper({
        canSpeak: true,
        set: { ...makeSet(), termLanguage: 'fr-FR' },
      });
      studyResource();
      expect(screen.queryByText('Speak')).toBeNull();
    });

    it('is a Study step only', () => {
      renderStepper({ canSpeak: true });
      expect(screen.queryByText('Speak')).toBeNull();
      studyResource();
      expect(screen.getByText('Speak')).toBeTruthy();
    });

    it('assigns Speak shown and unlocked by default', async () => {
      const { onAssign } = renderStepper({ canSpeak: true });
      studyResource();
      expect(screen.getByText('On')).toBeTruthy();
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input.speakLocked).toBe(false);
      expect(input.speakOff).toBeUndefined();
    });

    it('locks the Speak settings', async () => {
      const { onAssign } = renderStepper({ canSpeak: true });
      studyResource();
      fireEvent.click(screen.getByText('Speak'));
      fireEvent.click(
        screen.getByRole('switch', { name: 'Lock Speak settings' })
      );
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      expect(lastSubmission(onAssign).input.speakLocked).toBe(true);
    });

    it('turns Speak off for the assignment and hides the lock', async () => {
      const { onAssign } = renderStepper({ canSpeak: true });
      studyResource();
      fireEvent.click(screen.getByText('Speak'));
      fireEvent.click(
        screen.getByRole('switch', { name: 'Let students practice aloud' })
      );
      expect(
        screen.queryByRole('switch', { name: 'Lock Speak settings' })
      ).toBeNull();
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input.speakOff).toBe(true);
      expect(input.speakLocked).toBeUndefined();
    });

    it('sends no Speak fields on a Check', async () => {
      const { onAssign } = renderStepper({ canSpeak: true });
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input).not.toHaveProperty('speakLocked');
      expect(input).not.toHaveProperty('speakOff');
    });
  });

  it('blocks Assign without a ClassLink class', () => {
    render(
      <AuthContext.Provider
        value={
          {
            user: { uid: 't' },
            canAccessFeature: () => false,
          } as unknown as React.ContextType<typeof AuthContext>
        }
      >
        <FlashcardAssignStepper
          isOpen
          set={makeSet()}
          rosters={[roster('r9', 'Club')]}
          initialRosterIds={['r9']}
          onClose={vi.fn()}
          onAssign={vi.fn()}
        />
      </AuthContext.Provider>
    );
    expect(screen.getByRole('button', { name: 'Assign' })).toHaveProperty(
      'disabled',
      true
    );
  });

  describe('with flashcards-assign-v2', () => {
    it('shows the Cards and What students see steps', () => {
      renderStepper({ v2: true });
      expect(screen.getByText('Cards')).toBeTruthy();
      expect(screen.getByText('All 12 cards')).toBeTruthy();
      expect(screen.getByText('What students see')).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: /Study resource/ }));
      expect(screen.queryByText('Cards')).toBeNull();
    });

    it('assigns a random draw of the asked-for size', async () => {
      const { onAssign } = renderStepper({ v2: true });
      fireEvent.click(screen.getByText('Cards'));
      fireEvent.click(screen.getByRole('radio', { name: 'Random cards' }));
      fireEvent.change(screen.getByLabelText('Number of cards'), {
        target: { value: '4' },
      });
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input.set.cards).toHaveLength(4);
      expect(input.cardSelection).toEqual({ mode: 'random', count: 4 });
      expect(input.lockedSettings?.testCount).toBe('all');
    });

    it('assigns only the chosen cards and blocks an empty pick', async () => {
      const { onAssign } = renderStepper({ v2: true });
      fireEvent.click(screen.getByText('Cards'));
      fireEvent.click(screen.getByRole('radio', { name: 'Choose cards' }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(
        screen.getByRole('button', { name: 'Assign' }).hasAttribute('disabled')
      ).toBe(true);
      fireEvent.click(screen.getByRole('checkbox', { name: /term 2/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /term 7/ }));
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input.set.cards.map((c) => c.id)).toEqual(['c2', 'c7']);
      expect(input.cardSelection).toEqual({
        mode: 'pick',
        cardIds: ['c2', 'c7'],
      });
    });

    it('offers Speak as a check mode only when Speak is available', () => {
      renderStepper({ v2: true });
      fireEvent.click(screen.getByText('How students are checked'));
      expect(screen.queryByRole('radio', { name: 'Speak' })).toBeNull();
    });

    it('assigns a Speak check', async () => {
      const { onAssign } = renderStepper({ v2: true, canSpeak: true });
      fireEvent.click(screen.getByText('How students are checked'));
      fireEvent.click(screen.getByRole('radio', { name: 'Speak' }));
      assign();
      await waitFor(() => expect(onAssign).toHaveBeenCalled());
      const { input } = lastSubmission(onAssign);
      expect(input.kind).toBe('check');
      expect(input.checkMode).toBe('speak');
      expect(input.cardSelection).toBeUndefined();
    });
  });
});
