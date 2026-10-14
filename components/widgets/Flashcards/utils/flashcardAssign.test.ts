import { describe, expect, it } from 'vitest';
import type { ClassRoster, FlashcardSet } from '@/types';
import {
  DEFAULT_FLASHCARD_ASSIGN_FORM,
  buildFlashcardAssignKindFields,
  buildFlashcardAssignSubmission,
  buildFlashcardLockedSettings,
  flashcardTestCountOptions,
  validateFlashcardAssignForm,
} from './flashcardAssign';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';

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
