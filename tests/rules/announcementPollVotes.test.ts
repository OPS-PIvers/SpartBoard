// Firestore security-rules regression coverage for
// `/announcements/{announcementId}/pollVotes/{optionIndex}` — the live vote
// tally subcollection the front-of-room PollWidget writes to when a poll is
// embedded in an announcement (components/widgets/PollWidget/Widget.tsx).
//
// Contract under test (tightened from the prior `allow write: if request.auth
// != null` with no shape/value validation — see docs/scheduled-tasks/
// firestore-rules.md "MEDIUM pollVotes subcollection write is unrestricted"):
//   - Any authed user may create/update a tally doc, but ONLY with the exact
//     value the widget's `setDoc(..., {count: increment(1)}, {merge: true})`
//     produces: a create must land on `{count: 1}`, an update on previous + 1.
//     Field transforms are resolved into `request.resource` before rules run,
//     so the real call site passes while a same-shaped overwrite — `{count: 0}`
//     to wipe a tally, `{count: 999999}` to inflate one — is denied. (Scope
//     note: this is not per-voter dedup; a caller can still vote repeatedly.
//     It caps the damage per write at +1 instead of arbitrary, which is what
//     makes a tally reset or one-shot inflation impossible. True dedup needs a
//     per-voter vote doc redesign, out of scope here.)
//   - Delete is admin-only (mirrors the poll_sessions/votes sibling's
//     teacher/admin-only reset — no client ever deletes a pollVotes doc
//     today, so this closes an unused, unrestricted delete surface).
//   - Read stays open to any authed user (unchanged — anonymous tallies).
//
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc, increment } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-announcement-poll-votes-rules';
const ANNOUNCEMENT_ID = 'ann-1';
const ADMIN_EMAIL = 'admin@school.edu';
const ADMIN_UID = 'admin-uid';
const VOTER_UID = 'voter-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asVoter = (uid = VOTER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asUnauthed = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `announcements/${ANNOUNCEMENT_ID}`), {
      title: 'Test announcement',
    });
    await setDoc(doc(db, `announcements/${ANNOUNCEMENT_ID}/pollVotes/0`), {
      count: 5,
    });
  });
});

const voteRef = (db: ReturnType<typeof asVoter>, optionIndex: number) =>
  doc(db, `announcements/${ANNOUNCEMENT_ID}/pollVotes/${optionIndex}`);

describe('announcement pollVotes — write shape validation', () => {
  it('control: an authed voter can cast a vote the way PollWidget does (increment merge)', async () => {
    await assertSucceeds(
      setDoc(voteRef(asVoter(), 0), { count: increment(1) }, { merge: true })
    );
  });

  it('control: an authed voter can create a first vote on a fresh option', async () => {
    await assertSucceeds(
      setDoc(voteRef(asVoter(), 1), { count: increment(1) }, { merge: true })
    );
  });

  it('rejects a non-int count', async () => {
    await assertFails(setDoc(voteRef(asVoter(), 0), { count: '5' }));
  });

  it('rejects a negative count', async () => {
    await assertFails(setDoc(voteRef(asVoter(), 0), { count: -1 }));
  });

  it('rejects extra fields beyond count', async () => {
    await assertFails(
      setDoc(voteRef(asVoter(), 0), { count: 6, teacherUid: 'someone-else' })
    );
  });

  it('rejects resetting an existing tally to zero', async () => {
    await assertFails(setDoc(voteRef(asVoter(), 0), { count: 0 }));
  });

  it('rejects inflating an existing tally in one write', async () => {
    await assertFails(setDoc(voteRef(asVoter(), 0), { count: 999999 }));
  });

  it('rejects decrementing an existing tally', async () => {
    await assertFails(
      setDoc(voteRef(asVoter(), 0), { count: increment(-1) }, { merge: true })
    );
  });

  it('rejects an increment larger than one', async () => {
    await assertFails(
      setDoc(voteRef(asVoter(), 0), { count: increment(5) }, { merge: true })
    );
  });

  it('rejects creating a fresh option at anything other than one', async () => {
    await assertFails(setDoc(voteRef(asVoter(), 3), { count: 42 }));
  });

  it('a plain +1 overwrite matching the current tally is allowed (indistinguishable from a real vote)', async () => {
    // Seeded tally is 5, so a literal {count: 6} is exactly what increment(1)
    // resolves to — the rule authorises the value, not the transform used.
    await assertSucceeds(setDoc(voteRef(asVoter(), 0), { count: 6 }));
  });

  it('an unauthenticated caller cannot write a vote', async () => {
    await assertFails(setDoc(voteRef(asUnauthed(), 0), { count: 1 }));
  });

  it('KNOWN EDGE CASE: a legacy doc with an extra field (written before this rule existed) rejects all future increment-merge votes', async () => {
    // Documents the one gap flagged by review on this fix: `hasOnly(['count'])`
    // applies to the resulting merged document, not just the write payload, so
    // a pre-existing doc carrying any field beyond `count` — impossible via the
    // current PollWidget.vote() call site, but not impossible via a pre-fix
    // write or manual edit — would have every subsequent vote silently denied.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `announcements/${ANNOUNCEMENT_ID}/pollVotes/2`),
        { count: 3, teacherUid: 'legacy-write' }
      );
    });
    await assertFails(
      setDoc(voteRef(asVoter(), 2), { count: increment(1) }, { merge: true })
    );
  });
});

describe('announcement pollVotes — read', () => {
  it('any authed user can read live tallies', async () => {
    await assertSucceeds(getDoc(voteRef(asVoter(), 0)));
  });

  it('an unauthenticated caller cannot read tallies', async () => {
    await assertFails(getDoc(voteRef(asUnauthed(), 0)));
  });
});

describe('announcement pollVotes — delete', () => {
  it('an admin can delete a tally doc', async () => {
    await assertSucceeds(deleteDoc(voteRef(asAdmin(), 0)));
  });

  it('a non-admin authed voter cannot delete another poll’s tally', async () => {
    await assertFails(deleteDoc(voteRef(asVoter(), 0)));
  });
});
