import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { CustomWidgetsProvider } from './context/CustomWidgetsContext';
import { DashboardProvider } from './context/DashboardContext';
import { useDashboard } from './context/useDashboard';
import { DialogProvider } from './context/DialogContext';
import { DialogContainer } from './components/common/DialogContainer';
import { UpdateNotification } from './components/layout/UpdateNotification';
import { DriveDisconnectBanner } from './components/common/DriveDisconnectBanner';
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
const ActivityWallStudentApp = lazy(() =>
  import('./components/activityWall/ActivityWallStudentApp').then((module) => ({
    default: module.ActivityWallStudentApp,
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

const FullPageLoader = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
  </div>
);

const AuthenticatedApp: React.FC<{ isRemote?: boolean }> = ({
  isRemote = false,
}) => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LoginScreen />
      </Suspense>
    );
  }

  if (isRemote) {
    return (
      <CustomWidgetsProvider>
        <DashboardProvider>
          <Suspense fallback={<FullPageLoader />}>
            <MobileRemoteApp />
          </Suspense>
        </DashboardProvider>
      </CustomWidgetsProvider>
    );
  }

  return (
    <CustomWidgetsProvider>
      <DashboardProvider>
        <AppContent />
      </DashboardProvider>
    </CustomWidgetsProvider>
  );
};

/** Rendered inside DashboardProvider so it can access both auth and dashboard context. */
const AppContent: React.FC = () => {
  const { isAdmin, profileLoaded, setupCompleted } = useAuth();
  const { loading: dashLoading, activeDashboard } = useDashboard();

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
    </Suspense>
  );
};

const App: React.FC = () => {
  // Simple routing for Student View
  const pathname = window.location.pathname;
  const isMiniAppRoute = pathname.startsWith('/miniapp/');
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
  const isInviteRoute = pathname.startsWith('/invite/');
  const isStudentLoginRoute =
    pathname === '/student/login' || pathname.startsWith('/student/login/');
  const isMyAssignmentsRoute =
    pathname === '/my-assignments' || pathname.startsWith('/my-assignments/');

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
    return (
      <DialogProvider>
        <StudentIdleTimeoutGuard />
        <Suspense fallback={<FullPageLoader />}>
          <ActivityWallStudentApp />
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

  // Quiz student route — requires real Firebase auth (org Google account)
  if (isQuizRoute) {
    return (
      <DialogProvider>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <QuizStudentApp />
          </Suspense>
        </AuthProvider>
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
