import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpeakLanguage } from '@/types';
import { speakSoundName } from '@/config/pronunciationSoundNames';
import { cx } from '../playerUtils';
import type { LetterSegment, SpeakMark } from './speakJudge';

interface SpeakMarksProps {
  segments: LetterSegment[] | null;
  marks: SpeakMark[];
  language: SpeakLanguage;
  dark: boolean;
}

const KIND_KEY: Record<SpeakMark['kind'], string> = {
  changed: 'flashcards.speak.verdict.markChanged',
  missed: 'flashcards.speak.verdict.markMissed',
  extra: 'flashcards.speak.verdict.markExtra',
};

// Shape carries the meaning (G16): wavy for changed, struck through for missed, a plus for extra.
const SHAPE: Record<SpeakMark['kind'], string> = {
  changed: 'underline decoration-wavy underline-offset-[0.2em]',
  missed: 'line-through decoration-[0.12em]',
  extra: '',
};

const tone = (mark: SpeakMark, dark: boolean): string => {
  if (!mark.emphasised) {
    return dark
      ? 'decoration-white/45 text-white'
      : 'decoration-slate-400 text-slate-900';
  }
  if (mark.forgiven) {
    return dark
      ? 'decoration-emerald-300 text-emerald-100'
      : 'decoration-emerald-700 text-emerald-900';
  }
  return dark
    ? 'decoration-rose-300 text-rose-100'
    : 'decoration-rose-700 text-rose-900';
};

/** §4.5 item 4: the term's letters with each changed, missed or extra sound marked; tap one for a plain hint. */
export const SpeakMarks: React.FC<SpeakMarksProps> = ({
  segments,
  marks,
  language,
  dark,
}) => {
  const { t, i18n } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  if (marks.length === 0) return null;
  const sound = (mark: SpeakMark) =>
    speakSoundName(language, mark.token, i18n.language);
  const label = (mark: SpeakMark) =>
    `${t(KIND_KEY[mark.kind])}: ${sound(mark).name}`;
  const open = marks.find((mark) => mark.id === openId) ?? null;
  const toggle = (mark: SpeakMark) =>
    setOpenId((current) => (current === mark.id ? null : mark.id));

  const extraButton = (mark: SpeakMark) => (
    // no-tour-anchor: student player
    <button
      key={`extra-${mark.id}`}
      type="button"
      onClick={() => toggle(mark)}
      aria-label={label(mark)}
      aria-expanded={openId === mark.id}
      title={t('flashcards.speak.verdict.showHint')}
      className={cx(
        'touch-target-expand mx-[0.05em] inline-flex items-center justify-center rounded-full border align-super font-black leading-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
        mark.emphasised
          ? dark
            ? 'border-rose-300 text-rose-100'
            : 'border-rose-700 text-rose-800'
          : dark
            ? 'border-white/40 text-white/80'
            : 'border-slate-400 text-slate-600'
      )}
      style={{
        width: '0.9em',
        height: '0.9em',
        fontSize: '0.5em',
      }}
    >
      +
    </button>
  );

  return (
    <div className="w-full">
      <p
        className={cx(
          'font-black uppercase tracking-widest',
          dark ? 'text-white/70' : 'text-slate-600'
        )}
        style={{ fontSize: 'min(10px, 2.7cqmin)' }}
      >
        {t('flashcards.speak.verdict.marksLabel')}
      </p>
      {segments ? (
        <p
          lang={language}
          className="font-black leading-tight wrap-anywhere"
          style={{
            marginTop: 'min(6px, 1.4cqmin)',
            paddingBottom: '0.2em',
            fontSize: 'clamp(22px, 7.5cqmin, 40px)',
          }}
        >
          {segments.map((segment, index) => {
            const mark =
              segment.marks.find((m) => m.emphasised) ?? segment.marks[0];
            return (
              <React.Fragment key={index}>
                {mark ? (
                  // no-tour-anchor: student player
                  <button
                    type="button"
                    onClick={() => toggle(mark)}
                    aria-label={label(mark)}
                    aria-expanded={openId === mark.id}
                    title={t('flashcards.speak.verdict.showHint')}
                    className={cx(
                      'rounded-md font-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
                      SHAPE[mark.kind],
                      mark.emphasised
                        ? 'decoration-[0.1em]'
                        : 'decoration-[0.06em]',
                      tone(mark, dark)
                    )}
                  >
                    {segment.text}
                  </button>
                ) : (
                  <span>{segment.text}</span>
                )}
                {segment.extras.map(extraButton)}
              </React.Fragment>
            );
          })}
        </p>
      ) : (
        <ul
          className="flex flex-wrap justify-center"
          style={{ marginTop: 'min(6px, 1.4cqmin)', gap: 'min(6px, 1.4cqmin)' }}
        >
          {marks.map((mark) => (
            <li key={mark.id}>
              {/* no-tour-anchor: student player */}
              <button
                type="button"
                onClick={() => toggle(mark)}
                aria-expanded={openId === mark.id}
                className={cx(
                  'rounded-lg border font-bold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300',
                  mark.emphasised
                    ? dark
                      ? 'border-rose-300/60 text-white'
                      : 'border-rose-300 text-rose-950'
                    : dark
                      ? 'border-white/20 text-white/85'
                      : 'border-slate-300 text-slate-700'
                )}
                style={{
                  padding: 'min(6px, 1.4cqmin) min(10px, 2.3cqmin)',
                  fontSize: 'min(12px, 3.2cqmin)',
                }}
              >
                {label(mark)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div
          role="note"
          aria-label={t('flashcards.speak.verdict.showHint')}
          className={cx(
            'mx-auto max-w-md text-center',
            dark ? 'text-white/90' : 'text-slate-800'
          )}
          style={{
            marginTop: 'min(10px, 2.3cqmin)',
            fontSize: 'min(13px, 3.4cqmin)',
          }}
        >
          <p className="font-black">
            {sound(open).example
              ? t('flashcards.speak.verdict.soundAsIn', {
                  name: sound(open).name,
                  example: sound(open).example,
                })
              : sound(open).name}
          </p>
          {sound(open).known && (
            <p style={{ marginTop: 'min(3px, .7cqmin)' }}>{sound(open).hint}</p>
          )}
        </div>
      )}
    </div>
  );
};
