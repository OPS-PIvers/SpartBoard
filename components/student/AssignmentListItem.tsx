import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { db, functions } from '@/config/firebase';
import {
  KIND_CONFIG,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import { useDialog } from '@/context/useDialog';
import { logError } from '@/utils/logError';

/**
 * Lazy completion check — same pattern as the previous AssignmentCard but
 * surfaced as a calmer list-row visual matching the redesign.
 *
 * Per-kind doc-id strategy: response/submission docs are keyed differently
 * by assignment kind. Probing the wrong key always misses, which would
 * leave the row in a permanent 'not-completed' state and (post the
 * MyAssignmentsPage partition fix) drop a participating student's
 * completed assignment from the Completed section.
 *
 *   - quiz / video-activity / guided-learning: studentRole users write
 *     under `auth.uid` (the opaque pseudonym from `studentLoginV1`), via
 *     `computeResponseKey` in useQuizSession / useVideoActivitySession,
 *     and via the anonymousUid path in GuidedLearningStudentApp. The
 *     value is the same as `pseudonymUid` from useStudentAuth.
 *   - mini-app: written under the per-assignment HMAC pseudonym from
 *     `getAssignmentPseudonymV1` so a teacher can match-back without
 *     persisting PII (see MiniAppStudentApp.submit).
 *   - activity-wall: every submission is a fresh random UUID, so a doc
 *     existence probe is meaningless — skip the check entirely.
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

/**
 * Per-kind response/submission doc-id strategy. See the file header for the
 * keying contracts each session app actually writes under.
 *   - 'auth-uid'             — doc id == pseudonymUid (auth.uid).
 *   - 'assignment-pseudonym' — doc id == HMAC(uid, assignmentId) via the
 *                              `getAssignmentPseudonymV1` callable.
 *   - 'none'                 — no per-student doc id (e.g. activity-wall
 *                              writes a fresh UUID per submission); skip
 *                              the lazy completion check for this kind.
 */
type DocIdStrategy = 'auth-uid' | 'assignment-pseudonym' | 'none';

const DOC_ID_STRATEGY: Record<AssignmentSummary['kind'], DocIdStrategy> = {
  quiz: 'auth-uid',
  'video-activity': 'auth-uid',
  'guided-learning': 'auth-uid',
  'mini-app': 'assignment-pseudonym',
  'activity-wall': 'none',
};

/** Subcollection that holds per-student response/submission docs. */
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
  /**
   * When true, render the row in a low-emphasis "verifying" state instead
   * of the standard look. Used for ended-channel rows whose completion
   * check is still resolving — those are surfaced optimistically in the
   * Completed section so the check can fire (see MyAssignmentsPage
   * partition logic), and the muted visual prevents a row from looking
   * like a real "Completed" entry until we've confirmed the student
   * actually participated.
   */
  pendingVerification?: boolean;
}

export const AssignmentListItem: React.FC<AssignmentListItemProps> = ({
  assignment,
  pseudonymUid,
  classEntry,
  hideClassName,
  onCompletionResolved,
  pendingVerification,
}) => {
  const [completion, setCompletion] = useState<CompletionState>('unknown');
  // Only the quiz kind has `resultsLockedOut` on its response doc. Other
  // assignment kinds don't carry this field — strict equality below means a
  // missing/undefined field never trips the locked state.
  const [lockedOut, setLockedOut] = useState(false);
  const { showAlert } = useDialog();
  const config = KIND_CONFIG[assignment.kind];
  const responseSub = RESPONSE_SUBCOLLECTION[assignment.kind];
  const docIdStrategy = DOC_ID_STRATEGY[assignment.kind];

  useEffect(() => {
    if (!pseudonymUid) return;
    if (!responseSub) return;
    if (docIdStrategy === 'none') return;

    let cancelled = false;
    const run = async () => {
      try {
        const docId =
          docIdStrategy === 'assignment-pseudonym'
            ? await getCachedPseudonym(assignment.sessionId, pseudonymUid)
            : pseudonymUid;
        if (cancelled) return;
        const snap = await getDoc(
          doc(
            db,
            config.collectionName,
            assignment.sessionId,
            responseSub,
            docId
          )
        );
        if (cancelled) return;
        const next: CompletionState = snap.exists()
          ? 'completed'
          : 'not-completed';
        setCompletion(next);
        // Quiz-only: surface the teacher-controlled lockout flag so the row
        // can render a Locked badge and intercept the tap. Strict equality
        // keeps legacy responses (no field) out of the locked state.
        if (assignment.kind === 'quiz' && snap.exists()) {
          setLockedOut(snap.data()?.resultsLockedOut === true);
        }
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
    docIdStrategy,
    onCompletionResolved,
  ]);

  const isCompleted = completion === 'completed';
  // Pending verification only renders when the parent has surfaced an
  // ended-channel row before its completion check resolved. Once the
  // check confirms participation the row re-renders with the standard
  // "completed" treatment; if it confirms non-participation the parent
  // drops the row from its partition entirely.
  const isPending: boolean = !!pendingVerification && !isCompleted;

  const isGraded = assignment.gradingState === 'graded';

  /**
   * Re-check the live `resultsLockedOut` state from Firestore before either
   * blocking the click or surfacing the alert. Our row-level `lockedOut`
   * comes from a one-shot `getDoc` during the completion check and never
   * subscribes to changes — so if the teacher has unlocked the response
   * since the page rendered, the stale flag would otherwise strand the
   * student behind a "Locked" badge until they refreshed. On any error
   * (network, missing doc, etc.) we fall through to the alert as if still
   * locked — failing closed is safer than allowing access on an unknown.
   */
  const recheckLockAndProceed = async (): Promise<void> => {
    if (!responseSub || docIdStrategy === 'none' || !pseudonymUid) {
      void showAlert(
        'Locked by your teacher. Ask them to unlock your results.',
        { title: 'Results locked', variant: 'warning' }
      );
      return;
    }
    try {
      const docId =
        docIdStrategy === 'assignment-pseudonym'
          ? await getCachedPseudonym(assignment.sessionId, pseudonymUid)
          : pseudonymUid;
      const snap = await getDoc(
        doc(db, config.collectionName, assignment.sessionId, responseSub, docId)
      );
      const stillLocked =
        snap.exists() && snap.data()?.resultsLockedOut === true;
      if (!stillLocked) {
        setLockedOut(false);
        // Teacher has unlocked since our initial check. Since we stripped
        // `href` to defeat middle-click bypass, navigate programmatically.
        window.location.assign(assignment.openHref);
        return;
      }
    } catch (err) {
      // Re-check failed (network, permission, transient Firestore error).
      // We don't know the live state — surface a recoverable message rather
      // than a misleading "your teacher locked this" alert, and log so
      // operators can see the failure rate.
      logError('AssignmentListItem.recheckLock', err, {
        sessionId: assignment.sessionId,
        kind: assignment.kind,
      });
      void showAlert(
        'Could not verify your results status. Check your connection and try again in a moment.',
        { title: 'Connection issue', variant: 'warning' }
      );
      return;
    }
    void showAlert('Locked by your teacher. Ask them to unlock your results.', {
      title: 'Results locked',
      variant: 'warning',
    });
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (!lockedOut) return;
    // Quiz results have been locked by the teacher. Block the default
    // navigation, then re-check the live state — the teacher may have
    // unlocked since the row's initial completion check resolved.
    e.preventDefault();
    e.stopPropagation();
    void recheckLockAndProceed();
  };

  // An <a> without href is no longer in the natural tab order. To keep the
  // locked row reachable by keyboard, we force `tabIndex={0}` and handle
  // Enter / Space ourselves so screen-reader / keyboard users get the same
  // re-check-and-alert behavior as mouse users.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>): void => {
    if (!lockedOut) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    void recheckLockAndProceed();
  };

  return (
    <a
      // Omit href entirely when locked so middle-click, cmd-click, ctrl-click,
      // and shift-click can't bypass the onClick guard (which only blocks
      // primary-button left clicks). An hrefless <a> is non-navigable in all
      // click modes, making aria-disabled semantically truthful. We then
      // restore keyboard focusability via tabIndex={0} so the row stays
      // reachable by Tab — see handleKeyDown for Enter/Space handling.
      href={lockedOut ? undefined : assignment.openHref}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={lockedOut ? 0 : undefined}
      role={lockedOut ? 'button' : undefined}
      aria-busy={isPending ? true : undefined}
      aria-disabled={lockedOut ? true : undefined}
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 ${
        isPending
          ? 'border-dashed border-slate-200 bg-slate-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : isPending
              ? 'border-slate-300 text-slate-400'
              : 'border-slate-300 text-transparent'
        }`}
        aria-hidden="true"
      >
        {isCompleted && <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />}
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold sm:text-base ${
            isPending ? 'text-slate-500' : 'text-slate-800'
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

      {lockedOut && (
        <span
          aria-label="Results locked by your teacher"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-600"
        >
          <Lock className="h-3 w-3" />
          Locked
        </span>
      )}

      {/* Suppress the right-side status chip when locked so the "Locked" pill
          is the single, dominant signal on a locked row — otherwise the chip
          (e.g. "View results") contradicts the badge. */}
      {!lockedOut && (
        <span
          className={`hidden shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:inline-flex ${getChipClass(
            { isPending, isCompleted, isGraded }
          )}`}
          aria-hidden="true"
        >
          {getChipLabel({ isPending, isCompleted, isGraded })}
        </span>
      )}
    </a>
  );
};

/**
 * Status chip wording per row state.
 *  - Active row → "Open" (primary CTA)
 *  - Completed row, grades not published → "Not graded"
 *  - Completed row, grades published → "View results"
 *  - Optimistically-surfaced row whose completion check hasn't resolved →
 *    "Checking…"
 */
function getChipLabel({
  isPending,
  isCompleted,
  isGraded,
}: {
  isPending: boolean;
  isCompleted: boolean;
  isGraded: boolean;
}): string {
  if (isPending) return 'Checking…';
  if (!isCompleted) return 'Open';
  return isGraded ? 'View results' : 'Not graded';
}

const PRIMARY_CTA_CLASS =
  'bg-brand-blue-primary text-white shadow-sm shadow-brand-blue-primary/20 group-hover:bg-brand-blue-dark';

function getChipClass({
  isPending,
  isCompleted,
  isGraded,
}: {
  isPending: boolean;
  isCompleted: boolean;
  isGraded: boolean;
}): string {
  if (isPending) return 'bg-slate-100 text-slate-400';
  // Active rows AND completed-with-published-results both invite a click
  // ("Open" / "View results"), so they share the primary brand-blue style.
  // Completed-not-yet-graded is a muted status indicator, not a CTA.
  if (!isCompleted || isGraded) return PRIMARY_CTA_CLASS;
  return 'bg-slate-100 text-slate-500 group-hover:bg-slate-200';
}
