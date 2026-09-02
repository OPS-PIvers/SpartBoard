import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, ShieldCheck, X } from 'lucide-react';

/**
 * Minn. Stat. § 13.04 subd. 2 Tennessen warning, shown once per assignment
 * before any recording UI mounts and before the mic is ever probed. All four
 * required elements appear: purpose, whether the student may refuse, what
 * happens if they do, and who else receives the recording.
 */
export const RecordingConsentNotice: React.FC<{
  onAcknowledge: () => void;
  busy?: boolean;
  /** 'reminder' is the re-read overlay: it closes, it never re-acknowledges. */
  variant?: 'acknowledge' | 'reminder';
  /** The live (teacher-paced) quiz shell is dark; the self-paced one is light. */
  light?: boolean;
}> = ({
  onAcknowledge,
  busy = false,
  variant = 'acknowledge',
  light = true,
}) => {
  const { t } = useTranslation();

  const elements: { key: string; label: string; body: string }[] = [
    {
      key: 'purpose',
      label: t('quizMediaResponse.notice.purposeLabel'),
      body: t('quizMediaResponse.notice.purposeBody'),
    },
    {
      key: 'refuse',
      label: t('quizMediaResponse.notice.refuseLabel'),
      body: t('quizMediaResponse.notice.refuseBody'),
    },
    {
      key: 'consequence',
      label: t('quizMediaResponse.notice.consequenceLabel'),
      body: t('quizMediaResponse.notice.consequenceBody'),
    },
    {
      key: 'recipients',
      label: t('quizMediaResponse.notice.recipientsLabel'),
      body: t('quizMediaResponse.notice.recipientsBody'),
    },
  ];

  return (
    <section
      aria-labelledby="recording-notice-heading"
      className={`rounded-3xl border p-6 shadow-sm backdrop-blur-sm ${
        light
          ? 'border-slate-200 bg-white/90'
          : 'border-slate-700 bg-slate-800/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            light
              ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
              : 'bg-brand-blue-light/25 text-brand-blue-lighter'
          }`}
        >
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h3
            id="recording-notice-heading"
            className={`text-lg font-bold leading-snug ${
              light ? 'text-slate-900' : 'text-white'
            }`}
          >
            {t('quizMediaResponse.notice.title')}
          </h3>
          <p
            className={`mt-1 text-sm ${light ? 'text-slate-600' : 'text-slate-300'}`}
          >
            {t('quizMediaResponse.notice.intro')}
          </p>
        </div>
      </div>

      <dl className="mt-5 space-y-4">
        {elements.map((el) => (
          <div key={el.key}>
            <dt
              className={`text-xs font-bold uppercase tracking-wider ${
                light ? 'text-slate-500' : 'text-slate-300'
              }`}
            >
              {el.label}
            </dt>
            <dd
              className={`mt-1 text-sm leading-relaxed ${
                light ? 'text-slate-700' : 'text-slate-200'
              }`}
            >
              {el.body}
            </dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onAcknowledge}
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {variant === 'reminder' ? (
          <X aria-hidden className="h-4 w-4" />
        ) : (
          <Mic aria-hidden className="h-4 w-4" />
        )}
        {variant === 'reminder'
          ? t('quizMediaResponse.notice.close')
          : t('quizMediaResponse.notice.acknowledge')}
      </button>
    </section>
  );
};

/** Persistent "why we're asking" link that stays on the recorder itself. */
export const RecordingNoticeReminder = React.forwardRef<
  HTMLButtonElement,
  { onOpen: () => void; disabled?: boolean; light?: boolean }
>(({ onOpen, disabled = false, light = true }, ref) => {
  const { t } = useTranslation();
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={`rounded-lg text-xs font-semibold underline underline-offset-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:no-underline ${
        light
          ? 'text-brand-blue-primary hover:text-brand-blue-dark focus-visible:outline-brand-blue-primary disabled:text-slate-500'
          : 'text-brand-blue-lighter hover:text-white focus-visible:outline-brand-blue-lighter disabled:text-slate-400'
      }`}
    >
      {t('quizMediaResponse.notice.whyLink')}
    </button>
  );
});

RecordingNoticeReminder.displayName = 'RecordingNoticeReminder';
