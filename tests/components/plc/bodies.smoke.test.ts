/**
 * Block A smoke test — the Phase 2B body extraction (`PlcQuizLibraryBody`)
 * and the shared section bodies should all be importable React function
 * components.
 *
 * This is intentionally a static-shape test, not a render test. The
 * bodies pull in real Firestore / Drive collaborators through their
 * hooks; rendering them in a vitest environment requires the full mock
 * scaffolding the matching subTab tests already maintain. The high-
 * value regression that THIS test catches is "the body file ships
 * unimported because a wrapper rename dropped the re-export" — every
 * one of these symbols has to exist and be a function.
 *
 * Wave-4 cleanup (§6.5 / Decision 4.4) deleted the no-value `tabs/*`
 * shims (`PlcQuizLibraryTab`, `PlcVideoActivitiesTab`, `PlcNotesTab`,
 * `PlcTodosTab`, `PlcSharedBoardsTab`) — the dashboard now routes
 * straight to the bodies (`PlcAssessmentsBody`, `NotesDocsBody`,
 * `TodosBody`, `PlcSharedBoardsBody`). This test now asserts the live
 * bodies are exported function components.
 */

import { describe, it, expect } from 'vitest';

import { PlcQuizLibraryBody } from '@/components/plc/bodies/PlcQuizLibraryBody';
import { PlcAssessmentsBody } from '@/components/plc/bodies/PlcAssessmentsBody';
import { NotesBody } from '@/components/plc/bodies/NotesBody';
import { TodosBody } from '@/components/plc/bodies/TodosBody';
import { PlcSharedBoardsBody } from '@/components/plc/bodies/PlcSharedBoardsBody';
import { PlcAnalyticsBody } from '@/components/plc/bodies/PlcAnalyticsBody';
import { MembersBody } from '@/components/plc/bodies/MembersBody';

describe('plc bodies — module shape', () => {
  it('Phase 2B bodies are function components', () => {
    expect(typeof PlcQuizLibraryBody).toBe('function');
  });

  it('the unified Assessments host body (Wave-4) is a function component', () => {
    expect(typeof PlcAssessmentsBody).toBe('function');
  });

  it('the bodies the dashboard now mounts directly are exported (no shim layer)', () => {
    expect(typeof NotesBody).toBe('function');
    expect(typeof TodosBody).toBe('function');
    expect(typeof PlcSharedBoardsBody).toBe('function');
    expect(typeof PlcAnalyticsBody).toBe('function');
    expect(typeof MembersBody).toBe('function');
  });
});
