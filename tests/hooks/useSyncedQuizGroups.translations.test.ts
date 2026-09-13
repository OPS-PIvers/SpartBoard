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
  restoreSyncedVersion,
  syncedTranslationsInput,
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
    expect(Object.keys(out.translations).sort()).toEqual(['es', 'so']);
    expect(out.translations.es.reviewedQuestionIds).toEqual(['q1']);
    expect(out.complete).toBe(true);
  });

  it('omits a locale whose sidecar fails to load and reports incomplete', async () => {
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
    expect(Object.keys(out.translations)).toEqual(['so']);
    expect(out.complete).toBe(false);
  });

  it('reports an empty complete load when the quiz has no index at all', async () => {
    const drive = { loadTranslation: vi.fn() };
    const out = await loadTranslationsForSync(drive, undefined);
    expect(out).toEqual({ translations: {}, complete: true });
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
    expect(Object.keys(out.translations)).toEqual(['so']);
    expect(out.complete).toBe(false);
  });

  it('measures UTF-8 bytes, not UTF-16 units, for non-Latin text', async () => {
    // 300k CJK chars ≈ 900 KB of UTF-8 but only 300k String.length units.
    const cjk: QuizTranslation = {
      ...sidecar('zh'),
      questions: { q1: { text: '\u6f22'.repeat(300_000) } },
    };
    const drive = {
      loadTranslation: vi.fn().mockResolvedValue(cjk),
    };
    const out = await loadTranslationsForSync(drive, {
      zh: indexEntry('file-zh'),
    });
    expect(out.translations).toEqual({});
    expect(out.complete).toBe(false);
  });

  it('seeds the byte budget with the rest of the doc', async () => {
    const payload: QuizTranslation = {
      ...sidecar('es'),
      questions: { q1: { text: 'y'.repeat(500_000) } },
    };
    const drive = { loadTranslation: vi.fn().mockResolvedValue(payload) };
    const withoutBase = await loadTranslationsForSync(drive, {
      es: indexEntry('file-es'),
    });
    expect(Object.keys(withoutBase.translations)).toEqual(['es']);
    const withBase = await loadTranslationsForSync(
      drive,
      { es: indexEntry('file-es') },
      { docBase: { questions: [{ text: 'z'.repeat(400_000) }] } }
    );
    expect(withBase.translations).toEqual({});
    expect(withBase.complete).toBe(false);
  });
});

describe('syncedTranslationsInput', () => {
  it('clears only when the load completed and the owner has no locales', () => {
    expect(
      syncedTranslationsInput({ translations: {}, complete: true })
    ).toEqual({ translations: {} });
  });

  it('omits the key when a sidecar failed to load', () => {
    expect(
      syncedTranslationsInput({ translations: {}, complete: false })
    ).toEqual({});
  });

  it('passes the loaded locales through', () => {
    const translations = { es: sidecar('es') };
    expect(syncedTranslationsInput({ translations, complete: true })).toEqual({
      translations,
    });
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
      ...(translations === undefined ? {} : { translations }),
    });
    return updates[0];
  }

  it('publishes the loaded sidecars on the group doc', async () => {
    const patch = await runPublish({ es: sidecar('es') });
    expect(patch.translations).toEqual({ es: sidecar('es') });
  });

  it('preserves the canonical payload when the caller omits translations', async () => {
    const patch = await runPublish(undefined);
    expect(patch).not.toHaveProperty('translations');
  });

  it('clears the canonical payload only on an explicit empty map', async () => {
    const patch = await runPublish({});
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

describe('restoreSyncedVersion — translations preservation', () => {
  it('re-publishes the canonical translations a snapshot cannot carry', async () => {
    const current = {
      ...BASE_GROUP_DOC,
      translations: { es: sidecar('es') },
    };
    (firestore.getDoc as unknown as Mock)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          content: { title: 'Old', questions: BASE_GROUP_DOC.questions },
        }),
      })
      .mockResolvedValueOnce({ exists: () => true, data: () => current });
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      get: vi
        .fn()
        .mockResolvedValue({ exists: () => true, data: () => current }),
      update: vi.fn((_ref: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
      }),
      set: vi.fn(),
    };
    (firestore.runTransaction as unknown as Mock).mockImplementation(
      async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)
    );
    await restoreSyncedVersion(GROUP_ID, 1, UID);
    expect(updates[0].translations).toEqual({ es: sidecar('es') });
  });
});

describe('pullSyncedQuizContent — hostile translations payloads', () => {
  const pullWith = async (translations: unknown) => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC, translations }),
    });
    return pullSyncedQuizContent(GROUP_ID);
  };

  it('drops a non-object translations value entirely', async () => {
    await expect(pullWith('not-a-map')).resolves.not.toHaveProperty(
      'translations'
    );
    await expect(pullWith([sidecar('es')])).resolves.not.toHaveProperty(
      'translations'
    );
  });

  it('drops non-object locale payloads and keeps the good ones', async () => {
    const pulled = await pullWith({ es: sidecar('es'), so: 'garbage', fr: 7 });
    expect(Object.keys(pulled.translations ?? {})).toEqual(['es']);
  });

  it('coerces a malformed locale payload through the sidecar normalizer', async () => {
    const pulled = await pullWith({
      es: { locale: 'es', reviewedQuestionIds: 'q1', questions: null },
    });
    expect(pulled.translations?.es.reviewedQuestionIds).toEqual([]);
    expect(pulled.translations?.es.questions).toEqual({});
    expect(pulled.translations?.es.title).toBe('');
  });
});
