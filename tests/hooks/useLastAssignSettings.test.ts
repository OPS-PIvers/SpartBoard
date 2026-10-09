import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { getDocMock, setDocMock, stored } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  stored: {} as Record<string, unknown>,
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/utils/viewAsAudit', () => ({
  viewAsDirectSave: (_ref: unknown, _fields: unknown, write: () => unknown) =>
    Promise.resolve(write()),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: getDocMock,
  setDoc: setDocMock,
}));

import {
  resetLastAssignSettingsCache,
  useLastAssignSettings,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';
import {
  getFlashcardAssignPrefill,
  parseLastFlashcardAssignSettings,
  useLastFlashcardAssignSettings,
} from '@/hooks/useLastFlashcardAssignSettings';
import {
  parseLastVideoAssignPacing,
  useLastVideoAssignPacing,
} from '@/hooks/useLastVideoAssignPacing';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from '@/components/widgets/Flashcards/utils/flashcardAssign';

const NUMBER_SPEC: LastAssignSettingsSpec<number> = {
  field: 'lastNumber',
  parse: (raw) => (typeof raw === 'number' ? raw : null),
  logTag: 'test',
};

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  getDocMock.mockReset();
  setDocMock.mockReset();
  getDocMock.mockImplementation(() =>
    Promise.resolve({
      exists: () => true,
      get: (field: string) => stored[field],
    })
  );
  setDocMock.mockResolvedValue(undefined);
  resetLastAssignSettingsCache();
});

describe('useLastAssignSettings', () => {
  it('falls back to null on first use and reports loaded', async () => {
    const { result } = renderHook(() =>
      useLastAssignSettings(NUMBER_SPEC, 'u1', true)
    );
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.lastUsed).toBeNull();
  });

  it('reads the stored value and is inert when disabled', async () => {
    stored.lastNumber = 7;
    const { result } = renderHook(() =>
      useLastAssignSettings(NUMBER_SPEC, 'u1', true)
    );
    await waitFor(() => expect(result.current.lastUsed).toBe(7));

    const off = renderHook(() =>
      useLastAssignSettings(NUMBER_SPEC, 'u1', false)
    );
    expect(off.result.current).toMatchObject({ lastUsed: null, loaded: true });
    off.result.current.save(3);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('saves only its own field and updates every mounted reader', async () => {
    const a = renderHook(() => useLastAssignSettings(NUMBER_SPEC, 'u1', true));
    const b = renderHook(() => useLastAssignSettings(NUMBER_SPEC, 'u1', true));
    await waitFor(() => expect(a.result.current.loaded).toBe(true));
    act(() => a.result.current.save(5));
    expect(setDocMock).toHaveBeenCalledWith(
      { path: 'users/u1/userProfile/profile' },
      { lastNumber: 5 },
      { mergeFields: ['lastNumber'] }
    );
    expect(a.result.current.lastUsed).toBe(5);
    expect(b.result.current.lastUsed).toBe(5);
  });

  it('drops a value its parser rejects', async () => {
    const { result } = renderHook(() =>
      useLastAssignSettings(NUMBER_SPEC, 'u1', true)
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.save('x' as unknown as number));
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('keeps activities apart', async () => {
    stored.lastVideoAssignPacing = 'teacher';
    const video = renderHook(() => useLastVideoAssignPacing('u1', true));
    const cards = renderHook(() => useLastFlashcardAssignSettings('u1', true));
    await waitFor(() => expect(video.result.current.lastUsed).toBe('teacher'));
    await waitFor(() => expect(cards.result.current.loaded).toBe(true));
    expect(cards.result.current.lastUsed).toBeNull();
  });
});

describe('parseLastFlashcardAssignSettings', () => {
  it('keeps valid rules and never stores the work switch', () => {
    expect(
      parseLastFlashcardAssignSettings({
        collectSubmission: true,
        checkMode: 'test',
        showFirst: 'definition',
        strict: true,
        testTypes: ['fib', 'junk'],
        testCount: 10,
        masteryThreshold: 4,
        scoreVisibility: 'none',
      })
    ).toEqual({
      checkMode: 'test',
      showFirst: 'definition',
      strict: true,
      testTypes: ['fib'],
      testCount: 10,
      masteryThreshold: 4,
      scoreVisibility: 'none',
    });
  });

  it('falls back to defaults field by field', () => {
    const { collectSubmission: _drop, ...defaults } =
      DEFAULT_FLASHCARD_ASSIGN_FORM;
    expect(
      parseLastFlashcardAssignSettings({
        checkMode: 'quiz',
        strict: 'yes',
        testTypes: [],
        testCount: 2.5,
        masteryThreshold: 9,
      })
    ).toEqual(defaults);
  });

  it.each([null, 'x', [1]])('rejects malformed value %#', (raw) => {
    expect(parseLastFlashcardAssignSettings(raw)).toBeNull();
  });
});

describe('getFlashcardAssignPrefill', () => {
  it('uses defaults on first use', () => {
    expect(getFlashcardAssignPrefill(null, 20)).toEqual(
      DEFAULT_FLASHCARD_ASSIGN_FORM
    );
  });

  it('resets a test count the deck cannot use', () => {
    const rules = parseLastFlashcardAssignSettings({ testCount: 15 });
    expect(getFlashcardAssignPrefill(rules, 20).testCount).toBe(15);
    expect(getFlashcardAssignPrefill(rules, 12).testCount).toBe('all');
    expect(getFlashcardAssignPrefill(rules, 12).collectSubmission).toBe(false);
  });
});

describe('parseLastVideoAssignPacing', () => {
  it('accepts only the two pacing modes', () => {
    expect(parseLastVideoAssignPacing('teacher')).toBe('teacher');
    expect(parseLastVideoAssignPacing('student')).toBe('student');
    expect(parseLastVideoAssignPacing('live')).toBeNull();
    expect(parseLastVideoAssignPacing(undefined)).toBeNull();
  });
});
