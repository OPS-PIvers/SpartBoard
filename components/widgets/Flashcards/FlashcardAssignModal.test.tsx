import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClassRoster, FlashcardSet } from '@/types';
import { FlashcardAssignModal } from './FlashcardAssignModal';
import {
  DEFAULT_FLASHCARD_ASSIGN_FORM,
  buildFlashcardAssignKindFields,
  buildFlashcardAssignSubmission,
  buildFlashcardLockedSettings,
  flashcardTestCountOptions,
  validateFlashcardAssignForm,
  type FlashcardAssignSubmission,
} from './utils/flashcardAssign';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';

vi.mock('@/components/common/library/AssignTargetingSection', () => ({
  AssignTargetingSection: () => <div data-testid="targeting" />,
}));

vi.mock('@/components/common/AssignClassPicker', () => ({
  AssignClassPicker: ({
    rosters,
    onChange,
  }: {
    rosters: ClassRoster[];
    onChange: (value: { rosterIds: string[] }) => void;
  }) => (
    <div>
      {rosters.map((roster) => (
        <button
          key={roster.id}
          type="button"
          onClick={() => onChange({ rosterIds: [roster.id] })}
        >
          Pick {roster.name}
        </button>
      ))}
    </div>
  ),
}));

const makeSet = (cardCount: number): FlashcardSet => ({
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

const ssoRoster: ClassRoster = {
  id: 'r1',
  name: 'Period 2',
  driveFileId: 'f1',
  studentCount: 1,
  createdAt: 0,
  classlinkClassId: 'CL-1',
  students: [
    {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
  ],
};

const localRoster: ClassRoster = {
  id: 'r2',
  name: 'Club',
  driveFileId: 'f2',
  studentCount: 0,
  createdAt: 0,
  students: [],
};

const renderModal = (
  cardCount = 12,
  initialRosterIds: string[] = ['r1']
): { onAssign: ReturnType<typeof vi.fn> } => {
  const onAssign = vi.fn(async (_submission: FlashcardAssignSubmission) => {
    await Promise.resolve();
  });
  render(
    <FlashcardAssignModal
      isOpen
      set={makeSet(cardCount)}
      rosters={[ssoRoster, localRoster]}
      initialRosterIds={initialRosterIds}
      onClose={() => undefined}
      onAssign={onAssign}
    />
  );
  return { onAssign };
};

const assignButton = (): HTMLButtonElement =>
  screen
    .getAllByRole('button', { name: /^Assign$/ })
    .at(-1) as HTMLButtonElement;

const submission = (onAssign: ReturnType<typeof vi.fn>) =>
  onAssign.mock.calls[0][0] as FlashcardAssignSubmission;

describe('FlashcardAssignModal', () => {
  it('defaults to Study and submits no Check settings', async () => {
    const { onAssign } = renderModal();
    expect(
      screen.getByRole('switch', { name: 'Collect a submission' })
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Study: students can use every mode/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Write' })).toBeNull();

    fireEvent.click(assignButton());
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
    const { input } = submission(onAssign);
    expect(input.kind).toBe('study');
    expect(input).not.toHaveProperty('checkMode');
    expect(input).not.toHaveProperty('lockedSettings');
    expect(input).not.toHaveProperty('scoreVisibility');
    expect(input.classIds).toEqual(['CL-1']);
    expect(input.rosterIds).toEqual(['r1']);
    expect(input.periodNames).toEqual(['Period 2']);
  });

  it('switches to Check and shows mode-specific settings', () => {
    renderModal();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Collect a submission' })
    );
    expect(screen.getByText(/Check: students complete one mode/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Flashcards' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
    expect(screen.queryByRole('switch', { name: 'Strict mode' })).toBeNull();
    expect(screen.getByLabelText('Score visibility')).toHaveValue('score');

    fireEvent.click(screen.getByRole('radio', { name: 'Write' }));
    expect(screen.getByRole('switch', { name: 'Strict mode' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '3' })).toBeNull();
    expect(screen.queryByLabelText('Questions')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Test' }));
    expect(
      screen.getByRole('checkbox', { name: 'Multiple choice' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Fill in the blank' })
    ).toBeChecked();
    const count = screen.getByLabelText('Questions');
    expect(
      Array.from(count.querySelectorAll('option')).map((o) => o.textContent)
    ).toEqual(['5', '10', 'All (12)']);
  });

  it('disables multiple choice below 4 cards', () => {
    renderModal(3);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Collect a submission' })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Test' }));
    const mc = screen.getByRole('checkbox', { name: 'Multiple choice' });
    expect(mc).toBeDisabled();
    expect(mc).not.toBeChecked();
    expect(
      screen.getByText('Multiple choice needs at least 4 cards.')
    ).toBeTruthy();
    expect(
      Array.from(
        screen.getByLabelText('Questions').querySelectorAll('option')
      ).map((o) => o.textContent)
    ).toEqual(['All (3)']);
  });

  it('requires at least one test type', () => {
    renderModal();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Collect a submission' })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Test' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choice' }));
    expect(assignButton()).not.toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Fill in the blank' })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose at least one question type.'
    );
    expect(assignButton()).toBeDisabled();
  });

  it('requires a ClassLink class', () => {
    renderModal(12, []);
    expect(assignButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pick Club' }));
    expect(assignButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pick Period 2' }));
    expect(assignButton()).not.toBeDisabled();
  });

  it('builds locked Test settings for a Check submission', async () => {
    const { onAssign } = renderModal();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Collect a submission' })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Test' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Definition' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Strict mode' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choice' }));
    fireEvent.change(screen.getByLabelText('Questions'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Score visibility'), {
      target: { value: 'none' },
    });

    fireEvent.click(assignButton());
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
    const { input } = submission(onAssign);
    expect(input.kind).toBe('check');
    expect(input.checkMode).toBe('test');
    expect(input).not.toHaveProperty('masteryThreshold');
    expect(input.scoreVisibility).toBe('none');
    expect(input.lockedSettings).toEqual({
      showFirst: 'definition',
      shuffle: false,
      favoritesOnly: false,
      hideMastered: false,
      strict: true,
      testTypes: ['fib'],
      testCount: 10,
    });
  });
});

describe('flashcardAssign helpers', () => {
  it('mirrors the player test count steps', () => {
    expect(flashcardTestCountOptions(4)).toEqual(['all']);
    expect(flashcardTestCountOptions(5)).toEqual(['all']);
    expect(flashcardTestCountOptions(11)).toEqual([5, 10, 'all']);
  });

  it('builds Flashcards Check fields with the mastery threshold', () => {
    const form = {
      ...DEFAULT_FLASHCARD_ASSIGN_FORM,
      collectSubmission: true,
      strict: true,
      masteryThreshold: 4 as const,
    };
    expect(buildFlashcardAssignKindFields(form, 8)).toEqual({
      kind: 'check',
      checkMode: 'flashcards',
      masteryThreshold: 4,
      scoreVisibility: 'score',
      lockedSettings: {
        showFirst: 'term',
        shuffle: false,
        favoritesOnly: false,
        hideMastered: false,
        strict: false,
        testTypes: ['mc', 'fib'],
        testCount: 'all',
      },
    });
  });

  it('drops MC and out-of-range counts for small decks', () => {
    const form = {
      ...DEFAULT_FLASHCARD_ASSIGN_FORM,
      collectSubmission: true,
      checkMode: 'test' as const,
      testCount: 10,
    };
    expect(buildFlashcardLockedSettings(form, 3)).toMatchObject({
      testTypes: ['fib'],
      testCount: 'all',
    });
    expect(validateFlashcardAssignForm({ ...form, testTypes: ['mc'] }, 3)).toBe(
      'no-test-types'
    );
    expect(validateFlashcardAssignForm(form, 0)).toBe('no-cards');
  });

  it('ignores deleted or failed rosters in the create input', () => {
    const { input, rosterIds } = buildFlashcardAssignSubmission({
      set: makeSet(6),
      form: DEFAULT_FLASHCARD_ASSIGN_FORM,
      rosters: [ssoRoster, { ...localRoster, loadError: 'nope' }],
      rosterIds: ['r1', 'r2', 'gone'],
      targeting: { ...EMPTY_ASSIGN_TARGETING_VALUE, closeAt: 123 },
    });
    expect(rosterIds).toEqual(['r1']);
    expect(input).toMatchObject({
      kind: 'study',
      classIds: ['CL-1'],
      rosterIds: ['r1'],
      periodNames: ['Period 2'],
      targetGroupIds: [],
      openAt: null,
      closeAt: 123,
      dueAt: null,
    });
  });
});
