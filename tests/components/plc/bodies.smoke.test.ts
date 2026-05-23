/**
 * Block A smoke test — the Phase 2B body extraction
 * (`PlcQuizLibraryBody`) and its tab wrapper should all be importable
 * React function components.
 *
 * This is intentionally a static-shape test, not a render test. The
 * bodies pull in real Firestore / Drive collaborators through their
 * hooks; rendering them in a vitest environment requires the full mock
 * scaffolding the matching subTab tests already maintain. The high-
 * value regression that THIS test catches is "the body file ships
 * unimported because the wrapper rename dropped the re-export" — every
 * one of these symbols has to exist and be a function.
 */

import { describe, it, expect } from 'vitest';

import { PlcQuizLibraryBody } from '@/components/plc/bodies/PlcQuizLibraryBody';
import { PlcQuizLibraryTab } from '@/components/plc/tabs/PlcQuizLibraryTab';
import { NotesBody } from '@/components/plc/bodies/NotesBody';
import { TodosBody } from '@/components/plc/bodies/TodosBody';
import { PlcAnalyticsBody } from '@/components/plc/bodies/PlcAnalyticsBody';
import { MembersBody } from '@/components/plc/bodies/MembersBody';

describe('plc bodies — module shape', () => {
  it('Phase 2B bodies are function components', () => {
    expect(typeof PlcQuizLibraryBody).toBe('function');
  });

  it('tab wrappers still export (so legacy v1 tab routing keeps working)', () => {
    expect(typeof PlcQuizLibraryTab).toBe('function');
  });

  it('the Phase 2 bodies that shipped in #1582 are still exported', () => {
    expect(typeof NotesBody).toBe('function');
    expect(typeof TodosBody).toBe('function');
    expect(typeof PlcAnalyticsBody).toBe('function');
    expect(typeof MembersBody).toBe('function');
  });
});
