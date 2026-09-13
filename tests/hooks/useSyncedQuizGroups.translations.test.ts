/**
 * PLC translation transport (plan §11 PR5): the group doc carries whole
 * sidecars, loaded from the owner's Drive at publish time. A locale whose
 * sidecar fails to load is omitted — syncing content never fails over it.
 *
 * Mocking mirrors useSyncedQuizGroups.test.ts.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  loadTranslationsForSync,
  publishSyncedQuiz,
  pullSyncedQuizContent,
  createSyncedQuizGroup,
} from '@/hooks/useSyncedQuizGroups';
import type { QuizTranslation, QuizTranslationIndexEntry } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const GROUP_ID = 'group-tr';
const UID = 'teacher-uid-tr';

const sidecar = (locale: string): QuizTranslation => ({
  locale,
  title: `Título ${locale}`,
  questions: { q1: { text: 'hola' } },
  sourceHashes: { q1: 'h1' },
  reviewedQuestionIds: ['q1'],
  model: 'm',
  generatedAt: 1,
  updatedAt: 2,
});

const indexEntry = (driveFileId: string): QuizTranslationIndexEntry => ({
  driveFileId,
  reviewedCount: 1,
  staleCount: 0,
  questionCount: 1,
  sourceHashes: { q1: 'h1' },
  updatedAt: 2,
});

const BASE_GROUP_DOC = {
  id: GROUP_ID,
  version: 2,
  title: 'Test Quiz',
  questions: [{ id: 'q1', type: 'MC', text: 'Q1?' }],
  participants: { [UID]: { joinedAt: 1000 } },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: UID,
};

beforeEach(() => {
  vi.clearAllMocks();
  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => segs.join('/')
  );
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);
  (firestore.deleteField as unknown as Mock).mockReturnValue('__delete__');
});

describe('loadTranslationsForSync', () => {
  it('loads every indexed locale from Drive', async () => {
    const drive = {
      loadTranslation: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(sidecar(id === 'file-es' ? 'es' : 'so'))
        ),
    };
    const out = await loadTranslationsForSync(drive, {
      es: indexEntry('file-es'),
      so: indexEntry('file-so'),
    });
    expect(Object.keys(out ?? {}).sort()).toEqual(['es', 'so']);
    expect(out?.es.reviewedQuestionIds).toEqual(['q1']);
  });

  it('omits a locale whose sidecar fails to load and keeps the rest', async () => {
    const drive = {
      loadTranslation: vi
        .fn()
        .mockImplementation((id: string) =>
          id === 'file-es'
            ? Promise.reject(new Error('Drive 404'))
            : Promise.resolve(sidecar('so'))
        ),
    };
    const out = await loadTranslationsForSync(drive, {
      es: indexEntry('file-es'),
      so: indexEntry('file-so'),
    });
    expect(Object.keys(out ?? {})).toEqual(['so']);
  });

  it('returns undefined when the quiz has no index at all', async () => {
    const drive = { loadTranslation: vi.fn() };
    await expect(loadTranslationsForSync(drive, undefined)).resolves.toBe(
      undefined
    );
    expect(drive.loadTranslation).not.toHaveBeenCalled();
  });

  it('skips a locale that would blow the group-doc byte ceiling', async () => {
    const huge: QuizTranslation = {
      ...sidecar('es'),
      questions: { q1: { text: 'x'.repeat(900_000) } },
    };
    const drive = {
      loadTranslation: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(id === 'file-es' ? huge : sidecar('so'))
        ),
    };
    const out = await loadTranslationsForSync(drive, {
      es: indexEntry('file-es'),
      so: indexEntry('file-so'),
    });
    expect(Object.keys(out ?? {})).toEqual(['so']);
  });
});

describe('publishSyncedQuiz — translations threading', () => {
  async function runPublish(translations?: Record<string, QuizTranslation>) {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => BASE_GROUP_DOC,
      }),
      update: vi.fn((_ref: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
      }),
      set: vi.fn(),
    };
    (firestore.runTransaction as unknown as Mock).mockImplementation(
      async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)
    );
    await publishSyncedQuiz(GROUP_ID, {
      title: 'Updated',
      questions: BASE_GROUP_DOC.questions as never,
      expectedVersion: 2,
      uid: UID,
      ...(translations ? { translations } : {}),
    });
    return updates[0];
  }

  it('publishes the loaded sidecars on the group doc', async () => {
    const patch = await runPublish({ es: sidecar('es') });
    expect(patch.translations).toEqual({ es: sidecar('es') });
  });

  it('clears the canonical payload when the publisher has none', async () => {
    const patch = await runPublish(undefined);
    expect(patch.translations).toBe('__delete__');
  });
});

describe('createSyncedQuizGroup / pullSyncedQuizContent — translations', () => {
  it('omits the key entirely on a quiz with no translations', async () => {
    await createSyncedQuizGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'T',
      questions: [],
    });
    const payload = (firestore.setDoc as unknown as Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('translations');
  });

  it('seeds the group doc with translations when present', async () => {
    await createSyncedQuizGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'T',
      questions: [],
      translations: { es: sidecar('es') },
    });
    const payload = (firestore.setDoc as unknown as Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(payload.translations).toEqual({ es: sidecar('es') });
  });

  it('returns the canonical translations to the puller', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC, translations: { es: sidecar('es') } }),
    });
    const pulled = await pullSyncedQuizContent(GROUP_ID);
    expect(pulled.translations?.es.title).toBe('Título es');
  });

  it('omits translations for a group doc that carries none', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => BASE_GROUP_DOC,
    });
    const pulled = await pullSyncedQuizContent(GROUP_ID);
    expect(pulled).not.toHaveProperty('translations');
  });
});
