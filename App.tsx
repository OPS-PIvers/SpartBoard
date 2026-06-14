import React, { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { useReconcileExpiredSubShares } from './hooks/useReconcileExpiredSubShares';
import { CustomWidgetsProvider } from './context/CustomWidgetsContext';
import { SavedWidgetsProvider } from './context/SavedWidgetsContext';
import { DashboardProvider } from './context/DashboardContext';
import { useDashboard } from './context/useDashboard';
import { DialogProvider } from './context/DialogContext';
import { DialogContainer } from './components/common/DialogContainer';
import { UpdateNotification } from './components/layout/UpdateNotification';
import { DriveDisconnectBanner } from './components/common/DriveDisconnectBanner';
import { SchoologyLinkNudge } from './components/classes/SchoologyLinkNudge';
import { isConfigured, isAuthBypass } from './config/firebase';
import { StudentProvider } from './components/student/StudentContexts';
import {
  StudentAuthProvider,
  RequireStudentAuth,
} from './context/StudentAuthContext';
import { StudentIdleTimeoutGuard } from './components/student/StudentIdleTimeoutGuard';

// Lazy load heavy components for code splitting
// Using named export pattern: import(...).then(module => ({ default: module.ExportName }))
const NewUserSetup = lazy(() =>
  import('./components/auth/NewUserSetup').then((module) => ({
    default: module.NewUserSetup,
  }))
);
const MobileRemoteApp = lazy(() =>
  import('./components/remote/MobileRemoteView').then((module) => ({
    default: module.MobileRemoteView,
  }))
);
const ShortLinkRedirect = lazy(() =>
  import('./components/common/ShortLinkRedirect').then((module) => ({
    default: module.ShortLinkRedirect,
  }))
);
const StudentApp = lazy(() =>
  import('./components/student/StudentApp').then((module) => ({
    default: module.StudentApp,
  }))
);
const QuizStudentApp = lazy(() =>
  import('./components/quiz/QuizStudentApp').then((module) => ({
    default: module.QuizStudentApp,
  }))
);
const NextUpStudentApp = lazy(() =>
  import('./components/student/NextUpStudentApp').then((module) => ({
    default: module.NextUpStudentApp,
  }))
);
const VideoActivityStudentApp = lazy(() =>
  import('./components/videoActivity/VideoActivityStudentApp').then(
    (module) => ({ default: module.VideoActivityStudentApp })
  )
);
// SPIKE — Classroom Add-on student handshake de-risk page (throwaway).
const ClassroomAddonStudentSpike = lazy(() =>
  import('./components/classroomAddon/StudentSpikeRoute').then((module) => ({
    default: module.ClassroomAddonStudentSpike,
  }))
);
// SPIKE — Classroom Add-on teacher discovery de-risk page (throwaway).
const ClassroomAddonTeacherSpike = lazy(() =>
  import('./components/classroomAddon/TeacherDiscoveryRoute').then(
    (module) => ({
      default: module.ClassroomAddonTeacherSpike,
    })
  )
);
// Classroom Add-on teacher VIEW — in-iframe quiz grading (no addOnToken launch).
const ClassroomAddonTeacherReview = lazy(() =>
  import('./components/classroomAddon/TeacherReviewRoute').then((module) => ({
    default: module.ClassroomAddonTeacherReview,
  }))
);
// Schoology LTI 1.3 launch surface (validated-launch view; runner/picker land later).
const LtiLaunchPage = lazy(() =>
  import('@/components/lti/LtiLaunchPage').then((module) => ({
    default: module.LtiLaunchPage,
  }))
);
// Schoology LTI 1.3 deep-linking teacher resource picker (/lti/teacher?mode=deeplink).
const LtiDeepLinkPicker = lazy(() =>
  import('@/components/lti/LtiDeepLinkPicker').then((module) => ({
    default: module.LtiDeepLinkPicker,
  }))
);
const ActivityWallStudentApp = lazy(() =>
  import('./components/activityWall/ActivityWallStudentApp').then((module) => ({
    default: module.ActivityWallStudentApp,
  }))
);
const ActivityWallGalleryView = lazy(() =>
  import('./components/activityWall/ActivityWallGalleryView').then(
    (module) => ({
      default: module.ActivityWallGalleryView,
    })
  )
);
const PollVoteApp = lazy(() =>
  import('./components/poll/PollVoteApp').then((module) => ({
    default: module.PollVoteApp,
  }))
);
const MiniAppStudentApp = lazy(() =>
  import('./components/miniApp/MiniAppStudentApp').then((module) => ({
    default: module.MiniAppStudentApp,
  }))
);
const GuidedLearningStudentApp = lazy(() =>
  import('./components/guidedLearning/GuidedLearningStudentApp').then(
    (module) => ({ default: module.GuidedLearningStudentApp })
  )
);
const StudentLoginPage = lazy(() =>
  import('./components/student/StudentLoginPage').then((module) => ({
    default: module.StudentLoginPage,
  }))
);
const MyAssignmentsPage = lazy(() =>
  import('./components/student/MyAssignmentsPage').then((module) => ({
    default: module.MyAssignmentsPage,
  }))
);
const LandingPage = lazy(() =>
  import('./components/landing/LandingPage').then((module) => ({
    default: module.LandingPage,
  }))
);
const RequestRolloutPage = lazy(() =>
  import('./components/landing/RequestRolloutPage').then((module) => ({
    default: module.RequestRolloutPage,
  }))
);
const LoginScreen = lazy(() =>
  import('./components/auth/LoginScreen').then((module) => ({
    default: module.LoginScreen,
  }))
);
const InviteAcceptance = lazy(() =>
  import('./components/auth/InviteAcceptance').then((module) => ({
    default: module.InviteAcceptance,
  }))
);
const PlcInviteAcceptance = lazy(() =>
  import('./components/auth/PlcInviteAcceptance').then((module) => ({
    default: module.PlcInviteAcceptance,
  }))
);
const DashboardView = lazy(() =>
  import('./components/layout/DashboardView').then((module) => ({
    default: module.DashboardView,
  }))
);
const AdminWeatherFetcher = lazy(() =>
  import('./components/admin/AdminWeatherFetcher').then((module) => ({
    default: module.AdminWeatherFetcher,
  }))
);
const AdminCalendarFetcher = lazy(() =>
  import('./components/admin/AdminCalendarFetcher').then((module) => ({
    default: module.AdminCalendarFetcher,
  }))
);
const SubsApp = lazy(() =>
  import('./components/subs/SubsApp').then((module) => ({
    default: module.SubsApp,
  }))
);
const SpotifyCallback = lazy(() =>
  import('./components/spotify/SpotifyCallback').then((module) => ({
    default: module.SpotifyCallback,
  }))
);
const ConverterPage = lazy(() =>
  import('./components/converter/ConverterPage').then((module) => ({
    default: module.ConverterPage,
  }))
);
// Public legal/support pages — anonymous, no providers; must load without
// sign-in (Google OAuth consent + Marketplace require public Privacy/Terms URLs).
const PrivacyPolicyPage = lazy(() =>
  import('./components/legal/PrivacyPolicyPage').then((module) => ({
    default: module.PrivacyPolicyPage,
  }))
);
const TermsOfServicePage = lazy(() =>
  import('./components/legal/TermsOfServicePage').then((module) => ({
    default: module.TermsOfServicePage,
  }))
);
const SupportPage = lazy(() =>
  import('./components/legal/SupportPage').then((module) => ({
    default: module.SupportPage,
  }))
);
// DEV-only: gate the dynamic import itself (not just the render) so Rollup
// dead-code-eliminates the harness chunk from production builds.
const NotebookEditorDevHarness = import.meta.env.DEV
  ? lazy(() =>
      import('./components/dev/NotebookEditorDevHarness').then((module) => ({
        default: module.NotebookEditorDevHarness,
      }))
    )
  : null;
const LibraryDevHarness = import.meta.env.DEV
  ? lazy(() =>
      import('./components/dev/LibraryDevHarness').then((module) => ({
        default: module.LibraryDevHarness,
      }))
    )
  : null;
const SessionViewsDevHarness = import.meta.env.DEV
  ? lazy(() =>
      import('./components/dev/SessionViewsDevHarness').then((module) => ({
        default: module.SessionViewsDevHarness,
      }))
    )
  : null;

const FullPageLoader = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
  </div>
);

const AuthenticatedApp: React.FC<{ isRemote?: boolean }> = ({
  isRemote = false,
}) => {
  const { user, loading } = useAuth();

  if (!user) {
    // While the persisted session resolves, show a plain loader so returning
    // teachers don't get a flash of the marketing page before the dashboard.
    if (loading) {
      return <FullPageLoader />;
    }
    // Signed-out fork (docs/wide-distro-plan.md Phase 1): the root route gets
    // the public landing page (sign-in is its hero CTA); the mobile remote
    // keeps the minimal login screen.
    return (
      <Suspense fallback={<FullPageLoader />}>
        {isRemote ? <LoginScreen /> : <LandingPage />}
      </Suspense>
    );
  }

  if (isRemote) {
    return (
      <CustomWidgetsProvider>
        <SavedWidgetsProvider>
          <DashboardProvider>
            <Suspense fallback={<FullPageLoader />}>
              <MobileRemoteApp />
            </Suspense>
          </DashboardProvider>
        </SavedWidgetsProvider>
      </CustomWidgetsProvider>
    );
  }

  return (
    <CustomWidgetsProvider>
      <SavedWidgetsProvider>
        <DashboardProvider>
          <AppContent />
        </DashboardProvider>
      </SavedWidgetsProvider>
    </CustomWidgetsProvider>
  );
};

/** Rendered inside DashboardProvider so it can access both auth and dashboard context. */
const AppContent: React.FC = () => {
  const {
    user,
    isAdmin,
    profileLoaded,
    setupCompleted,
    roleId,
    isStudentRole,
    roleResolved,
    signOut,
  } = useAuth();
  const {
    loading: dashLoading,
    activeDashboard,
    driveService,
    addToast,
  } = useDashboard();

  // Sweep this teacher's expired substitute shares once per session so
  // Drive permissions get revoked using their existing OAuth token. The
  // `expireSubShares` cloud function continues to delete share docs as a
  // fallback when a teacher never returns. Wire `onPartialFailure` to a
  // toast so a stuck revoke surfaces in the UI — the cloud-function
  // fallback only logs to Cloud Logging, which is invisible to teachers.
  useReconcileExpiredSubShares({
    uid: user?.uid ?? null,
    driveService,
    onPartialFailure: () => {
      addToast(
        'Some expired substitute-share Drive permissions could not be revoked. Reconnect Google Drive to retry — they will otherwise be cleaned up automatically within 7 days.',
        'error'
      );
    },
  });

  // Two paths to "this is a student":
  //   - `isStudentRole` — token carries `studentRole: true`. Real SSO
  //     students minted by `studentLoginV1`. They have a valid student
  //     session, so we just redirect to /my-assignments without signing
  //     out — `RequireStudentAuth` on that route validates the same
  //     `studentRole` claim and lets them through.
  //   - `roleId === 'student'` — legacy student who signed in via regular
  //     Google Sign-In and was invited into the org with a student role.
  //     Their token has no studentRole claim, so /my-assignments would
  //     bounce them anyway; sign them out so the next sign-in goes through
  //     the proper student flow.
  // The Firestore rule on /users/{uid}/dashboards is the actual security
  // boundary; this just keeps either kind of student from briefly seeing
  // the empty teacher shell before the rule denies their writes.
  //
  // We gate on `roleResolved` so the decision waits for both the
  // `studentRole` claim AND the org-members snapshot to settle. Without
  // that, a legacy student would slip past during the ~hundreds-of-ms
  // window where `roleId` is still null.
  const isStudent = isStudentRole || roleId === 'student';
  useEffect(() => {
    if (!profileLoaded || !roleResolved || !isStudent) return;

    if (isStudentRole) {
      // Real SSO session — token is already valid for /my-assignments.
      // Don't sign out; just navigate.
      window.location.replace('/my-assignments');
      return;
    }

    // Legacy student — invalidate their teacher session before redirect so
    // the next sign-in goes through the proper student flow. Race signOut
    // against an arbitrary 2-second upper bound so a hung sign-out doesn't
    // strand them on the loader; the navigation tears the SPA down either
    // way, and `window.location.replace` is idempotent so we don't gate the
    // call on an effect-cleanup flag (a sign-out-induced effect re-run
    // could otherwise cancel a redirect we still want to fire).
    void Promise.race([
      signOut().catch((err) => {
        console.error(
          '[AppContent] Failed to sign legacy student out before redirect:',
          err
        );
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
    ]).then(() => {
      window.location.replace('/my-assignments');
    });
  }, [profileLoaded, roleResolved, isStudent, isStudentRole, signOut]);

  // Hold on the loader while role resolution is in flight so a legacy
  // student doesn't briefly see the dashboard shell before the redirect
  // fires, and once we know they're a student until the redirect lands.
  if (!roleResolved || isStudent) {
    return <FullPageLoader />;
  }

  // Wait for the user's profile and first dashboard load before deciding what to show.
  // Also wait for an active dashboard: DashboardContext can emit loading=false before
  // the default board has been created (async saveDashboard on first sign-in), and the
  // setup wizard's setGlobalStyle() is a no-op when activeDashboard is null.
  if (!profileLoaded || dashLoading || !activeDashboard) {
    return <FullPageLoader />;
  }

  // First-time users go through the lightweight setup wizard.
  if (!setupCompleted) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <NewUserSetup />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<FullPageLoader />}>
      {isAdmin && (
        <>
          <AdminWeatherFetcher />
          <AdminCalendarFetcher />
        </>
      )}
      <DashboardView />
      <UpdateNotification />
      <DriveDisconnectBanner />
      <SchoologyLinkNudge />
    </Suspense>
  );
};

const App: React.FC = () => {
  // Simple routing for Student View
  const pathname = window.location.pathname;
  const isMiniAppRoute = pathname.startsWith('/miniapp/');
  // Catch `/r`, `/r/`, and `/r/:code` so typos hit the resolver's
  // not-found UI instead of mounting the full teacher app + providers.
  const isShortLinkRoute = pathname === '/r' || pathname.startsWith('/r/');
  const isStudentRoute = pathname === '/join' || pathname.startsWith('/join/');
  const isQuizRoute = pathname === '/quiz' || pathname.startsWith('/quiz/');
  const isNextUpRoute =
    pathname === '/nextup' || pathname.startsWith('/nextup/');
  const isRemoteRoute =
    pathname === '/remote' || pathname.startsWith('/remote/');
  const isVideoActivityRoute =
    pathname === '/activity' || pathname.startsWith('/activity/');
  const isActivityWallRoute =
    pathname === '/activity-wall' || pathname.startsWith('/activity-wall/');
  const isPollVoteRoute = pathname === '/poll' || pathname.startsWith('/poll/');
  const isInviteRoute = pathname.startsWith('/invite/');
  const isPlcInviteRoute = pathname.startsWith('/plc-invite/');
  const isStudentLoginRoute =
    pathname === '/student/login' || pathname.startsWith('/student/login/');
  const isMyAssignmentsRoute =
    pathname === '/my-assignments' || pathname.startsWith('/my-assignments/');
  // Phase A — `/subs` is the substitute teacher portal. Mounted outside the
  // teacher AuthProvider/DashboardProvider so dashboard listeners don't fire
  // for subs. Phase 4 will wrap this in a domain-gated AuthProvider.
  const isSubsRoute = pathname === '/subs' || pathname.startsWith('/subs/');
  // SPIKE — Classroom Add-on routes. Anonymous entry; the page drives its own
  // Google OAuth + custom-token sign-in, so no teacher providers are mounted.
  const isClassroomAddonRoute = pathname.startsWith('/classroom-addon/');

  // Schoology LTI 1.3 launch routes (/lti/login + /lti/launch are Cloud Functions
  // via hosting rewrites; /lti/student + /lti/teacher are this SPA surface).
  const isLtiRoute = pathname.startsWith('/lti/');

  // Short-link resolver. Runs outside every provider so anonymous visitors
  // can follow admin-created /r/:code links without triggering Firebase
  // Auth, dashboard listeners, or any other heavy setup. The resolver does
  // a single Firestore lookup + client-side redirect.
  if (isShortLinkRoute) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <ShortLinkRedirect />
      </Suspense>
    );
  }

  // Spotify OAuth callback — loaded into the popup window opened by
  // `connectSpotify()`. Posts the auth code back to `window.opener` and
  // closes itself; no providers, no auth, no Firestore listeners needed.
  if (pathname === '/spotify-callback') {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <SpotifyCallback />
      </Suspense>
    );
  }

  // SMART Notebook -> .spartnb converter. Pure client-side tool; no auth, no
  // Firestore, no providers. Teachers land here from the "file too large"
  // prompt (or directly) to shrink big notebooks before importing.
  if (pathname === '/convert' || pathname.startsWith('/convert/')) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <ConverterPage />
      </Suspense>
    );
  }

  // Public legal/support pages. Anonymous, no providers — they must render
  // without sign-in so Google's OAuth consent + Marketplace review can reach
  // the Privacy Policy / Terms URLs. Trailing-slash tolerant because the
  // prerendered static copies (dist/privacy/index.html etc.) make Firebase
  // Hosting redirect /privacy → /privacy/ before the SPA boots.
  const legalPath = pathname.replace(/\/+$/, '');
  if (
    legalPath === '/privacy' ||
    legalPath === '/terms' ||
    legalPath === '/support'
  ) {
    const LegalPage =
      legalPath === '/privacy'
        ? PrivacyPolicyPage
        : legalPath === '/terms'
          ? TermsOfServicePage
          : SupportPage;
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LegalPage />
      </Suspense>
    );
  }

  // Pilot / district-rollout request form (docs/wide-distro-plan.md Phase 2).
  // Public route; AuthProvider so signed-in users can submit the form, but no
  // dashboard providers (the page must stay light and load for anyone).
  if (legalPath === '/request') {
    return (
      <DialogProvider>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <RequestRolloutPage />
          </Suspense>
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // DEV-ONLY: SVG page-editor harness for iterating on the SMART Notebook
  // editor against real pages. The import + component are gated on
  // import.meta.env.DEV, so the harness chunk is excluded from prod builds.
  if (
    import.meta.env.DEV &&
    NotebookEditorDevHarness &&
    pathname === '/notebook-editor-dev'
  ) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <NotebookEditorDevHarness />
      </Suspense>
    );
  }

  // DEV-ONLY: visual harness for the unified Library primitives (shell,
  // toolbar, cards, assignment rows) at multiple widget sizes. Same
  // import.meta.env.DEV gating as the notebook harness above.
  if (import.meta.env.DEV && LibraryDevHarness && pathname === '/library-dev') {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LibraryDevHarness />
      </Suspense>
    );
  }

  // DEV-ONLY: visual harness for the four live teacher session views (Quiz
  // Monitor / Quiz Results / VA Monitor / VA Results) against mock data, so
  // the redesign can be iterated without Firestore. Relies on
  // VITE_AUTH_BYPASS. Same import.meta.env.DEV gating as the harnesses above.
  if (
    import.meta.env.DEV &&
    SessionViewsDevHarness &&
    pathname === '/session-views-dev'
  ) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <SessionViewsDevHarness />
      </Suspense>
    );
  }

  // MiniApp student route — anonymous entry, no teacher auth needed.
  // StudentIdleTimeoutGuard is a no-op unless a studentRole (ClassLink-via-
  // Google) session is active; anonymous code+PIN launches and teacher
  // previews pass through untouched.
  if (isMiniAppRoute) {
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <MiniAppStudentApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Classroom Add-on routes. `/classroom-addon/teacher` is the Attachment Setup
  // (discovery) iframe; everything else under the prefix is the student view.
  if (isClassroomAddonRoute) {
    const isTeacherDiscovery = pathname.startsWith('/classroom-addon/teacher');
    if (isTeacherDiscovery) {
      // The discovery (attach) iframe carries an addOnToken; the teacher VIEW of
      // an already-created attachment (and the per-student work review) does
      // not. Mount the in-iframe grader for the view, the attach flow otherwise.
      const isAttachFlow =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('addOnToken');
      // Attach only needs auth (uid + Drive token) — no dashboard listeners. The
      // grader needs DashboardProvider: it reuses the shared WrittenResponseGrader
      // whose editor shell reads useDashboard (addToast), so wrap ONLY the review
      // branch — keeping attach lean while the grader has the context it needs.
      return (
        <DialogProvider>
          <AuthProvider>
            <Suspense fallback={<FullPageLoader />}>
              {isAttachFlow ? (
                <ClassroomAddonTeacherSpike />
              ) : (
                <DashboardProvider>
                  <ClassroomAddonTeacherReview />
                </DashboardProvider>
              )}
            </Suspense>
          </AuthProvider>
          <DialogContainer />
        </DialogProvider>
      );
    }
    // Student view: after the custom-token handshake the page renders
    // QuizStudentApp, which self-handles Firebase auth (preserving the SSO
    // student token) and SSO-auto-joins by ?code=. Only DialogProvider needed.
    return (
      <DialogProvider>
        <Suspense fallback={<FullPageLoader />}>
          <ClassroomAddonStudentSpike />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Schoology LTI 1.3 launch surface. Anonymous entry; the page exchanges the
  // one-time launch code for the validated context (and, for a Learner launch, a
  // studentRole custom token it signs in with).
  //
  // Provider scoping by route:
  //   - /lti/teacher?mode=deeplink → the teacher resource PICKER
  //     (LtiDeepLinkPicker), which loads the teacher's SpartBoard quiz library.
  //   - /lti/teacher (instructor resource-link launch) → LtiLaunchPage, which
  //     shows the validated-launch diagnostic card (grading is done from the
  //     SpartBoard dashboard Results view, gated on session ownership).
  // The deep-link picker needs AuthProvider (the uid + Drive token), mirroring
  // the Classroom teacher-discovery attach flow (AuthProvider, but no
  // DashboardProvider). So ALL /lti/teacher routes get AuthProvider.
  //   - /lti/student → LtiLaunchPage's student runner only; it never calls
  //     useAuth, so it stays on DialogProvider alone (no teacher Firestore
  //     listeners for anonymous students).
  if (isLtiRoute) {
    const isLtiTeacher = pathname.startsWith('/lti/teacher');
    const isLtiDeepLink =
      isLtiTeacher &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mode') === 'deeplink';
    return (
      <DialogProvider>
        {isLtiTeacher ? (
          <AuthProvider>
            <Suspense fallback={<FullPageLoader />}>
              {isLtiDeepLink ? <LtiDeepLinkPicker /> : <LtiLaunchPage />}
            </Suspense>
          </AuthProvider>
        ) : (
          <Suspense fallback={<FullPageLoader />}>
            <LtiLaunchPage />
          </Suspense>
        )}
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Video Activity student route — anonymous entry, no teacher auth needed
  if (isVideoActivityRoute) {
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <VideoActivityStudentApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  if (isActivityWallRoute) {
    // `/activity-wall/gallery/{shareId}` is a view-only "art gallery"
    // page for an Activity Wall's submissions — distinct from the
    // student submission flow that owns every other path under
    // `/activity-wall/...`. Both are unauthenticated entries.
    const isActivityWallGalleryRoute = pathname.startsWith(
      '/activity-wall/gallery/'
    );
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          {isActivityWallGalleryRoute ? (
            <ActivityWallGalleryView />
          ) : (
            <ActivityWallStudentApp />
          )}
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Public poll voting route — anonymous entry, no teacher auth needed.
  // Mirrors the activity-wall branch: DialogProvider + StudentIdleTimeoutGuard
  // wrap a lazy participant app. The `?data=` payload carries everything the
  // app needs to render and route the vote.
  if (isPollVoteRoute) {
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <PollVoteApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  const isGuidedLearningRoute = pathname.startsWith('/guided-learning/');

  // Guided Learning student route — anonymous entry, no teacher auth needed
  if (isGuidedLearningRoute) {
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <GuidedLearningStudentApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Student login route — PII-free GIS sign-in, NOT behind AuthProvider.
  // The page is itself the auth gate; it signs the student in with a custom
  // token once the Cloud Function verifies the Google id_token.
  if (isStudentLoginRoute) {
    return (
      <DialogProvider>
        <Suspense fallback={<FullPageLoader />}>
          <StudentLoginPage />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // My Assignments route — landing page for GIS-authenticated students.
  // StudentAuthProvider owns the auth lifecycle (idle timeout, custom claims).
  // RequireStudentAuth gates rendering on a valid student token and redirects
  // to /student/login when missing.
  if (isMyAssignmentsRoute) {
    return (
      <DialogProvider>
        <StudentAuthProvider>
          <RequireStudentAuth>
            <Suspense fallback={<FullPageLoader />}>
              <MyAssignmentsPage />
            </Suspense>
          </RequireStudentAuth>
        </StudentAuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  if (isStudentRoute) {
    return (
      <DialogProvider>
        <StudentProvider>
          <Suspense fallback={<FullPageLoader />}>
            <StudentApp />
          </Suspense>
        </StudentProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Substitute teacher portal — Google sign-in required, @orono.k12.mn.us
  // domain enforced inside SubsApp via a small auth gate. Mounted outside
  // DashboardProvider so teacher dashboard listeners never fire for subs.
  if (isSubsRoute) {
    return (
      <DialogProvider>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <SubsApp />
          </Suspense>
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Quiz student route — QuizStudentApp self-handles Firebase auth
  // (signInAnonymously when no current user; preserves the SSO student-
  // custom-token user otherwise). No teacher AuthContext consumers in the
  // quiz tree, so wrapping in <AuthProvider> would only mount admin-only
  // Firestore listeners that fail with permission-denied for students.
  if (isQuizRoute) {
    return (
      <DialogProvider>
        <Suspense fallback={<FullPageLoader />}>
          <QuizStudentApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Next Up student route — anonymous entry allowed
  if (isNextUpRoute) {
    return (
      <DialogProvider>
        <Suspense fallback={<FullPageLoader />}>
          <NextUpStudentApp />
        </Suspense>
        <DialogContainer />
      </DialogProvider>
    );
  }

  if (!isConfigured && !isAuthBypass) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">
            Configuration Required
          </h1>
          <p className="text-slate-600 mb-6">
            The application is missing Firebase configuration credentials.
            Please check your environment variables or <code>.env</code> file.
          </p>
          <div className="bg-slate-100 p-4 rounded-lg text-left overflow-x-auto">
            <code className="text-sm text-slate-700">
              VITE_FIREBASE_API_KEY=...
              <br />
              VITE_FIREBASE_AUTH_DOMAIN=...
              <br />
              VITE_FIREBASE_PROJECT_ID=...
            </code>
          </div>
        </div>
      </div>
    );
  }

  // Invite-acceptance route — requires Firebase auth so the user can claim
  // their invitation, but does NOT need DashboardProvider/CustomWidgetsProvider
  // (those mount heavy code the invite page doesn't need, and a failed invite
  // should not trigger dashboard loading).
  if (isInviteRoute) {
    return (
      <DialogProvider>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <InviteAcceptance />
          </Suspense>
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // PLC-invite landing route — separate from the org-invite route because
  // PLC invites live in a different collection (`plc_invitations`) and are
  // sent/accepted through `usePlcInvitations` rather than the callable
  // claim function.
  if (isPlcInviteRoute) {
    return (
      <DialogProvider>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <PlcInviteAcceptance />
          </Suspense>
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  // Mobile Remote Control — same auth requirements as the main teacher view
  if (isRemoteRoute) {
    return (
      <DialogProvider>
        <AuthProvider>
          <AuthenticatedApp isRemote={true} />
        </AuthProvider>
        <DialogContainer />
      </DialogProvider>
    );
  }

  return (
    <DialogProvider>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
      <DialogContainer />
    </DialogProvider>
  );
};

export default App;
