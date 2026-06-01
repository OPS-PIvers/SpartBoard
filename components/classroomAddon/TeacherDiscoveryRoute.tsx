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
import { logError } from '@/utils/logError';
import { ensureGis, requestAccessToken } from './gisOAuth';
import {
  ClipboardList,
  Video,
  Paperclip,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import {
  AddonShell,
  AddonHeader,
  AddonCard,
  AddonButton,
  AddonStatus,
  AddonError,
  AddonSelect,
} from './AddonShell';

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

  // User-facing progress line (the latest step) + a sticky error banner. These
  // replace the spike's always-visible scrolling log; no raw diagnostics are
  // ever shown to teachers.
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ContentKind>('quiz');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [attachmentId, setAttachmentId] = useState('');

  // ── Per-assignment settings (parity with the normal SpartBoard assign flow).
  // All optional — a teacher can attach with no PLC. Class targeting is NOT
  // here; it's auto-derived from the Classroom course link. The due date is
  // intentionally NOT collected here: an add-on cannot set the parent
  // assignment's due date (Google restricts courseWork.patch to the project
  // that created the coursework), so the teacher sets it once in Classroom's
  // own composer — the same screen this iframe is embedded in.
  // Default the teacher name from the signed-in profile (used for PLC sheet
  // attribution). Falls back to the email local-part, then empty.
  const defaultTeacherName =
    user?.displayName ?? user?.email?.split('@')[0] ?? '';
  const [teacherName, setTeacherName] = useState('');
  // Quiz-only: opt into exporting results to a shared PLC sheet.
  const [plcShareEnabled, setPlcShareEnabled] = useState(false);
  const [selectedPlcId, setSelectedPlcId] = useState('');

  // Records the current step as the user-facing status message.
  const append = useCallback((line: string) => {
    setStatusMsg(line);
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
    setErrorMsg(null);
    try {
      append('Signing in to SpartBoard…');
      await signInWithGoogle();
      append('Signed in. Pick something to attach.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      append(`ERROR: ${message}`);
      setErrorMsg(`Couldn't sign in: ${message}`);
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
        | { sessionId: string; kind: 'va'; maxPoints: number }
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

  // Build the PLC linkage when the teacher opted into "Share with PLC" and
  // picked a PLC — same shared builder the normal flow uses, so the linkage
  // shape (auto-created sheet + name + member snapshot) is identical. A failed
  // sheet auto-create falls through to no linkage and is logged. Shared by both
  // the quiz and video-activity attach paths; `sheetTitle` only names the
  // auto-created sheet (the builder is widget-agnostic), so either a quiz or a
  // VA title is fine.
  const resolvePlcLinkageForAttach = useCallback(
    async (sheetTitle: string): Promise<PlcLinkage | undefined> => {
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
          quizTitle: sheetTitle,
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
      return plcLinkage;
    },
    [plcShareEnabled, selectedPlcId, plcs, user, googleAccessToken, append]
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

    const effectiveTeacherName = teacherName.trim() || defaultTeacherName;

    // Build the PLC linkage when the teacher opted into "Share with PLC" and
    // picked a PLC — same shared builder the normal flow uses, so the linkage
    // shape (auto-created sheet + name + member snapshot) is identical. A
    // failed sheet auto-create falls through to no linkage and is logged.
    const plcLinkage = await resolvePlcLinkageForAttach(selectedQuiz.title);

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
        // Session doc is load-bearing: the Results monitor reads
        // `session.classroomAttachment` (NOT the assignment doc) to show
        // "Push grades". Write it FIRST so a partial failure where the
        // second (archive) write fails still leaves the push button working.
        await updateDoc(doc(db, 'quiz_sessions', sessionId), {
          classroomAttachment,
        });
        await updateDoc(
          doc(db, 'users', user.uid, 'quiz_assignments', sessionId),
          { classroomAttachment, updatedAt: Date.now() }
        );
      } catch (persistErr) {
        logError(
          'TeacherDiscoveryRoute.persistClassroomAttachment',
          persistErr,
          { sessionId, kind }
        );
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
    resolvePlcLinkageForAttach,
    user,
    courseId,
    itemId,
    kind,
    teacherName,
    defaultTeacherName,
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

    // The Classroom grade scale = the activity's total points, so pushed grades
    // read identically in Classroom (not a percentage out of 100). Fall back to
    // 100 only when the activity has no questions/points to sum.
    const vaMaxPoints =
      activityData.questions.reduce((s, q) => s + (q.points ?? 1), 0) || 100;

    const targeting = await resolveClassTargeting();

    // Respect the activity's OWN configured behavior, mirroring the normal VA
    // assign flow: `sessionOptions` + `attemptLimit` come from the activity's
    // behavior. The due date lives in Classroom (the teacher sets it in the
    // native composer), so it is NOT folded in here. `sessionSettings` (player
    // behavior) has no home on `behavior`, so it stays the conservative
    // VA_SESSION_SETTINGS default the route already used. VA supports PLC
    // sharing exactly like the quiz path — the sheet creator (`buildPlcLinkage`)
    // is widget-agnostic — so we build the same linkage and pass it on settings.
    const behavior = getVideoActivityBehavior(selectedActivity);
    const effectiveTeacherName = teacherName.trim() || defaultTeacherName;
    const sessionOptions: VideoActivitySessionOptions = {
      ...behavior.sessionOptions,
      attemptLimit: behavior.attemptLimit,
    };

    // Build the PLC linkage when the teacher opted into "Share with PLC" and
    // picked a PLC — same shared builder the quiz path uses, so the linkage
    // shape (auto-created sheet + name + member snapshot) is identical. A
    // failed sheet auto-create falls through to no linkage and is logged.
    const plcLinkage = await resolvePlcLinkageForAttach(selectedActivity.title);

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

    // Pass the activity total so the Classroom attachment's maxPoints matches
    // the activity exactly — the grade scale pushed grades are later capped to.
    const attachmentId = await createAttachment(
      `SpartBoard: ${selectedActivity.title}`,
      {
        sessionId,
        kind: 'va',
        maxPoints: vaMaxPoints,
      }
    );
    append(
      `Attached "${selectedActivity.title}". Students can now open it and ` +
        'complete the video activity inside Classroom.'
    );

    // Persist the attachment linkage onto both the teacher's assignment doc and
    // the session doc so the Results view can offer "Push grades to Google
    // Classroom". Best-effort: a failure here must NOT break the
    // already-completed attach flow — the activity is attached regardless.
    if (user?.uid) {
      const classroomAttachment = {
        attachmentId,
        courseId,
        itemId,
        maxPoints: vaMaxPoints,
        attachedAt: Date.now(),
      };
      try {
        // Session doc is load-bearing: the Results monitor reads
        // `session.classroomAttachment` (NOT the assignment doc) to show
        // "Push grades". Write it FIRST so a partial failure where the
        // second (archive) write fails still leaves the push button working.
        await updateDoc(doc(db, 'video_activity_sessions', sessionId), {
          classroomAttachment,
        });
        await updateDoc(
          doc(db, 'users', user.uid, 'video_activity_assignments', sessionId),
          { classroomAttachment, updatedAt: Date.now() }
        );
      } catch (persistErr) {
        logError(
          'TeacherDiscoveryRoute.persistClassroomAttachment',
          persistErr,
          { sessionId, kind }
        );
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
    selectedActivity,
    googleAccessToken,
    loadActivityData,
    resolveClassTargeting,
    createVideoActivityAssignment,
    createAttachment,
    resolvePlcLinkageForAttach,
    user,
    courseId,
    itemId,
    kind,
    teacherName,
    defaultTeacherName,
  ]);

  const runAttach = useCallback(async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (!courseId || !itemId) {
        append('Missing courseId/itemId in the URL.');
        setErrorMsg(
          'This assignment is missing its Classroom context. Re-open the ' +
            'SpartBoard add-on from the assignment.'
        );
        return;
      }
      if (!addOnToken) {
        append(
          'Missing addOnToken — this route must be opened as the Attachment ' +
            'Setup URI (discovery), not the teacher view.'
        );
        setErrorMsg(
          'This screen must be opened from the Classroom assignment’s add-on ' +
            'menu to attach an activity.'
        );
        return;
      }
      if (kind === 'quiz') {
        await attachQuiz();
      } else {
        await attachVideoActivity();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      append(`ERROR: ${message}`);
      setErrorMsg(`Something went wrong: ${message}`);
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

  const canAttach = kind === 'quiz' ? !!selectedQuizId : !!selectedActivityId;

  // Branded segmented selector for the activity type.
  const KIND_TABS: { value: ContentKind; label: string; icon: LucideIcon }[] = [
    { value: 'quiz', label: 'Quiz', icon: ClipboardList },
    { value: 'va', label: 'Video Activity', icon: Video },
  ];

  return (
    <AddonShell>
      <AddonHeader
        icon={Paperclip}
        title="Attach a SpartBoard activity"
        subtitle="Pick a quiz or video activity from your library. Students complete it right inside Classroom."
      />

      {existingAttachmentId ? (
        <AddonCard className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm leading-relaxed text-slate-600">
              This activity is already attached. Students open it from the
              assignment to complete it.
            </p>
          </div>
        </AddonCard>
      ) : !user ? (
        <AddonCard className="p-6">
          <p className="mb-4 text-sm text-slate-500">
            Sign in with your school Google account to load your SpartBoard
            library.
          </p>
          <AddonButton onClick={() => void signIn()} loading={busy}>
            Sign in to SpartBoard
          </AddonButton>
        </AddonCard>
      ) : (
        <div className="space-y-4">
          {/* Segmented Quiz / Video Activity selector */}
          <div
            role="tablist"
            aria-label="Activity type"
            className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            {KIND_TABS.map((tab) => {
              const active = kind === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={busy}
                  onClick={() => setKind(tab.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                    active
                      ? 'bg-gradient-to-r from-brand-blue-primary to-brand-blue-light text-white shadow'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Library picker */}
          <AddonCard className="p-4">
            <label
              htmlFor={
                kind === 'quiz' ? 'addon-quiz-select' : 'addon-va-select'
              }
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              {kind === 'quiz' ? 'Quiz' : 'Video Activity'}
            </label>
            {kind === 'quiz' ? (
              <AddonSelect
                id="addon-quiz-select"
                ariaLabel="Quiz"
                value={selectedQuizId}
                onChange={setSelectedQuizId}
                disabled={busy || quizzesLoading}
                placeholder={
                  quizzesLoading
                    ? 'Loading your quizzes…'
                    : quizzes.length === 0
                      ? 'No quizzes in your library yet'
                      : 'Select a quiz…'
                }
                options={quizzes.map((q) => ({ value: q.id, label: q.title }))}
              />
            ) : (
              <AddonSelect
                id="addon-va-select"
                ariaLabel="Video Activity"
                value={selectedActivityId}
                onChange={setSelectedActivityId}
                disabled={busy || activitiesLoading}
                placeholder={
                  activitiesLoading
                    ? 'Loading your video activities…'
                    : activities.length === 0
                      ? 'No video activities in your library yet'
                      : 'Select a video activity…'
                }
                options={activities.map((a) => ({
                  value: a.id,
                  label: a.title,
                }))}
              />
            )}
          </AddonCard>

          {/* Per-assignment settings — parity with the normal SpartBoard
              assign flow. Shown only once something is selected; all fields
              are optional. Class targeting is auto-derived from the
              Classroom course link, so there's no class/roster picker here. */}
          {canAttach && (
            <AddonCard className="space-y-4 p-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Assignment settings
              </h2>

              {behaviorSummary && (
                <p className="text-xs text-slate-500">
                  Inherits this {kind === 'quiz' ? 'quiz' : 'activity'}
                  &rsquo;s settings:{' '}
                  <span className="font-medium text-slate-700">
                    {behaviorSummary}
                  </span>
                </p>
              )}

              <div>
                <label
                  htmlFor="addon-teacher-name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Your name{' '}
                  <span className="font-normal text-slate-500">
                    (optional — shown on shared PLC results)
                  </span>
                </label>
                <input
                  id="addon-teacher-name"
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder={defaultTeacherName || 'Teacher name'}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* PLC sharing applies to BOTH quizzes and video activities —
                  `buildPlcLinkage` is widget-agnostic, so the same control
                  drives the quiz and VA attach paths. */}
              {plcs.length > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-sm text-slate-700">
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
                      className="h-4 w-4 rounded accent-brand-blue-light"
                    />
                    Share results with a PLC
                  </label>
                  {plcShareEnabled && (
                    <AddonSelect
                      ariaLabel="PLC to share results with"
                      value={selectedPlcId}
                      onChange={setSelectedPlcId}
                      disabled={busy}
                      placeholder="Select a PLC…"
                      options={plcs.map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  )}
                </div>
              )}
            </AddonCard>
          )}

          <AddonButton
            onClick={() => void runAttach()}
            loading={busy}
            disabled={!canAttach}
            icon={Paperclip}
          >
            {kind === 'quiz' ? 'Attach quiz' : 'Attach video activity'}
          </AddonButton>
        </div>
      )}

      {attachmentId && (
        <AddonCard className="mt-4 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Attached</p>
              <p className="text-sm text-slate-600">
                Students can now open and complete this activity inside
                Classroom.
              </p>
            </div>
          </div>
        </AddonCard>
      )}

      <div className="mt-4 space-y-2">
        <AddonError message={errorMsg} />
        {/* Persistent (not busy-gated) so the terminal status — including a
            non-fatal warning like a failed grade-push linkage write — stays
            visible after the spinner clears. */}
        <AddonStatus message={statusMsg} busy={busy} />
      </div>
    </AddonShell>
  );
};

export default ClassroomAddonTeacherSpike;
