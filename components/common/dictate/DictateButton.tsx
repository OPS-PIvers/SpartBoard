import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2, Mic, MicOff, Square } from 'lucide-react';
import { dictationLanguageLabel } from '@/utils/speechToText/languages';
import type {
  DictationController,
  DictationErrorCode,
} from '@/utils/speechToText/types';

export interface DictateButtonProps {
  controller: DictationController;
  /** `compact` is the icon-only mic for a fill-in-the-blank box. */
  size?: 'full' | 'compact';
  /** Light surface, as in self-paced quizzes and Writing. */
  light?: boolean;
  disabled?: boolean;
}

const FOCUS =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60';
const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';

function errorMessage(code: DictationErrorCode, t: TFunction): string {
  switch (code) {
    case 'mic-blocked':
      return t(
        'dictate.error.micBlocked',
        'Microphone is blocked. Click the icon at the left of the address bar, turn on Microphone, then tap Dictate again.'
      );
    case 'no-mic':
      return t(
        'dictate.error.noMic',
        'No microphone found. Plug in a microphone or headset, then tap Dictate again.'
      );
    case 'network':
      return t(
        'dictate.error.network',
        'Dictate needs the internet. Check your connection, then tap Dictate again.'
      );
    case 'language-unsupported':
      return t(
        'dictate.error.languageUnsupported',
        "Dictate can't hear that language on this device, so it is listening in English."
      );
    default:
      return t(
        'dictate.error.unknown',
        'Dictate stopped. Tap Dictate to start again.'
      );
  }
}

// Keeps the caret in the text box when the button is clicked.
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

/** The student's Dictate control (D4): hidden where the browser can't listen (D6). */
export const DictateButton: React.FC<DictateButtonProps> = ({
  controller,
  size = 'full',
  light = false,
  disabled = false,
}) => {
  const { t } = useTranslation();
  if (!controller.supported) return null;

  const { status, error, language, languages } = controller;
  const active = status !== 'idle';
  const listening = status === 'listening';
  const failed = error !== null && !active;
  const message = error ? errorMessage(error, t) : null;
  const multilingual = languages.length > 1;

  const idleTone = light
    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500';
  const activeTone = light
    ? 'border-brand-red-primary bg-brand-red-primary/10 text-brand-red-primary'
    : 'border-red-300 bg-brand-red-primary/30 text-red-100';
  const failedTone = light
    ? 'border-amber-400 bg-amber-50 text-amber-800 hover:border-amber-500'
    : 'border-amber-300/70 bg-amber-400/15 text-amber-100 hover:border-amber-300';
  const tone = active ? activeTone : failed ? failedTone : idleTone;

  const icon = active ? (
    status === 'starting' ? (
      <Loader2
        aria-hidden
        className="h-5 w-5 animate-spin motion-reduce:animate-none"
      />
    ) : (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-current opacity-25 animate-ping motion-reduce:animate-none"
        />
        <Square aria-hidden className="relative h-3.5 w-3.5 fill-current" />
      </span>
    )
  ) : failed ? (
    <MicOff aria-hidden className="h-5 w-5" />
  ) : (
    <Mic aria-hidden className="h-5 w-5" />
  );

  if (size === 'compact') {
    const label = active
      ? t('dictate.stop', 'Stop dictating')
      : t('dictate.button', 'Dictate');
    const next =
      languages[(languages.indexOf(language) + 1) % languages.length];
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <button /* no-tour-anchor: student Dictate control */
          type="button"
          aria-label={label}
          aria-pressed={active}
          aria-busy={status === 'starting'}
          title={!active && message ? message : label}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={controller.toggle}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors [-webkit-tap-highlight-color:transparent] ${FOCUS} ${DISABLED} ${tone}`}
        >
          {icon}
        </button>
        {multilingual && (
          <button /* no-tour-anchor: student Dictate control */
            type="button"
            aria-label={t('dictate.languageSwitch', {
              defaultValue: 'Dictating in {{language}}. Switch to {{next}}.',
              language: dictationLanguageLabel(language),
              next: dictationLanguageLabel(next),
            })}
            title={dictationLanguageLabel(language)}
            lang={language}
            disabled={disabled}
            onMouseDown={keepFocus}
            onClick={() => controller.setLanguage(next)}
            className={`inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border-2 px-2 text-xs font-bold uppercase transition-colors [-webkit-tap-highlight-color:transparent] ${FOCUS} ${DISABLED} ${idleTone}`}
          >
            {language}
          </button>
        )}
        <span role="status" className="sr-only">
          {listening ? t('dictate.listeningShort', 'Listening') : message}
        </span>
      </span>
    );
  }

  const label =
    status === 'starting'
      ? t('dictate.starting', 'Starting…')
      : listening
        ? t('dictate.listening', 'Listening… tap to stop')
        : t('dictate.button', 'Dictate');

  return (
    <div className="inline-flex max-w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button /* no-tour-anchor: student Dictate control */
          type="button"
          aria-pressed={active}
          aria-busy={status === 'starting'}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={controller.toggle}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition-colors [-webkit-tap-highlight-color:transparent] ${FOCUS} ${DISABLED} ${tone}`}
        >
          {icon}
          <span>{label}</span>
        </button>
        {multilingual && (
          <select /* no-tour-anchor: student Dictate control */
            aria-label={t('dictate.language', 'Dictation language')}
            value={language}
            disabled={disabled}
            onChange={(event) => controller.setLanguage(event.target.value)}
            className={`h-11 rounded-2xl border-2 px-3 text-sm font-semibold ${FOCUS} ${DISABLED} ${idleTone}`}
          >
            {languages.map((code) => (
              <option key={code} value={code} lang={code}>
                {dictationLanguageLabel(code)}
              </option>
            ))}
          </select>
        )}
      </div>
      <p
        role="status"
        className={`text-sm ${message ? '' : 'sr-only'} ${
          light ? 'text-slate-600' : 'text-slate-300'
        }`}
      >
        {message}
      </p>
    </div>
  );
};
