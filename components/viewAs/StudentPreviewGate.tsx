// View as student tab gate and banner (docs/plans/ADMIN_VIEW_AS.md D15).
import React, { useEffect, useSyncExternalStore } from 'react';
import { Eye } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { EndedScreen } from '@/context/ViewAsContext';
import { getViewAsTabState, subscribeViewAsTab } from '@/utils/viewAsTab';
import {
  bootStudentPreviewTab,
  endStudentPreview,
} from '@/utils/viewAsStudent';

export const StudentPreviewBanner: React.FC = () => (
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
    <button
      type="button"
      onClick={() => {
        void endStudentPreview().then(() => window.close());
      }}
      className="px-2 py-0.5 rounded bg-white text-slate-900 font-semibold hover:bg-slate-200"
    >
      Exit
    </button>
  </div>
);

export const StudentPreviewGate: React.FC<{
  loader: React.ReactNode;
  children: React.ReactNode;
}> = ({ loader, children }) => {
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);

  useEffect(() => {
    void bootStudentPreviewTab();
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
