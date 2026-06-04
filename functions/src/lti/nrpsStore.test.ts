/**
 * Tests for persistNrpsMembershipForLaunch — the PII-free NRPS-endpoint
 * persistence. Pins: (1) it files the membership under the JOINABLE, most-recent
 * session matching the code (the same one the student joins); (2) it keys by
 * sessionId → contextId; (3) it flips `ltiNrps` on the session only the FIRST
 * time a context is seen (no per-launch session-doc churn); (4) it is a no-op
 * when no joinable session matches; (5) it never writes a name/email.
 */

/* eslint-disable @typescript-eslint/require-await -- the structural Admin-SDK
   mock methods are async to match the real surface but don't await anything. */

import { describe, it, expect, beforeEach } from 'vitest';
import type * as admin from 'firebase-admin';
import {
  persistNrpsMembershipForLaunch,
  LTI_SESSION_MEMBERSHIPS_COLLECTION,
} from './nrpsStore';

interface SessionRow {
  id: string;
  code: string;
  status: string;
  startedAt: number | null;
  teacherUid?: string;
}

interface Write {
  path: string;
  data: Record<string, unknown>;
}

let sessions: SessionRow[] = [];
// Paths whose context doc should report `exists: true` on get().
let existingContextPaths: Set<string>;
let writes: Write[];

// Minimal structural Admin-SDK mock. Only the call shapes
// persistNrpsMembershipForLaunch uses are implemented.
function makeDb() {
  const ctxDocRef = (sessionId: string, contextId: string) => {
    const path = `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/${sessionId}/contexts/${contextId}`;
    return {
      get: async () => ({ exists: existingContextPaths.has(path) }),
      set: async (data: Record<string, unknown>) => {
        writes.push({ path, data });
      },
    };
  };
  return {
    collection: (name: string) => {
      if (name === 'quiz_sessions') {
        return {
          where: (_field: string, _op: string, value: string) => ({
            get: async () => ({
              docs: sessions
                .filter((s) => s.code === value)
                .map((s) => ({ id: s.id, data: () => s })),
            }),
          }),
          doc: (id: string) => ({
            set: async (data: Record<string, unknown>) => {
              writes.push({ path: `quiz_sessions/${id}`, data });
            },
          }),
        };
      }
      if (name === LTI_SESSION_MEMBERSHIPS_COLLECTION) {
        return {
          doc: (sessionId: string) => ({
            collection: () => ({
              doc: (contextId: string) => ctxDocRef(sessionId, contextId),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

const db = (): admin.firestore.Firestore =>
  makeDb() as unknown as admin.firestore.Firestore;

const ARGS = {
  quizCode: 'abc123', // normalizeQuizCode → 'ABC123'
  contextId: 'ctx-1',
  membershipUrl: 'https://lms/contexts/ctx-1/memberships',
  deploymentId: 'dep-1',
};

beforeEach(() => {
  sessions = [];
  existingContextPaths = new Set();
  writes = [];
});

describe('persistNrpsMembershipForLaunch', () => {
  it('files the membership under the joinable session and flips ltiNrps on first context', async () => {
    sessions = [
      { id: 'sess-1', code: 'ABC123', status: 'active', startedAt: 100 },
    ];
    const sessionId = await persistNrpsMembershipForLaunch(db(), ARGS);
    expect(sessionId).toBe('sess-1');

    const ctxWrite = writes.find((w) =>
      w.path.startsWith(
        `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/`
      )
    );
    expect(ctxWrite?.path).toBe(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`
    );
    expect(ctxWrite?.data).toMatchObject({
      contextMembershipsUrl: ARGS.membershipUrl,
      deploymentId: 'dep-1',
    });
    // PII gate: only the URL + ids are persisted.
    expect(Object.keys(ctxWrite?.data ?? {}).sort()).toEqual([
      'contextMembershipsUrl',
      'deploymentId',
      'updatedAt',
    ]);

    const flagWrite = writes.find((w) => w.path === 'quiz_sessions/sess-1');
    expect(flagWrite?.data).toEqual({ ltiNrps: true });
  });

  it('does NOT re-flip ltiNrps when the context already exists (no per-launch churn)', async () => {
    sessions = [
      { id: 'sess-1', code: 'ABC123', status: 'active', startedAt: 100 },
    ];
    existingContextPaths.add(
      `${LTI_SESSION_MEMBERSHIPS_COLLECTION}/sess-1/contexts/ctx-1`
    );
    await persistNrpsMembershipForLaunch(db(), ARGS);

    // Membership URL is still refreshed…
    expect(
      writes.some((w) =>
        w.path.endsWith('lti_session_memberships/sess-1/contexts/ctx-1')
      )
    ).toBe(true);
    // …but the session doc is NOT written again.
    expect(writes.some((w) => w.path === 'quiz_sessions/sess-1')).toBe(false);
  });

  it('picks the most-recent joinable session and ignores ended ones', async () => {
    sessions = [
      { id: 'old', code: 'ABC123', status: 'active', startedAt: 100 },
      { id: 'new', code: 'ABC123', status: 'active', startedAt: 500 },
      { id: 'ended', code: 'ABC123', status: 'ended', startedAt: 999 },
    ];
    const sessionId = await persistNrpsMembershipForLaunch(db(), ARGS);
    expect(sessionId).toBe('new');
  });

  it('is a no-op (returns null, no writes) when no joinable session matches', async () => {
    sessions = [{ id: 'ended', code: 'ABC123', status: 'ended', startedAt: 1 }];
    const sessionId = await persistNrpsMembershipForLaunch(db(), ARGS);
    expect(sessionId).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('returns null for an empty/garbage code without touching Firestore', async () => {
    const sessionId = await persistNrpsMembershipForLaunch(db(), {
      ...ARGS,
      quizCode: '   ',
    });
    expect(sessionId).toBeNull();
    expect(writes).toHaveLength(0);
  });
});
