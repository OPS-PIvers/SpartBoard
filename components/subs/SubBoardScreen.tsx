/**
 * SubBoardScreen — frozen, read-only-but-content-interactive view of the
 * teacher's real board for a substitute.
 *
 * The share doc carries the teacher's widget snapshot in
 * `initialState`/`widgets`. SubsDashboardProvider supplies a
 * DashboardContextValue scoped to that snapshot, with
 * `isActiveBoardReadOnly: true` so DraggableWindow auto-locks every
 * widget's drag/resize/close chrome. Widget content interaction (timer
 * Start, lunch +/-, scoreboard, music play/pause) stays local — the
 * provider's updateWidget mutates local React state only and never
 * writes to Firestore.
 *
 * Reset throws away both the local widgets-array changes (via
 * SubsControlContext.resetWidgets) AND component-local state (via a
 * resetKey bump on every widget mount).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { SubProfileToolbar } from './SubProfileToolbar';
import { teacherCardAccent, teacherInitials } from './subsView';
import { useSubstituteShare } from '@/hooks/useSubstituteShares';
import { SubsDashboardProvider } from './SubsDashboardProvider';
import { useSubsControl } from './SubsControlContext';
import { SubBoardCanvas } from './SubBoardCanvas';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubBoardScreenProps {
  shareId: string;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

export const SubBoardScreen: React.FC<SubBoardScreenProps> = ({
  shareId,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { share, loading, error } = useSubstituteShare(shareId);
  const [expired, setExpired] = useState(false);

  // Imperatively check expiration on a 60-second tick so an idle sub
  // still gets bounced back when the share lapses. Same pattern as
  // before — Date.now() lives inside the effect, not the render path.
  const expiresAt = share?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (expiresAt <= Date.now()) setExpired(true);
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!expired) return;
    const id = window.setTimeout(onBackToDirectory, 1500);
    return () => window.clearTimeout(id);
  }, [expired, onBackToDirectory]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60 bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!!error || !share || expired) {
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message={
            expired ? 'This share has expired.' : (error ?? 'Share not found.')
          }
          onBack={onBackToDirectory}
        />
      </div>
    );
  }

  return (
    <SubsDashboardProvider share={share}>
      <SubBoardScreenContent
        share={share}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />
    </SubsDashboardProvider>
  );
};

interface SubBoardScreenContentProps {
  share: SubstituteShareDoc;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

const SubBoardScreenContent: React.FC<SubBoardScreenContentProps> = ({
  share,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { resetWidgets } = useSubsControl();
  // Mirror the provider's resetKey locally so SubBoardCanvas re-mounts
  // widgets on reset. The provider calls onResetKeyChange but we drive
  // it from here so a SubBoardCanvas key bump is guaranteed.
  const [resetKey, setResetKey] = useState(0);

  const teacherName = share.originalAuthorName ?? 'Teacher';
  const boardName = share.name ?? 'Untitled board';
  const accent = useMemo(
    () => teacherCardAccent(share.shareId),
    [share.shareId]
  );
  const initials = useMemo(() => teacherInitials(teacherName), [teacherName]);

  const handleReset = () => {
    resetWidgets();
    setResetKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-900">
      <SubProfileToolbar
        teacherName={teacherName}
        teacherInitials={initials}
        accentColor={accent}
        boardName={boardName}
        expiresAt={share.expiresAt ?? 0}
        onReset={handleReset}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />

      <div className="fixed top-4 right-4 z-40 hidden md:flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 px-3 py-1.5 text-[11px] text-white/80 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Substitute view — widgets are locked in place
      </div>

      <main className="absolute inset-0 pt-20">
        <SubBoardCanvas resetKey={resetKey} />
      </main>
    </div>
  );
};

const ExpiredOrErrorPanel: React.FC<{
  message: string;
  onBack: () => void;
}> = ({ message, onBack }) => (
  <main className="min-h-screen flex items-center justify-center px-8">
    <div className="max-w-md text-center text-white">
      <h2 className="text-2xl font-bold tracking-tight">{message}</h2>
      <p className="mt-2 text-sm text-white/60">
        Returning you to the teacher directory.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to directory
      </button>
    </div>
  </main>
);
