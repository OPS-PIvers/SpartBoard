/**
 * QuizResults — aggregated results view for a completed quiz session.
 * Shows score distribution, per-question accuracy, and per-student breakdown.
 * Allows exporting to Google Sheets.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from 'react';
import {
  Download,
  BarChart3,
  Users,
  CheckCircle2,
  XCircle,
  Trophy,
  Loader2,
  ExternalLink,
  Target,
  AlertTriangle,
  Eye,
  EyeOff,
  User,
  Hash,
  Trash2,
  RefreshCw,
  Lock,
  GraduationCap,
  Send,
} from 'lucide-react';
import { QuizResponse, QuizData, QuizQuestion, QuizConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import {
  PlcSheetMissingError,
  PlcSheetSchemaMismatchError,
  QuizDriveService,
} from '@/utils/quizDriveService';
import { getPlcTeammateEmails } from '@/utils/plc';
import { publishPlcContribution } from '@/utils/plcContributions';
import { logError } from '@/utils/logError';
import {
  gradeAnswer,
  getResponseDocKey,
  type ResponseDocKey,
} from '@/hooks/useQuizSession';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  buildPinToNameMap,
  buildPinToExportNameMap,
  buildScoreboardTeams,
  canScoreResponse,
  getResponseScore,
  getDisplayScore,
  getScoreSuffix,
  getEarnedPoints,
  isGamificationActive,
} from '../utils/quizScoreboard';
import { resolveResponseDisplayName } from '../utils/resolveDisplayName';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { PlcTab } from '@/components/common/library/PlcTab';
import {
  SessionViewHeader,
  SegmentedTabs,
  StatTile,
  SessionBadge,
  ScorePill,
  SessionRow,
  ActionButton,
  OverflowMenu,
} from '@/components/common/sessionViews';
import type { OverflowMenuItem } from '@/components/common/sessionViews';
import { scoreColorClasses } from '@/utils/scoreColor';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WrittenResponseGrader } from './WrittenResponseGrader';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import {
  buildQuizClassroomGradeEntries,
  type ClassroomGradeEntry,
} from '@/utils/classroomGradePush';
import {
  bucketLtiPushResults,
  formatLtiPushToast,
  ltiPushErrorMessage,
  type LtiPushGradesRequest,
  type LtiPushGradesData,
} from '@/utils/ltiGradePush';
import {
  runClassroomGradePush,
  createToastGradePushHandlers,
  hasValidMaxPoints,
  MISSING_MAX_POINTS_MESSAGE,
  NOTHING_TO_PUSH_TOAST,
} from '@/utils/runClassroomGradePush';
import { requestClassroomTeacherToken } from '@/components/classroomAddon/gisOAuth';
import { getClassroomAttachments } from '@/utils/classroomAttachments';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/useQuizSession';
import { Pencil } from 'lucide-react';

/**
 * Export-error banner state. Generic errors render as a plain message; a
 * schema mismatch carries the header arrays from PlcSheetSchemaMismatchError
 * so the banner can show *which* column drifted and offer a
 * "export to my own sheet instead" recovery without touching the
 * assignment doc's PLC exportUrl.
 */
type ExportErrorState =
  | { kind: 'generic'; message: string }
  | {
      kind: 'schemaMismatch';
      message: string;
      existingHeaders: string[];
      expectedHeaders: string[];
      /** Set after a successful recovery export — render an "Open My Sheet" link. */
      recoveryUrl?: string;
    };

/**
 * Translate a PLC schema-mismatch into a human-readable diff. Length drift
 * (new question added/removed in the lead's copy after the sheet was first
 * written) is the common case; a single-column rename is the second. Anything
 * else falls back to a generic message — the user still has the recovery
 * button.
 */
function buildSchemaMismatchMessage(
  existing: string[],
  expected: string[]
): string {
  if (existing.length !== expected.length) {
    return (
      `The shared sheet has ${existing.length} columns but your quiz produces ${expected.length}. ` +
      'The lead probably edited the quiz after the sheet was created — your local copy is out of sync.'
    );
  }
  const idx = existing.findIndex((cell, i) => cell !== expected[i]);
  if (idx === -1) {
    return 'The shared sheet and your quiz produce identical headers, but the schema check still failed.';
  }
  return (
    `Column ${idx + 1} differs: the shared sheet has "${existing[idx]}", your quiz produces "${expected[idx]}". ` +
    'The lead probably edited the quiz after the sheet was created.'
  );
}

interface QuizResultsProps {
  quiz: QuizData;
  responses: QuizResponse[];
  config: QuizConfig;
  onBack: () => void;
  tabWarningsEnabled?: boolean;
  session?: import('@/types').QuizSession | null;
  /**
   * Delete a single student response by its deterministic Firestore doc key
   * (falls back to `studentUid` for legacy docs written before keying moved
   * to `pin-{period}-{pin}`). The snapshot listener will remove the row and
   * all derived stats/exports will recompute automatically.
   */
  onDeleteResponse?: (responseKey: string) => Promise<void>;
  /**
   * Unlock a student's results-view lockout (triggered when the
   * `resultsTabWarnings` threshold was hit while viewing published results).
   * Decrements warnings by 1 and clears the lockout — one more tab-switch
   * after this re-locks them. Pass the response's deterministic doc key
   * (`getResponseDocKey(r)`), same key used by `onDeleteResponse`.
   */
  onUnlockResultsForStudent?: (responseKey: string) => Promise<void>;
  /**
   * Called after the 404 stale-sheet recovery replaces a missing PLC sheet
   * with a fresh one. Lets the parent widget persist the new URL onto the
   * widget config and the active assignment doc so future exports don't
   * keep re-triggering the regenerate flow against the stale URL.
   */
  onPlcSheetUrlReplaced?: (newUrl: string) => Promise<void> | void;
  /**
   * Previously saved export URL for this assignment, read from the
   * `quiz_assignments` doc. When present, the Export button is replaced by
   * "Open Sheet" on mount so re-entering Results doesn't require re-exporting.
   */
  initialExportUrl?: string | null;
  /**
   * The PLC-mode export destination for the *active* assignment, sourced
   * from `assignment.plc.sheetUrl`. With per-assignment PLC sheets we can
   * no longer rely on `config.plcSheetUrl` (which used to mirror the
   * cached PLC-doc URL); each assignment has its own sheet and the
   * authoritative copy lives on the assignment doc. Falls back to
   * `config.plcSheetUrl` for legacy assignments saved before per-assignment
   * sheets shipped.
   */
  plcSheetUrl?: string | null;
  /**
   * Active assignment's PLC linkage id (`assignment.plc.id`). Drives both
   * the PLC tab visibility and the auto-publish of this teacher's quiz
   * contributions to `/plcs/{plcId}/contributions/*`. Passing `null`
   * disables both — the tab is hidden and no contribution is published.
   */
  plcId?: string | null;
  /**
   * `assignment.sync?.groupId` — persisted on the published contribution
   * for forward compatibility. PlcTab today groups contributions by exact
   * question-id sequence, which works for synced quizzes because
   * `pullSyncedQuiz` keeps question ids identical across members. The
   * `syncGroupId` field is the hook for a future "logical quiz id" grouping
   * if id parity ever stops being a safe assumption.
   */
  syncGroupId?: string | null;
  /**
   * Persist a fresh export URL back to the assignment doc so it survives
   * QuizResults remounts (the parent remounts it on Results re-entry to
   * recompute aggregate stats) and full tab reloads.
   */
  onExportUrlSaved?: (url: string) => Promise<void> | void;
  /**
   * Response keys ALREADY exported to the linked sheet, read from the
   * assignment doc. Used by the UPDATE SHEET button to determine which
   * responses still need to be appended.
   */
  initialExportedResponseIds?: string[] | null;
  /**
   * Persist the latest set of exported response keys back to the assignment
   * doc so re-entering Results doesn't re-export rows that were already
   * appended. Accepts `ResponseDocKey[]` to enforce caller-side correctness
   * — the implementation re-casts to `string[]` at the Firestore write
   * boundary (the wire format hasn't changed).
   */
  onExportedResponseIdsSaved?: (ids: ResponseDocKey[]) => Promise<void> | void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  quiz,
  responses: rawResponses,
  config,
  onBack,
  tabWarningsEnabled,
  session,
  onDeleteResponse,
  onUnlockResultsForStudent,
  onPlcSheetUrlReplaced,
  initialExportUrl,
  plcSheetUrl: assignmentPlcSheetUrl,
  plcId,
  syncGroupId,
  onExportUrlSaved,
  initialExportedResponseIds,
  onExportedResponseIdsSaved,
}) => {
  const { activeDashboard, updateWidget, addWidget, addToast, rosters } =
    useDashboard();
  const { ensureGoogleScope, user, orgId, canAccessFeature, isExternalUser } =
    useAuth();
  const { showConfirm } = useDialog();
  const { plcs, clearPlcSharedSheetUrl, setPlcSharedSheetUrl } = usePlcs();
  const [exporting, setExporting] = useState(false);
  const [pushingGrades, setPushingGrades] = useState(false);
  const [pushingSchoologyGrades, setPushingSchoologyGrades] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(
    initialExportUrl ?? null
  );
  // Sync from the prop when the parent hydrates assignments after mount —
  // e.g. a hard reload where `assignments` is briefly empty before Firestore
  // populates it, so `initialExportUrl` starts null and transitions to a real
  // URL. Uses the "adjusting state while rendering" pattern so the button
  // swap ("EXPORT" → "OPEN SHEET") happens in the same commit as the prop
  // change, without an extra render pass from useEffect.
  const [lastInitialExportUrl, setLastInitialExportUrl] = useState<
    string | null | undefined
  >(initialExportUrl);
  if (initialExportUrl !== lastInitialExportUrl) {
    setLastInitialExportUrl(initialExportUrl);
    setExportUrl(initialExportUrl ?? null);
  }
  // Internally we use the ResponseDocKey brand to enforce that callers
  // never confuse a raw `string` with a response-doc key. The wire format
  // (initialExportedResponseIds prop / Firestore `exportedResponseIds`)
  // stays `string[]` for backwards compatibility — the cast happens at the
  // boundary on read; the persist callback (`onExportedResponseIdsSaved`)
  // accepts `ResponseDocKey[]` so the implementation can re-cast for
  // Firestore.
  const [exportedResponseIds, setExportedResponseIds] = useState<
    ResponseDocKey[]
  >((initialExportedResponseIds ?? []) as ResponseDocKey[]);
  const [lastInitialExportedResponseIds, setLastInitialExportedResponseIds] =
    useState<string[] | null | undefined>(initialExportedResponseIds);
  if (initialExportedResponseIds !== lastInitialExportedResponseIds) {
    setLastInitialExportedResponseIds(initialExportedResponseIds);
    setExportedResponseIds(
      (initialExportedResponseIds ?? []) as ResponseDocKey[]
    );
  }
  const [updatingSheet, setUpdatingSheet] = useState(false);
  const [exportError, setExportError] = useState<ExportErrorState | null>(null);
  const [showGrader, setShowGrader] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'students' | 'plc'
  >('overview');
  // Per-instance prefix for the ARIA tab↔panel linkage (multiple quiz widgets
  // can render on one dashboard).
  const tabPanelId = useId();
  const [showScoreboardPrompt, setShowScoreboardPrompt] = useState(false);
  const scoreboardPromptRef = useRef<HTMLDivElement>(null);

  // Close popup on click-outside or Escape
  const closeScoreboardPrompt = useCallback(() => {
    setShowScoreboardPrompt(false);
  }, []);
  useClickOutside(scoreboardPromptRef, closeScoreboardPrompt);
  useEffect(() => {
    if (!showScoreboardPrompt) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowScoreboardPrompt(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showScoreboardPrompt]);

  // Legacy fallback: map classlinkClassId / testClassId → roster name
  // (= period name) so we can resolve a class period for SSO responses
  // that lack `classPeriod` directly. New responses already carry
  // `classPeriod` because `joinQuizSession` reads it off
  // `session.classPeriodByClassId` at SSO join time and writes it
  // alongside `classId`. This map only rescues IN-FLIGHT responses that
  // joined before that fix shipped — and then only when the teacher's
  // rosters still resolve.
  const classIdToPeriodName = useMemo(() => {
    const map = new Map<string, string>();
    for (const roster of rosters) {
      if (roster.classlinkClassId) {
        map.set(roster.classlinkClassId, roster.name);
      }
      if (roster.testClassId) {
        map.set(roster.testClassId, roster.name);
      }
    }
    return map;
  }, [rosters]);

  // Enriched view of responses: every row has `classPeriod` populated when
  // either (a) the student picked one at join time, or (b) we can resolve
  // their `classId` claim back to a roster name on the teacher side. Used
  // for the period filter, the export, and every downstream tab — keeping
  // SSO students visible in the period dropdown and in the "Class Period"
  // column of the shared sheet.
  const responses = useMemo(() => {
    return rawResponses.map((r) => {
      if (r.classPeriod) return r;
      if (r.classId) {
        const resolved = classIdToPeriodName.get(r.classId);
        if (resolved) return { ...r, classPeriod: resolved };
      }
      return r;
    });
  }, [rawResponses, classIdToPeriodName]);

  const completed = responses.filter((r) => r.status === 'completed');

  const resolvedPeriods = useMemo(
    () => config.periodNames ?? (config.periodName ? [config.periodName] : []),
    [config.periodNames, config.periodName]
  );
  const pinToName = useMemo(
    () => buildPinToNameMap(rosters, resolvedPeriods),
    [rosters, resolvedPeriods]
  );

  // ClassLink name resolution — pulls names for every classId the session
  // targets, so multi-class assignments resolve names for students from
  // every targeted period (not just `classIds[0]`). The fallback to
  // `[session.classId]` keeps single-class sessions working. For legacy
  // code+PIN sessions both maps are empty and pinToName handles display.
  const sessionClassIds = useMemo(() => {
    if (session?.classIds && session.classIds.length > 0)
      return session.classIds;
    return session?.classId ? [session.classId] : [];
  }, [session?.classIds, session?.classId]);
  const { byStudentUid: classLinkNames } = useAssignmentPseudonymsMulti(
    session?.id ?? null,
    sessionClassIds,
    orgId
  );
  // Schoology LTI students aren't in any ClassLink roster — resolve their names
  // on-read via NRPS and merge in (ClassLink wins on the rare uid collision).
  // Gated on `ltiNrps` so non-LTI sessions never make the call.
  const ltiNames = useLtiSessionNames(
    session?.id ?? null,
    session?.ltiNrps === true
  );
  const byStudentUid = useMemo(() => {
    if (ltiNames.size === 0) return classLinkNames;
    const merged = new Map(classLinkNames);
    for (const [uid, name] of ltiNames) {
      if (!merged.has(uid)) merged.set(uid, name);
    }
    return merged;
  }, [classLinkNames, ltiNames]);
  const exportPinToName = useMemo(
    () => buildPinToExportNameMap(rosters, resolvedPeriods),
    [rosters, resolvedPeriods]
  );
  const hasNames = Object.keys(pinToName).length > 0;

  // Whether the underlying quiz contains any manual-grade question
  // types. Used to surface the "Grade Written" entry-point only when
  // it's actually useful.
  const hasWrittenQuestions = useMemo(
    () => quiz.questions.some((q) => q.type === 'short' || q.type === 'essay'),
    [quiz.questions]
  );

  // Build a display-name lookup keyed by the response's deterministic
  // doc key so the grader can show a real student name in its header
  // rather than the raw uid/pin.
  const displayNameByResponseKey = useMemo(() => {
    const m = new Map<string, string>();
    responses.forEach((r) => {
      const key = r._responseKey ?? r.studentUid;
      if (!key) return;
      const name = resolveResponseDisplayName(r, pinToName, byStudentUid);
      if (name) m.set(key, name);
    });
    return m;
  }, [responses, pinToName, byStudentUid]);

  // Save a manual grade for a single response/question pair. Uses
  // Firestore's dotted-field-path syntax so concurrent grades on
  // different questions of the same response don't clobber each other
  // (which would happen if we read-modify-wrote the whole `grading`
  // map). Field-path updates merge atomically at the map-key level on
  // the server.
  const saveWrittenGrade = useCallback(
    async (
      responseKey: string,
      questionId: string,
      grade: import('@/types').WrittenAnswerGrade
    ) => {
      const sessionId = session?.id;
      if (!sessionId) {
        throw new Error(
          'Cannot save grade: no active session in scope. Reopen the quiz results and try again.'
        );
      }
      const ref = doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        responseKey
      );
      // Bracket-notation field path so Firestore merges this key only.
      await updateDoc(ref, { [`grading.${questionId}`]: grade });
    },
    [session?.id]
  );

  // Auto-publish this teacher's contribution to the PLC results aggregate.
  // Replaces the old "everyone must export to a shared Google Sheet" dance:
  // as soon as the teacher views her results, her contribution is written
  // to /plcs/{plcId}/contributions/{quizId}_{teacherUid} and every teammate's
  // PlcTab snapshots-update in real time. Debounced so we don't write on
  // every keystroke of an in-flight responses stream — the publish coalesces
  // ~1.5s after the responses array settles.
  //
  // Intentionally re-runs on response changes (new submissions, edits,
  // deletions) so the aggregate stays fresh while the teacher is sitting
  // on the Results screen. The setDoc overwrites the same doc id, so
  // there's no history pile-up.
  //
  // Permission-denied is silently ignored (expected when the teacher has
  // been removed from the PLC mid-session). Every other failure mode —
  // quota-exceeded on large response arrays, schema rejection from a
  // future rules-vs-client version skew, transient network failure —
  // toasts ONCE per failure streak so the teacher knows her contribution
  // isn't reaching teammates' aggregates. The toast doesn't repeat on
  // subsequent failed retries (would be spammy) but a clean recovery
  // resets the flag so the next failure can toast again.
  const autoPublishErrorToastedRef = useRef(false);
  useEffect(() => {
    if (!plcId || !user || !config.teacherName) return;
    if (responses.length === 0) return;
    const handle = setTimeout(() => {
      void (async () => {
        try {
          await publishPlcContribution({
            plcId,
            teacherUid: user.uid,
            teacherName: config.teacherName ?? '',
            quiz,
            responses,
            syncGroupId: syncGroupId ?? null,
            pinToName: exportPinToName,
            byStudentUid,
          });
          autoPublishErrorToastedRef.current = false;
        } catch (err) {
          logError('QuizResults.autoPublishPlcContribution', err, {
            plcId,
            quizId: quiz.id,
            teacherUid: user.uid,
          });
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? (err as { code?: unknown }).code
              : undefined;
          const isPermissionDenied = code === 'permission-denied';
          if (!isPermissionDenied && !autoPublishErrorToastedRef.current) {
            autoPublishErrorToastedRef.current = true;
            const msg =
              err instanceof Error
                ? err.message
                : 'Unknown error publishing PLC contribution.';
            addToast(
              `Your results aren't reaching the PLC view: ${msg}`,
              'error'
            );
          }
        }
      })();
    }, 1500);
    return () => clearTimeout(handle);
  }, [
    plcId,
    syncGroupId,
    user,
    config.teacherName,
    quiz,
    responses,
    exportPinToName,
    byStudentUid,
    addToast,
  ]);

  // Per-period filtering — uses classPeriod set on each response at join time.
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    for (const r of responses) {
      if (r.classPeriod) periods.add(r.classPeriod);
    }
    return Array.from(periods).sort();
  }, [responses]);

  const filteredResponses = useMemo(
    () =>
      periodFilter === 'all'
        ? responses
        : responses.filter((r) => r.classPeriod === periodFilter),
    [responses, periodFilter]
  );
  const filteredCompleted = useMemo(
    () => filteredResponses.filter((r) => r.status === 'completed'),
    [filteredResponses]
  );
  // Only average responses we can actually score. A completed response that
  // can't be graded yet (answer key not loaded, or question-id drift) would
  // otherwise contribute a phantom 0 and drag the class average down — see
  // `canScoreResponse`.
  const filteredScoreable = useMemo(
    () => filteredCompleted.filter((r) => canScoreResponse(r, quiz.questions)),
    [filteredCompleted, quiz.questions]
  );
  const filteredAvgScore =
    filteredScoreable.length > 0
      ? Math.round(
          filteredScoreable.reduce(
            (sum, r) => sum + getDisplayScore(r, quiz.questions, session),
            0
          ) / filteredScoreable.length
        )
      : null;

  const handleSendToScoreboard = useCallback(
    (mode: 'pin' | 'name') => {
      setShowScoreboardPrompt(false);

      if (filteredCompleted.length === 0) {
        addToast('No completed students yet', 'error');
        return;
      }

      const newTeams = buildScoreboardTeams(
        filteredCompleted,
        quiz.questions,
        mode,
        pinToName,
        session,
        byStudentUid
      );

      // buildScoreboardTeams drops responses that can't be scored yet (answer
      // key still loading / id drift), so `completed` can be non-empty while
      // `newTeams` is empty. Bail before touching the widget — otherwise we'd
      // overwrite an already-populated scoreboard with an empty roster and toast
      // a misleading "0 students" success.
      if (newTeams.length === 0) {
        addToast(
          'No scoreable students yet — the answer key may still be loading.',
          'info'
        );
        return;
      }

      const existingScoreboard = activeDashboard?.widgets.find(
        (w) => w.type === 'scoreboard'
      );

      if (existingScoreboard) {
        updateWidget(existingScoreboard.id, {
          config: {
            ...existingScoreboard.config,
            teams: newTeams,
          },
        });
        addToast(
          `Updated scoreboard with ${newTeams.length} students.`,
          'success'
        );
      } else {
        addWidget('scoreboard', {
          config: {
            teams: newTeams,
          },
        });
        addToast(
          `Created scoreboard with ${newTeams.length} students.`,
          'success'
        );
      }
    },
    [
      filteredCompleted,
      quiz.questions,
      pinToName,
      byStudentUid,
      session,
      activeDashboard?.widgets,
      updateWidget,
      addWidget,
      addToast,
    ]
  );

  const handleScoreboardClick = useCallback(() => {
    if (filteredCompleted.length === 0) {
      addToast('No completed students yet', 'error');
      return;
    }
    if (hasNames) {
      setShowScoreboardPrompt(true);
    } else {
      handleSendToScoreboard('pin');
    }
  }, [filteredCompleted.length, hasNames, addToast, handleSendToScoreboard]);

  // Recovery path shared by handleExport (initial export) and
  // handleUpdateSheet (delta append). When the configured PLC sheet is
  // gone (404) or this teacher lacks access (403):
  //   - 404 with a uniquely-resolved owning PLC: clear the cached URL,
  //     create a fresh sheet in this teacher's Drive, share with
  //     teammates, persist the canonical URL, then re-run the caller's
  //     export via `retryExport` with the new URL substituted in.
  //   - 403 with a uniquely-resolved owning PLC: throw a clear
  //     "ask the PLC lead for access to {plcName}" message — the sheet
  //     exists, regenerating would orphan it for teammates.
  //   - Ambiguous matches or no PLC match: re-throw the original error
  //     so we don't touch the wrong plcs/{id}.
  // Returns the new sheet URL on successful regenerate, so callers can
  // sync local state (e.g. `exportUrl`) to the canonical URL.
  const recoverFromPlcSheetError = async (
    exportErr: unknown,
    exportOpts: Parameters<QuizDriveService['exportResultsToSheet']>[3],
    retryExport: (
      newOpts: Parameters<QuizDriveService['exportResultsToSheet']>[3]
    ) => Promise<string>,
    // The fresh Sheets token from the calling handler's ensureGoogleScope.
    // Passed explicitly rather than read from the `googleAccessToken` closure:
    // after a never-granted user consents in the same handler tick, the closure
    // is still stale-null (state updates next render), so the closure guard
    // would wrongly bail before recovery.
    token: string
  ): Promise<{ url: string; canonical: string }> => {
    if (
      !(exportErr instanceof PlcSheetMissingError) ||
      !user ||
      !exportOpts?.plcSheetUrl
    ) {
      throw exportErr;
    }
    // Use filter + require exactly-one match. `find` would silently
    // pick the first when two PLCs accidentally share the same URL
    // (legacy manual-paste assignments); we'd rather surface the
    // original error than touch the wrong plcs/{id}.
    const matchingPlcs = plcs.filter(
      (p) => p.sharedSheetUrl === exportOpts.plcSheetUrl
    );
    const owningPlc = matchingPlcs.length === 1 ? matchingPlcs[0] : null;
    if (exportErr.status === 403) {
      // Don't toast here — both `handleExport` and `handleUpdateSheet` catch
      // and toast `err.message`, so toasting from inside the helper produced
      // duplicate toasts (Copilot review on PR #1442). The thrown Error
      // carries the actionable message so the call-site toast stays clear.
      const accessDeniedMessage = owningPlc
        ? `You don't have access to the ${owningPlc.name} PLC sheet yet — ask the PLC lead to grant you writer access.`
        : "You don't have access to this PLC sheet — ask the PLC lead to grant you writer access.";
      throw new Error(accessDeniedMessage);
    }
    if (!owningPlc) {
      throw exportErr;
    }
    const svc = new QuizDriveService(token);
    await clearPlcSharedSheetUrl(owningPlc.id);
    const created = await svc.createPlcSheetAndShare({
      plcName: owningPlc.name,
      quizTitle: quiz.title,
      memberEmailsToShareWith: getPlcTeammateEmails(owningPlc, user.uid),
    });
    const canonical = await setPlcSharedSheetUrl(owningPlc.id, created.url);
    if (onPlcSheetUrlReplaced) {
      try {
        await onPlcSheetUrlReplaced(canonical);
      } catch (persistErr) {
        console.error(
          '[QuizResults] Failed to persist regenerated PLC URL:',
          persistErr
        );
      }
    }
    const url = await retryExport({ ...exportOpts, plcSheetUrl: canonical });
    addToast(
      'The previous PLC sheet was missing — created a fresh one.',
      'info'
    );
    return { url, canonical };
  };

  const handleExport = async () => {
    // Scope depends on mode. SOLO export CREATES a brand-new sheet the user
    // owns → the non-sensitive `drive.file` login scope suffices (silent, no
    // consent — it's always in the login grant). PLC export APPENDS to a shared
    // sheet a teammate may own → that genuinely needs the broad `spreadsheets`
    // scope (acquired on demand, Path B: silent for already-granted users, a
    // one-time consent popup otherwise — this is a user gesture, so
    // interactive). Null → reuse the existing "Google access required" branch.
    const token = await ensureGoogleScope(
      config.plcMode ? 'spreadsheets' : 'drive.file',
      { interactive: true }
    );
    if (!token) {
      setExportError({
        kind: 'generic',
        message: 'Google access token not available. Please sign in again.',
      });
      return;
    }
    // Captured before we overwrite exportUrl — used below to distinguish
    // the first solo export (silent success, button transitions to OPEN
    // SHEET) from a solo re-export (toast acknowledging that the previous
    // sheet is now an orphan in the teacher's Drive).
    const previousExportUrl = exportUrl;
    setExporting(true);
    setExportError(null);
    try {
      const svc = new QuizDriveService(token);
      const exportOpts = {
        pinToName: exportPinToName,
        byStudentUid,
        teacherName: config.teacherName,
        plcMode: config.plcMode,
        // Prefer the active assignment's `plc.sheetUrl` (per-assignment
        // model). Fall back to `config.plcSheetUrl` for legacy assignments
        // that pre-date per-assignment sheets and still mirror the URL on
        // widget config.
        plcSheetUrl: assignmentPlcSheetUrl ?? config.plcSheetUrl,
      };
      let url: string;
      try {
        url = await svc.exportResultsToSheet(
          quiz.title,
          responses,
          quiz.questions,
          exportOpts
        );
      } catch (exportErr) {
        if (!config.plcMode) {
          throw exportErr;
        }
        const recovered = await recoverFromPlcSheetError(
          exportErr,
          exportOpts,
          (newOpts) =>
            svc.exportResultsToSheet(
              quiz.title,
              responses,
              quiz.questions,
              newOpts
            ),
          token
        );
        url = recovered.url;
      }
      setExportUrl(url);
      // Snapshot every response key we just exported so the UPDATE SHEET
      // button can later append only the rows that come in afterwards.
      const exportedIds = responses.map((r) => getResponseDocKey(r));
      setExportedResponseIds(exportedIds);
      if (onExportUrlSaved) {
        // Fire-and-forget: lower-stakes than the exported-IDs persist
        // below. Worst case the button reverts to EXPORT on next remount.
        void Promise.resolve(onExportUrlSaved(url)).catch((err: unknown) => {
          console.error(
            '[QuizResults] failed to persist exportUrl to assignment doc',
            err
          );
        });
      }
      if (onExportedResponseIdsSaved) {
        // Await: a failed persist here means the assignment doc keeps
        // stale exported IDs. Next session re-seeds from stale Firestore
        // and UPDATE SHEET re-appends already-exported rows. Surface a
        // warning toast and don't claim success.
        try {
          await onExportedResponseIdsSaved(exportedIds);
        } catch (persistErr) {
          console.error(
            '[QuizResults] failed to persist exportedResponseIds to assignment doc',
            persistErr
          );
          addToast(
            'Export succeeded, but we could not record which rows were saved. Avoid using UPDATE SHEET in this session.',
            'error'
          );
          return;
        }
      }
      if (config.plcMode) {
        addToast('Results exported to shared PLC sheet', 'success');
      } else if (previousExportUrl) {
        addToast(
          'Re-exported to a fresh sheet. The previous sheet remains in your Drive.',
          'success'
        );
      }
    } catch (err) {
      if (err instanceof PlcSheetSchemaMismatchError) {
        setExportError({
          kind: 'schemaMismatch',
          message: buildSchemaMismatchMessage(
            err.existingHeaders,
            err.expectedHeaders
          ),
          existingHeaders: err.existingHeaders,
          expectedHeaders: err.expectedHeaders,
        });
        // Short toast — the diff itself lives in the banner so it's visible
        // alongside the recovery button rather than fading away.
        addToast(
          'Export blocked: the shared sheet was built from a different version of this quiz.',
          'error'
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Export failed';
        setExportError({ kind: 'generic', message: msg });
        addToast(msg, 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  /**
   * Schema-mismatch escape hatch: when the shared PLC sheet's header row
   * doesn't match what the current quiz produces, the regular append refuses
   * to write to avoid column-shifted rows. This handler re-runs the export
   * with `plcMode: false` so the service goes through the solo branch and
   * mints a fresh personal sheet the teacher owns — same workflow Tatum used
   * when her assignment couldn't append to Jen's sheet. The teacher then
   * copy/pastes rows into the shared sheet manually.
   *
   * Intentionally does NOT call `onExportUrlSaved`. That callback writes to
   * the assignment doc's `exportUrl`, which is reserved for the PLC sheet.
   * Overwriting it would (a) break UPDATE SHEET (it'd start updating the
   * personal sheet instead of the PLC one) and (b) cause future sessions to
   * rehydrate from the throwaway sheet, masking the underlying PLC mismatch.
   */
  const handleSchemaMismatchRecovery = async () => {
    // Always creates a fresh PERSONAL sheet (plcMode:false below) → the
    // non-sensitive `drive.file` login scope is sufficient; no `spreadsheets`.
    const token = await ensureGoogleScope('drive.file', {
      interactive: true,
    });
    if (!token) {
      addToast(
        'Google access token not available. Please sign in again.',
        'error'
      );
      return;
    }
    setExporting(true);
    try {
      const svc = new QuizDriveService(token);
      const url = await svc.exportResultsToSheet(
        quiz.title,
        responses,
        quiz.questions,
        {
          pinToName: exportPinToName,
          byStudentUid,
          teacherName: config.teacherName,
          plcMode: false,
          plcSheetUrl: undefined,
        }
      );
      setExportError((prev) =>
        prev?.kind === 'schemaMismatch' ? { ...prev, recoveryUrl: url } : prev
      );
      addToast(
        'Exported to a personal sheet — open it to copy rows into the shared sheet manually.',
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recovery export failed';
      addToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  const newResponsesToAppend = useMemo(() => {
    if (!exportUrl) return [];
    const exportedSet = new Set(exportedResponseIds);
    return responses.filter((r) => !exportedSet.has(getResponseDocKey(r)));
  }, [exportUrl, exportedResponseIds, responses]);

  // Tracking is "initialized" once a per-response export-id snapshot exists
  // for this assignment. Two cases set it: (1) the prop hydrated with a
  // non-null array from Firestore, (2) we just ran an in-session export which
  // populated `exportedResponseIds` locally. Without tracking, an UPDATE
  // SHEET click would treat the empty set as "everything is new" and
  // duplicate-append every row to the sheet — see Copilot review on PR #1442.
  const trackingInitialized =
    exportedResponseIds.length > 0 || initialExportedResponseIds != null;
  // Solo-mode export sheets carry a "Question Analysis" stats block at the
  // bottom (see quizDriveService.exportResultsToSheet solo branch). Appending
  // would land NEW response rows AFTER the stats, fragmenting the sheet.
  // PLC-mode sheets are append-friendly by construction (Results tab is
  // header + rows, no trailing blocks).
  const canShowUpdateSheet = !!config.plcMode && trackingInitialized;
  // Solo mode equivalent: a "Re-export" button that creates a fresh sheet
  // each time `handleExport` runs. Reuses the existing solo export path
  // (which always creates a new spreadsheet) so the teacher has a way to
  // refresh after deleting the old sheet, after a bug fix changes export
  // output, or just to rebuild with the latest responses. The previous
  // sheet remains in Drive — the teacher cleans it up manually.
  const canShowSoloReExport = !config.plcMode && !!exportUrl;

  const handleUpdateSheet = async () => {
    if (!exportUrl) return;
    // PLC-only (gated by `canShowUpdateSheet = !!config.plcMode && …`): appends
    // to / regenerates the shared sheet a teammate may own → keeps the broad
    // `spreadsheets` scope. This is an org-only surface, so external users never
    // reach it. (Solo paths above use the non-sensitive `drive.file` scope.)
    const token = await ensureGoogleScope('spreadsheets', {
      interactive: true,
    });
    if (!token) {
      setExportError({
        kind: 'generic',
        message: 'Google access token not available. Please sign in again.',
      });
      return;
    }
    setUpdatingSheet(true);
    setExportError(null);
    try {
      const svc = new QuizDriveService(token);
      // Smart re-export: when there's an append-delta, append. When there
      // isn't, do a clear-and-rewrite ("regenerate") on the same sheet so
      // the teacher has a way to force a clean rebuild without abandoning
      // the canonical URL. This branches on newResponsesToAppend.length —
      // empty delta = rebuild, non-empty delta = append. Re-export Sheet
      // is gated on `config.plcMode` upstream (`canShowUpdateSheet`).
      const isFullRebuild = newResponsesToAppend.length === 0;
      const exportOpts = {
        pinToName: exportPinToName,
        byStudentUid,
        teacherName: config.teacherName,
        plcMode: true,
        plcSheetUrl: exportUrl,
      };
      let regeneratedSheet = false;
      try {
        if (isFullRebuild) {
          // Rebuild from scratch: clear every row on the existing sheet
          // and write headers + all responses. Preserves the URL so PLC
          // peers keep their bookmarks.
          await svc.regeneratePlcSheet(
            exportUrl,
            responses,
            quiz.questions,
            exportOpts
          );
        } else {
          await svc.exportResultsToSheet(
            quiz.title,
            newResponsesToAppend,
            quiz.questions,
            exportOpts
          );
        }
      } catch (updateErr) {
        // Only attempt PLC recovery for PLC-linked sheets; a solo sheet
        // 404/403 has no plcs/{id} to update and we should surface as-is.
        if (!config.plcMode) {
          throw updateErr;
        }
        const recovered = await recoverFromPlcSheetError(
          updateErr,
          exportOpts,
          (newOpts) =>
            // The regenerated sheet is empty, so we re-export ALL
            // responses (not just the previously-pending delta). The
            // exportedResponseIds reset below mirrors that.
            svc.exportResultsToSheet(
              quiz.title,
              responses,
              quiz.questions,
              newOpts
            ),
          token
        );
        regeneratedSheet = true;
        // Sync local "OPEN SHEET" link to the new sheet so the teacher
        // doesn't click through to the now-stale URL.
        setExportUrl(recovered.canonical);
        // Persist the regenerated URL onto the assignment doc too —
        // without this, a reload rehydrates `initialExportUrl` from the
        // stale dead URL, OPEN SHEET points at the wrong place, and the
        // next UPDATE SHEET re-triggers the same 404 → regenerate cycle
        // creating yet another orphan sheet. (Final-review finding on
        // PR #1442.)
        if (onExportUrlSaved) {
          void Promise.resolve(onExportUrlSaved(recovered.canonical)).catch(
            (persistErr: unknown) => {
              console.error(
                '[QuizResults] failed to persist regenerated exportUrl after update',
                persistErr
              );
            }
          );
        }
      }
      // After a regenerated-sheet retry the sheet now contains every
      // response (we passed `responses` to retry), so the exported set
      // is the full list. The non-recovery path also lands here with
      // the same all-IDs snapshot — newResponsesToAppend was the delta
      // BEFORE the append, so post-append the union is every response.
      const allIds = responses.map((r) => getResponseDocKey(r));
      setExportedResponseIds(allIds);
      if (onExportedResponseIdsSaved) {
        // Await: same rationale as handleExport — fire-and-forget here
        // would let UPDATE SHEET silently re-append duplicate rows on
        // the next session if the persist fails.
        try {
          await onExportedResponseIdsSaved(allIds);
        } catch (persistErr) {
          console.error(
            '[QuizResults] failed to persist exportedResponseIds after update',
            persistErr
          );
          addToast(
            'Update succeeded, but we could not record which rows were saved. Avoid using UPDATE SHEET again in this session.',
            'error'
          );
          return;
        }
      }
      addToast(
        regeneratedSheet
          ? `The previous PLC sheet was missing — created a fresh one and exported all ${responses.length} response${
              responses.length === 1 ? '' : 's'
            }.`
          : isFullRebuild
            ? `Sheet rebuilt from scratch — wrote ${responses.length} response${
                responses.length === 1 ? '' : 's'
              }.`
            : `Added ${newResponsesToAppend.length} new response${
                newResponsesToAppend.length === 1 ? '' : 's'
              } to the sheet.`,
        'success'
      );
    } catch (err) {
      // UPDATE SHEET hits a sheet that previously appended cleanly, so a
      // schema-mismatch here is far less likely than on initial EXPORT —
      // but it's possible if the lead edited the quiz after this teacher's
      // first append. Route it through the same banner so the recovery
      // button is available.
      if (err instanceof PlcSheetSchemaMismatchError) {
        setExportError({
          kind: 'schemaMismatch',
          message: buildSchemaMismatchMessage(
            err.existingHeaders,
            err.expectedHeaders
          ),
          existingHeaders: err.existingHeaders,
          expectedHeaders: err.expectedHeaders,
        });
        addToast(
          'Update blocked: the shared sheet was built from a different version of this quiz.',
          'error'
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Update failed';
        setExportError({ kind: 'generic', message: msg });
        addToast(msg, 'error');
      }
    } finally {
      setUpdatingSheet(false);
    }
  };

  // Push the SpartBoard quiz scores into the linked Google Classroom
  // gradebook as DRAFT grades. Only available when this assignment was
  // attached to one or more Classroom coursework items via the add-on (which
  // writes `session.classroomAttachments`, back-compat singular
  // `classroomAttachment`). The grade scale is the quiz's total points
  // (`maxPoints`), and we push each student's RAW earned points capped to that
  // total — so a 17/20 quiz reads as 17/20 in Classroom, never a percentage out
  // of 100. Students map to their Classroom grade by `r.studentUid`, which
  // equals the ClassLink SSO pseudonym key the batch CF resolves to a Classroom
  // userId. When the assignment is linked to multiple courses, the SAME payload
  // fans out to each (Item D multi-course).
  const classroomAttachments = getClassroomAttachments(session);
  const handlePushGrades = async () => {
    // Guard the grade scale FIRST (a malformed/stale attachment could carry
    // NaN/0 maxPoints, scaling every grade to 0/NaN), then the eligible list —
    // completed responses with a resolvable pseudonym THAT CAN BE SCORED — so we
    // never pop a consent dialog when there's nothing to push. The eligible
    // filter mirrors buildQuizClassroomGradeEntries (which also drops
    // unscoreable responses), so the confirm-dialog count matches what actually
    // gets pushed and we don't confirm only to toast "nothing to push". The
    // eligible list and the grade payload both reflect the responses/quiz
    // captured when the teacher clicked (this closure); a brief mid-dialog
    // Firestore update isn't re-read. All linked courses share this assignment's
    // frozen denominator, so we validate + build once and fan out.
    const validAttachments = classroomAttachments.filter((a) =>
      hasValidMaxPoints(a.maxPoints)
    );
    if (validAttachments.length === 0) {
      addToast(MISSING_MAX_POINTS_MESSAGE, 'error');
      return;
    }
    const maxPoints = validAttachments[0].maxPoints;
    const eligible = completed.filter(
      (r) => !!r.studentUid && canScoreResponse(r, quiz.questions)
    );
    if (eligible.length === 0) {
      addToast(NOTHING_TO_PUSH_TOAST, 'info');
      return;
    }

    // Shared push flow (token mint → CF → result toast); QuizResults supplies
    // only its grade builder (correctness points scaled onto the frozen
    // denominator via the single-source-of-truth scaler the in-iframe grader
    // also uses) and the toast reporter.
    const courseCount = validAttachments.length;
    await runClassroomGradePush({
      functions,
      attachments: validAttachments.map((a) => ({
        courseId: a.courseId,
        itemId: a.itemId,
        attachmentId: a.attachmentId,
        maxPoints: a.maxPoints,
      })),
      requestToken: () =>
        requestClassroomTeacherToken(user?.email ?? undefined),
      buildGrades: () =>
        buildQuizClassroomGradeEntries(completed, quiz.questions, maxPoints),
      confirm: () =>
        showConfirm(
          `Push ${eligible.length} grade${eligible.length === 1 ? '' : 's'} to Google ` +
            `Classroom${courseCount > 1 ? ` (${courseCount} courses)` : ''}? This writes draft grades to the assignment gradebook — ` +
            'you still review and return them in Classroom.',
          {
            title: 'Push grades to Google Classroom',
            confirmLabel: 'Push grades',
            cancelLabel: 'Cancel',
          }
        ),
      distinctTokenCancel: true,
      logTag: 'QuizResults.pushClassroomGrades',
      logContext: {
        sessionId: session?.id,
        attachmentId: validAttachments[0].attachmentId,
      },
      ...createToastGradePushHandlers(addToast, setPushingGrades),
    });
  };

  // Push the SpartBoard quiz scores into the linked Schoology gradebook via
  // AGS. Only available when this assignment was launched from Schoology
  // (`session.ltiAttachment` present — set server-side on first student
  // launch). An assignment is EITHER a Classroom add-on attachment OR a
  // Schoology LTI launch, never both, so this is a separate, independent
  // action from `handlePushGrades`. Unlike Classroom, there's no client token
  // mint or resource-link to pass — the CF derives the AGS resource link from
  // the session and clamps scores server-side; we only send the grade payload.
  // The denominator (`maxPoints`) is the quiz's total points (the single
  // source of truth `quizMaxPoints` computes), and each student's CORRECTNESS
  // points are scaled onto it by `buildQuizClassroomGradeEntries` (no
  // speed/streak bonus) — the same builder Classroom uses, so written-response
  // grades flow into Schoology for free via `getEarnedPoints`.
  const ltiAttachment = session?.ltiAttachment ?? null;
  const schoologyGrades = useMemo(() => {
    if (!ltiAttachment) return [] as ClassroomGradeEntry[];
    return buildQuizClassroomGradeEntries(
      completed,
      quiz.questions,
      quizMaxPoints(quiz.questions)
    );
  }, [ltiAttachment, completed, quiz.questions]);
  const handlePushSchoologyGrades = async () => {
    if (!ltiAttachment || !session?.id) return;
    const maxPoints = quizMaxPoints(quiz.questions);
    const grades = buildQuizClassroomGradeEntries(
      completed,
      quiz.questions,
      maxPoints
    );
    if (grades.length === 0) {
      addToast('No completed responses to push yet.', 'info');
      return;
    }
    setPushingSchoologyGrades(true);
    try {
      const push = httpsCallable<LtiPushGradesRequest, LtiPushGradesData>(
        functions,
        'ltiPushGradesForAssignmentV1'
      );
      const { data } = await push({
        sessionId: session.id,
        kind: 'quiz',
        maxPoints,
        grades,
      });
      const bucket = bucketLtiPushResults(data);
      addToast(
        formatLtiPushToast(bucket),
        bucket.failed > 0 ? 'error' : 'success'
      );
    } catch (err) {
      logError('QuizResults.pushSchoologyGrades', err, {
        sessionId: session?.id,
      });
      addToast(ltiPushErrorMessage(err), 'error');
    } finally {
      setPushingSchoologyGrades(false);
    }
  };

  // Overflow-menu items. The Sheet/Export family (Export, Re-export solo,
  // Re-export/Update PLC, Open Sheet) and Send to Scoreboard all live here
  // (decluttered out of the visible header per the approved design). Each
  // item keeps the EXACT gate/handler/disabled condition it had as a visible
  // header button — only the placement changes:
  //   • Export            — shown when `!exportUrl`; handleExport; disabled
  //                         while exporting or with zero responses.
  //   • Re-export (solo)  — gated on `canShowSoloReExport`; handleExport.
  //   • Re-export/Update  — gated on `canShowUpdateSheet`; handleUpdateSheet
  //     (PLC)               (smart append-or-rebuild). Informative label.
  //   • Open Sheet        — shown when `exportUrl` is truthy; opens the sheet
  //                         in a new tab (was an <a target="_blank"> link).
  //   • Send to Scoreboard— gated on `filteredCompleted.length > 0` (respects
  //                         the active period filter).
  // When a Schoology push applies it's the visible primary action, so it's
  // NOT duplicated here; there is no Classroom-vs-Schoology overlap (an
  // assignment is one or the other), so the visible primary push is Classroom
  // when attached, else Schoology — and the overflow never carries a push
  // that's already visible.
  const overflowItems: OverflowMenuItem[] = [];
  // Google Sheets export is a Google-API feature excluded from the free tier
  // (docs/wide-distro-plan.md Phase 3). External (no-org/free-tier) users can't
  // connect Drive (the Drive entry is hidden for them), so they have no token
  // and the export would only surface a "sign in again" error — hide the
  // affordance cleanly instead. `isExternalUser` is false while membership
  // resolves, so org/internal members keep the button.
  if (!exportUrl && !isExternalUser) {
    overflowItems.push({
      label: 'Export to Sheets',
      icon: Download,
      loading: exporting,
      onClick: () => void handleExport(),
      disabled: exporting || responses.length === 0,
    });
  }
  if (exportUrl) {
    const sheetUrl = exportUrl;
    overflowItems.push({
      label: 'Open Sheet',
      icon: ExternalLink,
      onClick: () => window.open(sheetUrl, '_blank', 'noopener,noreferrer'),
    });
  }
  if (canShowSoloReExport) {
    overflowItems.push({
      label: 'Re-export sheet (creates a new sheet)',
      icon: RefreshCw,
      loading: exporting,
      onClick: () => void handleExport(),
      disabled: exporting,
    });
  }
  if (canShowUpdateSheet) {
    // Smart re-export: appends new responses when the sheet is behind,
    // otherwise clears and rewrites the same sheet from scratch. Always
    // enabled in PLC mode so the teacher always has a path to refresh — the
    // label tells them which mode the next click will run in.
    overflowItems.push({
      label:
        newResponsesToAppend.length === 0
          ? 'Re-export sheet (rebuild from scratch)'
          : `Re-export sheet (${newResponsesToAppend.length} new responses to append)`,
      icon: RefreshCw,
      loading: updatingSheet,
      onClick: () => void handleUpdateSheet(),
      disabled: updatingSheet,
    });
  }
  if (filteredCompleted.length > 0) {
    overflowItems.push({
      label: 'Send to Scoreboard',
      icon: Trophy,
      onClick: handleScoreboardClick,
    });
  }

  // Visible primary push: Classroom when this assignment is add-on-attached
  // (and the admin gate permits), otherwise Schoology when LTI-launched. Same
  // gating conditions/handlers as before — only the placement changes.
  const showClassroomPush =
    classroomAttachments.length > 0 && canAccessFeature('google-classroom');
  const showSchoologyPush = !!ltiAttachment;

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <SessionViewHeader
        onBack={onBack}
        title={quiz.title}
        subtitle={`${filteredCompleted.length} of ${filteredResponses.length} students finished`}
        actions={
          <>
            {hasWrittenQuestions && (
              <ActionButton
                variant="secondary"
                label="Grade Written"
                icon={Pencil}
                onClick={() => setShowGrader(true)}
              />
            )}
            {/* Admin-managed `google-classroom` gate hides the draft grade-push
                entry point for users below the doc's minTier. */}
            {showClassroomPush && (
              <ActionButton
                variant="primary"
                label="Push Grades"
                icon={GraduationCap}
                loading={pushingGrades}
                onClick={() => void handlePushGrades()}
                disabled={pushingGrades}
              />
            )}
            {showSchoologyPush && (
              <ActionButton
                variant="primary"
                label="Push to Schoology"
                icon={Send}
                loading={pushingSchoologyGrades}
                onClick={() => void handlePushSchoologyGrades()}
                disabled={
                  pushingSchoologyGrades || schoologyGrades.length === 0
                }
              />
            )}
            {overflowItems.length > 0 && (
              <div className="relative shrink-0">
                <OverflowMenu items={overflowItems} />
              </div>
            )}
            {/* Anchored separately from the overflow menu so deleting the last
                completed student (which empties overflowItems) can't unmount the
                prompt mid-interaction. */}
            {showScoreboardPrompt && (
              <div className="relative shrink-0">
                <div
                  ref={scoreboardPromptRef}
                  className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-brand-blue-primary/10 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  style={{
                    padding: 'min(16px, 4cqmin)',
                    width: 'max(220px, 50cqw)',
                  }}
                >
                  <p
                    className="font-black text-brand-blue-dark text-center uppercase tracking-wider"
                    style={{
                      fontSize: 'min(11px, 3.5cqmin)',
                      marginBottom: 'min(12px, 3cqmin)',
                    }}
                  >
                    How should students appear?
                  </p>
                  <div
                    className="flex flex-col"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <button
                      onClick={() => handleSendToScoreboard('name')}
                      className="flex items-center w-full bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95"
                      style={{
                        gap: 'min(8px, 2cqmin)',
                        padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      <User
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                      Student Names
                    </button>
                    <button
                      onClick={() => handleSendToScoreboard('pin')}
                      className="flex items-center w-full bg-slate-100 hover:bg-slate-200 text-brand-blue-dark font-bold rounded-xl transition-all active:scale-95"
                      style={{
                        gap: 'min(8px, 2cqmin)',
                        padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      <Hash
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                      PINs Only
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        }
      />

      {exportError &&
        !(exportError.kind === 'schemaMismatch' && exportError.recoveryUrl) && (
          <div
            className="mx-4 mt-3 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            <div className="font-bold text-center">{exportError.message}</div>
            {exportError.kind === 'schemaMismatch' && (
              <div className="mt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSchemaMismatchRecovery()}
                  disabled={exporting}
                  className="bg-brand-red-primary hover:bg-brand-red-dark disabled:bg-brand-gray-lighter text-white font-bold rounded-lg px-3 py-1.5 transition active:scale-95"
                >
                  Export to my own sheet instead
                </button>
              </div>
            )}
          </div>
        )}

      {/* After a successful schema-mismatch recovery, swap the red error
          banner for a success banner with the personal-sheet link. Keeps
          the user out of the "did the recovery work?" ambiguity that the
          original implementation left them in (the red banner stayed up
          alongside the new link). */}
      {exportError?.kind === 'schemaMismatch' && exportError.recoveryUrl && (
        <div
          className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          <div className="font-bold text-center">
            Exported to a personal sheet. Open and copy rows into the shared PLC
            sheet manually.
          </div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <a
              href={exportError.recoveryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold inline-flex items-center gap-1"
            >
              Open My Sheet
              <ExternalLink style={{ width: '1em', height: '1em' }} />
            </a>
          </div>
        </div>
      )}

      {responses.length === 0 ? (
        <ScaledEmptyState
          icon={BarChart3}
          title="No data available yet"
          subtitle="Results appear here once students submit."
        />
      ) : (
        <>
          {/* Period Filter (only when responses have classPeriod data) */}
          {availablePeriods.length > 1 && (
            <div
              className="flex items-center border-b border-brand-blue-primary/10"
              style={{
                padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                gap: 'min(8px, 2cqmin)',
              }}
            >
              <label
                htmlFor="quiz-results-period-filter"
                className="text-brand-blue-primary/60 font-bold uppercase tracking-widest shrink-0"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                Period:
              </label>
              <select
                id="quiz-results-period-filter"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  padding: 'min(4px, 1.5cqmin) min(8px, 2.5cqmin)',
                  fontSize: 'min(14px, 5.5cqmin)',
                }}
              >
                <option value="all">All Periods ({responses.length})</option>
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>
                    {p} ({responses.filter((r) => r.classPeriod === p).length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tabs Navigation. The PLC tab only appears when this assignment
              is in PLC mode — that's the only context where a cross-teacher
              aggregate makes sense. The shared sheet URL we render against
              is the per-assignment plc.sheetUrl, fallback to widget config
              for legacy assignments (same precedence as the export path). */}
          <div
            className="flex border-b border-brand-blue-primary/10"
            style={{ padding: 'min(8px, 2cqmin) min(16px, 4cqmin)' }}
          >
            <SegmentedTabs
              ariaLabel="Quiz results sections"
              panelIdPrefix={tabPanelId}
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { key: 'overview', label: 'Overview', icon: BarChart3 },
                { key: 'questions', label: 'Questions', icon: Target },
                {
                  key: 'students',
                  label: 'Students',
                  icon: Users,
                  count: responses.length,
                },
                ...(plcId
                  ? ([
                      {
                        key: 'plc' as const,
                        label: 'PLC',
                        icon: GraduationCap,
                      },
                    ] as const)
                  : []),
              ]}
            />
          </div>

          <div
            role="tabpanel"
            id={`${tabPanelId}-panel-${activeTab}`}
            aria-labelledby={`${tabPanelId}-tab-${activeTab}`}
            className="flex-1 overflow-y-auto custom-scrollbar"
            style={{ padding: 'min(16px, 4cqmin)' }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                responses={filteredResponses}
                completed={filteredCompleted}
                avgScore={filteredAvgScore}
                questions={quiz.questions}
                session={session}
              />
            )}
            {activeTab === 'questions' && (
              <QuestionsTab
                questions={quiz.questions}
                responses={filteredResponses}
              />
            )}
            {activeTab === 'students' && (
              <StudentsTab
                responses={filteredResponses}
                questions={quiz.questions}
                pinToName={pinToName}
                byStudentUid={byStudentUid}
                tabWarningsEnabled={tabWarningsEnabled ?? true}
                session={session}
                onDeleteResponse={onDeleteResponse}
                onUnlockResultsForStudent={onUnlockResultsForStudent}
                resultsTabWarningThreshold={
                  session?.protection?.tabWarningThreshold ?? 3
                }
                addToast={addToast}
              />
            )}
            {activeTab === 'plc' && plcId && <PlcTab plcId={plcId} />}
          </div>
        </>
      )}

      {showGrader && session?.id && user?.uid && (
        <WrittenResponseGrader
          quiz={quiz}
          responses={responses}
          displayNameByResponseKey={displayNameByResponseKey}
          teacherUid={user.uid}
          onSaveGrade={saveWrittenGrade}
          onClose={() => setShowGrader(false)}
        />
      )}
    </div>
  );
};

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  responses: QuizResponse[];
  completed: QuizResponse[];
  avgScore: number | null;
  questions: QuizQuestion[];
  session?: import('@/types').QuizSession | null;
}> = ({ responses: _responses, completed, avgScore, questions, session }) => {
  const suffix = getScoreSuffix(session);
  const buckets = [
    {
      label: '90-100%',
      min: 90,
      max: 100,
      color: 'bg-emerald-500 shadow-emerald-500/20',
    },
    {
      label: '80-89%',
      min: 80,
      max: 89,
      color: 'bg-blue-500 shadow-blue-500/20',
    },
    {
      label: '60-79%',
      min: 60,
      max: 79,
      color: 'bg-amber-500 shadow-amber-500/20',
    },
    {
      label: '0-59%',
      min: 0,
      max: 59,
      color: 'bg-brand-red-primary shadow-brand-red-primary/20',
    },
  ];

  // ⚡ Bolt: Pre-calculate scores for all completed responses once
  // This avoids calculating `getResponseScore` inside the `buckets.map` filter
  // which was O(B*R*Q), changing it to O(R*Q + B*R).
  // Distribution chart always uses percentage scores for meaningful bucketing,
  // even when gamification is active (points would not fit 0-100% buckets).
  const completedScores = React.useMemo(() => {
    return completed
      .filter((r) => canScoreResponse(r, questions))
      .map((r) => getResponseScore(r, questions, session));
  }, [completed, questions, session]);

  return (
    <div className="flex flex-col" style={{ gap: 'min(20px, 5cqmin)' }}>
      {/* Top Level Scoreboard */}
      <div className="grid grid-cols-2 gap-4">
        <StatTile
          tone="amber"
          icon={
            <Trophy
              style={{
                width: 'min(24px, 6cqmin)',
                height: 'min(24px, 6cqmin)',
              }}
            />
          }
          value={avgScore !== null ? `${avgScore}${suffix}` : '—'}
          label="Class Average"
        />
        <StatTile
          tone="blue"
          icon={
            <Users
              style={{
                width: 'min(24px, 6cqmin)',
                height: 'min(24px, 6cqmin)',
              }}
            />
          }
          value={completed.length}
          label="Finished"
        />
      </div>

      {/* Distribution Chart */}
      <div className="bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-brand-blue-primary" />
          <span
            className="font-black text-brand-blue-dark uppercase tracking-widest"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Score Distribution
          </span>
        </div>
        <div className="space-y-4">
          {buckets.map((b) => {
            const count = completedScores.filter(
              (s) => s >= b.min && s <= b.max
            ).length;
            // Denominator is the SCOREABLE population (what completedScores
            // counts), not all completed responses — otherwise unscoreable
            // responses (answer key still loading / id drift) inflate the
            // denominator so the buckets under-sum and read as all-0% next to a
            // non-zero "Finished" tile. See canScoreResponse / completedScores.
            const pct =
              completedScores.length > 0
                ? Math.round((count / completedScores.length) * 100)
                : 0;

            return (
              <div key={b.label}>
                <div
                  className="flex items-center justify-between mb-1.5 font-bold"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  <span className="text-brand-blue-dark">{b.label}</span>
                  <span className="text-brand-blue-primary/60">
                    {count} {count === 1 ? 'Student' : 'Students'} ({pct}%)
                  </span>
                </div>
                <div className="h-3 bg-brand-blue-lighter rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full ${b.color} rounded-full transition-all duration-1000 shadow-lg`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const QuestionsTab: React.FC<{
  questions: QuizData['questions'];
  responses: QuizResponse[];
}> = ({ questions, responses }) => {
  // ⚡ Bolt: Pre-calculate counts per question in a single pass.
  // Auto-graded types track answered/correct; written types track
  // answered/graded so partial credit (7/10 essay) isn't bucketed as
  // "Missed" — graders found that misleading.
  const questionStats = React.useMemo(() => {
    const stats: Record<
      string,
      { answered: number; correct: number; graded: number }
    > = {};
    const questionsById: Record<string, QuizQuestion> = {};

    questions.forEach((q) => {
      stats[q.id] = { answered: 0, correct: 0, graded: 0 };
      questionsById[q.id] = q;
    });

    responses.forEach((r) => {
      r.answers.forEach((a) => {
        const qStats = stats[a.questionId];
        const q = questionsById[a.questionId];

        if (qStats && q) {
          qStats.answered++;
          const isWritten = q.type === 'short' || q.type === 'essay';
          const manualGrade = isWritten ? r.grading?.[q.id] : undefined;
          if (isWritten) {
            if (manualGrade) qStats.graded++;
          } else if (gradeAnswer(q, a.answer, manualGrade).isCorrect) {
            qStats.correct++;
          }
        }
      });
    });

    return stats;
  }, [responses, questions]);

  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm overflow-hidden">
      {questions.map((q, i) => {
        const stats = questionStats[q.id] || {
          answered: 0,
          correct: 0,
          graded: 0,
        };
        const isWritten = q.type === 'short' || q.type === 'essay';
        const pct =
          stats.answered > 0
            ? Math.round(
                ((isWritten ? stats.graded : stats.correct) / stats.answered) *
                  100
              )
            : 0;

        return (
          <SessionRow
            key={q.id}
            trailing={
              isWritten ? (
                <SessionBadge tone="warn" label="Manual" />
              ) : (
                <span
                  className={`font-black tabular-nums shrink-0 ${scoreColorClasses(pct).text}`}
                  style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                >
                  {pct}%
                </span>
              )
            }
          >
            <div
              className="flex items-center"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              <div
                className="bg-brand-blue-lighter px-2 py-0.5 rounded text-brand-blue-primary font-black uppercase tracking-tighter shrink-0"
                style={{ fontSize: 'min(9px, 2.5cqmin)' }}
              >
                Q{i + 1}
              </div>
              <p
                className="font-bold text-brand-blue-dark leading-tight truncate"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {q.text}
              </p>
            </div>

            <div
              className="flex items-center mt-1.5"
              style={{ gap: 'min(12px, 3cqmin)' }}
            >
              <div
                className="flex items-center gap-1.5 text-emerald-600 font-bold shrink-0"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                <CheckCircle2
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                {isWritten ? stats.graded : stats.correct}{' '}
                {isWritten ? 'Graded' : 'Correct'}
              </div>
              <div
                className="flex items-center gap-1.5 text-brand-red-primary font-bold shrink-0"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                <XCircle
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                {stats.answered - (isWritten ? stats.graded : stats.correct)}{' '}
                {isWritten ? 'Ungraded' : 'Missed'}
              </div>
              <div className="flex-1 h-2 bg-brand-blue-lighter rounded-full overflow-hidden min-w-0">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${scoreColorClasses(pct).bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </SessionRow>
        );
      })}
    </div>
  );
};

const StudentsTab: React.FC<{
  responses: QuizResponse[];
  questions: QuizQuestion[];
  pinToName: Record<string, string>;
  byStudentUid: Map<
    string,
    import('@/hooks/useAssignmentPseudonyms').StudentName
  >;
  tabWarningsEnabled: boolean;
  session?: import('@/types').QuizSession | null;
  onDeleteResponse?: (responseKey: string) => Promise<void>;
  onUnlockResultsForStudent?: (responseKey: string) => Promise<void>;
  resultsTabWarningThreshold: number;
  addToast: (message: string, type?: import('@/types').Toast['type']) => void;
}> = ({
  responses,
  questions,
  pinToName,
  byStudentUid,
  tabWarningsEnabled,
  session,
  onDeleteResponse,
  onUnlockResultsForStudent,
  resultsTabWarningThreshold,
  addToast,
}) => {
  const [showResults, setShowResults] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] =
    useState<ResponseDocKey | null>(null);
  const [deletingKey, setDeletingKey] = useState<ResponseDocKey | null>(null);
  const [unlockingKey, setUnlockingKey] = useState<ResponseDocKey | null>(null);
  const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  const gamified = isGamificationActive(session);

  // Mirror QuizLiveMonitor.handleUnlockResultsForStudent — same toast copy
  // and same one-shot semantics (decrement warnings by 1; one more
  // tab-switch re-locks). Surfacing this on the post-session Results view
  // matters because the live monitor goes away once the assignment ends,
  // but the lockout flag persists on the response doc.
  const handleUnlockResultsForStudent = useCallback(
    async (responseKey: ResponseDocKey, displayName: string) => {
      if (!onUnlockResultsForStudent) return;
      setUnlockingKey(responseKey);
      try {
        await onUnlockResultsForStudent(responseKey);
        addToast(
          `${displayName} can view results again — one more tab-switch will re-lock them.`,
          'success'
        );
      } catch (err) {
        logError('QuizResults.unlockResultsForStudent', err);
        addToast(
          `Could not unlock ${displayName}'s results — try again or check your connection.`,
          'error'
        );
      } finally {
        setUnlockingKey((k) => (k === responseKey ? null : k));
      }
    },
    [onUnlockResultsForStudent, addToast]
  );

  return (
    <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
      <button
        onClick={() => setShowResults(!showResults)}
        className="w-full flex items-center justify-between p-3 bg-white/60 border border-brand-blue-primary/10 rounded-xl hover:bg-white/80 transition-all"
      >
        <span
          className="font-bold text-brand-blue-dark"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          {responses.length} student{responses.length !== 1 ? 's' : ''}
        </span>
        <span
          className="flex items-center gap-1.5 text-brand-blue-primary font-bold"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          {showResults ? (
            <>
              <EyeOff
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              Hide Results
            </>
          ) : (
            <>
              <Eye
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              Show Results
            </>
          )}
        </span>
      </button>

      {showResults && (
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm overflow-hidden">
          {responses
            .slice()
            .sort((a, b) => {
              // Match the row's display gate (below): an unscoreable response
              // renders "—", so rank it with not-started (-1) rather than letting
              // its phantom 0 sort it in among genuine low scores. Computed inline
              // (no nested helper) so a closure isn't re-allocated per comparison.
              const scoreA =
                (a.status === 'completed' || a.status === 'in-progress') &&
                canScoreResponse(a, questions)
                  ? getDisplayScore(a, questions, session)
                  : -1;
              const scoreB =
                (b.status === 'completed' || b.status === 'in-progress') &&
                canScoreResponse(b, questions)
                  ? getDisplayScore(b, questions, session)
                  : -1;
              return scoreB - scoreA;
            })
            .map((r) => {
              const score = getDisplayScore(r, questions, session);
              const earned = getEarnedPoints(r, questions, session);
              // A finished/in-progress response is only shown with a numeric
              // score once it can actually be graded — answer key loaded AND at
              // least one answer maps to a loaded question. Otherwise we render a
              // neutral placeholder instead of a misleading 0 (see
              // `canScoreResponse`).
              const scoreable =
                (r.status === 'completed' || r.status === 'in-progress') &&
                canScoreResponse(r, questions);
              const warnings = r.tabSwitchWarnings ?? 0;
              const resultsLockedOut = r.resultsLockedOut === true;
              const resultsTabWarnings = r.resultsTabWarnings ?? 0;

              const displayName = resolveResponseDisplayName(
                r,
                pinToName,
                byStudentUid
              );
              // Mono face is reserved for the literal `PIN <num>` fallback —
              // anything else (real name, ClassLink name, or the "Student"
              // SSO fallback) renders in the regular sans face. Mirrors the
              // contract used by QuizLiveMonitor's StudentRow.
              const isResolved = !r.pin || displayName !== `PIN ${r.pin}`;
              const rowKey = getResponseDocKey(r);
              const canDelete = Boolean(onDeleteResponse);
              const canUnlockResults =
                resultsLockedOut && Boolean(onUnlockResultsForStudent);
              const isConfirming = confirmDeleteKey === rowKey;
              const isDeleting = deletingKey === rowKey;
              const isUnlocking = unlockingKey === rowKey;

              if (isConfirming) {
                return (
                  <SessionRow
                    key={rowKey}
                    tintTone="danger"
                    trailing={
                      <>
                        <button
                          onClick={() => {
                            setDeletingKey(rowKey);
                            setConfirmDeleteKey(null);
                            const pending = onDeleteResponse?.(rowKey);
                            if (!pending) {
                              setDeletingKey((k) => (k === rowKey ? null : k));
                              return;
                            }
                            void pending
                              .catch((err: unknown) => {
                                console.error(
                                  '[QuizResults] failed to delete response',
                                  err
                                );
                                addToast(
                                  `Failed to delete ${displayName}\u2019s submission. Please try again.`,
                                  'error'
                                );
                              })
                              .finally(() => {
                                setDeletingKey((k) =>
                                  k === rowKey ? null : k
                                );
                              });
                          }}
                          disabled={isDeleting}
                          className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-lg px-3 py-1 shrink-0"
                          style={{ fontSize: 'min(11px, 3cqmin)' }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteKey(null)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg px-3 py-1 shrink-0"
                          style={{ fontSize: 'min(11px, 3cqmin)' }}
                        >
                          Cancel
                        </button>
                      </>
                    }
                  >
                    <span
                      className="text-red-700 font-bold truncate"
                      style={{ fontSize: 'min(12px, 4cqmin)' }}
                    >
                      Delete {displayName}&rsquo;s submission?
                    </span>
                  </SessionRow>
                );
              }

              return (
                <SessionRow
                  key={rowKey}
                  trailing={
                    <>
                      <div className="text-right shrink-0">
                        {scoreable ? (
                          <>
                            <ScorePill
                              score={gamified ? 0 : score}
                              display="percent"
                              gamified={gamified}
                              points={earned}
                            />
                            <p
                              className="text-brand-blue-primary/60 font-bold"
                              style={{ fontSize: 'min(10px, 3cqmin)' }}
                            >
                              {earned}/{maxPoints} pts
                              {r.status === 'in-progress' && ' (In Progress)'}
                            </p>
                            {/* Fresh responses now carry preSyncVersion: 0
                             * so the server-side sync query
                             * (`where('preSyncVersion', '==', 0)`) can find
                             * untagged rows. The chip should only render once
                             * a sync has actually tagged the response — i.e.
                             * when the value is greater than zero. */}
                            {typeof r.preSyncVersion === 'number' &&
                              r.preSyncVersion > 0 && (
                                <span
                                  className="mt-0.5 inline-flex"
                                  title="This response was started on an earlier version of the quiz. The teacher synced new content after the student began."
                                >
                                  <SessionBadge
                                    tone="warn"
                                    label={`Pre-sync v${r.preSyncVersion}`}
                                  />
                                </span>
                              )}
                          </>
                        ) : r.status === 'completed' ||
                          r.status === 'in-progress' ? (
                          <p
                            className="font-black text-brand-gray-primary"
                            style={{ fontSize: 'min(15px, 5cqmin)' }}
                            title="Scoring unavailable — the quiz answer key hasn't loaded yet, or this submission doesn't match the current quiz version."
                          >
                            &mdash;
                          </p>
                        ) : (
                          <div
                            className="bg-brand-gray-lightest text-brand-gray-primary font-black uppercase rounded px-2 py-1 tracking-tighter"
                            style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                          >
                            {r.status}
                          </div>
                        )}
                      </div>

                      {/* Unlock-results action — only when this student is
                        currently locked out of viewing published results.
                        Decrements `resultsTabWarnings` by 1 and clears the
                        flag; one more tab-switch re-locks them (zero grace
                        warnings post-unlock, matching QuizLiveMonitor's
                        behavior). */}
                      {canUnlockResults && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleUnlockResultsForStudent(
                              rowKey,
                              displayName
                            )
                          }
                          disabled={isUnlocking}
                          title="Decrement warnings by 1 and reopen the results view for this student"
                          aria-label={`Unlock results for ${displayName}`}
                          className="shrink-0 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1"
                          style={{ fontSize: 'min(11px, 3cqmin)' }}
                        >
                          {isUnlocking ? (
                            <Loader2
                              className="animate-spin"
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                          ) : (
                            <Lock
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                          )}
                          Unlock results
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => setConfirmDeleteKey(rowKey)}
                          disabled={isDeleting}
                          title="Delete this submission"
                          aria-label={`Delete ${displayName}'s submission`}
                          className="shrink-0 p-1.5 rounded-lg text-brand-red-primary/50 hover:text-brand-red-primary hover:bg-brand-red-primary/10 disabled:opacity-30 transition-colors"
                        >
                          {isDeleting ? (
                            <Loader2
                              className="animate-spin"
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                          ) : (
                            <Trash2
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                          )}
                        </button>
                      )}
                    </>
                  }
                >
                  <div
                    className="flex items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <p
                      className={`font-bold text-brand-blue-dark truncate ${isResolved ? '' : 'font-mono'}`}
                      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                    >
                      {displayName}
                    </p>
                    {tabWarningsEnabled && warnings > 0 && (
                      <span
                        title={`${warnings} Tab Switch Warning(s)`}
                        className="shrink-0"
                      >
                        <SessionBadge
                          tone="danger"
                          icon={AlertTriangle}
                          label={`${warnings}`}
                        />
                      </span>
                    )}
                    {/* Results-view lockout indicator. Student crossed the
                      `protection.tabWarningThreshold` while viewing
                      published results — the student app redirected
                      them out and wrote `resultsLockedOut: true`. Sits
                      next to the in-quiz tab-switch warning badge above
                      because both come from the same "nav warning"
                      family but track different surfaces (live attempt
                      vs. published results). */}
                    {resultsLockedOut && (
                      <span
                        aria-label="Results locked"
                        title={`Results locked after ${resultsTabWarnings} of ${resultsTabWarningThreshold} tab-switch warnings`}
                        className="shrink-0"
                      >
                        <SessionBadge
                          tone="warn"
                          icon={Lock}
                          label={`Locked (${resultsTabWarnings}/${resultsTabWarningThreshold})`}
                        />
                      </span>
                    )}
                  </div>
                </SessionRow>
              );
            })}
        </div>
      )}
    </div>
  );
};
