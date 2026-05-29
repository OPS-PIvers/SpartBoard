/**
 * Google Classroom Add-on teacher discovery (Attachment Setup) route.
 *
 * Route: /classroom-addon/teacher  (the add-on's Attachment Setup URI).
 * Classroom opens this iframe when a teacher picks SpartBoard from the
 * assignment "Add-ons" menu, passing courseId/itemId/itemType + an `addOnToken`
 * (+ login_hint).
 *
 * Flow (the real "attach an activity" pipe):
 *   1. Teacher signs into SpartBoard (Google) — gives a Firebase uid + a Drive
 *      access token so we can list/load their quiz / video-activity library.
 *   2. Teacher picks either a Quiz or a Video Activity from their library.
 *   3. We load the content and create a Classroom-targeted assignment
 *      (`classIds: [<linked sourcedId> | "classroom:<courseId>"]`):
 *        - Quiz → a persistent join `code` the student takes the quiz with.
 *        - Video Activity → a `sessionId` (VA has no join code); the student
 *          joins by sessionId.
 *      Both run async / self-paced (no live teacher session).
 *   4. A short GIS popup grants `classroom.addons.teacher`; the
 *      `createClassroomAttachment` CF validates the teacher launch via
 *      `getAddOnContext` and creates the attachment. The callable builds the
 *      studentViewUri from the params we pass:
 *        - Quiz → `/classroom-addon/student?code=<code>`
 *        - VA   → `/classroom-addon/student?kind=va&sessionId=<sessionId>`
 */
import React, { useCallback, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { usePlcs } from '@/hooks/usePlcs';
import type {
  PlcLinkage,
  VideoActivitySessionOptions,
  VideoActivitySessionSettings,
} from '@/types';
import { getQuizBehavior, formatBehaviorSummary } from '@/utils/quizBehavior';
import {
  getVideoActivityBehavior,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';
import { buildPlcLinkage } from '@/utils/plcLinkage';
import { ensureGis, requestAccessToken } from './gisOAuth';

// The teacher/discovery iframe creates attachments → needs the teacher scope.
// (The SpartBoard sign-in above grants Drive separately, via AuthContext.)
const ADDON_TEACHER_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
].join(' ');

// Conservative PLAYER defaults for an async Classroom attachment — mirrors the
// VA widget's own `defaultSessionSettings` (require a correct answer, no
// skipping, no autoplay). This covers ONLY the player-behavior surface
// (`sessionSettings`); the assignment-policy knobs (`sessionOptions`,
// `attemptLimit`) are sourced from the activity's own configured behavior via
// `getVideoActivityBehavior` at attach time, mirroring the normal VA flow. The
// add-on route has no widget config to read a per-teacher player default from,
// so this constant stands in for it.
const VA_SESSION_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: true,
  allowSkipping: false,
};

/**
 * Parse a `<input type="datetime-local">` value into an epoch-ms due date.
 * Returns `undefined` for an empty / unparseable value so callers can omit
 * `dueAt` entirely (absent = no due date) rather than persisting `NaN`.
 */
function parseDueAt(local: string): number | undefined {
  if (!local) return undefined;
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

interface CreateAttachmentResult {
  attachmentId: string;
}

// Params the callable accepts. `quizCode` (quiz) and `sessionId`+`kind:'va'`
// (video activity) are mutually exclusive per the pinned contract; the callable
// builds the right studentViewUri from whichever set we pass.
interface CreateAttachmentParams {
  accessToken: string;
  courseId: string;
  itemId: string;
  itemType: string;
  addOnToken: string;
  origin: string;
  title: string;
  quizCode?: string;
  sessionId?: string;
  kind?: 'quiz' | 'va';
  /**
   * The grade scale for this attachment = the quiz's total points. Pushed
   * student grades are capped to this so Classroom shows the same number/
   * denominator as the SpartBoard quiz (e.g. 17/20). Quiz path only; the
   * callable defaults to 100 when omitted (video-activity path).
   */
  maxPoints?: number;
}

type ContentKind = 'quiz' | 'va';

/**
 * Targeting derived for a Classroom attachment. `classIds` carries the identity-
 * bridge sourcedId (linked) or `classroom:<courseId>` (unlinked fallback) — this
 * is what gates student responses and is NEVER changed by this resolver. The
 * roster fields (`rosterIds`/`periodNames`/`classPeriodByClassId`) are what the
 * teacher monitor reads to show the assignment's targeted class; they're only
 * populated when the course is linked to a real SpartBoard roster.
 */
interface ResolvedTargeting {
  classIds: string[];
  rosterIds: string[];
  periodNames: string[];
  classPeriodByClassId: Record<string, string>;
}

export const ClassroomAddonTeacherSpike: React.FC = () => {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const loginHint = params.get('login_hint') ?? undefined;
  const courseId = params.get('courseId') ?? '';
  const itemId = params.get('itemId') ?? '';
  const itemType = params.get('itemType') ?? 'courseWork';
  const addOnToken = params.get('addOnToken') ?? '';
  // Present when Classroom re-opens this route as the teacher VIEW of an
  // already-created attachment (no addOnToken in that iframe).
  const existingAttachmentId = params.get('attachmentId') ?? '';

  const { user, signInWithGoogle, googleAccessToken } = useAuth();
  const { quizzes, loadQuizData, loading: quizzesLoading } = useQuiz(user?.uid);
  const { createAssignment } = useQuizAssignments(user?.uid);
  const {
    activities,
    loadActivityData,
    loading: activitiesLoading,
  } = useVideoActivity(user?.uid);
  const { createAssignment: createVideoActivityAssignment } =
    useVideoActivityAssignments(user?.uid);
  // PLC list for the quiz "Share with PLC" picker. usePlcs() reads `useAuth`
  // (mounted on this route) — no DashboardProvider required.
  const { plcs } = usePlcs();

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ContentKind>('quiz');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [attachmentId, setAttachmentId] = useState('');

  // ── Per-assignment settings (parity with the normal SpartBoard assign flow).
  // All optional — a teacher can attach with no due date / no PLC. Class
  // targeting is NOT here; it's auto-derived from the Classroom course link.
  // `dueAtLocal` is the raw <input type="datetime-local"> value; parsed to
  // epoch-ms only at attach time.
  const [dueAtLocal, setDueAtLocal] = useState('');
  // Default the teacher name from the signed-in profile (used for PLC sheet
  // attribution). Falls back to the email local-part, then empty.
  const defaultTeacherName =
    user?.displayName ?? user?.email?.split('@')[0] ?? '';
  const [teacherName, setTeacherName] = useState('');
  // Quiz-only: opt into exporting results to a shared PLC sheet.
  const [plcShareEnabled, setPlcShareEnabled] = useState(false);
  const [selectedPlcId, setSelectedPlcId] = useState('');

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );
  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId),
    [activities, selectedActivityId]
  );

  // Read-only summary of the configured behavior the attachment will inherit —
  // surfaces the parity (the quiz/VA's own session mode, attempts, etc.) so the
  // teacher can see what students will get before attaching.
  const behaviorSummary = useMemo(() => {
    if (kind === 'quiz') {
      return selectedQuiz
        ? formatBehaviorSummary(getQuizBehavior(selectedQuiz))
        : null;
    }
    return selectedActivity
      ? formatVideoActivityBehaviorSummary(
          getVideoActivityBehavior(selectedActivity)
        )
      : null;
  }, [kind, selectedQuiz, selectedActivity]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      append('Signing in to SpartBoard…');
      await signInWithGoogle();
      append('Signed in. Pick something to attach.');
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, signInWithGoogle]);

  // Resolve the assignment's targeting. If this Google course is linked to a
  // ClassLink class, use that real sourcedId so the assignment's classIds
  // MATCH the token classroomAddonLoginV1 mints for the student (which is also
  // the linked sourcedId) — that's what lets the class-gate authorize their
  // responses AND lets the monitor resolve real names. We ALSO surface the
  // linked roster's id + name as rosterIds/periodNames so the teacher monitor
  // shows the targeted class (it reads periodNames, not classIds). If unlinked,
  // classIds falls back to "classroom:<courseId>" (works, but nameless) and the
  // roster fields stay empty — an unlinked course has no SpartBoard roster.
  // Shared by both the quiz and video-activity attach paths.
  const resolveClassTargeting =
    useCallback(async (): Promise<ResolvedTargeting> => {
      const targeting: ResolvedTargeting = {
        classIds: [`classroom:${courseId}`],
        rosterIds: [],
        periodNames: [],
        classPeriodByClassId: {},
      };
      try {
        const linkSnap = await getDoc(
          doc(db, 'classroom_course_links', courseId)
        );
        const linkData = linkSnap.exists() ? linkSnap.data() : undefined;
        const linkedClassId = linkData?.classlinkClassId as string | undefined;
        const linkedRosterId = linkData?.rosterId as string | undefined;
        if (linkedClassId) {
          targeting.classIds = [linkedClassId];
          append(`Course is linked to ClassLink class ${linkedClassId}.`);

          // Surface the linked roster so the monitor can label the targeted
          // class. Best-effort: a missing roster doc/name must not break attach —
          // fall back to a sensible default rather than throwing.
          if (linkedRosterId && user?.uid) {
            let rosterName = 'Google Classroom';
            try {
              const rosterSnap = await getDoc(
                doc(db, 'users', user.uid, 'rosters', linkedRosterId)
              );
              const name = rosterSnap.exists()
                ? (rosterSnap.data().name as string | undefined)
                : undefined;
              if (name && name.length > 0) {
                rosterName = name;
              }
            } catch {
              // Keep the default rosterName; targeting is still valid.
            }
            targeting.rosterIds = [linkedRosterId];
            targeting.periodNames = [rosterName];
            targeting.classPeriodByClassId = { [linkedClassId]: rosterName };
          }
        } else {
          append(
            'Course not linked to a ClassLink class — students will be ' +
              'anonymous in the monitor. Link it from your roster to show names.'
          );
        }
      } catch {
        // Fall back to the courseId-scoped classId with no roster targeting.
      }
      return targeting;
    }, [append, courseId, user?.uid]);

  // Mint the addons.teacher access token + create the Classroom attachment.
  // `contentParams` carries the quiz-vs-VA discriminator (quizCode vs
  // sessionId+kind) per the pinned createClassroomAttachment contract.
  const createAttachment = useCallback(
    async (
      title: string,
      contentParams:
        | { quizCode: string; kind: 'quiz'; maxPoints: number }
        | { sessionId: string; kind: 'va' }
    ): Promise<string> => {
      // The addons.teacher grant is what getAddOnContext validates the teacher
      // launch against — a separate, minimal grant from the SpartBoard Drive
      // sign-in above.
      append('Granting Classroom add-on permission…');
      await ensureGis();
      const accessToken = await requestAccessToken(
        ADDON_TEACHER_SCOPES,
        loginHint
      );

      append('Creating the Classroom attachment…');
      const callable = httpsCallable<
        CreateAttachmentParams,
        CreateAttachmentResult
      >(functions, 'createClassroomAttachment');
      const { data } = await callable({
        accessToken,
        courseId,
        itemId,
        itemType,
        addOnToken,
        origin: window.location.origin,
        title,
        ...contentParams,
      });
      setAttachmentId(data.attachmentId);
      return data.attachmentId;
    },
    [append, courseId, itemId, itemType, addOnToken, loginHint]
  );

  const attachQuiz = useCallback(async () => {
    if (!selectedQuiz) {
      append('Pick a quiz first.');
      return;
    }
    if (!googleAccessToken) {
      append('No Google Drive token — sign in to SpartBoard again.');
      return;
    }

    append(`Loading "${selectedQuiz.title}"…`);
    const quizData = await loadQuizData(selectedQuiz.driveFileId);

    // The Classroom grade scale = the quiz's total points, so a 17/20 quiz
    // reads as 17/20 in Classroom (not a percentage out of 100). Fall back to
    // 100 only when the quiz has no questions/points to sum.
    const quizMaxPoints =
      quizData.questions.reduce((s, q) => s + (q.points ?? 1), 0) || 100;

    const targeting = await resolveClassTargeting();

    // Respect the quiz's OWN configured behavior (session mode, per-attempt
    // options, attempt limit) exactly as the normal SpartBoard assign flow
    // does — no longer hardcoded to a bare self-paced session. Note: even when
    // the quiz is configured teacher-paced, a Classroom attachment has no live
    // teacher session, so the runner self-paces regardless; we still carry the
    // configured options/attemptLimit so per-attempt behavior matches.
    const { sessionMode, sessionOptions, attemptLimit } =
      getQuizBehavior(selectedQuiz);

    const dueAt = parseDueAt(dueAtLocal);
    const effectiveTeacherName = teacherName.trim() || defaultTeacherName;

    // Build the PLC linkage when the teacher opted into "Share with PLC" and
    // picked a PLC — same shared builder the normal flow uses, so the linkage
    // shape (auto-created sheet + name + member snapshot) is identical. A
    // failed sheet auto-create falls through to no linkage and is logged.
    let plcLinkage: PlcLinkage | undefined;
    if (plcShareEnabled && !selectedPlcId) {
      append(
        'PLC sharing was on but no PLC was picked — attaching without it.'
      );
    }
    // Cache the selected PLC up front. `plcs` can repopulate on a cold load
    // (usePlcs streams in after first render), so a picked-then-vanished id
    // must not silently attach with an undefined `plc`.
    const selectedPlc = plcs.find((p) => p.id === selectedPlcId);
    if (plcShareEnabled && selectedPlcId && !selectedPlc) {
      append(
        'Selected PLC is no longer available — attaching without PLC sharing.'
      );
    }
    if (plcShareEnabled && selectedPlcId && selectedPlc && user) {
      append('Setting up the shared PLC results sheet…');
      const { linkage, error: plcSheetError } = await buildPlcLinkage({
        plc: selectedPlc,
        quizTitle: selectedQuiz.title,
        selfUid: user.uid,
        googleAccessToken,
      });
      plcLinkage = linkage;
      if (plcSheetError) {
        append(
          `Note: couldn't create the shared PLC sheet (${plcSheetError.message}). ` +
            'Attaching without PLC sharing.'
        );
      } else if (linkage) {
        append(`Results will export to the "${linkage.name}" PLC sheet.`);
      }
    }

    // `sessionMode` + `sessionOptions` + `attemptLimit` now come from the
    // quiz's configured behavior. `periodNames` rides on the settings object
    // (that's where the quiz hook reads it from for both the assignment +
    // session docs); `rosterIds`/`classPeriodByClassId` ride on the options
    // bag. Both are only set when the course is linked to a roster.
    append('Creating a class-targeted assignment…');
    const { id: sessionId, code } = await createAssignment(
      {
        id: selectedQuiz.id,
        title: selectedQuiz.title,
        driveFileId: selectedQuiz.driveFileId,
        questions: quizData.questions,
      },
      {
        className: 'Google Classroom',
        sessionMode,
        sessionOptions,
        attemptLimit,
        ...(dueAt !== undefined ? { dueAt } : {}),
        ...(effectiveTeacherName ? { teacherName: effectiveTeacherName } : {}),
        ...(plcLinkage ? { plc: plcLinkage } : {}),
        ...(targeting.periodNames.length > 0
          ? { periodNames: targeting.periodNames }
          : {}),
      },
      {
        classIds: targeting.classIds,
        initialStatus: 'active',
        ...(targeting.rosterIds.length > 0
          ? { rosterIds: targeting.rosterIds }
          : {}),
        ...(Object.keys(targeting.classPeriodByClassId).length > 0
          ? { classPeriodByClassId: targeting.classPeriodByClassId }
          : {}),
      }
    );
    append(`Assignment created (join code ${code}).`);

    // Pass the quiz total so the Classroom attachment's maxPoints matches the
    // quiz exactly — the grade scale pushed grades are later capped to.
    const attachmentId = await createAttachment(
      `SpartBoard: ${selectedQuiz.title}`,
      {
        quizCode: code,
        kind: 'quiz',
        maxPoints: quizMaxPoints,
      }
    );
    append(
      `Attached "${selectedQuiz.title}". Students can now open it and take ` +
        'the quiz inside Classroom.'
    );

    // Persist the attachment linkage onto both the teacher's assignment doc
    // and the session doc so the Results monitor can offer "Push grades to
    // Google Classroom". Best-effort: a failure here must NOT break the
    // already-completed attach flow — the activity is attached regardless.
    if (user?.uid) {
      const classroomAttachment = {
        attachmentId,
        courseId,
        itemId,
        maxPoints: quizMaxPoints,
        attachedAt: Date.now(),
      };
      try {
        await updateDoc(
          doc(db, 'users', user.uid, 'quiz_assignments', sessionId),
          { classroomAttachment, updatedAt: Date.now() }
        );
        await updateDoc(doc(db, 'quiz_sessions', sessionId), {
          classroomAttachment,
        });
      } catch (persistErr) {
        append(
          `Note: couldn't link this attachment for grade push (${
            persistErr instanceof Error
              ? persistErr.message
              : String(persistErr)
          }). The activity is still attached.`
        );
      }
    }
  }, [
    append,
    selectedQuiz,
    googleAccessToken,
    loadQuizData,
    resolveClassTargeting,
    createAssignment,
    createAttachment,
    user,
    courseId,
    itemId,
    dueAtLocal,
    teacherName,
    defaultTeacherName,
    plcShareEnabled,
    selectedPlcId,
    plcs,
  ]);

  const attachVideoActivity = useCallback(async () => {
    if (!selectedActivity) {
      append('Pick a video activity first.');
      return;
    }
    if (!googleAccessToken) {
      append('No Google Drive token — sign in to SpartBoard again.');
      return;
    }

    append(`Loading "${selectedActivity.title}"…`);
    const activityData = await loadActivityData(selectedActivity.driveFileId);

    const targeting = await resolveClassTargeting();

    // Respect the activity's OWN configured behavior, mirroring the normal VA
    // assign flow: `sessionOptions` + `attemptLimit` come from the activity's
    // behavior, and the optional due date is folded into `sessionOptions.dueAt`
    // (that's where the VA runner reads it). `sessionSettings` (player
    // behavior) has no home on `behavior`, so it stays the conservative
    // VA_SESSION_SETTINGS default the route already used. VA supports PLC
    // sharing exactly like the quiz path — the sheet creator (`buildPlcLinkage`)
    // is widget-agnostic — so we build the same linkage and pass it on settings.
    const behavior = getVideoActivityBehavior(selectedActivity);
    const dueAt = parseDueAt(dueAtLocal);
    const effectiveTeacherName = teacherName.trim() || defaultTeacherName;
    const sessionOptions: VideoActivitySessionOptions = {
      ...behavior.sessionOptions,
      attemptLimit: behavior.attemptLimit,
      ...(dueAt !== undefined ? { dueAt } : {}),
    };

    // Build the PLC linkage when the teacher opted into "Share with PLC" and
    // picked a PLC — same shared builder the quiz path uses, so the linkage
    // shape (auto-created sheet + name + member snapshot) is identical. A
    // failed sheet auto-create falls through to no linkage and is logged.
    let plcLinkage: PlcLinkage | undefined;
    if (plcShareEnabled && !selectedPlcId) {
      append(
        'PLC sharing was on but no PLC was picked — attaching without it.'
      );
    }
    // Cache the selected PLC up front. `plcs` can repopulate on a cold load
    // (usePlcs streams in after first render), so a picked-then-vanished id
    // must not silently attach with an undefined `plc`.
    const selectedPlc = plcs.find((p) => p.id === selectedPlcId);
    if (plcShareEnabled && selectedPlcId && !selectedPlc) {
      append(
        'Selected PLC is no longer available — attaching without PLC sharing.'
      );
    }
    if (plcShareEnabled && selectedPlcId && selectedPlc && user) {
      append('Setting up the shared PLC results sheet…');
      const { linkage, error: plcSheetError } = await buildPlcLinkage({
        plc: selectedPlc,
        // `quizTitle` only names the auto-created sheet — the builder is
        // widget-agnostic, so a VA title is fine here.
        quizTitle: selectedActivity.title,
        selfUid: user.uid,
        googleAccessToken,
      });
      plcLinkage = linkage;
      if (plcSheetError) {
        append(
          `Note: couldn't create the shared PLC sheet (${plcSheetError.message}). ` +
            'Attaching without PLC sharing.'
        );
      } else if (linkage) {
        append(`Results will export to the "${linkage.name}" PLC sheet.`);
      }
    }

    // VA has no join code — the assignment is identified by its sessionId
    // (== assignment id). `createAssignment`'s args are POSITIONAL:
    // (activity, settings, initialStatus?, classIds?, periodNames?, rosterIds?, mode?).
    // `periodNames` ALSO rides on the settings object (1st positional after the
    // activity): the hook writes the assignment doc's `periodNames` from
    // `settings.periodNames`, while the positional 5th arg only reaches the
    // SESSION doc — so without it on settings the VA manager's class label is
    // empty. periodNames/rosterIds are empty arrays when the course is unlinked,
    // which the hook treats the same as the previous (undefined) behavior.
    append('Creating a class-targeted video-activity assignment…');
    const { id: sessionId } = await createVideoActivityAssignment(
      {
        id: selectedActivity.id,
        title: selectedActivity.title,
        driveFileId: selectedActivity.driveFileId,
        youtubeUrl: activityData.youtubeUrl,
        questions: activityData.questions,
      },
      {
        className: 'Google Classroom',
        sessionSettings: VA_SESSION_SETTINGS,
        sessionOptions,
        ...(effectiveTeacherName ? { teacherName: effectiveTeacherName } : {}),
        ...(plcLinkage ? { plc: plcLinkage } : {}),
        ...(targeting.periodNames.length > 0
          ? { periodNames: targeting.periodNames }
          : {}),
      },
      'active',
      targeting.classIds,
      targeting.periodNames,
      targeting.rosterIds
    );
    append(`Video-activity session created (sessionId ${sessionId}).`);

    await createAttachment(`SpartBoard: ${selectedActivity.title}`, {
      sessionId,
      kind: 'va',
    });
    append(
      `Attached "${selectedActivity.title}". Students can now open it and ` +
        'complete the video activity inside Classroom.'
    );
  }, [
    append,
    selectedActivity,
    googleAccessToken,
    loadActivityData,
    resolveClassTargeting,
    createVideoActivityAssignment,
    createAttachment,
    user,
    dueAtLocal,
    teacherName,
    defaultTeacherName,
    plcShareEnabled,
    selectedPlcId,
    plcs,
  ]);

  const runAttach = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId || !itemId) {
        append('Missing courseId/itemId in the URL.');
        return;
      }
      if (!addOnToken) {
        append(
          'Missing addOnToken — this route must be opened as the Attachment ' +
            'Setup URI (discovery), not the teacher view.'
        );
        return;
      }
      if (kind === 'quiz') {
        await attachQuiz();
      } else {
        await attachVideoActivity();
      }
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [
    append,
    courseId,
    itemId,
    addOnToken,
    kind,
    attachQuiz,
    attachVideoActivity,
  ]);

  const tabBtn = (value: ContentKind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      disabled={busy}
      aria-pressed={kind === value}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
        kind === value
          ? 'bg-blue-500 text-white'
          : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );

  const canAttach = kind === 'quiz' ? !!selectedQuizId : !!selectedActivityId;

  return (
    <div className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">Attach a SpartBoard activity</h1>
          <p className="text-sm text-slate-400">
            Pick a quiz or video activity from your library to attach to this
            Classroom assignment. Students complete it inside Classroom.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-y-1">
            <span className="text-slate-400">courseId</span>
            <span className="break-all font-mono">
              {courseId === '' ? '(missing)' : courseId}
            </span>
            <span className="text-slate-400">itemId</span>
            <span className="break-all font-mono">
              {itemId === '' ? '(missing)' : itemId}
            </span>
            <span className="text-slate-400">itemType</span>
            <span className="font-mono">{itemType}</span>
            <span className="text-slate-400">addOnToken</span>
            <span className="break-all font-mono">
              {addOnToken === '' ? '(none — teacher view?)' : '(present)'}
            </span>
          </div>
        </div>

        {existingAttachmentId ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            This is the teacher view of an existing attachment (
            <span className="font-mono">{existingAttachmentId}</span>). Students
            open it to complete the attached activity.
          </div>
        ) : !user ? (
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={busy}
            className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Sign in to SpartBoard'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {tabBtn('quiz', 'Quiz')}
              {tabBtn('va', 'Video Activity')}
            </div>

            {kind === 'quiz' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Quiz</span>
                <select
                  value={selectedQuizId}
                  onChange={(e) => setSelectedQuizId(e.target.value)}
                  disabled={busy || quizzesLoading}
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                >
                  <option value="">
                    {quizzesLoading
                      ? 'Loading your quizzes…'
                      : quizzes.length === 0
                        ? 'No quizzes in your library yet'
                        : 'Select a quiz…'}
                  </option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Video Activity
                </span>
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  disabled={busy || activitiesLoading}
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                >
                  <option value="">
                    {activitiesLoading
                      ? 'Loading your video activities…'
                      : activities.length === 0
                        ? 'No video activities in your library yet'
                        : 'Select a video activity…'}
                  </option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Per-assignment settings — parity with the normal SpartBoard
                assign flow. Shown only once something is selected; all fields
                are optional. Class targeting is auto-derived from the
                Classroom course link, so there's no class/roster picker here. */}
            {canAttach && (
              <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold text-slate-200">
                  Assignment settings
                </h2>

                {behaviorSummary && (
                  <p className="text-xs text-slate-400">
                    Inherits this {kind === 'quiz' ? 'quiz' : 'activity'}
                    &rsquo;s settings:{' '}
                    <span className="font-medium text-slate-300">
                      {behaviorSummary}
                    </span>
                  </p>
                )}

                <label className="block text-sm">
                  <span className="mb-1 block text-slate-400">
                    Due date <span className="text-slate-500">(optional)</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={dueAtLocal}
                    onChange={(e) => setDueAtLocal(e.target.value)}
                    disabled={busy}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white disabled:opacity-50 [color-scheme:dark]"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-slate-400">
                    Your name{' '}
                    <span className="text-slate-500">
                      (optional — shown on shared PLC results)
                    </span>
                  </span>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder={defaultTeacherName || 'Teacher name'}
                    disabled={busy}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 disabled:opacity-50"
                  />
                </label>

                {/* PLC sharing applies to BOTH quizzes and video activities —
                    `buildPlcLinkage` is widget-agnostic, so the same control
                    drives the quiz and VA attach paths. */}
                {plcs.length > 0 && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={plcShareEnabled}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setPlcShareEnabled(on);
                          // Preselect the sole PLC so a one-PLC teacher doesn't
                          // have to also pick from a single-item list.
                          if (on && !selectedPlcId && plcs.length === 1) {
                            setSelectedPlcId(plcs[0].id);
                          }
                        }}
                        disabled={busy}
                        className="h-4 w-4 accent-blue-500"
                      />
                      Share results with a PLC
                    </label>
                    {plcShareEnabled && (
                      <select
                        value={selectedPlcId}
                        onChange={(e) => setSelectedPlcId(e.target.value)}
                        disabled={busy}
                        aria-label="PLC to share results with"
                        className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white disabled:opacity-50"
                      >
                        <option value="">Select a PLC…</option>
                        {plcs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void runAttach()}
              disabled={busy || !canAttach}
              className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {busy
                ? 'Working…'
                : kind === 'quiz'
                  ? 'Attach quiz'
                  : 'Attach video activity'}
            </button>
          </div>
        )}

        {attachmentId && (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            <h2 className="mb-1 font-semibold">Attached ✓</h2>
            <p className="break-all font-mono">{attachmentId}</p>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <h2 className="mb-2 text-sm font-semibold">Log</h2>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-300">
            {log.length ? log.join('\n') : '(no output yet)'}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ClassroomAddonTeacherSpike;
