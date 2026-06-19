/**
 * PlcCommentsThread — reusable, object-scoped comment thread with @mentions
 * (Decision 2.6, §3.5, §6.2 commentable data cards). Parameterized by
 * `targetType` + `targetId` so the same component serves Shared Data result
 * cards today and assessments/notes later.
 *
 * Surface: this renders inside PLC light-surface cards (white on slate-50), so
 * muted text uses the light-surface palette (`text-slate-500/600`) per the
 * project's contrast guidance. All interactive controls carry focus rings and
 * icon-only buttons carry aria-labels.
 *
 * Permissions: reading is open to any member; COMPOSING is gated behind
 * `canEditPlcContent` (viewers read, can't post). Soft-delete is allowed for
 * the author (own) and — per the rules' tidy-up posture — any member; the UI
 * exposes delete on a member's own comment and, for lead/co-lead, on any
 * comment.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Trash2 } from 'lucide-react';
import type { PlcComment } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { usePlcMembers, usePlcRole } from '@/context/usePlcContext';
import { logError } from '@/utils/logError';
import {
  usePlcComments,
  type PlcCommentTargetType,
} from '@/hooks/usePlcComments';
import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import { PlcMentionPicker } from './PlcMentionPicker';
import {
  MENTION_QUERY_RE,
  filterMentionCandidates,
  resolveMentions,
  type MentionCandidate,
} from './mentionUtils';

interface PlcCommentsThreadProps {
  plcId: string;
  targetType: PlcCommentTargetType;
  targetId: string;
  /** Human label for the thread's subject, used in aria-labels. */
  targetLabel?: string;
}

function formatWhen(ms: number, locale: string): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

const CommentRow: React.FC<{
  comment: PlcComment;
  canDelete: boolean;
  onDelete: (comment: PlcComment) => void;
}> = ({ comment, canDelete, onDelete }) => {
  const { t, i18n } = useTranslation();
  const when = formatWhen(comment.createdAt, i18n.language);
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-800 truncate">
          {comment.authorName}
        </span>
        {when && <span className="text-xxs text-slate-500">{when}</span>}
        {comment.editedAt != null && (
          <span className="text-xxs italic text-slate-500">
            {t('plcDashboard.comments.edited', { defaultValue: 'edited' })}
          </span>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(comment)}
            aria-label={t('plcDashboard.comments.delete', {
              defaultValue: 'Delete comment',
            })}
            className="ml-auto p-1 rounded-md text-slate-400 hover:text-brand-red-primary hover:bg-brand-red-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red-primary"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">
        {comment.body}
      </p>
    </li>
  );
};

export const PlcCommentsThread: React.FC<PlcCommentsThreadProps> = ({
  plcId,
  targetType,
  targetId,
  targetLabel,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const members = usePlcMembers();
  const myRole = usePlcRole(user?.uid);
  const canCompose = myRole !== null && myRole !== 'viewer';
  const isManager = myRole === 'lead' || myRole === 'coLead';

  const {
    comments,
    loading,
    error,
    addComment,
    softDeleteComment,
    restoreComment,
  } = usePlcComments(plcId, targetType, targetId);
  const { softDelete } = usePlcSoftDelete(plcId);

  const [draft, setDraft] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>(
    []
  );
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const idPrefix = useMemo(
    () => `plc-comment-mention-${targetType}-${targetId}`,
    [targetType, targetId]
  );

  const candidates = useMemo(
    () =>
      mentionQuery === null
        ? []
        : filterMentionCandidates(members, mentionQuery, user?.uid ?? null),
    [members, mentionQuery, user?.uid]
  );

  // Recompute the active @-query from the textarea's current value + caret.
  const refreshMentionQuery = useCallback((value: string, caret: number) => {
    const upToCaret = value.slice(0, caret);
    const match = MENTION_QUERY_RE.exec(upToCaret);
    if (match) {
      setMentionQuery(match[1] ?? '');
      setActiveIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    refreshMentionQuery(value, e.target.selectionStart ?? value.length);
  };

  const insertMention = useCallback(
    (candidate: MentionCandidate) => {
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? draft.length;
      const before = draft.slice(0, caret);
      const after = draft.slice(caret);
      // Replace the trailing `@query` with `@DisplayName `.
      const replaced = before.replace(
        MENTION_QUERY_RE,
        (full) =>
          `${full.startsWith('@') ? '' : full[0]}@${candidate.displayName} `
      );
      const next = replaced + after;
      setDraft(next);
      setSelectedMentions((prev) =>
        prev.some((m) => m.uid === candidate.uid) ? prev : [...prev, candidate]
      );
      setMentionQuery(null);
      // Restore focus + place caret after the inserted mention.
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node) {
          node.focus();
          const pos = replaced.length;
          node.setSelectionRange(pos, pos);
        }
      });
    },
    [draft]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = candidates[activeIndex];
        if (chosen) {
          e.preventDefault();
          insertMention(chosen);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    // Submit on Cmd/Ctrl+Enter when not navigating the picker.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handlePost();
    }
  };

  const handlePost = useCallback(async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const mentions = resolveMentions(draft, selectedMentions);
      await addComment({ targetType, targetId, body, mentions });
      setDraft('');
      setSelectedMentions([]);
      setMentionQuery(null);
    } catch (err) {
      logError('PlcCommentsThread.addComment', err, {
        plcId,
        targetType,
        targetId,
      });
      addToast(
        t('plcDashboard.comments.postFailed', {
          defaultValue: 'Couldn’t post your comment. Try again.',
        }),
        'error'
      );
    } finally {
      setPosting(false);
    }
  }, [
    draft,
    posting,
    selectedMentions,
    addComment,
    targetType,
    targetId,
    plcId,
    addToast,
    t,
  ]);

  const handleDelete = useCallback(
    async (comment: PlcComment) => {
      const confirmed = await showConfirm(
        t('plcDashboard.comments.confirmDelete', {
          defaultValue: 'Delete this comment?',
        }),
        {
          title: t('plcDashboard.comments.confirmDeleteTitle', {
            defaultValue: 'Delete comment',
          }),
          variant: 'danger',
          confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
        }
      );
      if (!confirmed) return;
      try {
        // Soft-delete with undo (Decision 3.1): tombstone the comment, log
        // `item_deleted`, and pop an Undo toast that restores it.
        await softDelete({
          type: 'comment',
          id: comment.id,
          title: comment.body,
          runDelete: () => softDeleteComment(comment.id),
          runRestore: () => restoreComment(comment.id),
        });
      } catch (err) {
        logError('PlcCommentsThread.softDeleteComment', err, {
          plcId,
          commentId: comment.id,
        });
        addToast(
          t('plcDashboard.comments.deleteFailed', {
            defaultValue: 'Couldn’t delete that comment. Try again.',
          }),
          'error'
        );
      }
    },
    [
      showConfirm,
      softDelete,
      softDeleteComment,
      restoreComment,
      plcId,
      addToast,
      t,
    ]
  );

  const heading = t('plcDashboard.comments.heading', {
    defaultValue: 'Comments',
  });

  return (
    <section
      aria-label={
        targetLabel
          ? t('plcDashboard.comments.threadLabel', {
              defaultValue: 'Comments on {{subject}}',
              subject: targetLabel,
            })
          : heading
      }
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          {heading}
          {comments.length > 0 && (
            <span className="ml-1 text-slate-400">({comments.length})</span>
          )}
        </h4>
      </div>

      {loading ? (
        <p className="text-xxs text-slate-500">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : error ? (
        <p className="text-xxs text-brand-red-primary">
          {t('plcDashboard.comments.loadError', {
            defaultValue: 'Couldn’t load comments.',
          })}
        </p>
      ) : comments.length === 0 ? (
        <p className="text-xxs text-slate-500">
          {t('plcDashboard.comments.empty', {
            defaultValue: 'No comments yet',
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canDelete={comment.authorUid === user?.uid || isManager}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {canCompose ? (
        <div className="relative">
          <label htmlFor={`${idPrefix}-input`} className="sr-only">
            {t('plcDashboard.comments.add', { defaultValue: 'Add a comment' })}
          </label>
          <textarea
            ref={textareaRef}
            id={`${idPrefix}-input`}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setMentionQuery(null)}
            rows={2}
            role="combobox"
            aria-expanded={mentionQuery !== null && candidates.length > 0}
            aria-controls={`${idPrefix}-listbox`}
            aria-activedescendant={
              mentionQuery !== null && candidates.length > 0
                ? `${idPrefix}-opt-${activeIndex}`
                : undefined
            }
            placeholder={t('plcDashboard.comments.placeholder', {
              defaultValue: 'Write a comment… use @ to mention a teammate',
            })}
            className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          />
          {mentionQuery !== null && (
            <div id={`${idPrefix}-listbox`}>
              <PlcMentionPicker
                candidates={candidates}
                activeIndex={activeIndex}
                onSelect={insertMention}
                onHoverIndex={setActiveIndex}
                idPrefix={idPrefix}
              />
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xxs text-slate-400">
              {t('plcDashboard.comments.mentionHint', {
                defaultValue: 'Type @ to mention a teammate',
              })}
            </span>
            <button
              type="button"
              onClick={() => void handlePost()}
              disabled={posting || draft.trim().length === 0}
              className="px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xxs font-semibold hover:bg-brand-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            >
              {t('plcDashboard.comments.post', { defaultValue: 'Post' })}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xxs italic text-slate-400">
          {t('plcDashboard.comments.viewerReadOnly', {
            defaultValue: 'Viewers can read comments but not post.',
          })}
        </p>
      )}
    </section>
  );
};
