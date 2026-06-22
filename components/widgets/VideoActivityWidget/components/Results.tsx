/**
 * Results — aggregated results view for a video activity session.
 * Adapted from QuizResults. Shows per-student scores and per-question accuracy.
 */

import React, { useId, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  AlertTriangle,
  BarChart3,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  GraduationCap,
  Send,
} from 'lucide-react';
import {
  PlcLinkage,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { QuizDriveService } from '@/utils/quizDriveService';
import {
  gradeVideoActivityAnswer,
  computeVideoActivityScorePct,
  canScoreVideoActivityResponse,
  videoActivityMaxPoints,
  buildVideoActivityGradeEntries,
} from '@/utils/videoActivityGrading';
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
  bucketLtiPushResults,
  formatLtiPushToast,
  ltiPushErrorMessage,
  type LtiPushGradesRequest,
  type LtiPushGradesData,
} from '@/utils/ltiGradePush';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  useAssignmentPseudonymsMulti,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { logError } from '@/utils/logError';
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

interface ResultsProps {
  session: VideoActivitySession;
  responses: VideoActivityResponse[];
  onBack: () => void;
  /**
   * PLC linkage for this assignment, if any. Currently unused at render
   * time — kept on the props shape so callers don't have to drop the
   * prop, and so the VA-side auto-publish work can pick this up directly
   * when it lands. The PLC tab is intentionally hidden in VA Results
   * until the VA-side publish path exists (otherwise PlcTab would
   * cross-contaminate VA's view with Quiz contributions from the same
   * PLC). See the tab-strip and panel comments below.
   */
  plc?: PlcLinkage;
}

export const Results: React.FC<ResultsProps> = ({
  session,
  responses,
  onBack,
  plc: _plc,
}) => {
  const { ensureGoogleScope, user, orgId, canAccessFeature, isExternalUser } =
    useAuth();
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  // Use the multi-class variant — `session.classId` is a transitional
  // mirror of `classIds[0]` only, so the single-class hook would miss
  // SSO students from `classIds[1+]` on multi-class assignments and
  // their export rows would fall back to the generic "Student" label.
  // Mirrors the QuizLiveMonitor pattern.
  const sessionClassIds = useMemo(() => {
    if (session.classIds && session.classIds.length > 0)
      return session.classIds;
    return session.classId ? [session.classId] : [];
  }, [session.classIds, session.classId]);
  const { byStudentUid: classLinkNames } = useAssignmentPseudonymsMulti(
    session.id,
    sessionClassIds,
    orgId
  );
  // Schoology LTI students aren't in any ClassLink roster — resolve their names
  // on-read via NRPS and merge in (ClassLink wins on the rare uid collision).
  // Gated on `ltiNrps` so non-LTI sessions never make the call. `kind: 'va'`
  // namespaces the resolver/cache away from the quiz path. Mirrors QuizResults.
  const ltiNames = useLtiSessionNames(
    session.id,
    session.ltiNrps === true,
    'va'
  );
  const byStudentUid = useMemo(() => {
    if (ltiNames.size === 0) return classLinkNames;
    const merged = new Map(classLinkNames);
    for (const [uid, name] of ltiNames) {
      if (!merged.has(uid)) merged.set(uid, name);
    }
    return merged;
  }, [classLinkNames, ltiNames]);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pushingGrades, setPushingGrades] = useState(false);
  const [pushingSchoology, setPushingSchoology] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'questions' | 'students'
  >('overview');
  // Per-instance prefix for the ARIA tab↔panel linkage.
  const tabPanelId = useId();

  const questions = session.questions;
  const totalStudents = responses.length;

  /**
   * Compute correctness from the authoritative activity question data.
   * Routes through the shared `gradeVideoActivityAnswer` so MA / FIB
   * variants / partial-credit semantics stay aligned with the student
   * client and the post-completion summary.
   */
  const isAnswerCorrect = (questionId: string, answer: string): boolean => {
    const q = questions.find((q) => q.id === questionId);
    return q ? gradeVideoActivityAnswer(q, answer).isCorrect : false;
  };

  const getStudentScore = (r: VideoActivityResponse): number =>
    computeVideoActivityScorePct(questions, r.answers);

  // ⚡ Bolt: Consolidate multiple O(N) array passes inside render
  // Calculate completed count and average score in a single loop
  const { completed, avgScore } = React.useMemo(() => {
    if (responses.length === 0) {
      // No responses → nothing is scoreable, so the average is undefined, not a
      // real 0. Return `null` (not `0`) so the Avg Score tile renders "—",
      // matching the no-scoreable-responses path below — otherwise an empty
      // session would show a phantom "0%" that reads as a class that failed.
      return { completed: 0, avgScore: null };
    }

    let completedCount = 0;
    let scoreSum = 0;
    // Average only over responses we can actually score. A completed response
    // whose questions haven't loaded yet (or whose answers map to no loaded
    // question) would score a phantom 0 and drag the class average down as if
    // everyone failed — exclude it from the mean rather than seating it at 0.
    // See `canScoreVideoActivityResponse`. `completedCount` still counts every
    // completion (that's a real headcount), so only the denominator narrows.
    let scoredCount = 0;

    for (const r of responses) {
      if (r.completedAt !== null) {
        completedCount++;
        if (canScoreVideoActivityResponse(questions, r.answers)) {
          scoreSum += computeVideoActivityScorePct(questions, r.answers);
          scoredCount++;
        }
      }
    }

    return {
      completed: completedCount,
      // `null` when nothing is scoreable yet (question set not loaded, or every
      // completed response drifted) — the tile renders "—" rather than a
      // phantom "0%" that reads as a class that failed. A genuine empty
      // submission still counts as a real 0, so it keeps the average defined.
      avgScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : null,
    };
  }, [responses, questions]);

  const getQuestionAccuracy = (questionId: string): number => {
    const answered = responses.filter((r) =>
      r.answers.some((a) => a.questionId === questionId)
    );
    if (answered.length === 0) return 0;
    const correct = answered.filter((r) =>
      r.answers.some(
        (a) =>
          a.questionId === questionId && isAnswerCorrect(a.questionId, a.answer)
      )
    ).length;
    return Math.round((correct / answered.length) * 100);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleExport = async () => {
    // Acquire the Sheets scope on demand (Path B): silent for already-granted
    // users, one-time consent for never-granted (this is a user gesture).
    const token = await ensureGoogleScope('spreadsheets', {
      interactive: true,
    });
    if (!token) {
      setExportError(
        'Google Drive access is required to export. Please sign out and sign in again.'
      );
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const drive = new QuizDriveService(token);

      // Map VideoActivityResponses to QuizResponse shape for reuse
      const quizResponses = responses.map((r) => ({
        studentUid: r.studentUid,
        // Anon responses always carry a PIN; SSO responses don't. Fall back
        // to empty string so the export shape stays string-typed.
        pin: r.pin ?? '',
        joinedAt: r.joinedAt,
        status: (r.completedAt ? 'completed' : 'in-progress') as
          | 'completed'
          | 'in-progress'
          | 'joined',
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          answer: a.answer,
          answeredAt: a.answeredAt,
          isCorrect: a.isCorrect,
        })),
        score: r.score,
        submittedAt: r.completedAt,
        tabSwitchWarnings: r.tabSwitchWarnings ?? 0,
      }));

      // Pass `byStudentUid` so SSO `studentRole` rows (no PIN) export with
      // their resolved ClassLink names instead of falling back to the
      // generic "Student" label.
      //
      // PR3b: pass `gradeFn: gradeVideoActivityAnswer` so the exporter
      // grades VA's MA / FIB-with-variants questions correctly. Without
      // this override the Quiz default grader has no `'MA'` case and
      // returns 0 points for those columns (the TODO PR2a left here).
      // Cast away the QuizQuestion / QuizResponse / typeof-gradeAnswer
      // shapes — the lifted `buildResultsSheetData` is generic enough to
      // accept VA's variants but the public `exportResultsToSheet`
      // signature is still typed as Quiz-shaped. PR3 documents the cast
      // boundary; a future refactor that splits the Quiz-specific
      // question-stats block out into a generic helper would let this
      // function become generic too and remove the cast.
      type ExporterOptions = Parameters<typeof drive.exportResultsToSheet>[3];
      const url = await drive.exportResultsToSheet(
        session.assignmentName,
        quizResponses,
        questions as unknown as Parameters<
          typeof drive.exportResultsToSheet
        >[2],
        {
          byStudentUid,
          gradeFn:
            gradeVideoActivityAnswer as unknown as NonNullable<ExporterOptions>['gradeFn'],
        }
      );
      setExportUrl(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  };

  // Push the SpartBoard video-activity scores into the linked Google Classroom
  // gradebook as DRAFT grades. Only available when this assignment was attached
  // to one or more Classroom coursework items via the add-on (which writes
  // `session.classroomAttachments`, back-compat singular `classroomAttachment`).
  // VA grades are a 0–100 percentage on screen, so we scale that displayed
  // percentage onto the frozen Classroom point total (`maxPoints`) — matching
  // the per-student score the Students tab shows. Students map to their
  // Classroom grade by `r.studentUid` (the ClassLink SSO pseudonym the batch CF
  // resolves to a Classroom userId). Linked to multiple courses, the SAME
  // payload fans out to each (Item D multi-course).
  const classroomAttachments = getClassroomAttachments(session);
  const handlePushGrades = async () => {
    // Guard the grade scale FIRST (a malformed/stale attachment could carry
    // NaN/0 maxPoints, scaling every grade to 0/NaN), then the eligible list —
    // completed responses with a resolvable pseudonym — so we never pop a
    // consent dialog when there's nothing to push. All linked courses share this
    // assignment's frozen denominator, so we validate + build once and fan out.
    const validAttachments = classroomAttachments.filter((a) =>
      hasValidMaxPoints(a.maxPoints)
    );
    if (validAttachments.length === 0) {
      addToast(MISSING_MAX_POINTS_MESSAGE, 'error');
      return;
    }
    const maxPoints = validAttachments[0].maxPoints;
    // Build the PII-free entries once via the shared helper (same filter +
    // scaling the Publish=Push chaining uses, so the two paths can't drift).
    // Unscoreable/incomplete responses are excluded so we never pop a consent
    // dialog for nothing — or PATCH a phantom 0 into the real gradebook.
    const grades = buildVideoActivityGradeEntries(
      responses,
      questions,
      maxPoints
    );
    if (grades.length === 0) {
      addToast(NOTHING_TO_PUSH_TOAST, 'info');
      return;
    }

    // Shared push flow (token mint → CF → result toast). The entries were built
    // from the responses captured when the teacher clicked (this closure), so a
    // mid-dialog Firestore edit can't bake in stale scores.
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
      buildGrades: () => grades,
      confirm: () =>
        showConfirm(
          `Push ${grades.length} grade${grades.length === 1 ? '' : 's'} to Google ` +
            `Classroom${courseCount > 1 ? ` (${courseCount} courses)` : ''}? This writes draft grades to the assignment gradebook — ` +
            'you still review and return them in Classroom.',
          {
            title: 'Push grades to Google Classroom',
            confirmLabel: 'Push grades',
            cancelLabel: 'Cancel',
          }
        ),
      distinctTokenCancel: true,
      logTag: 'VideoActivityResults.pushClassroomGrades',
      logContext: {
        sessionId: session?.id,
        attachmentId: validAttachments[0].attachmentId,
      },
      ...createToastGradePushHandlers(addToast, setPushingGrades),
    });
  };

  // Push the SpartBoard video-activity scores into the linked Schoology
  // gradebook over LTI AGS. Only available when this assignment was launched
  // from a Schoology resource link — the first student launch sets
  // `session.ltiAttachment` (presence ⇒ Schoology assignment). The server
  // derives the resource link + clamps; we scale the displayed 0–100 percentage
  // onto the SAME point total the deep-link froze into the Schoology line item
  // (the activity's summed question points), so the pushed score's denominator
  // matches the gradebook column exactly — mirroring the quiz path (which posts
  // against quizMaxPoints) and the Classroom VA push (which scales onto the
  // frozen attachment points). Students map to their Schoology grade by
  // `r.studentUid` (the `schoology-sub` pseudonym the AGS line item is keyed on).
  const ltiAttachment = session?.ltiAttachment ?? null;
  const handlePushSchoologyGrades = async () => {
    if (!ltiAttachment) return;

    // The gradebook denominator = the activity's summed question points (= the
    // line item `scoreMaximum` the picker set at deep-link time). Shared with
    // LtiDeepLinkPicker.addVideoActivity via videoActivityMaxPoints, so
    // scoreGiven/scoreMaximum always match the Schoology column. Entries are
    // built via the shared helper (same filter + scaling as the Classroom VA
    // push and the Publish=Push chaining) so nothing drifts.
    const maxPoints = videoActivityMaxPoints(questions);
    const grades = buildVideoActivityGradeEntries(
      responses,
      questions,
      maxPoints
    );
    if (grades.length === 0) {
      addToast('No completed responses to push yet.', 'info');
      return;
    }

    setPushingSchoology(true);
    try {
      const callable = httpsCallable<LtiPushGradesRequest, LtiPushGradesData>(
        functions,
        'ltiPushGradesForAssignmentV1'
      );
      const { data } = await callable({
        sessionId: session.id,
        kind: 'va',
        maxPoints,
        grades,
      });
      const bucket = bucketLtiPushResults(data);
      addToast(
        formatLtiPushToast(bucket),
        bucket.failed > 0 ? 'error' : 'success'
      );
    } catch (err) {
      logError('VideoActivityResults.pushSchoologyGrades', err, {
        sessionId: session?.id,
      });
      addToast(ltiPushErrorMessage(err), 'error');
    } finally {
      setPushingSchoology(false);
    }
  };

  // Visible primary push: Classroom when this assignment is add-on-attached
  // (and the admin gate permits), otherwise Schoology when LTI-launched. Same
  // gating conditions/handlers as before — only the placement changes.
  const showClassroomPush =
    classroomAttachments.length > 0 && canAccessFeature('google-classroom');
  const showSchoologyPush = !!ltiAttachment;

  // Overflow-menu items. The Sheet/Export family (Export, Open Sheet) lives
  // here, decluttered out of the visible header per the approved design. Each
  // item keeps the EXACT gate/handler it had as a visible header button — only
  // the placement changes:
  //   • Export    — shown when `!exportUrl`; handleExport; disabled while
  //                 exporting or with zero responses.
  //   • Open Sheet — shown when `exportUrl` is truthy; opens the sheet in a
  //                  new tab (was an outlined <a target="_blank"> link).
  const overflowItems: OverflowMenuItem[] = [];
  // Google Sheets export is a Google-API feature excluded from the free tier
  // (docs/wide-distro-plan.md Phase 3). External (no-org/free-tier) users have
  // no Drive token (the Drive connect entry is hidden for them), so the export
  // would only error — hide it cleanly. `isExternalUser` is false while
  // membership resolves, so org/internal members keep the button.
  if (!exportUrl && !isExternalUser) {
    overflowItems.push({
      label: 'Export',
      icon: Download,
      loading: exporting,
      onClick: () => void handleExport(),
      disabled: exporting || totalStudents === 0,
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

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <SessionViewHeader
        onBack={onBack}
        status={session.status === 'ended' ? 'ended' : 'live'}
        title={session.assignmentName}
        subtitle={session.activityTitle}
        actions={
          <>
            {/* Push grades to Google Classroom — only when this assignment was
                attached to one or more Classroom coursework items via the add-on.
                The admin-managed `google-classroom` gate hides it for users
                below the doc's minTier. */}
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
            {/* Push grades to Schoology — only when this assignment was launched
                from a Schoology resource link (server sets `ltiAttachment` on the
                first student launch). */}
            {showSchoologyPush && (
              <ActionButton
                variant="primary"
                label="Push to Schoology"
                icon={Send}
                loading={pushingSchoology}
                onClick={() => void handlePushSchoologyGrades()}
                disabled={pushingSchoology || completed === 0}
              />
            )}
            {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}
          </>
        }
      />

      {exportError && (
        <div
          className="flex items-center bg-amber-50 border-b border-amber-200 text-amber-700"
          style={{
            padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
          }}
        >
          <AlertTriangle
            className="shrink-0"
            style={{
              width: 'min(14px, 4cqmin)',
              height: 'min(14px, 4cqmin)',
            }}
          />
          {exportError}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex border-b border-slate-200"
        style={{ padding: 'min(8px, 2cqmin) min(16px, 4cqmin)' }}
      >
        <SegmentedTabs
          ariaLabel="Video activity results sections"
          panelIdPrefix={tabPanelId}
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'overview', label: 'Overview', icon: BarChart3 },
            { key: 'questions', label: 'Questions', icon: Clock },
            {
              key: 'students',
              label: 'Students',
              icon: Users,
              count: responses.length,
            },
            // PLC tab intentionally hidden for Video Activity until the
            // VA-side auto-publish path lands. The Quiz path writes its
            // contributions to `/plcs/{plcId}/contributions/`; if we
            // rendered PlcTab here it would aggregate quiz responses
            // under VA question labels (cross-contamination). Re-enable
            // alongside the VA `publishPlcContribution` wiring.
          ]}
        />
      </div>

      {/* Tab content */}
      <div
        role="tabpanel"
        id={`${tabPanelId}-panel-${activeTab}`}
        aria-labelledby={`${tabPanelId}-tab-${activeTab}`}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(14px, 3.5cqmin)' }}
      >
        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                tone="blue"
                icon={
                  <Users
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                  />
                }
                value={totalStudents}
                label="Students"
              />
              <StatTile
                tone="green"
                icon={
                  <CheckCircle2
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                  />
                }
                value={completed}
                label="Completed"
              />
              <StatTile
                tone="violet"
                icon={
                  <BarChart3
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                  />
                }
                value={avgScore === null ? '—' : `${avgScore}%`}
                label="Avg Score"
              />
            </div>

            {totalStudents === 0 && (
              <ScaledEmptyState
                icon={Users}
                title="No students yet"
                subtitle="No students have joined this session yet."
              />
            )}
          </div>
        )}

        {/* Questions tab */}
        {activeTab === 'questions' &&
          (questions.length === 0 ? (
            <ScaledEmptyState
              icon={Clock}
              title="No questions"
              subtitle="This activity has no questions."
            />
          ) : (
            <div className="bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm overflow-hidden">
              {questions.map((q, idx) => {
                const accuracy = getQuestionAccuracy(q.id);
                const colors = scoreColorClasses(accuracy);
                return (
                  <SessionRow
                    key={q.id}
                    trailing={
                      <div className="shrink-0 text-right">
                        <p
                          className={`font-black tabular-nums ${colors.text}`}
                          style={{ fontSize: 'min(16px, 5cqmin)' }}
                        >
                          {accuracy}%
                        </p>
                        <p
                          className="text-slate-400"
                          style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                        >
                          accuracy
                        </p>
                      </div>
                    }
                  >
                    <div
                      className="flex items-center"
                      style={{
                        gap: 'min(6px, 1.5cqmin)',
                        marginBottom: 'min(4px, 1cqmin)',
                      }}
                    >
                      <SessionBadge
                        tone="info"
                        label={formatTimestamp(q.timestamp)}
                      />
                      <p
                        className="text-slate-700 font-medium truncate"
                        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                      >
                        {idx + 1}. {q.text}
                      </p>
                    </div>

                    {/* Accuracy bar */}
                    <div
                      className="bg-slate-100 rounded-full overflow-hidden"
                      style={{
                        height: 'min(6px, 1.5cqmin)',
                        marginTop: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>
                  </SessionRow>
                );
              })}
            </div>
          ))}

        {/* Students tab */}
        {activeTab === 'students' &&
          (responses.length === 0 ? (
            <ScaledEmptyState
              icon={Users}
              title="No students yet"
              subtitle="No students have joined this session yet."
            />
          ) : (
            <div className="bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm overflow-hidden">
              {responses
                .slice()
                .sort((a, b) => {
                  // Unscorable responses (answer key not loaded) sink to the
                  // bottom instead of intermixing with genuine 0% students.
                  const sa = canScoreVideoActivityResponse(questions, a.answers)
                    ? getStudentScore(a)
                    : -1;
                  const sb = canScoreVideoActivityResponse(questions, b.answers)
                    ? getStudentScore(b)
                    : -1;
                  return sb - sa;
                })
                .map((r) => {
                  const score = getStudentScore(r);
                  // When the question set hasn't loaded (or the response's
                  // answers map to no loaded question), the score is a phantom
                  // 0 rather than a real result — show a neutral "—" instead of
                  // "0%". See `canScoreVideoActivityResponse`.
                  const scoreable = canScoreVideoActivityResponse(
                    questions,
                    r.answers
                  );
                  const correct = r.answers.filter((a) =>
                    isAnswerCorrect(a.questionId, a.answer)
                  ).length;
                  return (
                    <SessionRow
                      key={r._responseKey ?? r.studentUid ?? r.pin}
                      trailing={
                        <>
                          <div
                            className="flex items-center shrink-0"
                            style={{ gap: 'min(6px, 1.5cqmin)' }}
                          >
                            {/* Iterate in canonical question order (not
                                submission order) so the icon strip matches the
                                Live Monitor for self-paced revisits. */}
                            {questions
                              .map((q) =>
                                r.answers.find((a) => a.questionId === q.id)
                              )
                              .filter(
                                (a): a is (typeof r.answers)[number] =>
                                  a !== undefined
                              )
                              .map((a) =>
                                isAnswerCorrect(a.questionId, a.answer) ? (
                                  <CheckCircle2
                                    key={a.questionId}
                                    className="text-emerald-500"
                                    style={{
                                      width: 'min(14px, 3.5cqmin)',
                                      height: 'min(14px, 3.5cqmin)',
                                    }}
                                  />
                                ) : (
                                  <XCircle
                                    key={a.questionId}
                                    className="text-brand-red-primary"
                                    style={{
                                      width: 'min(14px, 3.5cqmin)',
                                      height: 'min(14px, 3.5cqmin)',
                                    }}
                                  />
                                )
                              )}
                          </div>
                          {scoreable ? (
                            <ScorePill score={score} display="percent" />
                          ) : (
                            <span
                              className="font-black tabular-nums shrink-0 text-slate-400"
                              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                            >
                              —
                            </span>
                          )}
                        </>
                      }
                    >
                      <p
                        className="font-bold text-slate-800 truncate"
                        style={{ fontSize: 'min(13px, 4cqmin)' }}
                      >
                        {/* `formatStudentName` returns '' on roster miss and legacy rows may carry '' for `r.name`; pick the first non-empty string so the falsy-fallthrough intent is explicit (no `||` chain that ESLint would flag). */}
                        {[
                          formatStudentName(byStudentUid.get(r.studentUid)),
                          r.name,
                          r.pin,
                        ].find((s) => typeof s === 'string' && s.length > 0)}
                      </p>
                      <div
                        className="flex items-center"
                        style={{
                          gap: 'min(6px, 1.5cqmin)',
                          marginTop: 'min(3px, 0.8cqmin)',
                        }}
                      >
                        <SessionBadge
                          tone={r.completedAt ? 'success' : 'warn'}
                          label={r.completedAt ? 'Completed' : 'In progress'}
                        />
                        <span
                          className="text-slate-400"
                          style={{ fontSize: 'min(10px, 3cqmin)' }}
                        >
                          {correct}/{questions.length} correct
                        </span>
                      </div>
                    </SessionRow>
                  );
                })}
            </div>
          ))}

        {/* PLC tab intentionally not rendered for Video Activity — see
            tab-strip comment above for the cross-contamination reason. */}
      </div>
    </div>
  );
};
