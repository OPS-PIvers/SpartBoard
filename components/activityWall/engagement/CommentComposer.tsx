import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { ActivityWallIdentificationMode } from '@/types';
import { buildParticipantLabel } from './participantLabel';
import type { PostCommentInput } from './useWallEngagement';

export interface CommentComposerProps {
  identificationMode: ActivityWallIdentificationMode;
  /** Known viewer label (student page); skips the name/PIN inputs. */
  participantLabel?: string;
  submissionId: string;
  parentCommentId: string | null;
  onPostComment: (input: PostCommentInput) => Promise<void>;
  onDone?: () => void;
}

export const CommentComposer: React.FC<CommentComposerProps> = ({
  identificationMode,
  participantLabel,
  submissionId,
  parentCommentId,
  onPostComment,
  onDone,
}) => {
  const known = typeof participantLabel === 'string';
  const requiresName =
    !known &&
    (identificationMode === 'name' || identificationMode === 'name-pin');
  const requiresPin =
    !known &&
    (identificationMode === 'pin' || identificationMode === 'name-pin');

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!content.trim()) return;
    if (requiresName && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (requiresPin && !pin.trim()) {
      setError('Please enter the PIN.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onPostComment({
        submissionId,
        parentCommentId,
        content,
        participantLabel:
          participantLabel ??
          buildParticipantLabel(identificationMode, name, pin),
      });
      setContent('');
      setName('');
      setPin('');
      onDone?.();
    } catch (err) {
      console.error('[ActivityWallEngagement] Comment submit failed:', err);
      setError('Could not post your comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {(requiresName || requiresPin) && (
        <div className="grid grid-cols-2 gap-2">
          {requiresName && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            />
          )}
          {requiresPin && (
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              aria-label="PIN"
              className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            />
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={parentCommentId ? 'Write a reply…' : 'Leave a comment…'}
          aria-label={parentCommentId ? 'Write a reply' : 'Leave a comment'}
          className="flex-1 resize-none rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send aria-hidden="true" className="w-3.5 h-3.5" />
          )}
          Post
        </button>
      </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </form>
  );
};
