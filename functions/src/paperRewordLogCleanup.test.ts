import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
const captured = vi.hoisted(() => ({
  opts: undefined as { document: string; retry?: boolean } | undefined,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: (
    opts: { document: string; retry?: boolean },
    handler: unknown
  ) => {
    captured.opts = opts;
    return handler;
  },
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import * as admin from './firebaseAdmin';
import { cleanupPaperRewordLog } from './paperRewordLogCleanup';

type Handler = (event: {
  params: Record<string, string>;
  time?: string;
}) => Promise<void>;

let deletedPaths: string[];
let failWith: Error | null;

const makeRef = (path: string): Record<string, unknown> => ({
  path,
  collection: (name: string) => makeRef(`${path}/${name}`),
  doc: (id: string) => makeRef(`${path}/${id}`),
});

beforeEach(() => {
  deletedPaths = [];
  failWith = null;
  (admin.firestore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    collection: (name: string) => makeRef(name),
    recursiveDelete: (ref: { path: string }) => {
      if (failWith) return Promise.reject(failWith);
      deletedPaths.push(ref.path);
      return Promise.resolve();
    },
  });
});

describe('cleanupPaperRewordLog', () => {
  it('listens on response deletes and retries failures', () => {
    const opts = captured.opts;
    expect(opts?.document).toBe(
      'quiz_sessions/{sessionId}/responses/{responseKey}'
    );
    expect(opts?.retry).toBe(true);
  });

  const run = (time = new Date().toISOString()) =>
    (cleanupPaperRewordLog as unknown as Handler)({
      params: { sessionId: 'sess-1', responseKey: 'resp-1' },
      time,
    });

  it('removes the reword log of the deleted response', async () => {
    await run();
    expect(deletedPaths).toEqual([
      'quiz_sessions/sess-1/responses/resp-1/paper_reword_log',
    ]);
  });

  it('rethrows a failed sweep so the trigger can retry', async () => {
    failWith = new Error('boom');
    await expect(run()).rejects.toThrow('boom');
  });

  it('drops an event older than the retry budget', async () => {
    failWith = new Error('boom');
    await expect(
      run(new Date(Date.now() - 2 * 3600 * 1000).toISOString())
    ).resolves.toBeUndefined();
  });
});
