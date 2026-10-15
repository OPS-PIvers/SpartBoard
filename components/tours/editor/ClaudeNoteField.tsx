import React, {
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '@/context/AuthContextValue';
import { inputLight } from '@/components/common/lightChrome';
import { logError } from '@/utils/logError';
import { saveTourNote, useTourReview } from '@/components/tours/tourReview';

export const MAX_NOTE_CHARS = 1000;
/** Delay after the last keystroke before the note is saved. */
export const NOTE_SAVE_MS = 800;

/** A note Claude reads and acts on in its finish pass, on the tour ("tour") or a step; blank removes it (C10). */
export const ClaudeNoteField: React.FC<{
  setId: string;
  target: string;
  testId: string;
}> = ({ setId, target, testId }) => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const id = useId();
  const review = useTourReview(setId);
  const saved =
    target === 'tour' ? review?.tourNote : review?.stepNotes?.[target];
  // What the admin is typing, until it is saved.
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = auth?.user?.email ?? '';

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const save = pending.current;
    pending.current = null;
    save?.();
  };
  // Leaving the step or closing the editor saves what is still pending.
  const flushOnLeave = useEffectEvent(flush);
  useEffect(() => () => flushOnLeave(), []);

  if (!auth?.canAccessFeature('claude-connector')) return null;

  const change = (text: string) => {
    setDraft(text);
    pending.current = () =>
      void saveTourNote(
        setId,
        target,
        text.trim() ? { text, by: email, at: Date.now() } : undefined
      )
        .then(() => setDraft(null))
        .catch((err: unknown) =>
          logError('ClaudeNoteField.save', err, { setId, target })
        );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, NOTE_SAVE_MS);
  };

  return (
    <div className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      <label htmlFor={id}>{t('tours.editor.noteForClaude')}</label>
      <textarea
        id={id}
        data-testid={testId}
        rows={2}
        maxLength={MAX_NOTE_CHARS}
        value={draft ?? saved?.text ?? ''}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        className={`w-full resize-y rounded-lg px-2.5 py-1.5 text-sm font-normal ${inputLight}`}
      />
      {saved?.by && draft === null && (
        <span className="font-normal text-slate-500">
          {t('tours.editor.noteBy', { who: saved.by })}
        </span>
      )}
    </div>
  );
};
