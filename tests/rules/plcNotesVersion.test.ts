// Firestore security-rules coverage for the PLC note OPTIMISTIC VERSION
// PRECONDITION (Decision 2.4, §3.8) and the Wave-2 widened note key set.
//
// This suite pins, end-to-end against the emulator, the exact contract the
// client `updateNote` transaction relies on:
//   - A versioned note may only be updated when the incoming `version` is
//     exactly `old + 1` (a stale writer who bumped from an older base is
//     rejected — the client surfaces the conflict toast and reloads).
//   - A same-version or skip-version write is denied.
//   - During rollout, an update where BOTH the stored and incoming docs omit
//     `version` is accepted (un-migrated notes keep saving), but a write that
//     INTRODUCES `version` onto a previously-unversioned doc is denied.
//   - The widened key set (`kind` / `meetingId` / `version` / `deletedAt`) is
//     accepted on create, and unknown fields stay locked out.
//
// It deliberately overlaps the version cases in plcNotesTodosWave2.test.ts so
// the version precondition has a dedicated, named home (per the T4 task) — the
// two suites stay independently readable.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-notes-version-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';

const MEMBER_UID = 'member-uid';
const MEMBER2_UID = 'member2-uid';
const OUTSIDER_UID = 'outsider-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
    .firestore();

const asMember2 = () =>
  testEnv
    .authenticatedContext(MEMBER2_UID, { email: 'member2@example.com' })
    .firestore();

const asOutsider = () =>
  testEnv
    .authenticatedContext(OUTSIDER_UID, { email: 'outsider@example.com' })
    .firestore();

const notePath = `plcs/${PLC_ID}/notes/${NOTE_ID}`;

/** A fully-formed versioned meeting note; override any field per test. */
const versionedNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Unit 4 CFA debrief',
  body: '## Agenda',
  kind: 'meeting',
  meetingId: 'm1',
  createdBy: MEMBER_UID,
  createdAt: 1,
  lastEditedBy: MEMBER_UID,
  lastEditedAt: 1,
  version: 1,
  deletedAt: null,
  ...overrides,
});

/** A legacy note with no `version` field (pre-Wave-2 shape). */
const legacyNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Legacy',
  body: 'No version field',
  createdBy: MEMBER_UID,
  createdAt: 1,
  lastEditedBy: MEMBER_UID,
  lastEditedAt: 1,
  ...overrides,
});

/** Seed a doc with rules disabled (test fixture setup, not under test). */
async function seed(data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), notePath), data);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, MEMBER2_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [MEMBER2_UID]: 'member2@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Widened key set on create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — Wave-2 widened keys', () => {
  it('member can create a note with kind/meetingId/version/deletedAt', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), notePath), versionedNote({ version: 0 }))
    );
  });

  it('rejects an unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), notePath), versionedNote({ priority: 'high' }))
    );
  });

  it('rejects a non-int version', async () => {
    await assertFails(
      setDoc(doc(asMember(), notePath), versionedNote({ version: '1' }))
    );
  });

  it('rejects an out-of-union kind', async () => {
    await assertFails(
      setDoc(doc(asMember(), notePath), versionedNote({ kind: 'todo' }))
    );
  });

  it('rejects a non-member create', async () => {
    await assertFails(
      setDoc(doc(asOutsider(), notePath), versionedNote({ version: 0 }))
    );
  });
});

// ---------------------------------------------------------------------------
// Version precondition on update — the core of Decision 2.4
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — version precondition', () => {
  it('accepts an update bumping version by exactly +1 (a different member)', async () => {
    await seed(versionedNote({ version: 3 }));
    await assertSucceeds(
      updateDoc(doc(asMember2(), notePath), {
        body: 'edited by teammate',
        lastEditedBy: MEMBER2_UID,
        lastEditedAt: 2,
        version: 4,
      })
    );
  });

  it('rejects a stale write that skips a version (lost the race)', async () => {
    await seed(versionedNote({ version: 3 }));
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'stale',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 5,
      })
    );
  });

  it('rejects a same-version write (no bump)', async () => {
    await seed(versionedNote({ version: 3 }));
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'no bump',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 3,
      })
    );
  });

  it('rejects a backwards version write', async () => {
    await seed(versionedNote({ version: 3 }));
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'backwards',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });

  // The EXACT shape the fixed client `updateNote` sends under a lost race
  // (Decision 2.4): the client loaded base version 3 and computes
  // `expectedVersion + 1 = 4`, but a teammate already committed 3 → 4 first, so
  // the canonical is now 4 and the client's `version: 4` fails `new == old + 1`
  // (4 == 4 + 1 is false). This is the path the OLD transaction-based client
  // never exercised (it re-read 4 and sent 5, which SUCCEEDED and silently
  // overwrote the teammate). Asserting it here proves the conflict surfaces.
  it('rejects a stale-base write of exactly old (loaded base + 1 == current)', async () => {
    // Teammate already advanced the canonical to version 4.
    await seed(versionedNote({ version: 4, body: 'teammate text' }));
    // This client loaded base 3 and sends 3 + 1 = 4 — equals current, so
    // `new == old + 1` (4 == 5) is false → rejected. No silent overwrite.
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'my stale draft',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 9,
        version: 4,
      })
    );
  });

  // The non-racing happy path for the same client shape: the loaded base is
  // current, so `expectedVersion + 1` is a clean +1 and the write succeeds.
  it('accepts a fresh-base write (loaded base == current, sends base + 1)', async () => {
    await seed(versionedNote({ version: 4 }));
    await assertSucceeds(
      updateDoc(doc(asMember(), notePath), {
        body: 'my up-to-date draft',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 9,
        version: 5,
      })
    );
  });

  it('requires the editor to stamp themselves into lastEditedBy', async () => {
    await seed(versionedNote({ version: 1 }));
    await assertFails(
      updateDoc(doc(asMember2(), notePath), {
        body: 'spoofed editor',
        lastEditedBy: MEMBER_UID, // not the caller (MEMBER2)
        lastEditedAt: 2,
        version: 2,
      })
    );
  });

  it('keeps createdBy/createdAt immutable across an edit', async () => {
    await seed(versionedNote({ version: 1 }));
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        createdBy: MEMBER2_UID,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });

  it('allows a soft-delete tombstone alongside the version bump', async () => {
    await seed(versionedNote({ version: 1 }));
    await assertSucceeds(
      updateDoc(doc(asMember(), notePath), {
        deletedAt: serverTimestamp(),
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Rollout escape hatch — un-versioned legacy notes
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — rollout escape hatch', () => {
  it('accepts an update where both stored + incoming omit version', async () => {
    await seed(legacyNote());
    await assertSucceeds(
      updateDoc(doc(asMember(), notePath), {
        body: 'edited legacy',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
      })
    );
  });

  it('rejects INTRODUCING a version onto a previously-unversioned note', async () => {
    await seed(legacyNote());
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'edited legacy',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 1,
      })
    );
  });
});
