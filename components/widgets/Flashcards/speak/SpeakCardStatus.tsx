// Per-card Speak status, Hear it and the Advanced IPA override (docs/multilingual-pronunciation-engine.md F11).
import React, { useId, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MinusCircle,
  Volume2,
} from 'lucide-react';
import type { FlashcardCard, FlashcardCardSpeak, SpeakDialect } from '@/types';
import {
  hearIt,
  hearItVoice,
  subscribeVoices,
} from '@/utils/pronunciation/hearIt';
import { parseFlashcardAnswerVariants } from '@/utils/flashcardMatch';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ipaOverrideValid, speakForTerm } from './speakEditorState';

const ICON_STYLE = { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' };
const TEXT_STYLE = { fontSize: 'min(11px, 3.5cqmin)' };

/** True when the device has a voice for the dialect; follows the browser's late voice list. */
function useHasVoice(dialect: SpeakDialect | undefined): boolean {
  return useSyncExternalStore(
    subscribeVoices,
    () => (dialect ? hearItVoice(dialect) !== null : false),
    () => false
  );
}

/** The reason line for a flagged card, or null for a ready one. */
function useSpeakReason(speak: FlashcardCardSpeak | undefined) {
  const { t } = useTranslation();
  const reason = speak?.reasons?.[0];
  return reason ? t(`flashcards.speak.editor.reasons.${reason}`) : null;
}

export const SpeakStatusLabel: React.FC<{ speak: FlashcardCardSpeak }> = ({
  speak,
}) => {
  const { t } = useTranslation();
  const reason = useSpeakReason(speak);
  const confirmed = speak.status === 'needs-review' && !!speak.confirmedAt;
  const view =
    speak.status === 'ready' || confirmed
      ? {
          Icon: CheckCircle2,
          text: t('flashcards.speak.editor.status.ready'),
          className: 'text-emerald-700',
        }
      : speak.status === 'needs-review'
        ? {
            Icon: AlertTriangle,
            text: t('flashcards.speak.editor.status.needsReview'),
            className: 'text-amber-700',
          }
        : {
            Icon: MinusCircle,
            text: t('flashcards.speak.editor.status.unavailable'),
            className: 'text-slate-500',
          };
  return (
    <span
      className={`inline-flex items-center font-bold ${view.className}`}
      style={{ ...TEXT_STYLE, gap: 'min(4px, 1cqmin)' }}
      title={confirmed ? undefined : (reason ?? undefined)}
    >
      <view.Icon aria-hidden="true" style={ICON_STYLE} />
      {view.text}
      {reason && !confirmed && <span className="sr-only">: {reason}</span>}
    </span>
  );
};

export const HearItButton: React.FC<{
  term: string;
  dialect: SpeakDialect | undefined;
  fieldKey: string;
  srSuffix?: string;
}> = ({ term, dialect, fieldKey, srSuffix }) => {
  const { t } = useTranslation();
  const hasVoice = useHasVoice(dialect);
  const word = parseFlashcardAnswerVariants(term)[0] ?? '';
  if (!hasVoice || !dialect || !word.trim()) return null;
  const label = t('flashcards.speak.editor.hearIt');
  return (
    <button
      type="button"
      onClick={() => hearIt(word, dialect)}
      className="inline-flex items-center rounded-lg font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      style={{
        ...TEXT_STYLE,
        gap: 'min(4px, 1cqmin)',
        padding: 'min(3px, 0.8cqmin) min(6px, 1.5cqmin)',
      }}
      {...tourFieldAttr(
        'flashcards-speak-editor.hear-it',
        'flashcards',
        fieldKey
      )}
    >
      <Volume2 aria-hidden="true" style={ICON_STYLE} />
      {label}
      {srSuffix && <span className="sr-only"> {srSuffix}</span>}
    </button>
  );
};

interface SpeakCardRowProps {
  card: FlashcardCard;
  index: number;
  dialects: readonly SpeakDialect[];
  ipaDraft: Partial<Record<SpeakDialect, string>> | undefined;
  onIpaChange: (
    cardId: string,
    ipa: Partial<Record<SpeakDialect, string>>
  ) => void;
  onConfirm: (cardId: string) => void;
}

export const SpeakCardRow: React.FC<SpeakCardRowProps> = ({
  card,
  index,
  dialects,
  ipaDraft,
  onIpaChange,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const speak = speakForTerm(card);
  const fieldKey = `row-${index + 1}`;
  const ipa = ipaDraft ?? speak?.ipaOverride ?? {};
  const needsCheck = speak?.status === 'needs-review' && !speak.confirmedAt;

  return (
    <div className="col-span-3 col-start-3 min-w-0">
      <div
        className="flex flex-wrap items-center"
        style={{ columnGap: 'min(10px, 2.5cqmin)', rowGap: 'min(4px, 1cqmin)' }}
      >
        {speak && <SpeakStatusLabel speak={speak} />}
        {needsCheck && (
          <button
            type="button"
            onClick={() => onConfirm(card.id)}
            className="rounded-lg font-bold text-rose-700 hover:bg-rose-50"
            style={{
              ...TEXT_STYLE,
              padding: 'min(3px, 0.8cqmin) min(6px, 1.5cqmin)',
            }}
            {...tourFieldAttr(
              'flashcards-speak-editor.confirm',
              'flashcards',
              fieldKey
            )}
          >
            {t('flashcards.speak.editor.confirm')}
            <span className="sr-only"> {index + 1}</span>
          </button>
        )}
        <HearItButton
          term={card.term}
          dialect={dialects[0]}
          srSuffix={String(index + 1)}
          fieldKey={fieldKey}
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center rounded-lg font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          style={{
            ...TEXT_STYLE,
            gap: 'min(2px, 0.5cqmin)',
            padding: 'min(3px, 0.8cqmin) min(6px, 1.5cqmin)',
          }}
          {...tourFieldAttr(
            'flashcards-speak-editor.card-advanced',
            'flashcards',
            fieldKey
          )}
        >
          {open ? (
            <ChevronDown aria-hidden="true" style={ICON_STYLE} />
          ) : (
            <ChevronRight aria-hidden="true" style={ICON_STYLE} />
          )}
          {t('flashcards.speak.editor.advancedSettings')}
          <span className="sr-only"> {index + 1}</span>
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          className="grid grid-cols-1 [@container(min-width:680px)]:grid-cols-2"
          style={{ gap: 'min(8px, 2cqmin)', marginTop: 'min(6px, 1.5cqmin)' }}
        >
          {dialects.map((dialect) => {
            const value = ipa[dialect] ?? '';
            const valid = ipaOverrideValid(value);
            const errorId = `${panelId}-${dialect}-error`;
            return (
              <label key={dialect} className="min-w-0">
                <span
                  className="font-bold text-slate-600"
                  style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                >
                  {t('flashcards.speak.editor.ipaLabel', {
                    dialect: t(
                      `flashcards.speak.editor.dialectNames.${dialect}`
                    ),
                  })}
                </span>
                <input
                  value={value}
                  maxLength={200}
                  spellCheck={false}
                  aria-invalid={!valid}
                  aria-describedby={valid ? undefined : errorId}
                  onChange={(event) =>
                    onIpaChange(card.id, {
                      ...ipa,
                      [dialect]: event.target.value,
                    })
                  }
                  className={`mt-1 w-full rounded-lg border bg-white font-mono text-slate-800 outline-hidden focus:ring-2 ${
                    valid
                      ? 'border-slate-200 focus:border-rose-400 focus:ring-rose-500/20'
                      : 'border-rose-400 focus:ring-rose-500/20'
                  }`}
                  style={{
                    padding: 'min(6px, 1.5cqmin)',
                    fontSize: 'min(12px, 3.8cqmin)',
                  }}
                  {...tourFieldAttr(
                    'flashcards-speak-editor.ipa',
                    'flashcards',
                    `${fieldKey}-${dialect}`
                  )}
                />
                {!valid && (
                  <span
                    id={errorId}
                    className="mt-1 block font-bold text-rose-700"
                    style={TEXT_STYLE}
                  >
                    {t('flashcards.speak.editor.ipaInvalid')}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
