// View as student tab gate and banner (docs/plans/shipped/ADMIN_VIEW_AS.md D15).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { auth } from '@/config/firebase';
import { Eye } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { EndedScreen } from '@/context/ViewAsContext';
import {
  getViewAsTabState,
  subscribeViewAsTab,
  updateViewAsTabState,
  VIEW_AS_PARAM,
  VIEW_AS_STUDENT,
} from '@/utils/viewAsTab';
import {
  bootStudentPreviewTab,
  endStudentPreview,
} from '@/utils/viewAsStudent';

/** True when the preview signed in as a class-roster student, who has a My Assignments page. */
function useHasMyAssignments(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    void auth.currentUser
      ?.getIdTokenResult()
      .then((r) => {
        if (live) setHas(r.claims.studentRole === true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return has;
}

const openMyAssignments = () => {
  window.history.pushState(
    null,
    '',
    `/my-assignments?${VIEW_AS_PARAM}=${VIEW_AS_STUDENT}`
  );
  updateViewAsTabState({ studentPage: 'my-assignments' });
};

export const StudentPreviewBanner: React.FC = () => {
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);
  const hasMyAssignments = useHasMyAssignments();
  return (
    <div
      role="region"
      aria-label="View as student"
      data-testid="student-preview-banner"
      className="fixed top-0 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-3 pr-1.5 h-8 w-max max-w-[calc(100vw-24px)] rounded-b-lg bg-slate-900 text-white text-xs font-medium shadow-lg"
      style={{ zIndex: Z_INDEX.viewAsBanner }}
    >
      <Eye size={14} className="shrink-0 text-slate-300" aria-hidden />
      <span className="truncate">Student view</span>
      <span className="shrink-0 text-amber-300 font-semibold">Read-only</span>
      {hasMyAssignments && tab.studentPage === 'activity' && (
        // no-tour-anchor: the admin-only preview banner is never a tour step.
        <button
          type="button"
          onClick={openMyAssignments}
          className="px-2 py-0.5 rounded-sm text-white font-semibold hover:bg-white/15"
        >
          My Assignments
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void endStudentPreview().then(() => window.close());
        }}
        className="px-2 py-0.5 rounded-sm bg-white text-slate-900 font-semibold hover:bg-slate-200"
      >
        Exit
      </button>
    </div>
  );
};

export const StudentPreviewGate: React.FC<{
  loader: React.ReactNode;
  children: React.ReactNode;
}> = ({ loader, children }) => {
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);

  useEffect(() => {
    void bootStudentPreviewTab();
  }, []);

  // Back and Forward move between the activity and My Assignments in place.
  useEffect(() => {
    const onPop = () =>
      updateViewAsTabState({
        studentPage: window.location.pathname.startsWith('/my-assignments')
          ? 'my-assignments'
          : 'activity',
      });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const expiresAt = tab.student?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setTimeout(
      () => void endStudentPreview(),
      Math.max(0, expiresAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  if (tab.ended) return <EndedScreen />;
  if (!tab.student) return <>{loader}</>;
  return (
    <>
      <StudentPreviewBanner />
      {children}
    </>
  );
};
