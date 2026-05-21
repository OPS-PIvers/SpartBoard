// Firestore security-rules regression for the
// `/plcs/{plcId}/assignment_index/{assignmentId}` match block introduced
// with Phase 1 of the PLC Dashboard. The rules carry several subtle
// invariants that the dashboard's security model depends on:
//   - membership-gated reads
//   - author-only writes
//   - schema lock-down (`keys().hasOnly([...])`) so future readers don't
//     have to defensively parse unexpected payloads
//   - `sheetUrl` pinned to the trusted Google Sheets domain (anti-phish);
//     per-assignment sheets mean we can't pin to one canonical PLC URL
//   - update rule blocks owner takeover by a different PLC member
//   - immutability of `id`, `ownerUid`, `createdAt` on update
//
// A single CEL edit can silently break any of these. This file pins each
// one. Requires a running Firestore emulator — invoke via
// `pnpm run test:rules` (see vitest.rules.config.ts).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-plc-assignment-index';
const PLC_ID = 'plc-rules-test';
const ASSIGNMENT_ID = 'asn-rules-test';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const NON_MEMBER_UID = 'non-member-uid';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/canonical-sheet-id';
const PHISH_URL = 'https://evil.example.com/phish';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMemberA = () =>
  testEnv
    .authenticatedContext(MEMBER_A_UID, { email: 'member-a@example.com' })
    .firestore();

const asMemberB = () =>
  testEnv
    .authenticatedContext(MEMBER_B_UID, { email: 'member-b@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

// Canonical valid entry payload. Tests start from this and mutate fields
// to exercise individual invariants — keeping the "happy path" template
// in one place avoids drift across cases.
const validEntry = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  kind: 'quiz',
  ownerUid: MEMBER_A_UID,
  ownerName: 'Member A',
  ownerEmail: 'member-a@example.com',
  title: 'My Quiz',
  sheetUrl: SHEET_URL,
  // Phase 3: required field. 'active' is the canonical create-time value;
  // pause/resume/deactivate flow through the update branch which checks
  // the `status in [...]` set.
  status: 'active',
  createdAt: 1000,
  ...overrides,
});

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
  // Seed a PLC with two members and a canonical sharedSheetUrl. Use the
  // privileged context so we don't have to satisfy the rule's create
  // branch in test setup.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID],
      memberEmails: {
        [MEMBER_A_UID]: 'member-a@example.com',
        [MEMBER_B_UID]: 'member-b@example.com',
      },
      sharedSheetUrl: SHEET_URL,
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`
        ),
        validEntry()
      );
    });
  });

  it('a PLC member can read entries', async () => {
    await assertSucceeds(
      getDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });

  it('a non-member cannot read entries (membership gate)', async () => {
    // The dashboard renders the same list for every member; non-members
    // must not see the index at all. Without this gate, anyone with the
    // PLC id could enumerate every PLC-mode assignment a community has
    // run.
    await assertFails(
      getDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — create', () => {
  it('PLC member can create their own entry with a valid payload', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry()
      )
    );
  });

  it('rejects creation by a non-member (member-only authorship)', async () => {
    // Even with a valid-looking payload, a non-member cannot fabricate
    // an entry. This blocks the "I just learned this PLC's id" attack
    // surface.
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ ownerUid: NON_MEMBER_UID })
      )
    );
  });

  it('rejects when ownerUid != caller (no impersonation)', async () => {
    // Member A cannot author an entry "as" member B — the dashboard
    // displays `ownerName` from this snapshot, so an impersonation
    // would mislead other members about who ran the assignment.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ ownerUid: MEMBER_B_UID })
      )
    );
  });

  it('rejects when assignmentId path segment != entry.id (path/payload mismatch)', async () => {
    // The doc id must equal the source assignment id so the dashboard
    // can join back. Without this, members could write entries at
    // arbitrary paths and confuse the join logic.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/different-id`),
        validEntry({ id: ASSIGNMENT_ID })
      )
    );
  });

  it('rejects a non-Google sheetUrl (anti-phish domain pin)', async () => {
    // The dashboard renders `sheetUrl` as a clickable `<a href>`. If the
    // rule allowed an arbitrary string here, any member could turn the
    // PLC dashboard into a phishing redirect for every teammate. The
    // rule pins it to the trusted Google Sheets host/path prefix.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ sheetUrl: PHISH_URL })
      )
    );
  });

  it('rejects a docs.google.com URL outside /spreadsheets/ (e.g. /document/)', async () => {
    // A Google Docs (not Sheets) URL is still a Google host, but the
    // index only ever links per-assignment *sheets*. Pinning the
    // /spreadsheets/ path keeps the surface tight.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({
          sheetUrl: 'https://docs.google.com/document/d/some-doc-id',
        })
      )
    );
  });

  it('rejects a non-Google host that embeds the trusted prefix (anchor bypass)', async () => {
    // The domain pin is anchored (`^...$`) so an attacker can't smuggle a
    // hostile host by appending the trusted prefix as a fragment/query.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({
          sheetUrl:
            'https://evil.example.com/#https://docs.google.com/spreadsheets/d/x',
        })
      )
    );
  });

  it('accepts a per-assignment sheet URL that differs from the PLC sharedSheetUrl', async () => {
    // Regression: each assignment now gets its own unique sheet (#1448),
    // so the entry's `sheetUrl` will NOT equal the PLC's `sharedSheetUrl`.
    // The old exact-match pin rejected every per-assignment PLC create;
    // the domain-prefix rule must accept any valid Google Sheets URL.
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({
          sheetUrl:
            'https://docs.google.com/spreadsheets/d/per-assignment-unique-id/edit',
        })
      )
    );
  });

  it('rejects extra unknown fields (schema lock-down via keys().hasOnly)', async () => {
    // Closed schema — future readers can rely on the field set without
    // defensive parsing. A drift here would also hide payload bloat
    // that the rule should reject.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { ...validEntry(), unexpected: 'extra-field' }
      )
    );
  });

  it("accepts kind: 'video-activity' (PR3a widening)", async () => {
    // PR3a widened the rules constraint from `kind == 'quiz'` to
    // `kind in ['quiz', 'video-activity']` so VA's PR3b assignment-share
    // flow can write its own index entries. This test pins the new
    // allow-list and prevents a future narrowing regression.
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ kind: 'video-activity' })
      )
    );
  });

  it("rejects kind outside ['quiz', 'video-activity']", async () => {
    // The rule's `kind in [...]` is still a closed allowlist; arbitrary
    // values must still be rejected so the dashboard doesn't render rows
    // it doesn't know how to display.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ kind: 'mini-app' })
      )
    );
  });

  it('accepts a valid sheetUrl regardless of the parent PLC sharedSheetUrl', async () => {
    // The rule no longer cross-references the PLC's `sharedSheetUrl` — a
    // PLC whose `sharedSheetUrl` is null (first assignment hasn't run the
    // QuizResults export flow yet) must still accept a per-assignment
    // sheet create. This is the exact state most PLC quiz creates are in.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: null,
      });
    });
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        validEntry({ sheetUrl: SHEET_URL })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// update — owner takeover & immutability
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`
        ),
        validEntry()
      );
    });
  });

  it('original owner can update their own entry (e.g. retitle)', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { title: 'Renamed Quiz' }
      )
    );
  });

  it('a different PLC member CANNOT take over an entry by claiming ownerUid (the bypass we closed)', async () => {
    // This is the security flaw Copilot caught: the original combined
    // `allow create, update` rule only checked
    // `request.resource.data.ownerUid == request.auth.uid`, not the
    // *existing* `resource.data.ownerUid`. Member B could overwrite
    // member A's entry simply by setting `ownerUid` to themselves. If
    // this assertion ever flips to `assertSucceeds`, the takeover is
    // back.
    await assertFails(
      updateDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        {
          ownerUid: MEMBER_B_UID,
          ownerName: 'Member B',
          ownerEmail: 'member-b@example.com',
        }
      )
    );
  });

  it('rejects an attempt by the existing owner to change ownerUid (immutability)', async () => {
    // Even the rightful owner can't transfer ownership via update —
    // this would let a leaving member dump entries on a teammate.
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { ownerUid: MEMBER_B_UID }
      )
    );
  });

  it('rejects an attempt to mutate id (immutability)', async () => {
    // `id` is a copy of the source assignment id — changing it on the
    // entry would silently break the dashboard's join-back path.
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { id: 'different-id' }
      )
    );
  });

  it('rejects an attempt to mutate createdAt (immutability)', async () => {
    // `createdAt` orders the dashboard list — rewriting it would let an
    // owner re-pin their old entries to the top.
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { createdAt: 9999999 }
      )
    );
  });

  it('rejects an update that introduces an extra field (schema lock-down still applies)', async () => {
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { unexpected: 'extra-field' }
      )
    );
  });

  it('rejects sheetUrl drift to an arbitrary URL on update', async () => {
    // Same anti-phish guard as create — the owner can't later swap the
    // link to a non-Google host (they may still point it at a different
    // Google Sheets URL, which the domain-prefix rule permits).
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`),
        { sheetUrl: PHISH_URL }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`
        ),
        validEntry()
      );
    });
  });

  it('owner can delete their own entry', async () => {
    await assertSucceeds(
      deleteDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });

  it('a different PLC member cannot delete', async () => {
    // No lead-override on delete — leads who want to sweep stale entries
    // ask the owner. Pinning this prevents an accidental rule edit from
    // adding a permissive lead branch.
    await assertFails(
      deleteDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });
});
