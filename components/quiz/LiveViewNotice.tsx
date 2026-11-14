import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuizLiveViewStamp, QuizNudgeNoteId } from '@/types';
import {
  NUDGE_NOTE_IDS,
  NUDGE_NOTE_TEXT,
  NUDGE_SHOW_MS,
} from '@/utils/quizNudgeNotes';
import { getServerNow } from '@/utils/serverTime';

const NUDGE_NOTE_KEY: Record<QuizNudgeNoteId, string> = {
  'see-me': 'quizLiveView.noteSeeMe',
  'own-work': 'quizLiveView.noteOwnWork',
  'keep-going': 'quizLiveView.noteKeepGoing',
};

const isNoteId = (v: unknown): v is QuizNudgeNoteId =>
  typeof v === 'string' && (NUDGE_NOTE_IDS as readonly string[]).includes(v);

/** Student side of Live view: the optional "being viewed" banner and the Nudge border. */
export const LiveViewNotice: React.FC<{
  liveView: QuizLiveViewStamp | null | undefined;
  /** The quiz's language, so a note reads in it. */
  language?: string;
}> = ({ liveView, language }) => {
  const { t } = useTranslation();
  const lng = language ? { lng: language } : {};
  const until = liveView?.notify ? (liveView.until ?? 0) : 0;
  const nudgeAt = liveView?.nudge?.at ?? 0;

  // A closed teacher tab never clears the stamp, so the banner ends itself at `until`.
  const [expiredUntil, setExpiredUntil] = useState(() =>
    until && until <= getServerNow() ? until : 0
  );
  useEffect(() => {
    if (!until) return;
    const id = window.setTimeout(
      () => setExpiredUntil(until),
      Math.max(0, until - getServerNow())
    );
    return () => window.clearTimeout(id);
  }, [until]);
  // A Nudge that already ran, found again on reload, starts out done.
  const [endedNudgeAt, setEndedNudgeAt] = useState(() =>
    nudgeAt && nudgeAt + NUDGE_SHOW_MS <= getServerNow() ? nudgeAt : 0
  );
  useEffect(() => {
    if (!nudgeAt) return;
    const id = window.setTimeout(
      () => setEndedNudgeAt(nudgeAt),
      Math.max(0, nudgeAt + NUDGE_SHOW_MS - getServerNow())
    );
    return () => window.clearTimeout(id);
  }, [nudgeAt]);

  const showBanner = until > 0 && until !== expiredUntil;
  const showNudge = nudgeAt > 0 && nudgeAt !== endedNudgeAt;
  const noteId = liveView?.nudge?.noteId;
  if (!showBanner && !showNudge) return null;
  return (
    <>
      {showBanner && (
        <div
          role="status"
          className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-xs font-semibold text-sky-900"
        >
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('quizLiveView.banner', 'Your teacher is viewing your quiz', lng)}
        </div>
      )}
      {showNudge && (
        <div
          role="alert"
          className="pointer-events-none fixed inset-0 z-quiz-lock flex items-start justify-center border-[10px] border-amber-400 animate-pulse motion-reduce:animate-none"
        >
          {isNoteId(noteId) && (
            <p className="mt-6 rounded-md border border-amber-600 bg-amber-400 px-5 py-2 text-lg font-bold text-slate-900">
              {t(NUDGE_NOTE_KEY[noteId], NUDGE_NOTE_TEXT[noteId], lng)}
            </p>
          )}
          {!isNoteId(noteId) && (
            <span className="sr-only">
              {t('quizLiveView.nudge', 'Your teacher is checking in', lng)}
            </span>
          )}
        </div>
      )}
    </>
  );
};
