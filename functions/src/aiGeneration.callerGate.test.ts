import { beforeEach, describe, expect, it, vi } from 'vitest';

const runTransaction = vi.fn<() => Promise<void>>();
const docGet = vi.fn(() =>
  Promise.resolve({ exists: false, data: () => undefined })
);
const fakeDb = {
  collection: () => ({ doc: () => ({ get: docGet, id: 'x' }) }),
  runTransaction,
};

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => fakeDb, {
    FieldValue: { serverTimestamp: () => 'ts', increment: (n: number) => n },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { HttpsError, onCall: (_o: unknown, handler: unknown) => handler };
});
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `mock-${name}`, name }),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => '@orono.k12.mn.us',
  resolveOrgIdForDomain: () => Promise.resolve('orono'),
}));
const isDistrictStaffToken = vi.fn(() => Promise.resolve(true));
vi.mock('./districtStaff', () => ({
  isDistrictStaffToken: () => isDistrictStaffToken(),
}));
const generateAi = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('./aiRouter', () => ({
  generateAi: (...a: unknown[]) => generateAi(...a),
}));

import {
  draftGuidedLearningStepTextV1,
  generateGuidedLearning,
  generateVideoActivity,
  generateWithAI,
  transcribeVideoWithGemini,
} from './aiGeneration';
import { __resetAiCallerGateCache } from './aiCallerGate';

type Handler = (req: { auth?: unknown; data: unknown }) => Promise<unknown>;
const callables: [string, Handler][] = [
  ['generateWithAI', generateWithAI as unknown as Handler],
  ['generateVideoActivity', generateVideoActivity as unknown as Handler],
  [
    'transcribeVideoWithGemini',
    transcribeVideoWithGemini as unknown as Handler,
  ],
  ['generateGuidedLearning', generateGuidedLearning as unknown as Handler],
  [
    'draftGuidedLearningStepTextV1',
    draftGuidedLearningStepTextV1 as unknown as Handler,
  ],
];

const teacher = {
  uid: 't1',
  token: {
    email: 'teacher@orono.k12.mn.us',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};

beforeEach(() => {
  __resetAiCallerGateCache();
  runTransaction.mockReset();
  docGet.mockClear();
  generateAi.mockReset();
  isDistrictStaffToken.mockReset();
  isDistrictStaffToken.mockResolvedValue(true);
});

describe('AI callables refuse non-teachers before any read or charge', () => {
  const refused = [
    [
      'anonymous',
      {
        firebase: { sign_in_provider: 'anonymous' },
        email: 'a@orono.k12.mn.us',
      },
    ],
    [
      'unverified',
      {
        email: 'teacher@orono.k12.mn.us',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      },
    ],
    ['student', { ...teacher.token, studentRole: true }],
  ] as const;
  for (const [name, call] of callables) {
    for (const [kind, token] of refused) {
      it(`${name} refuses a ${kind} token`, async () => {
        await expect(
          call({ auth: { uid: 'x1', token }, data: {} })
        ).rejects.toMatchObject({ code: 'permission-denied' });
        expect(runTransaction).not.toHaveBeenCalled();
        expect(docGet).not.toHaveBeenCalled();
        expect(generateAi).not.toHaveBeenCalled();
      });
    }
  }

  it('refuses a verified account with no staff or admin record', async () => {
    isDistrictStaffToken.mockResolvedValue(false);
    await expect(
      (generateWithAI as unknown as Handler)({
        auth: { uid: 'x1', token: { ...teacher.token, email: 'x@gmail.com' } },
        data: { type: 'poll', prompt: 'hi' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(runTransaction).not.toHaveBeenCalled();
    expect(generateAi).not.toHaveBeenCalled();
  });
});

describe('generateWithAI quota failure', () => {
  it('refuses the request and makes no model call when the quota transaction fails', async () => {
    runTransaction.mockRejectedValue(new Error('contention'));
    await expect(
      (generateWithAI as unknown as Handler)({
        auth: teacher,
        data: { type: 'poll', prompt: 'Make a poll' },
      })
    ).rejects.toMatchObject({ code: 'internal' });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(generateAi).not.toHaveBeenCalled();
  });
});
