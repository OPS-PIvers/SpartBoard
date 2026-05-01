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
} from 'react';
import {
  ArrowLeft,
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
} from 'lucide-react';
import { QuizResponse, QuizData, QuizQuestion, QuizConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import {
  PlcSheetMissingError,
  QuizDriveService,
} from '@/utils/quizDriveService';
import { getPlcTeammateEmails } from '@/utils/plc';
import {
  gradeAnswer,
  getResponseDocKey,
  type ResponseDocKey,
} from '@/hooks/useQuizSession';
import { useDashboard } from '@/context/useDashboard';
import {
  buildPinToNameMap,
  buildPinToExportNameMap,
  buildScoreboardTeams,
  getResponseScore,
  getDisplayScore,
  getScoreSuffix,
  getEarnedPoints,
  isGamificationActive,
} from '../utils/quizScoreboard';
import { resolveResponseDisplayName } from '../utils/resolveDisplayName';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useAssignmentPseudonyms } from '@/hooks/useAssignmentPseudonyms';
import { PlcTab } from './PlcTab';

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
  onPlcSheetUrlReplaced,
  initialExportUrl,
  plcSheetUrl: assignmentPlcSheetUrl,
  onExportUrlSaved,
  initialExportedResponseIds,
  onExportedResponseIdsSaved,
}) => {
  const { activeDashboard, updateWidget, addWidget, addToast, rosters } =
    useDashboard();
  const { googleAccessToken, user, orgId } = useAuth();
  const { plcs, clearPlcSharedSheetUrl, setPlcSharedSheetUrl } = usePlcs();
  const [exporting, setExporting] = useState(false);
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'students' | 'plc'
  >('overview');
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

  // ClassLink name resolution — only populated when session.classId is set
  // (i.e. assigned to a ClassLink class). For legacy code+PIN sessions both
  // maps are empty and pinToName handles display.
  const { byStudentUid } = useAssignmentPseudonyms(
    session?.id ?? null,
    session?.classId ?? null,
    orgId
  );
  const exportPinToName = useMemo(
    () => buildPinToExportNameMap(rosters, resolvedPeriods),
    [rosters, resolvedPeriods]
  );
  const hasNames = Object.keys(pinToName).length > 0;

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
  const filteredAvgScore =
    filteredCompleted.length > 0
      ? Math.round(
          filteredCompleted.reduce(
            (sum, r) => sum + getDisplayScore(r, quiz.questions, session),
            0
          ) / filteredCompleted.length
        )
      : null;

  const handleSendToScoreboard = useCallback(
    (mode: 'pin' | 'name') => {
      setShowScoreboardPrompt(false);

      if (completed.length === 0) {
        addToast('No completed students yet', 'error');
        return;
      }

      const newTeams = buildScoreboardTeams(
        completed,
        quiz.questions,
        mode,
        pinToName,
        session,
        byStudentUid
      );

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
      completed,
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
    if (completed.length === 0) {
      addToast('No completed students yet', 'error');
      return;
    }
    if (hasNames) {
      setShowScoreboardPrompt(true);
    } else {
      handleSendToScoreboard('pin');
    }
  }, [completed.length, hasNames, addToast, handleSendToScoreboard]);

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
    ) => Promise<string>
  ): Promise<{ url: string; canonical: string }> => {
    if (
      !(exportErr instanceof PlcSheetMissingError) ||
      !user ||
      !googleAccessToken ||
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
    const svc = new QuizDriveService(googleAccessToken);
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
    if (!googleAccessToken) {
      setExportError(
        'Google access token not available. Please sign in again.'
      );
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const svc = new QuizDriveService(googleAccessToken);
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
            )
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setExportError(msg);
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

  const handleUpdateSheet = async () => {
    if (!exportUrl) return;
    if (!googleAccessToken) {
      setExportError(
        'Google access token not available. Please sign in again.'
      );
      return;
    }
    setUpdatingSheet(true);
    setExportError(null);
    try {
      const svc = new QuizDriveService(googleAccessToken);
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
            )
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
      const msg = err instanceof Error ? err.message : 'Update failed';
      setExportError(msg);
      addToast(msg, 'error');
    } finally {
      setUpdatingSheet(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="flex items-center border-b border-brand-blue-primary/10"
        style={{
          gap: 'min(12px, 3cqmin)',
          padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)',
        }}
      >
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-brand-blue-primary/10 rounded-lg transition-colors text-brand-blue-primary shrink-0"
        >
          <ArrowLeft
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p
            className="font-black text-brand-blue-dark truncate"
            style={{ fontSize: 'min(14px, 4.5cqmin)' }}
          >
            Results: {quiz.title}
          </p>
          <p
            className="text-brand-blue-primary/60 font-bold"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {completed.length} of {responses.length} students finished
          </p>
        </div>

        {completed.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={handleScoreboardClick}
              className="flex items-center bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <Trophy
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              SEND TO SCOREBOARD
            </button>
            {showScoreboardPrompt && (
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
            )}
          </div>
        )}
        {exportUrl ? (
          <>
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 shrink-0"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                fontSize: 'min(11px, 3.5cqmin)',
              }}
            >
              <ExternalLink
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              OPEN SHEET
            </a>
            {canShowUpdateSheet && (
              // Smart re-export: appends new responses when the sheet is
              // behind, otherwise clears and rewrites the same sheet from
              // scratch. The button is always enabled in PLC mode so the
              // teacher always has a path to refresh — the title hint
              // tells them which mode the next click will run in.
              <span
                title={
                  newResponsesToAppend.length === 0
                    ? 'Re-export — rebuild this sheet from scratch'
                    : `Add ${newResponsesToAppend.length} new response${
                        newResponsesToAppend.length === 1 ? '' : 's'
                      } to the sheet`
                }
                className="shrink-0 inline-flex"
              >
                <button
                  onClick={() => void handleUpdateSheet()}
                  disabled={updatingSheet}
                  aria-label={
                    newResponsesToAppend.length === 0
                      ? 'Re-export sheet (rebuild from scratch)'
                      : `Re-export sheet (${newResponsesToAppend.length} new responses to append)`
                  }
                  className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                    fontSize: 'min(11px, 3.5cqmin)',
                  }}
                >
                  {updatingSheet ? (
                    <Loader2
                      className="animate-spin"
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  ) : (
                    <RefreshCw
                      style={{
                        width: 'min(14px, 4cqmin)',
                        height: 'min(14px, 4cqmin)',
                      }}
                    />
                  )}
                  RE-EXPORT SHEET
                  {newResponsesToAppend.length > 0 && (
                    <span
                      className="ml-1 inline-flex items-center justify-center bg-white/25 rounded-full font-black"
                      style={{
                        minWidth: 'min(18px, 5cqmin)',
                        height: 'min(18px, 5cqmin)',
                        padding: '0 min(6px, 1.5cqmin)',
                        fontSize: 'min(10px, 3cqmin)',
                      }}
                    >
                      {newResponsesToAppend.length}
                    </span>
                  )}
                </button>
              </span>
            )}
          </>
        ) : (
          <button
            onClick={() => void handleExport()}
            disabled={exporting || responses.length === 0}
            className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-gray-lighter text-white font-bold rounded-xl transition-all shadow-md active:scale-95 shrink-0"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            {exporting ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            ) : (
              <Download
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            )}
            EXPORT
          </button>
        )}
      </div>

      {exportError && (
        <div
          className="mx-4 mt-3 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-bold text-center"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          {exportError}
        </div>
      )}

      {responses.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full text-brand-blue-primary/30"
          style={{ gap: 'min(16px, 4cqmin)' }}
        >
          <div className="bg-brand-blue-lighter/50 p-6 rounded-full border-2 border-dashed border-brand-blue-primary/10">
            <BarChart3
              style={{
                width: 'min(48px, 12cqmin)',
                height: 'min(48px, 12cqmin)',
              }}
            />
          </div>
          <p className="font-bold" style={{ fontSize: 'min(14px, 4.5cqmin)' }}>
            No data available yet.
          </p>
        </div>
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
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin) 0',
              gap: 'min(4px, 1cqmin)',
            }}
          >
            {(
              [
                'overview',
                'questions',
                'students',
                ...(config.plcMode ? (['plc'] as const) : []),
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-black uppercase tracking-widest rounded-t-xl transition-all ${
                  activeTab === tab
                    ? 'bg-white text-brand-blue-primary border-x border-t border-brand-blue-primary/10'
                    : 'text-brand-blue-primary/40 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/30'
                }`}
                style={{
                  padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)',
                  fontSize: 'min(10px, 3cqmin)',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
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
                addToast={addToast}
              />
            )}
            {activeTab === 'plc' &&
              config.plcMode &&
              (assignmentPlcSheetUrl ?? config.plcSheetUrl) && (
                <PlcTab
                  plcSheetUrl={
                    (assignmentPlcSheetUrl ?? config.plcSheetUrl) as string
                  }
                  googleAccessToken={googleAccessToken}
                  questions={quiz.questions}
                />
              )}
          </div>
        </>
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
    return completed.map((r) => getResponseScore(r, questions, session));
  }, [completed, questions, session]);

  return (
    <div className="flex flex-col" style={{ gap: 'min(20px, 5cqmin)' }}>
      {/* Top Level Scoreboard */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
          <Trophy
            className="text-amber-400 mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {avgScore !== null ? `${avgScore}${suffix}` : '—'}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            Class Average
          </p>
        </div>
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-4 text-center shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-blue-primary"></div>
          <Users
            className="text-brand-blue-primary mx-auto mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          />
          <p
            className="font-black text-brand-blue-dark leading-none"
            style={{ fontSize: 'min(28px, 9cqmin)' }}
          >
            {completed.length}
          </p>
          <p
            className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
            style={{ fontSize: 'min(10px, 3cqmin)' }}
          >
            Finished
          </p>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="bg-white border border-brand-blue-primary/10 rounded-2xl p-5 shadow-sm">
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
            const pct =
              completed.length > 0
                ? Math.round((count / completed.length) * 100)
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
  // ⚡ Bolt: Pre-calculate counts of "answered" and "correct" per question.
  // This avoids O(Q*R*A) iteration inside `questions.map` loop and instead
  // uses a single O(R*A) pass with O(Q) rendering.
  const questionStats = React.useMemo(() => {
    const stats: Record<string, { answered: number; correct: number }> = {};
    const questionsById: Record<string, QuizQuestion> = {};

    questions.forEach((q) => {
      stats[q.id] = { answered: 0, correct: 0 };
      questionsById[q.id] = q;
    });

    responses.forEach((r) => {
      r.answers.forEach((a) => {
        const qStats = stats[a.questionId];
        const q = questionsById[a.questionId];

        if (qStats && q) {
          qStats.answered++;
          if (gradeAnswer(q, a.answer)) {
            qStats.correct++;
          }
        }
      });
    });

    return stats;
  }, [responses, questions]);

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const stats = questionStats[q.id] || { answered: 0, correct: 0 };
        const pct =
          stats.answered > 0
            ? Math.round((stats.correct / stats.answered) * 100)
            : 0;

        return (
          <div
            key={q.id}
            className="bg-white border border-brand-blue-primary/10 rounded-2xl p-4 shadow-sm hover:border-brand-blue-primary/20 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className="bg-brand-blue-lighter px-2 py-0.5 rounded text-brand-blue-primary font-black uppercase tracking-tighter"
                style={{ fontSize: 'min(9px, 2.5cqmin)' }}
              >
                Question {i + 1}
              </div>
              <div
                className="font-black text-brand-blue-dark"
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                {pct}% Accuracy
              </div>
            </div>

            <p
              className="font-bold text-brand-blue-dark leading-tight line-clamp-2"
              style={{ fontSize: 'min(13px, 4.5cqmin)' }}
            >
              {q.text}
            </p>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-brand-blue-primary/5">
              <div
                className="flex items-center gap-1.5 text-emerald-600 font-bold"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                <CheckCircle2
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                {stats.correct} Correct
              </div>
              <div
                className="flex items-center gap-1.5 text-brand-red-primary font-bold"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                <XCircle
                  style={{
                    width: 'min(14px, 4cqmin)',
                    height: 'min(14px, 4cqmin)',
                  }}
                />
                {stats.answered - stats.correct} Missed
              </div>
            </div>

            <div className="h-2 bg-brand-blue-lighter rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  pct >= 80
                    ? 'bg-emerald-500'
                    : pct >= 60
                      ? 'bg-amber-500'
                      : 'bg-brand-red-primary'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
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
  addToast: (message: string, type?: import('@/types').Toast['type']) => void;
}> = ({
  responses,
  questions,
  pinToName,
  byStudentUid,
  tabWarningsEnabled,
  session,
  onDeleteResponse,
  addToast,
}) => {
  const [showResults, setShowResults] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] =
    useState<ResponseDocKey | null>(null);
  const [deletingKey, setDeletingKey] = useState<ResponseDocKey | null>(null);
  const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  const gamified = isGamificationActive(session);
  const suffix = getScoreSuffix(session);

  return (
    <div className="space-y-2">
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

      {showResults &&
        responses
          .slice()
          .sort((a, b) => {
            const scoreA =
              a.status === 'completed' || a.status === 'in-progress'
                ? getDisplayScore(a, questions, session)
                : -1;
            const scoreB =
              b.status === 'completed' || b.status === 'in-progress'
                ? getDisplayScore(b, questions, session)
                : -1;
            return scoreB - scoreA;
          })
          .map((r) => {
            const score = getDisplayScore(r, questions, session);
            const earned = getEarnedPoints(r, questions, session);
            const warnings = r.tabSwitchWarnings ?? 0;

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
            const isConfirming = confirmDeleteKey === rowKey;
            const isDeleting = deletingKey === rowKey;

            if (isConfirming) {
              return (
                <div
                  key={rowKey}
                  className="flex items-center rounded-xl border bg-red-50 border-red-200 p-3 gap-2"
                >
                  <span
                    className="flex-1 text-red-700 font-bold truncate"
                    style={{ fontSize: 'min(12px, 4cqmin)' }}
                  >
                    Delete {displayName}&rsquo;s submission?
                  </span>
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
                          setDeletingKey((k) => (k === rowKey ? null : k));
                        });
                    }}
                    disabled={isDeleting}
                    className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold rounded-lg px-3 py-1"
                    style={{ fontSize: 'min(11px, 3cqmin)' }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDeleteKey(null)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg px-3 py-1"
                    style={{ fontSize: 'min(11px, 3cqmin)' }}
                  >
                    Cancel
                  </button>
                </div>
              );
            }

            return (
              <div
                key={rowKey}
                className="flex items-center bg-white border border-brand-blue-primary/10 rounded-xl p-3 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`font-bold text-brand-blue-dark truncate ${isResolved ? '' : 'font-mono'}`}
                      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                    >
                      {displayName}
                    </p>
                    {tabWarningsEnabled && warnings > 0 && (
                      <span
                        className="flex items-center gap-1 bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase font-black shrink-0"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                        title={`${warnings} Tab Switch Warning(s)`}
                      >
                        <AlertTriangle style={{ width: 10, height: 10 }} />
                        {warnings}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 ml-4 pl-4 border-l border-brand-blue-primary/5">
                  {r.status === 'completed' || r.status === 'in-progress' ? (
                    <>
                      <p
                        className={`font-black ${gamified ? 'text-brand-blue-dark' : score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-brand-red-primary'}`}
                        style={{ fontSize: 'min(15px, 5cqmin)' }}
                      >
                        {score}
                        {suffix}
                      </p>
                      <p
                        className="text-brand-blue-primary/60 font-bold"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        {earned}/{maxPoints} pts
                        {r.status === 'in-progress' && ' (In Progress)'}
                      </p>
                      {/* Fresh responses now carry preSyncVersion: 0
                       * so the server-side sync query
                       * (`where('preSyncVersion', '<', N)`) can find
                       * untagged rows. The chip should only render once
                       * a sync has actually tagged the response — i.e.
                       * when the value is greater than zero. */}
                      {typeof r.preSyncVersion === 'number' &&
                        r.preSyncVersion > 0 && (
                          <p
                            className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 font-bold uppercase tracking-wider text-amber-700"
                            style={{ fontSize: 'min(8px, 2.2cqmin)' }}
                            title="This response was started on an earlier version of the quiz. The teacher synced new content after the student began."
                          >
                            Pre-sync v{r.preSyncVersion}
                          </p>
                        )}
                    </>
                  ) : (
                    <div
                      className="bg-brand-gray-lightest text-brand-gray-primary font-black uppercase rounded px-2 py-1 tracking-tighter"
                      style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                    >
                      {r.status}
                    </div>
                  )}
                </div>

                {canDelete && (
                  <button
                    onClick={() => setConfirmDeleteKey(rowKey)}
                    disabled={isDeleting}
                    title="Delete this submission"
                    aria-label={`Delete ${displayName}'s submission`}
                    className="ml-2 shrink-0 p-1.5 rounded-lg text-brand-red-primary/50 hover:text-brand-red-primary hover:bg-brand-red-primary/10 disabled:opacity-30 transition-colors"
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
              </div>
            );
          })}
    </div>
  );
};
