import React from 'react';
import { ClipboardList, Loader2, X } from 'lucide-react';
import { spaNavigate } from '@/utils/plcPath';
import { tourAttr } from '@/config/tourAnchors';
import {
  buildGradebookPath,
  type ParsedGradebookPath,
} from '@/utils/gradebookPath';
import { useGradebookMarkWrites } from '@/hooks/gradebook/useGradebookMarkWrites';
import { useLastUndo } from '@/hooks/gradebook/gradebookUndoStore';
import { useGradebook } from './GradebookContext';
import { GradebookSubBar } from './GradebookSubBar';
import { GradebookGrid } from './GradebookGrid';
import { GradebookAnalysis } from './analysis/GradebookAnalysis';
import { GradebookAnalyzeModal } from './analysis/GradebookAnalyzeModal';
import { GradebookStudentView } from './student/GradebookStudentView';

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export const GradebookShell: React.FC<{
  tab: 'grid' | 'analysis';
  rosterId: string | null;
  onClose: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
}> = ({ tab, rosterId, onClose, onKeyDown, children }) => (
  <div
    className="fixed inset-0 z-modal flex flex-col overscroll-none bg-slate-50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="gradebook-title"
    onKeyDown={onKeyDown}
  >
    <header className="flex h-14 shrink-0 items-center gap-3 bg-brand-blue-primary px-4 text-white shadow-sm md:h-16">
      <ClipboardList
        className="hidden h-5 w-5 text-white/70 md:block"
        aria-hidden
      />
      <h1
        id="gradebook-title"
        className="mr-2 hidden text-base font-bold sm:block md:text-lg"
      >
        Gradebook
      </h1>
      {rosterId && (
        <div
          role="tablist"
          {...tourAttr('gradebook.tabs')}
          className="flex gap-0.5 rounded-lg bg-white/15 p-1"
        >
          {(
            [
              ['grid', 'Grades'],
              ['analysis', 'Data analysis'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => spaNavigate(buildGradebookPath(rosterId, id))}
              className={`h-7 rounded-md px-3 text-[13px] font-semibold ${
                tab === id
                  ? 'bg-white text-brand-blue-dark shadow-sm'
                  : 'text-white/85 hover:bg-white/15'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        {...tourAttr('gradebook.close')}
        className="rounded-lg p-1.5 hover:bg-white/20"
        aria-label="Close gradebook"
        title="Close"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </header>
    {children}
  </div>
);

export const GradebookEmpty: React.FC<{ title: string; body?: string }> = ({
  title,
  body,
}) => (
  <div className="m-auto max-w-sm p-8 text-center">
    <p className="text-base font-bold text-slate-800">{title}</p>
    {body && <p className="mt-1 text-sm text-slate-500">{body}</p>}
  </div>
);

/** The gradebook page for one class: header, sub-bar and the routed body (D4, D19). */
export const GradebookPage: React.FC<{
  parsed: ParsedGradebookPath;
  onClose: () => void;
}> = ({ parsed, onClose }) => {
  const gb = useGradebook();
  const popoverWrites = useGradebookMarkWrites(gb.rosterId, gb.settings.flags);
  const popoverUndo = useLastUndo(popoverWrites.undoScope);
  const tab = parsed.view === 'analysis' ? 'analysis' : 'grid';
  const onGrid = parsed.view === 'grid' || parsed.view === 'assignment';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || isTyping(e.target) || e.altKey) return;
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z' &&
      !e.shiftKey
    ) {
      if (popoverUndo && popoverUndo.at > gb.marks.lastUndoAt) {
        e.preventDefault();
        popoverWrites
          .undoBatch(popoverUndo.batchId)
          .then((label) => label && gb.toast('Undone'))
          .catch(() => gb.toast('Could not undo that change'));
        return;
      }
      if (!gb.marks.canUndo) return;
      e.preventDefault();
      void gb.marks.undo();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      gb.setPrivacy(!gb.privacy);
    }
  };

  let body: React.ReactNode;
  if (gb.status === 'loading') {
    body = (
      <div className="grid flex-1 place-items-center">
        <Loader2
          className="h-10 w-10 animate-spin text-brand-blue-primary"
          aria-label="Loading"
        />
      </div>
    );
  } else if (gb.status === 'error') {
    body = (
      <GradebookEmpty
        title="Could not load grades"
        body="Reload the page to try again."
      />
    );
  } else if (parsed.view === 'analysis') {
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-6 md:pt-6">
        <GradebookAnalysis />
      </div>
    );
  } else if (parsed.view === 'student' && parsed.studentUid) {
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-6 md:pt-6">
        <GradebookStudentView studentUid={parsed.studentUid} />
      </div>
    );
  } else if (gb.columns.length === 0) {
    body = (
      <GradebookEmpty
        title="No assignments in this view"
        body="Change the grading period or filters."
      />
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        <GradebookGrid />
      </div>
    );
  }

  return (
    <GradebookShell
      tab={tab}
      rosterId={gb.rosterId}
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <GradebookSubBar onGrid={onGrid && gb.status === 'ready'} />
      {body}
      {parsed.view === 'assignment' && parsed.sessionId && (
        <GradebookAnalyzeModal
          sessionId={parsed.sessionId}
          onClose={() => spaNavigate(buildGradebookPath(gb.rosterId))}
        />
      )}
    </GradebookShell>
  );
};
