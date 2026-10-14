import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { Rubric, WrittenAnswerAnnotation } from '@/types';
import { formatTimecode } from '@/utils/mediaGrading';
import { tourFieldAttr } from '@/config/tourAnchors';
import { RubricStrandChips } from './RubricStrandChips';
import { toggleStrandTag } from '@/utils/rubricStrandTags';

export interface TimedNotesListProps {
  annotations: WrittenAnswerAnnotation[];
  onChange: (next: WrittenAnswerAnnotation[]) => void;
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  /** Moves the player to a note's moment, in ms. */
  onSeek: (ms: number) => void;
  disabled?: boolean;
  rubric?: Rubric;
}

/** Time-stamped grading notes under a take player, shared by audio and whiteboard. */
export const TimedNotesList: React.FC<TimedNotesListProps> = ({
  annotations,
  onChange,
  activeId,
  onActiveIdChange,
  onSeek,
  disabled = false,
  rubric,
}) => {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...annotations].sort((a, b) => a.from - b.from),
    [annotations]
  );
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {sorted.length === 0 && (
        <li className="text-xs italic leading-relaxed text-slate-500">
          {t('quizMediaResponse.grading.player.noComments')}
        </li>
      )}
      {sorted.map((a, index) => (
        <li
          key={a.id}
          className={`rounded-lg border p-2 transition-colors ${
            a.id === activeId
              ? 'border-violet-400 bg-violet-50'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onActiveIdChange(a.id);
                onSeek(a.from);
              }}
              {...tourFieldAttr(
                'quiz-grading.audio-note-seek',
                'quiz',
                String(index)
              )}
              className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs tabular-nums text-slate-700 transition hover:bg-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={t('quizMediaResponse.grading.player.seekTo', {
                time: formatTimecode(a.from),
              })}
            >
              {formatTimecode(a.from)}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(annotations.filter((x) => x.id !== a.id));
                if (activeId === a.id) onActiveIdChange(null);
              }}
              {...tourFieldAttr(
                'quiz-grading.audio-note-remove',
                'quiz',
                String(index)
              )}
              className="ml-auto rounded p-1 text-slate-500 transition hover:bg-slate-200 hover:text-brand-red-primary disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={t('quizMediaResponse.grading.player.removeComment', {
                time: formatTimecode(a.from),
              })}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
          {rubric && (
            <div className="mt-1.5">
              <RubricStrandChips
                rubric={rubric}
                value={a.rubricCriteria}
                disabled={disabled}
                onToggle={(criterionId) =>
                  onChange(
                    annotations.map((x) =>
                      x.id === a.id
                        ? {
                            ...x,
                            rubricCriteria: toggleStrandTag(
                              x.rubricCriteria,
                              criterionId,
                              rubric
                            ),
                          }
                        : x
                    )
                  )
                }
              />
            </div>
          )}
          <label className="mt-1.5 block">
            <span className="sr-only">
              {t('quizMediaResponse.grading.player.commentLabel', {
                time: formatTimecode(a.from),
              })}
            </span>
            <textarea
              value={a.comment ?? ''}
              disabled={disabled}
              rows={2}
              placeholder={t(
                'quizMediaResponse.grading.player.commentPlaceholder'
              )}
              onFocus={() => onActiveIdChange(a.id)}
              {...tourFieldAttr(
                'quiz-grading.audio-note-comment',
                'quiz',
                String(index)
              )}
              onChange={(e) =>
                onChange(
                  annotations.map((x) =>
                    x.id === a.id ? { ...x, comment: e.target.value } : x
                  )
                )
              }
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:bg-slate-100"
            />
          </label>
        </li>
      ))}
    </ul>
  );
};
