import React, { useState, useEffect } from 'react';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useLiveSession } from '../../hooks/useLiveSession';
import { StudentLobby } from './StudentLobby';
import { WidgetRenderer } from '../widgets/WidgetRenderer';
import { Snowflake, Radio } from 'lucide-react';
import { WidgetData, DEFAULT_GLOBAL_STYLE } from '../../types';
import { getDefaultWidgetConfig } from '../../utils/widgetHelpers';

const noop = () => undefined;
const asyncNoop = async () => {
  await Promise.resolve();
};

export const StudentApp = () => {
  const [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Ensure we have correct size on mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sign in anonymously when component mounts
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        setAuthInitialized(true);
      } catch (error) {
        // - This component treats anonymous-auth failures as non-fatal so the UI can still proceed.
        // - Session join behavior (including any ID fallback) is handled within the useLiveSession hook.
        // Because this failure is non-fatal for core functionality, we log a warning
        // instead of an error, but include guidance for common misconfiguration issues.
        console.warn(
          'Anonymous auth failed. If this is a restricted operation error, please ensure "Anonymous" provider is enabled in Firebase Console -> Authentication -> Sign-in method.',
          error
        );
        // We still mark auth as initialized so that downstream hooks can run their own fallback logic.
        setAuthInitialized(true);
      }
    };

    void initAuth();

    // Cleanup anonymous session on unmount
    return () => {
      if (auth.currentUser?.isAnonymous) {
        void signOut(auth).catch((err) =>
          console.error('Failed to sign out on unmount:', err)
        );
      }
    };
  }, []);

  // Hook usage for 'student' role
  const {
    session,
    loading,
    joinSession,
    leaveSession,
    studentId,
    studentPin,
    individualFrozen,
  } = useLiveSession(undefined, 'student', joinedCode ?? undefined);

  const backgroundStyles = React.useMemo(() => {
    if (!session?.background) return {};
    const bg = session.background;

    if (bg.startsWith('http') || bg.startsWith('data:')) {
      return {
        backgroundImage: `url("${bg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    return {};
  }, [session]);

  const backgroundClasses = React.useMemo(() => {
    if (!session?.background) return '';
    const bg = session.background;
    if (bg.startsWith('http') || bg.startsWith('data:')) return '';
    return bg;
  }, [session]);

  const handleJoin = async (code: string, pin: string) => {
    setError(null);
    try {
      const sessionId = await joinSession(pin, code);
      setJoinedCode(sessionId);
    } catch (error) {
      console.error('Join error:', error);
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else {
        message = 'Failed to join session due to an unexpected error.';
      }

      if (message.toLowerCase().includes('session not found')) {
        setError('Session not found. Please check your join code.');
      } else if (
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch')
      ) {
        setError('Connection error. Please check your internet.');
      } else {
        setError(message);
      }
    }
  };

  // Wait for auth to initialize before showing lobby
  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Initializing...</div>
      </div>
    );
  }

  // 1. Lobby State
  if (!joinedCode || !studentId) {
    return (
      <StudentLobby onJoin={handleJoin} isLoading={loading} error={error} />
    );
  }

  // 2. Waiting State (Joined but no active widget)
  if (!session?.isActive || !session?.activeWidgetId) {
    return (
      <div
        id="dashboard-root"
        className={`h-screen w-screen overflow-hidden relative transition-all duration-1000 ${backgroundClasses}`}
        style={backgroundStyles}
      >
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-black/20 backdrop-blur-sm animate-in fade-in">
          <Radio className="w-12 h-12 mb-4 animate-pulse text-white" />
          <h2 className="text-xl font-bold text-white">Connected</h2>
          <p className="text-white/70 font-medium mb-6">
            Waiting for teacher to start an activity...
          </p>
          <button
            onClick={() => void leaveSession()}
            className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-xl text-sm font-bold transition-all"
          >
            Leave Session
          </button>
        </div>
      </div>
    );
  }

  // 3. Frozen State Overlay (Global or Individual)
  if (session.frozen || individualFrozen) {
    return (
      <div className="fixed inset-0 z-overlay bg-indigo-900 flex flex-col items-center justify-center p-8 text-center text-white">
        <Snowflake className="w-20 h-20 mb-6 animate-spin-slow opacity-80" />
        <h1 className="text-4xl font-black mb-4">Eyes on Teacher</h1>
        <p className="text-indigo-200 text-lg mb-8">Your screen is paused.</p>
        <button
          onClick={() => void leaveSession()}
          className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-xl text-sm font-bold transition-all"
        >
          Leave Session
        </button>
      </div>
    );
  }

  // 4. Active Widget State
  // We provide the widget with the current window dimensions.
  // In student view, widgets are rendered full-screen without the draggable container.
  const activeWidgetStub: WidgetData = {
    id: session.activeWidgetId,
    type: session.activeWidgetType ?? 'clock',
    x: 0,
    y: 0,
    // Use full window dimensions instead of grid units
    w: windowSize.width,
    h: windowSize.height,
    z: 1,
    flipped: false,
    config:
      session.activeWidgetConfig ??
      getDefaultWidgetConfig(session.activeWidgetType ?? 'clock'),
    isLive: true,
  };

  return (
    <div
      id="dashboard-root"
      className={`h-screen w-screen overflow-hidden relative transition-all duration-1000 ${backgroundClasses}`}
      style={backgroundStyles}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 z-header" />
      <button
        onClick={() => void leaveSession()}
        className="absolute top-4 right-4 z-header px-3 py-1.5 bg-black/30 hover:bg-red-500/40 text-white/70 hover:text-white border border-white/20 hover:border-red-500/20 rounded-lg text-xxs font-black uppercase tracking-widest backdrop-blur-md transition-all"
      >
        Leave
      </button>
      <div className="h-full w-full">
        {/* Pass isStudentView to render content without window chrome */}
        <WidgetRenderer
          widget={activeWidgetStub}
          isStudentView={true}
          sessionCode={session?.code}
          isGlobalFrozen={session?.frozen ?? false}
          isLive={true}
          students={[]}
          updateSessionConfig={asyncNoop}
          updateSessionBackground={asyncNoop}
          startSession={asyncNoop}
          endSession={asyncNoop}
          removeStudent={asyncNoop}
          toggleFreezeStudent={asyncNoop}
          studentPin={studentPin}
          toggleGlobalFreeze={asyncNoop}
          updateWidget={noop}
          removeWidget={noop}
          duplicateWidget={noop}
          bringToFront={noop}
          addToast={noop}
          globalStyle={DEFAULT_GLOBAL_STYLE}
        />
      </div>
    </div>
  );
};
