/**
 * useSchoologySeenSections — live subscription to the per-teacher inventory of
 * Schoology (LTI) sections SpartBoard has SEEN via a launch
 * (`users/{teacherUid}/lti_seen_sections`, written server-side on student
 * launches). Drives the "Link to Schoology" review screen + the dashboard nudge:
 * each entry carries the section title (recognition) and the `sessionId` the
 * linking CFs use as their trust anchor.
 *
 * Schoology has no "list my courses" API, so this passive inventory is the only
 * way the client knows which sections exist to link. Owner-scoped + owner-read
 * (rules), so a teacher only ever sees their own sections.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { LtiLinkKind } from '@/utils/ltiCourseLinks';

export interface SchoologySeenSection {
  /** The Schoology section's LTI `context_id` (the doc id). */
  contextId: string;
  /** The section title captured at launch, or null if the platform withheld it. */
  contextTitle: string | null;
  /** A session the teacher owns that saw this section (the linking trust anchor). */
  sessionId: string;
  kind: LtiLinkKind;
}

/**
 * Subscribe to the signed-in teacher's seen-Schoology-section inventory. Returns
 * `[]` until loaded / when signed out, and on any read error (the feature simply
 * doesn't surface rather than erroring the shell).
 */
export function useSchoologySeenSections(
  teacherUid: string | null | undefined
): SchoologySeenSection[] {
  const [sections, setSections] = useState<SchoologySeenSection[]>([]);

  useEffect(() => {
    // Signed out → don't subscribe; the render guard below yields []. (No
    // synchronous setState in the effect body — see the project's effect rules.)
    if (!teacherUid) return;
    const ref = collection(db, 'users', teacherUid, 'lti_seen_sections');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list = snap.docs
          .map((d): SchoologySeenSection => {
            const data = d.data() as Partial<SchoologySeenSection>;
            return {
              contextId:
                typeof data.contextId === 'string' ? data.contextId : d.id,
              contextTitle:
                typeof data.contextTitle === 'string'
                  ? data.contextTitle
                  : null,
              sessionId:
                typeof data.sessionId === 'string' ? data.sessionId : '',
              kind: data.kind === 'va' ? 'va' : 'quiz',
            };
          })
          // A section with no usable sessionId can't satisfy the trust anchor,
          // so it can't be linked — drop it from the actionable inventory.
          .filter((s) => !!s.sessionId);
        setSections(list);
      },
      () => setSections([])
    );
    return unsub;
  }, [teacherUid]);

  // Mask any stale subscription state while signed out (the effect doesn't reset
  // it synchronously); a live subscription drives `sections` otherwise.
  return teacherUid ? sections : [];
}
