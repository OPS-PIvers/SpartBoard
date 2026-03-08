import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { DashboardProvider } from './context/DashboardContext';
import { UpdateNotification } from './components/layout/UpdateNotification';
import { DriveDisconnectBanner } from './components/common/DriveDisconnectBanner';
import { isConfigured, isAuthBypass } from './config/firebase';
import { StudentProvider } from './components/student/StudentContexts';

// Lazy load heavy components for code splitting
// Using named export pattern: import(...).then(module => ({ default: module.ExportName }))
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
const LoginScreen = lazy(() =>
  import('./components/auth/LoginScreen').then((module) => ({
    default: module.LoginScreen,
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

const AuthenticatedApp: React.FC = () => {
  const { user, isAdmin } = useAuth();

  if (!user) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <LoginScreen />
      </Suspense>
    );
  }

  return (
    <DashboardProvider>
      <Suspense fallback={<FullPageLoader />}>
        {isAdmin && (
          <>
            <AdminWeatherFetcher />
            <AdminCalendarFetcher />
          </>
        )}
        <DashboardView />
      </Suspense>
      <UpdateNotification />
      <DriveDisconnectBanner />
    </DashboardProvider>
  );
};

const App: React.FC = () => {
  // Simple routing for Student View
  const pathname = window.location.pathname;
  const isStudentRoute = pathname === '/join' || pathname.startsWith('/join/');
  const isQuizRoute = pathname === '/quiz' || pathname.startsWith('/quiz/');
  const isNextUpRoute =
    pathname === '/nextup' || pathname.startsWith('/nextup/');

  if (isStudentRoute) {
    return (
      <StudentProvider>
        <Suspense fallback={<FullPageLoader />}>
          <StudentApp />
        </Suspense>
      </StudentProvider>
    );
  }

  // Quiz student route — requires real Firebase auth (org Google account)
  if (isQuizRoute) {
    return (
      <AuthProvider>
        <Suspense fallback={<FullPageLoader />}>
          <QuizStudentApp />
        </Suspense>
      </AuthProvider>
    );
  }

  // Next Up student route — anonymous entry allowed
  if (isNextUpRoute) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <NextUpStudentApp />
      </Suspense>
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

  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
};

export default App;
