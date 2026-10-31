// District fix for one Speak word: more pronunciations to accept, or skip it in Speak.
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Save, Trash2, Volume2 } from 'lucide-react';
import type { FlashcardSpeakReference } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { hearIt } from '@/utils/pronunciation/hearIt';
import {
  MAX_ACCEPTED_PER_WORD,
  type SpeakWordAccepted,
} from '@/utils/pronunciation/wordFixes';

export interface SpeakWordFixDraft {
  accepted: SpeakWordAccepted[];
  skip: boolean;
}

/** Turns a sounds-like spelling into readings; null when the engine can't read it as one word. */
export type ReadSpelling = (
  spelling: string
) => Promise<FlashcardSpeakReference[] | null>;

const smallButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';

export const FlashcardsSpeakWordFix: React.FC<{
  dialect: string;
  saved: SpeakWordFixDraft;
  readSpelling: ReadSpelling;
  onSave: (fix: SpeakWordFixDraft) => Promise<void>;
  /** The parent remounts this panel on each save, so it says when the last one landed. */
  justSaved: boolean;
}> = ({ dialect, saved, readSpelling, onSave, justSaved }) => {
  const { t, i18n } = useTranslation();
  const inputId = useId();
  const [accepted, setAccepted] = useState(saved.accepted);
  const [skip, setSkip] = useState(saved.skip);
  const [spelling, setSpelling] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const full = accepted.length >= MAX_ACCEPTED_PER_WORD;
  const date = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
  });

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await onSave({ accepted, skip });
    } catch (err) {
      console.error('[FlashcardsSpeakWordFix] save:', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const text = spelling.trim();
    if (!text || adding || full) return;
    setAdding(true);
    setUnreadable(false);
    try {
      const refs = await readSpelling(text);
      if (!refs) {
        setUnreadable(true);
        return;
      }
      setAccepted((prev) => [
        ...prev,
        {
          id: `s${Date.now().toString(36)}`,
          kind: 'spelling',
          spelling: text,
          refs,
          addedAt: Date.now(),
        },
      ]);
      setSpelling('');
    } catch (err) {
      console.error('[FlashcardsSpeakWordFix] read spelling:', err);
      setUnreadable(true);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="w-full space-y-3 border-t border-slate-200 pt-3">
      <div>
        <label htmlFor={inputId} className="text-xs font-bold text-slate-600">
          {t('flashcards.speak.admin.wordsToCheck.soundsLike')}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={inputId}
            value={spelling}
            maxLength={64}
            spellCheck={false}
            disabled={skip || full}
            onChange={(e) => {
              setSpelling(e.target.value);
              setUnreadable(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 disabled:opacity-40"
            {...tourFieldAttr(
              'admin.widget-config.field',
              'flashcards',
              'speak-word-fix-sounds-like'
            )}
          />
          <button
            type="button"
            disabled={skip || !spelling.trim()}
            onClick={() => hearIt(spelling, dialect)}
            className={smallButton}
            {...tourFieldAttr(
              'admin.widget-config.field',
              'flashcards',
              'speak-word-fix-hear'
            )}
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
            {t('flashcards.speak.player.hearIt')}
          </button>
          <button
            type="button"
            disabled={skip || full || adding || !spelling.trim()}
            onClick={() => void add()}
            className={smallButton}
            {...tourFieldAttr(
              'admin.widget-config.field',
              'flashcards',
              'speak-word-fix-add'
            )}
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('flashcards.speak.admin.wordsToCheck.add')}
          </button>
        </div>
        {unreadable ? (
          <p className="mt-1 text-xs font-medium text-brand-red-primary">
            {t('flashcards.speak.admin.wordsToCheck.unreadable')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            {t('flashcards.speak.admin.wordsToCheck.recordHint')}
          </p>
        )}
      </div>

      {accepted.length > 0 && (
        <div>
          <span className="text-xs font-bold text-slate-600">
            {t('flashcards.speak.admin.wordsToCheck.alsoAccepted')}
          </span>
          <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
            {accepted.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-1.5 text-sm text-slate-700"
              >
                <span className="min-w-0 truncate">
                  {item.kind === 'spelling'
                    ? t(
                        'flashcards.speak.admin.wordsToCheck.acceptedSpelling',
                        {
                          spelling: item.spelling,
                        }
                      )
                    : t(
                        'flashcards.speak.admin.wordsToCheck.acceptedRecording',
                        {
                          date: date.format(item.addedAt),
                        }
                      )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAccepted((prev) => prev.filter((a) => a.id !== item.id))
                  }
                  className={smallButton}
                  {...tourFieldAttr(
                    'admin.widget-config.field',
                    'flashcards',
                    'speak-word-fix-remove'
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t('flashcards.speak.admin.wordsToCheck.remove')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
          className="h-4 w-4 accent-brand-blue-primary"
          {...tourFieldAttr(
            'admin.widget-config.field',
            'flashcards',
            'speak-word-fix-skip'
          )}
        />
        {t('flashcards.speak.admin.wordsToCheck.skip')}
      </label>
      <div className="flex items-center justify-end gap-3">
        {failed && (
          <span className="text-xs font-medium text-brand-red-primary">
            {t('plcDashboard.members.actionError')}
          </span>
        )}
        {!failed && justSaved && !saving && (
          <span className="text-xs text-slate-500">
            {t('flashcards.speak.admin.saved')}
          </span>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-40"
          {...tourFieldAttr(
            'admin.widget-config.field',
            'flashcards',
            'speak-word-fix-save'
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          {t('flashcards.speak.admin.wordsToCheck.saveFix')}
        </button>
      </div>
    </div>
  );
};
