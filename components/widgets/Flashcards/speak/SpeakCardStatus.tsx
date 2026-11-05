// Per-card Speak status, Hear it and the Advanced IPA override (docs/multilingual-pronunciation-engine.md F11).
import React, { useId, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MinusCircle,
  Plus,
  Volume2,
  X,
} from 'lucide-react';
import type { FlashcardCard, FlashcardCardSpeak, SpeakDialect } from '@/types';
import {
  hearIt,
  hearItVoice,
  subscribeVoices,
} from '@/utils/pronunciation/hearIt';
import { parseFlashcardAnswerVariants } from '@/utils/flashcardMatch';
import { tourFieldAttr } from '@/config/tourAnchors';
import { hearIpa } from '@/utils/pronunciation/hearIpa';
import {
  MAX_IPA_READINGS,
  filledIpaReadings,
  ipaReadingsOf,
  type SpeakIpaOverride,
} from '@/utils/pronunciation/ipaReadings';
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
  /** The teacher's IPA; when set, a voice reads the term that way. */
  ipa?: string;
  /** Icon only, for the button beside an IPA box. */
  compact?: boolean;
}> = ({ term, dialect, fieldKey, srSuffix, ipa, compact }) => {
  const { t } = useTranslation();
  const hasVoice = useHasVoice(dialect);
  const [failed, setFailed] = useState(false);
  const word = parseFlashcardAnswerVariants(term)[0] ?? '';
  const typed = ipa?.trim() && ipaOverrideValid(ipa) ? ipa.trim() : undefined;
  if (!dialect || !word.trim() || (!typed && !hasVoice)) return null;
  const label = t('flashcards.speak.editor.hearIt');
  const play = () => {
    setFailed(false);
    if (!typed) {
      hearIt(word, dialect);
      return;
    }
    void hearIpa({ dialect, ipa: typed, term: word }).then((ok) =>
      setFailed(!ok)
    );
  };
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 'min(4px, 1cqmin)' }}
    >
      <button
        type="button"
        onClick={play}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        className="inline-flex items-center rounded-lg font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        style={{
          ...TEXT_STYLE,
          gap: 'min(4px, 1cqmin)',
          padding: 'min(3px, 0.8cqmin) min(6px, 1.5cqmin)',
        }}
        {...(compact
          ? tourFieldAttr(
              'flashcards-speak-editor.ipa-hear-it',
              'flashcards',
              fieldKey
            )
          : tourFieldAttr(
              'flashcards-speak-editor.hear-it',
              'flashcards',
              fieldKey
            ))}
      >
        <Volume2 aria-hidden="true" style={ICON_STYLE} />
        {!compact && label}
        {srSuffix && <span className="sr-only"> {srSuffix}</span>}
      </button>
      {failed && (
        <span
          role="status"
          className="font-bold text-rose-700"
          style={TEXT_STYLE}
        >
          {t('flashcards.speak.editor.hearIpaFailed')}
        </span>
      )}
    </span>
  );
};

interface SpeakCardRowProps {
  card: FlashcardCard;
  index: number;
  dialects: readonly SpeakDialect[];
  ipaDraft: SpeakIpaOverride | undefined;
  onIpaChange: (cardId: string, ipa: SpeakIpaOverride) => void;
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
          ipa={filledIpaReadings(ipa[dialects[0]])[0]}
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
            const readings = ipaReadingsOf(ipa[dialect]);
            const boxes = readings.length > 0 ? readings : [''];
            const dialectName = t(
              `flashcards.speak.editor.dialectNames.${dialect}`
            );
            const setReadings = (next: string[]) =>
              onIpaChange(card.id, {
                ...ipa,
                [dialect]: next.length === 1 ? next[0] : next,
              });
            const canAdd =
              boxes.length < MAX_IPA_READINGS &&
              boxes[boxes.length - 1].trim() !== '';
            return (
              <div key={dialect} className="min-w-0">
                <span
                  id={`${panelId}-${dialect}-label`}
                  className="font-bold text-slate-600"
                  style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                >
                  {t('flashcards.speak.editor.ipaLabel', {
                    dialect: dialectName,
                  })}
                </span>
                {boxes.map((value, i) => {
                  const valid = ipaOverrideValid(value);
                  const errorId = `${panelId}-${dialect}-${i}-error`;
                  const boxKey = `${fieldKey}-${dialect}${i === 0 ? '' : `-${i + 1}`}`;
                  return (
                    <div key={i} style={{ marginTop: 'min(4px, 1cqmin)' }}>
                      <div
                        className="flex items-center"
                        style={{ gap: 'min(4px, 1cqmin)' }}
                      >
                        <input
                          value={value}
                          maxLength={200}
                          spellCheck={false}
                          aria-labelledby={`${panelId}-${dialect}-label`}
                          aria-invalid={!valid}
                          aria-describedby={valid ? undefined : errorId}
                          onChange={(event) =>
                            setReadings(
                              boxes.map((v, j) =>
                                j === i ? event.target.value : v
                              )
                            )
                          }
                          className={`min-w-0 flex-1 rounded-lg border bg-white font-mono text-slate-800 outline-hidden focus:ring-2 ${
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
                            boxKey
                          )}
                        />
                        <HearItButton
                          compact
                          term={card.term}
                          dialect={dialect}
                          ipa={value}
                          srSuffix={`${dialectName} ${i + 1}`}
                          fieldKey={boxKey}
                        />
                        {i === 0 && boxes.length > 1 && (
                          <span
                            aria-hidden="true"
                            className="inline-block shrink-0"
                            style={{
                              ...ICON_STYLE,
                              boxSizing: 'content-box',
                              padding: 'min(3px, 0.8cqmin)',
                            }}
                          />
                        )}
                        {i > 0 && (
                          <button
                            type="button"
                            aria-label={t('flashcards.speak.editor.removeIpa')}
                            title={t('flashcards.speak.editor.removeIpa')}
                            onClick={() =>
                              setReadings(boxes.filter((_, j) => j !== i))
                            }
                            className="inline-flex shrink-0 items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            style={{ padding: 'min(3px, 0.8cqmin)' }}
                            {...tourFieldAttr(
                              'flashcards-speak-editor.ipa-remove',
                              'flashcards',
                              boxKey
                            )}
                          >
                            <X aria-hidden="true" style={ICON_STYLE} />
                          </button>
                        )}
                      </div>
                      {!valid && (
                        <span
                          id={errorId}
                          className="mt-1 block font-bold text-rose-700"
                          style={TEXT_STYLE}
                        >
                          {t('flashcards.speak.editor.ipaInvalid')}
                        </span>
                      )}
                    </div>
                  );
                })}
                {canAdd && (
                  <button
                    type="button"
                    onClick={() => setReadings([...boxes, ''])}
                    className="mt-1 inline-flex items-center rounded-lg font-bold text-brand-blue-primary hover:underline"
                    style={{ ...TEXT_STYLE, gap: 'min(2px, 0.5cqmin)' }}
                    {...tourFieldAttr(
                      'flashcards-speak-editor.ipa-add',
                      'flashcards',
                      `${fieldKey}-${dialect}`
                    )}
                  >
                    <Plus aria-hidden="true" style={ICON_STYLE} />
                    {t('flashcards.speak.editor.addIpa')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
