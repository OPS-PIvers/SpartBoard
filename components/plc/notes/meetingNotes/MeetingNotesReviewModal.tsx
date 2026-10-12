// Review a drafted set of meeting notes: confirm owners, then Insert, Replace, Regenerate or Dismiss (MR-D19, MR-D23).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { NotesMarkdown } from '@/components/plc/bodies/notesMarkdown';
import type { PlcMember, PlcRecordingDraft } from '@/types';
import type { MeetingNotesApplyMode } from '@/utils/plcMeetingNotes';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

type Action = MeetingNotesApplyMode | 'regenerate' | 'dismiss';

interface MeetingNotesReviewModalProps {
  title: string;
  draft: PlcRecordingDraft;
  members: PlcMember[];
  canRegenerate: boolean;
  onApply: (
    mode: MeetingNotesApplyMode,
    owners: Record<string, string | null>
  ) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onClose: () => void;
}

const secondary =
  'px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors';

export const MeetingNotesReviewModal: React.FC<
  MeetingNotesReviewModalProps
> = ({
  title,
  draft,
  members,
  canRegenerate,
  onApply,
  onRegenerate,
  onDismiss,
  onClose,
}) => {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      draft.actionItems.map((i) => [i.id, i.suggestedOwnerUid ?? null])
    )
  );
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('plcDashboard.notes.meetingNotes.actionFailed', {
              defaultValue: 'That didn’t work. Try again.',
            })
      );
      setBusy(null);
    }
  };

  const activeMembers = members.filter((m) => m.status !== 'removed');

  const footer = (
    <div className="flex w-full items-center gap-2">
      <button
        {...tourAttr('plc-notes.review-insert')}
        type="button"
        disabled={busy !== null}
        onClick={() => void run('insert', () => onApply('insert', owners))}
        className="px-3 py-1.5 rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xs font-bold disabled:opacity-50 transition-colors"
      >
        {t('plcDashboard.notes.meetingNotes.insert', {
          defaultValue: 'Insert',
        })}
      </button>
      <button
        {...tourAttr('plc-notes.review-replace')}
        type="button"
        disabled={busy !== null}
        onClick={() => void run('replace', () => onApply('replace', owners))}
        className={secondary}
      >
        {t('plcDashboard.notes.meetingNotes.replace', {
          defaultValue: 'Replace',
        })}
      </button>
      {canRegenerate && (
        <button
          {...tourAttr('plc-notes.review-regenerate')}
          type="button"
          disabled={busy !== null}
          onClick={() => void run('regenerate', onRegenerate)}
          className={secondary}
        >
          {t('plcDashboard.notes.meetingNotes.regenerate', {
            defaultValue: 'Regenerate',
          })}
        </button>
      )}
      <button
        {...tourAttr('plc-notes.review-dismiss')}
        type="button"
        disabled={busy !== null}
        onClick={() => void run('dismiss', onDismiss)}
        className="ml-auto text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50"
      >
        {t('plcDashboard.notes.meetingNotes.dismiss', {
          defaultValue: 'Dismiss',
        })}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      <p className="mb-3 text-xs text-slate-500">
        {t('plcDashboard.notes.meetingNotes.draftedLine', {
          defaultValue:
            'Drafted automatically from the recording. Check before inserting.',
        })}
      </p>
      {draft.markdown.trim() && <NotesMarkdown body={draft.markdown} />}
      {draft.actionItems.length > 0 && (
        <section className="mt-4 pb-2">
          <h4 className="mb-1 text-sm font-bold text-slate-900">
            {t('plcDashboard.notes.meeting.actionItems', {
              defaultValue: 'Action items',
            })}
          </h4>
          <ul>
            {draft.actionItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-slate-100 py-1.5"
              >
                <span className="flex-1 text-sm text-slate-700">
                  {item.text}
                </span>
                <select
                  {...tourFieldAttr('plc-notes.review-owner', 'plc', item.id)}
                  value={owners[item.id] ?? ''}
                  onChange={(e) =>
                    setOwners((o) => ({
                      ...o,
                      [item.id]: e.target.value || null,
                    }))
                  }
                  aria-label={t('plcDashboard.notes.actionItems.assignee', {
                    defaultValue: 'Assignee',
                  })}
                  className="shrink-0 min-w-[9rem] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                >
                  <option value="">
                    {t('plcDashboard.notes.actionItems.unassigned', {
                      defaultValue: 'Unassigned',
                    })}
                  </option>
                  {activeMembers.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.displayName || m.email}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-brand-red-primary">
          {error}
        </p>
      )}
    </Modal>
  );
};
