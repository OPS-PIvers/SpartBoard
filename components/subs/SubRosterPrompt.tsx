import React, { useState } from 'react';
import { AlertCircle, Loader2, Users } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { SubRosterStatus } from '@/hooks/useSubstituteRosters';

type PromptStatus = Extract<SubRosterStatus, 'locked' | 'partial' | 'error'>;

const COPY: Record<
  PromptStatus,
  { title: string; body: string; action: string; pill: string }
> = {
  locked: {
    title: 'Load the class lists',
    body: 'Student names for this board are kept in Google Drive. Tick every file in the list that opens, then choose Select.',
    action: 'Load class lists',
    pill: 'Load class lists',
  },
  partial: {
    title: 'Some class lists are still missing',
    body: 'Not every file was ticked. Open the list again, tick every file, then choose Select.',
    action: 'Load the rest',
    pill: 'Load missing class lists',
  },
  error: {
    title: 'The class lists did not load',
    body: 'Check you are signed in with the account the teacher shared with, then try again.',
    action: 'Try again',
    pill: 'Class lists did not load. Try again',
  },
};

const isPromptStatus = (status: SubRosterStatus): status is PromptStatus =>
  status === 'locked' || status === 'partial' || status === 'error';

interface SubRosterPromptProps {
  status: SubRosterStatus;
  teacherName: string;
  onLoad: () => void;
}

/** The sub's way to unlock the share's class lists: a dialog on arrival, then a pill. */
export const SubRosterPrompt: React.FC<SubRosterPromptProps> = ({
  status,
  teacherName,
  onLoad,
}) => {
  // Remembered per status, so a pick that missed files asks again.
  const [dismissed, setDismissed] = useState<SubRosterStatus | null>(null);

  if (status === 'none' || status === 'ready') return null;
  if (!isPromptStatus(status)) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-full bg-white/85 backdrop-blur-xl border border-slate-200/70 shadow-md px-3 py-1.5 text-xs text-slate-600"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        Loading class lists…
      </div>
    );
  }

  const copy = COPY[status];
  const warn = status !== 'locked';
  const Icon = warn ? AlertCircle : Users;
  return (
    <>
      <button /* no-tour-anchor: substitute portal, never on the board */
        type="button"
        onClick={onLoad}
        className={`flex items-center gap-2 rounded-full backdrop-blur-xl border px-3 py-1.5 text-xs font-bold shadow-md transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
          warn
            ? 'bg-amber-50/95 hover:bg-amber-100 border-amber-300 text-amber-800'
            : 'bg-white/85 hover:bg-white border-slate-200/70 text-brand-blue-primary'
        }`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden />
        {copy.pill}
      </button>
      <Modal
        isOpen={dismissed !== status}
        onClose={() => setDismissed(status)}
        title={copy.title}
        maxWidth="max-w-md"
        contentClassName="px-6 py-5"
      >
        <p className="text-sm text-slate-600">{copy.body}</p>
        <p className="mt-2 text-xs text-slate-500">Shared by {teacherName}.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button /* no-tour-anchor: substitute portal, never on the board */
            type="button"
            onClick={() => setDismissed(status)}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-sm cursor-pointer"
          >
            Not now
          </button>
          <button /* no-tour-anchor: substitute portal, never on the board */
            type="button"
            onClick={() => {
              setDismissed(status);
              onLoad();
            }}
            className="px-3 py-1.5 text-sm font-bold bg-brand-blue-primary text-white rounded-sm hover:bg-brand-blue-dark cursor-pointer"
          >
            {copy.action}
          </button>
        </div>
      </Modal>
    </>
  );
};
