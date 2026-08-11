/**
 * Regression tests for `vertexClientOptions()` — the single helper every AI
 * callable (`generateWithAI`, `generateVideoActivity`, `transcribeVideoWithGemini`,
 * `generateGuidedLearning`) uses to construct its Vertex AI client.
 *
 * Raised in review on #2395: the helper resolved `project` purely from
 * `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` and threw `internal` when neither
 * was set. Neither variable appears in Google's list of variables set
 * automatically on Cloud Run — which is what gen2 functions run on, and whose
 * docs explicitly state it does NOT set `GOOGLE_CLOUD_PROJECT`. If the
 * deployed runtime doesn't populate them, all four callables throw
 * "AI service is not configured" on every invocation: a total AI outage.
 *
 * `FIREBASE_CONFIG` *is* guaranteed by Firebase Functions on both generations
 * and carries `projectId` — it's the same fallback firebase-functions' own
 * `projectID` / `gcloudProject` params read (they read ONLY FIREBASE_CONFIG,
 * so they complement the env vars rather than superseding them). The helper
 * now reads both sources.
 *
 * There was also no coverage of this helper at all — not the success path,
 * not the throw, not the `vertexai: true` construction. The repo's vitest
 * config sets `GCLOUD_PROJECT`, which only ever exercised the happy path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same module mocks as aiQuotaExternalLimit.test.ts, so importing
// aiGeneration.ts (which runs functionsInit + defineSecret at module load)
// stays pure.
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: () => ({}),
}));

vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    HttpsError,
    onCall: (_options: unknown, handler: unknown) => handler,
  };
});

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `mock-${name}`, name }),
}));

vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (email: string): string | null => {
    const at = email.lastIndexOf('@');
    if (at < 0 || at === email.length - 1) return null;
    return '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: (): Promise<string | null> => Promise.resolve(null),
}));

import { __vertexClientOptions, __VERTEX_LOCATION } from './aiGeneration';

const PROJECT_KEYS = [
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_CONFIG',
] as const;

// vitest.config.ts sets GCLOUD_PROJECT for the whole suite; these tests own
// the project-id environment, so snapshot and restore it per test.
let saved: Partial<Record<(typeof PROJECT_KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = {};
  for (const key of PROJECT_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of PROJECT_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe('vertexClientOptions — project id resolution', () => {
  it('resolves from GCLOUD_PROJECT', () => {
    process.env.GCLOUD_PROJECT = 'from-gcloud';
    expect(__vertexClientOptions().project).toBe('from-gcloud');
  });

  it('resolves from GOOGLE_CLOUD_PROJECT when GCLOUD_PROJECT is absent', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'from-google-cloud';
    expect(__vertexClientOptions().project).toBe('from-google-cloud');
  });

  it('falls back to FIREBASE_CONFIG.projectId when neither env var is set', () => {
    // The regression this PR's review flagged: on a gen2 runtime that sets
    // neither variable, this previously threw and took every AI callable down.
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'from-firebase-config',
      storageBucket: 'ignored',
    });
    expect(__vertexClientOptions().project).toBe('from-firebase-config');
  });

  it('prefers GCLOUD_PROJECT over the FIREBASE_CONFIG fallback', () => {
    process.env.GCLOUD_PROJECT = 'from-gcloud';
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'other' });
    expect(__vertexClientOptions().project).toBe('from-gcloud');
  });
});

describe('vertexClientOptions — client construction', () => {
  it('targets Vertex AI at the global endpoint', () => {
    process.env.GCLOUD_PROJECT = 'demo-spartboard';
    const opts = __vertexClientOptions();

    // vertexai:true is what routes the SDK at Vertex rather than the Gemini
    // Developer API — the whole point of this migration, and the reason the
    // module no longer holds an API key.
    expect(opts.vertexai).toBe(true);
    expect(opts.location).toBe(__VERTEX_LOCATION);
    expect(opts.location).toBe('global');
    // No API key may be smuggled back in; auth is ADC.
    expect(opts).not.toHaveProperty('apiKey');
  });
});

describe('vertexClientOptions — missing project id', () => {
  const expectConfigError = () => {
    try {
      __vertexClientOptions();
    } catch (err) {
      return err as { code?: string; message?: string };
    }
    throw new Error('expected vertexClientOptions() to throw');
  };

  it('throws an internal HttpsError when no source supplies a project id', () => {
    const err = expectConfigError();
    expect(err.code).toBe('internal');
    // Matches the failure mode the old missing-API-key guards had, and does
    // not leak configuration detail to the client.
    expect(err.message).toBe('AI service is not configured.');
  });

  it('throws rather than surfacing a SyntaxError on malformed FIREBASE_CONFIG', () => {
    // A parse failure must not mask the clear "not configured" error with a
    // raw SyntaxError from JSON.parse.
    process.env.FIREBASE_CONFIG = '{not valid json';
    const err = expectConfigError();
    expect(err.code).toBe('internal');
    expect(err.message).toBe('AI service is not configured.');
  });

  it('throws when FIREBASE_CONFIG parses but carries no projectId', () => {
    process.env.FIREBASE_CONFIG = JSON.stringify({ storageBucket: 'b' });
    expect(expectConfigError().code).toBe('internal');
  });

  it('throws when FIREBASE_CONFIG.projectId is a non-string', () => {
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 123 });
    expect(expectConfigError().code).toBe('internal');
  });
});
