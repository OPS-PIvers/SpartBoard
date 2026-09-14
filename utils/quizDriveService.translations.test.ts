// Translation sidecar naming + the name-collision fallback (plan §3.3).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuizDriveService } from './quizDriveService';
import type { QuizTranslation } from '@/types';

const payload: QuizTranslation = {
  locale: 'es',
  title: 'Números',
  questions: { q1: { text: '¿Cuál es primo?' } },
  sourceHashes: { q1: 'abc0123456789def' },
  reviewedQuestionIds: [],
  model: 'gemini-3.5-flash-lite',
  generatedAt: 1,
  updatedAt: 2,
};

const QUIZ_ID = '0123abcd-4567-89ef-0123-456789abcdef';

const ok = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);

const fail = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Folder lookups: app folder, then Quizzes folder. */
const stubFolders = () => {
  fetchMock.mockImplementationOnce(() => ok({ files: [{ id: 'app-folder' }] }));
  fetchMock.mockImplementationOnce(() =>
    ok({ files: [{ id: 'quiz-folder' }] })
  );
};

describe('translationFileName', () => {
  it('embeds the quiz id prefix and locale, and sanitizes the title', () => {
    expect(
      QuizDriveService.translationFileName(QUIZ_ID, 'Unit 3/4: Primes', 'es')
    ).toBe('Unit 3_4_ Primes.0123abcd.es.tr.json');
  });

  it('keeps two languages of the same quiz in separate files', () => {
    const es = QuizDriveService.translationFileName(QUIZ_ID, 'Numbers', 'es');
    const hmn = QuizDriveService.translationFileName(QUIZ_ID, 'Numbers', 'hmn');
    expect(es).not.toBe(hmn);
  });
});

describe('saveTranslation', () => {
  it('patches the known file id without touching the folder lookup', async () => {
    fetchMock.mockImplementationOnce(() => ok({}));
    const drive = new QuizDriveService('token');
    // The folder lookup still runs first, so stub it ahead of the patch.
    fetchMock.mockReset();
    stubFolders();
    fetchMock.mockImplementationOnce(() => ok({}));

    const id = await drive.saveTranslation(
      QUIZ_ID,
      'Numbers',
      'es',
      payload,
      'existing-file'
    );
    expect(id).toBe('existing-file');
    expect(fetchMock.mock.calls[2][0]).toContain('existing-file');
  });

  it('falls back to the same-name file in the folder when no id is known', async () => {
    stubFolders();
    fetchMock.mockImplementationOnce(() => ok({ files: [{ id: 'collided' }] }));
    fetchMock.mockImplementationOnce(() => ok({}));

    const drive = new QuizDriveService('token');
    const id = await drive.saveTranslation(QUIZ_ID, 'Numbers', 'es', payload);
    expect(id).toBe('collided');
    const listUrl = fetchMock.mock.calls[2][0] as string;
    expect(decodeURIComponent(listUrl)).toContain(
      'Numbers.0123abcd.es.tr.json'
    );
  });

  it('creates a new file when the update and the name lookup both miss', async () => {
    stubFolders();
    fetchMock.mockImplementationOnce(() => fail(404)); // stale existingFileId patch
    fetchMock.mockImplementationOnce(() => ok({ files: [] })); // no name collision
    fetchMock.mockImplementationOnce(() => ok({ id: 'created' })); // metadata
    fetchMock.mockImplementationOnce(() => ok({})); // content upload

    const drive = new QuizDriveService('token');
    const id = await drive.saveTranslation(
      QUIZ_ID,
      'Numbers',
      'es',
      payload,
      'stale-id'
    );
    expect(id).toBe('created');
  });
});

describe('loadTranslation / deleteTranslation', () => {
  it('returns the sidecar payload', async () => {
    fetchMock.mockImplementationOnce(() => ok(payload));
    const drive = new QuizDriveService('token');
    await expect(drive.loadTranslation('file-es')).resolves.toEqual(payload);
  });

  it('throws a specific error when the sidecar is gone', async () => {
    fetchMock.mockImplementationOnce(() => fail(404));
    const drive = new QuizDriveService('token');
    await expect(drive.loadTranslation('file-es')).rejects.toThrow(
      'Translation file not found in Drive'
    );
  });

  it('treats a missing file as a successful delete', async () => {
    fetchMock.mockImplementationOnce(() => fail(404));
    const drive = new QuizDriveService('token');
    await expect(drive.deleteTranslation('file-es')).resolves.toBeUndefined();
  });
});
