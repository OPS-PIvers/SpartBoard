// On dev, saving a quiz whose Drive file belongs to the live site writes a dev copy instead of failing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuizDriveService } from './quizDriveService';
import { DevProdDriveWriteError } from './devDriveWriteGuard';
import type { QuizData } from '@/types';

const quiz = {
  id: '0123abcd-4567-89ef-0123-456789abcdef',
  title: 'Solar System',
  questions: [],
  createdAt: 1,
  updatedAt: 1,
} as unknown as QuizData;

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

let calls: { url: string; method: string }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method });
      if (method === 'PATCH' && url.includes('/files/prod-file'))
        throw new DevProdDriveWriteError();
      if (method === 'GET' && url.includes('google-apps.folder'))
        return json({ files: [{ id: 'folder-1' }] });
      if (method === 'GET') return json({ files: [] });
      if (method === 'POST') return json({ id: 'dev-file' });
      return json({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('QuizDriveService dev copy', () => {
  it('saveQuiz makes a new file and returns its id', async () => {
    const id = await new QuizDriveService('token').saveQuiz(quiz, 'prod-file');
    expect(id).toBe('dev-file');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(
      calls.some((c) => c.method === 'PATCH' && c.url.includes('/dev-file'))
    ).toBe(true);
  });

  it('saveTranslation makes a new sidecar and returns its id', async () => {
    const id = await new QuizDriveService('token').saveTranslation(
      quiz.id,
      quiz.title,
      'es',
      {
        locale: 'es',
        title: 'Sistema solar',
        questions: {},
        sourceHashes: {},
        reviewedQuestionIds: [],
        model: 'm',
        generatedAt: 1,
        updatedAt: 1,
      },
      'prod-file'
    );
    expect(id).toBe('dev-file');
  });

  it('still fails on other errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new TypeError('offline');
      })
    );
    await expect(
      new QuizDriveService('token').saveQuiz(quiz, 'any-file')
    ).rejects.toThrow('offline');
  });
});
