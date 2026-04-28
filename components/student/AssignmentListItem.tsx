import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2 } from 'lucide-react';
import { db, functions } from '@/config/firebase';
import {
  KIND_CONFIG,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';

/**
 * Lazy completion check — same pattern as the previous AssignmentCard but
 * surfaced as a calmer list-row visual matching the redesign.
 *
 * Pseudonym cache: per-(uid, sessionId), de-dupes the callable across
 * concurrent renders. Module-local; survives card remounts within a single
 * page lifetime. Pseudonyms are stable for a given (uid, assignmentId).
 */

let pseudonymCacheOwnerUid: string | null = null;
let pseudonymCache: Map<string, Promise<string>> = new Map();

function getCachedPseudonym(
  sessionId: string,
  pseudonymUid: string
): Promise<string> {
  if (pseudonymCacheOwnerUid !== pseudonymUid) {
    pseudonymCache = new Map();
    pseudonymCacheOwnerUid = pseudonymUid;
  }
  const cached = pseudonymCache.get(sessionId);
  if (cached) return cached;

  const callable = httpsCallable<
    { assignmentId: string },
    { pseudonym?: string }
  >(functions, 'getAssignmentPseudonymV1');

  const promise = callable({ assignmentId: sessionId }).then((res) => {
    const p = res.data?.pseudonym;
    if (typeof p !== 'string' || p.length === 0) {
      throw new Error('Pseudonym missing from callable response.');
    }
    return p;
  });

  pseudonymCache.set(sessionId, promise);
  promise.catch(() => {
    if (pseudonymCache.get(sessionId) === promise) {
      pseudonymCache.delete(sessionId);
    }
  });
  return promise;
}

/** Subcollection that holds per-student response/submission docs, keyed by pseudonym. */
const RESPONSE_SUBCOLLECTION: Record<AssignmentSummary['kind'], string | null> =
  {
    quiz: 'responses',
    'video-activity': 'responses',
    'guided-learning': 'responses',
    'mini-app': 'submissions',
    'activity-wall': 'submissions',
  };

export type CompletionState = 'unknown' | 'completed' | 'not-completed';

interface AssignmentListItemProps {
  assignment: AssignmentSummary;
  pseudonymUid: string | null;
  /** Optional class directory entry for the assignment's primary class — used in the meta line. */
  classEntry?: ClassDirectoryEntry;
  /** Hide the class name (e.g. when rendered inside a per-class view). */
  hideClassName?: boolean;
  /**
   * Called once the per-row completion check resolves to a non-'unknown'
   * state. The parent uses this to partition rows into Active vs Completed.
   */
  onCompletionResolved?: (
    sessionId: string,
    kind: AssignmentSummary['kind'],
    completion: CompletionState
  ) => void;
}

export const AssignmentListItem: React.FC<AssignmentListItemProps> = ({
  assignment,
  pseudonymUid,
  classEntry,
  hideClassName,
  onCompletionResolved,
}) => {
  const [completion, setCompletion] = useState<CompletionState>('unknown');
  const config = KIND_CONFIG[assignment.kind];
  const responseSub = RESPONSE_SUBCOLLECTION[assignment.kind];

  useEffect(() => {
    if (!pseudonymUid) return;
    if (!responseSub) return;

    let cancelled = false;
    const run = async () => {
      try {
        const pseudonym = await getCachedPseudonym(
          assignment.sessionId,
          pseudonymUid
        );
        if (cancelled) return;
        const snap = await getDoc(
          doc(
            db,
            config.collectionName,
            assignment.sessionId,
            responseSub,
            pseudonym
          )
        );
        if (cancelled) return;
        const next: CompletionState = snap.exists()
          ? 'completed'
          : 'not-completed';
        setCompletion(next);
        onCompletionResolved?.(assignment.sessionId, assignment.kind, next);
      } catch {
        // Silent: a failed completion check shouldn't block the student
        // from opening the assignment. Leave completion as 'unknown'.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    assignment.sessionId,
    assignment.kind,
    pseudonymUid,
    config.collectionName,
    responseSub,
    onCompletionResolved,
  ]);

  const isCompleted = completion === 'completed';

  return (
    <a
      href={assignment.openHref}
      className={`group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 ${
        isCompleted ? 'opacity-80' : ''
      }`}
    >
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 text-transparent'
        }`}
        aria-hidden="true"
      >
        {isCompleted && <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold sm:text-base ${
            isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'
          }`}
        >
          {assignment.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {!hideClassName && classEntry?.name && (
            <span className="font-medium text-slate-600">
              {classEntry.name}
            </span>
          )}
          {!hideClassName && classEntry?.name && (
            <span className="px-1.5 text-slate-300">·</span>
          )}
          <span>{config.label}</span>
        </p>
      </div>

      <span
        className={`hidden shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:inline-flex ${
          isCompleted
            ? 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
            : 'bg-brand-blue-primary text-white shadow-sm shadow-brand-blue-primary/20 group-hover:bg-brand-blue-dark'
        }`}
        aria-hidden="true"
      >
        {isCompleted ? 'Review' : 'Open'}
      </span>
    </a>
  );
};
