import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';
import { tourAttr, type TourAnchorId } from '@/config/tourAnchors';
import { TeacherPreviewBanner } from './TeacherPreviewBanner';
import {
  STUDENT_INPUT,
  STUDENT_PRIMARY_BUTTON,
  StudentScreenError,
  StudentScreenEyebrow,
  StudentScreenLogo,
  StudentScreenShell,
  StudentScreenTitle,
} from './StudentScreenShell';

interface StudentPinJoinCardProps {
  /** The app or activity name above the title. */
  eyebrow?: string;
  /** Replaces the Join button's label. */
  submitLabel?: string;
  title: string;
  intro: string;
  /** Join-code field, for apps reached without a code in the link. */
  code?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    maxLength?: number;
  };
  codeTourId?: TourAnchorId;
  pin: string;
  onPinChange: (value: string) => void;
  /** Live-tour anchors; pages with no student tour surface leave them off. */
  pinTourId?: TourAnchorId;
  onSubmit: () => void;
  submitTourId?: TourAnchorId;
  busy: boolean;
  error?: string | null;
  /** Shown under the Join button, such as a link back to sign-in. */
  footer?: React.ReactNode;
  /** Teacher preview: the same card under the preview banner, with nothing that works. */
  preview?: boolean;
}

/** The PIN join card every student app shows to a visitor who isn't signed in. */
export const StudentPinJoinCard: React.FC<StudentPinJoinCardProps> = ({
  eyebrow,
  title,
  intro,
  code,
  codeTourId,
  pin,
  onPinChange,
  pinTourId,
  onSubmit,
  submitTourId,
  busy,
  error = null,
  footer,
  preview = false,
  submitLabel,
}) => {
  const { t } = useTranslation();
  const codeId = useId();
  const pinId = useId();
  const ready = pin.trim() !== '' && (!code || code.value.trim() !== '');
  return (
    <StudentScreenShell banner={preview ? <TeacherPreviewBanner /> : undefined}>
      <StudentScreenLogo />
      {eyebrow && <StudentScreenEyebrow>{eyebrow}</StudentScreenEyebrow>}
      <StudentScreenTitle>{title}</StudentScreenTitle>
      <p className="mt-2 text-sm text-slate-600">{intro}</p>
      <StudentScreenError message={error} />
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy && !preview) onSubmit();
        }}
      >
        {code && (
          <>
            <label htmlFor={codeId} className="sr-only">
              {code.placeholder}
            </label>
            <input
              {...(codeTourId ? tourAttr(codeTourId) : {})}
              id={codeId}
              type="text"
              value={code.value}
              onChange={(e) => code.onChange(e.target.value)}
              placeholder={code.placeholder}
              maxLength={code.maxLength}
              readOnly={preview}
              autoCapitalize="characters"
              autoComplete="off"
              className={`${STUDENT_INPUT} uppercase placeholder:normal-case`}
              required
            />
          </>
        )}
        <label htmlFor={pinId} className="sr-only">
          {t('quizStudent.join.pinPlaceholder')}
        </label>
        <input
          {...(pinTourId ? tourAttr(pinTourId) : {})}
          id={pinId}
          type="text"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          placeholder={t('quizStudent.join.pinPlaceholder')}
          inputMode="numeric"
          maxLength={10}
          readOnly={preview}
          autoComplete="off"
          autoFocus={!code && !preview}
          className={STUDENT_INPUT}
          required
        />
        <button
          {...(submitTourId ? tourAttr(submitTourId) : {})}
          type="submit"
          disabled={busy || !ready || preview}
          className={`mt-1 ${STUDENT_PRIMARY_BUTTON}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              {submitLabel ?? t('quizStudent.join.join')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>
      {footer}
    </StudentScreenShell>
  );
};
