import React, { useContext, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TourReviewNote } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { inputLight } from '@/components/common/lightChrome';

export const MAX_NOTE_CHARS = 1000;

/** A note Claude reads and acts on in its finish pass; blank removes it (C10). */
export const ClaudeNoteField: React.FC<{
  note: TourReviewNote | undefined;
  onChange: (note: TourReviewNote | undefined) => void;
  testId: string;
}> = ({ note, onChange, testId }) => {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const id = useId();
  if (!auth?.canAccessFeature('claude-connector')) return null;
  const email = auth.user?.email ?? '';
  return (
    <div className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      <label htmlFor={id}>{t('tours.editor.noteForClaude')}</label>
      <textarea
        id={id}
        data-testid={testId}
        rows={2}
        maxLength={MAX_NOTE_CHARS}
        value={note?.text ?? ''}
        onChange={(e) =>
          onChange(
            e.target.value.trim()
              ? { text: e.target.value, by: email, at: Date.now() }
              : undefined
          )
        }
        className={`w-full resize-y rounded-lg px-2.5 py-1.5 text-sm font-normal ${inputLight}`}
      />
      {note?.by && (
        <span className="font-normal text-slate-500">
          {t('tours.editor.noteBy', { who: note.by })}
        </span>
      )}
    </div>
  );
};
