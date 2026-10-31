import React from 'react';
import { Eye, X } from 'lucide-react';
import type { PollResponse } from '@/hooks/usePollSession';
import type { WidgetType } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { cloudKey, legacyHiddenWordKey } from '@/utils/pollResults';

interface TextResponsesProps {
  kind: 'words' | 'text';
  questionId: string;
  responses: PollResponse[];
  hiddenKeys: readonly string[];
  /** This question's hidden word cloud words, as cloudKeys. */
  hiddenWords: readonly string[];
  /** Hidden words haven't loaded yet, so the cloud waits rather than flash them. */
  hiddenWordsLoading?: boolean;
  /** The board owner can hide answers and bring them back. */
  canModerate: boolean;
  onHide: (key: string) => void;
  onHideWord: (word: string) => void;
  onShowHidden: () => void;
  fontFamily: string;
  widgetId: string;
  widgetType: WidgetType;
}

// Brand blue and red plus calm neutrals; no purple.
const WORD_COLORS = [
  'text-brand-blue-primary',
  'text-brand-red-primary',
  'text-emerald-700',
  'text-amber-700',
  'text-sky-700',
  'text-slate-700',
];

const wordClass = (word: string): string => {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) | 0;
  }
  return WORD_COLORS[Math.abs(hash) % WORD_COLORS.length];
};

const MAX_CLOUD_ENTRIES = 80;

const buildAnswerCloud = (
  texts: string[],
  hidden: (word: string) => boolean
): { word: string; count: number; weight: number }[] => {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const key = cloudKey(t);
    if (key && !hidden(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CLOUD_ENTRIES);
  const top = entries[0]?.[1] ?? 1;
  return entries.map(([word, count]) => ({ word, count, weight: count / top }));
};

const iconStyle = { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' };

/** Word cloud and open response answers on the board, with per-answer hiding. */
export const TextResponses: React.FC<TextResponsesProps> = ({
  kind,
  questionId,
  responses,
  hiddenKeys,
  hiddenWords,
  hiddenWordsLoading = false,
  canModerate,
  onHide,
  onHideWord,
  onShowHidden,
  fontFamily,
  widgetId,
  widgetType,
}) => {
  const hidden = new Set(hiddenKeys);
  const hiddenWordSet = new Set(hiddenWords);
  const visible = responses.filter((r) => !hidden.has(`${questionId}:${r.id}`));
  const words =
    kind === 'words' && !hiddenWordsLoading
      ? buildAnswerCloud(
          visible.map((r) => r.text),
          (word) =>
            hiddenWordSet.has(word) ||
            hidden.has(legacyHiddenWordKey(questionId, word))
        )
      : [];
  const hiddenCount =
    hiddenKeys.filter(
      (k) => k.startsWith(`${questionId}:`) || k.startsWith(`${questionId}#`)
    ).length + hiddenWords.length;
  const empty = responses.length === 0;

  return (
    <div
      data-testid="poll-text-responses"
      className={`flex-1 flex flex-col font-${fontFamily}`}
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {empty ? (
        <p
          className="flex-1 flex items-center justify-center font-bold text-slate-400"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          No responses yet
        </p>
      ) : kind === 'words' ? (
        <div
          className="flex-1 flex flex-wrap items-center justify-center content-center"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {words.map(({ word, count, weight }) => (
            <span
              key={word}
              title={`${word} (${count})`}
              className={`inline-flex items-center font-black leading-none ${wordClass(word)}`}
              style={{
                fontSize: `clamp(11px, ${(4 + weight * 10).toFixed(2)}cqmin, 72px)`,
              }}
            >
              {word}
              {canModerate && (
                <button // no-tour-anchor: one per word, tours point at the question
                  type="button"
                  onClick={() => onHideWord(word)}
                  aria-label={`Hide ${word}`}
                  className="relative touch-target-expand text-slate-400 hover:text-red-600 transition-colors"
                  style={{ marginLeft: '0.15em' }}
                >
                  <X style={iconStyle} />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <ul
          className="flex flex-col divide-y divide-slate-200"
          aria-label="Responses"
        >
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between text-slate-700 font-semibold wrap-anywhere"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 2cqmin) 0',
                fontSize: 'min(16px, 5cqmin)',
              }}
            >
              <span className="min-w-0">{r.text}</span>
              {canModerate && (
                <button // no-tour-anchor: one per answer, tours point at the question
                  type="button"
                  onClick={() => onHide(`${questionId}:${r.id}`)}
                  aria-label="Hide response"
                  className="relative touch-target-expand shrink-0 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <X style={iconStyle} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canModerate && hiddenCount > 0 && (
        <button
          {...tourAttr('poll.show-hidden', widgetId, widgetType)}
          type="button"
          onClick={onShowHidden}
          className="relative touch-target-expand self-center flex items-center font-bold text-slate-500 hover:text-brand-blue-primary transition-colors"
          style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(12px, 4cqmin)' }}
        >
          <Eye style={iconStyle} />
          Show {hiddenCount} hidden
        </button>
      )}
    </div>
  );
};
