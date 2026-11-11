// Review before you submit and Mark for review (docs/plans/QUIZ_MCA_PRACTICE.md M23–M25); marks never leave the student's device.
import React from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MathText } from '@/components/common/MathText';
import { reviewCounts, type ReviewRow } from '@/utils/quizReviewStep';
import { clearAllReviewStates } from '@/utils/quizReviewMarksStore';

const focusCls =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary';

/** Toggle on each question; the student's own reminder to come back. */
export const MarkForReviewButton: React.FC<{
  marked: boolean;
  onToggle: () => void;
}> = ({ marked, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      // no-tour-anchor: student quiz screen; tours walk teachers
      type="button"
      onClick={onToggle}
      aria-pressed={marked}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-bold border transition-colors [-webkit-tap-highlight-color:transparent] ${focusCls} ${
        marked
          ? 'bg-amber-50 border-amber-300 text-amber-800'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800'
      }`}
    >
      <Bookmark
        className={`w-4 h-4 ${marked ? 'fill-amber-400 text-amber-600' : ''}`}
        aria-hidden
      />
      {marked
        ? t('quizReview.marked', 'Marked for review')
        : t('quizReview.mark', 'Mark for review')}
    </button>
  );
};

/** Rendered on the submitted screen, where the question view and its marks have already unmounted. */
export const ReviewMarksCleanup: React.FC<{
  sessionId: string;
  responseKey: string | undefined;
}> = ({ sessionId, responseKey }) => {
  React.useEffect(() => {
    clearAllReviewStates(sessionId, responseKey);
  }, [sessionId, responseKey]);
  return null;
};

/** Shows the review screen in place of the question area, keeping the question markup's indentation. */
export const ReviewSwap: React.FC<{
  review: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}> = ({ review, className, children }) =>
  review != null ? <>{review}</> : <div className={className}>{children}</div>;

const StatusIcon: React.FC<{ status: ReviewRow['status'] }> = ({ status }) =>
  status === 'answered' ? (
    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
  ) : status === 'locked' ? (
    <Lock className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />
  ) : (
    <Circle className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
  );

/** Renders inside the quiz page, so its banners, accommodation bar and clock stay in view. */
export const QuizReviewScreen: React.FC<{
  title: string;
  rows: ReviewRow[];
  onJump: (index: number) => void;
  /** Returns to the last question. */
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  /** The attempt's time-limit clock, when the quiz has one. */
  clock?: React.ReactNode;
  /** Raise hand, when the teacher turned it on. */
  footer?: React.ReactNode;
}> = ({
  title,
  rows,
  onJump,
  onBack,
  onSubmit,
  submitting,
  error,
  clock,
  footer,
}) => {
  const { t } = useTranslation();
  const counts = reviewCounts(rows);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const statusText = (status: ReviewRow['status']) =>
    status === 'answered'
      ? t('quizReview.answered', 'Answered')
      : status === 'locked'
        ? t('quizReview.locked', 'Locked')
        : t('quizReview.unanswered', 'Not answered');
  const summary = [
    t('quizReview.countAnswered', '{{count}} answered', {
      count: counts.answered,
    }),
    counts.unanswered > 0 &&
      t('quizReview.countUnanswered', '{{count}} not answered', {
        count: counts.unanswered,
      }),
    counts.marked > 0 &&
      t('quizReview.countMarked', '{{count}} marked', {
        count: counts.marked,
      }),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="flex flex-col min-h-full">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 flex flex-col gap-5 flex-1">
        <div className="flex items-center gap-2">
          <button
            // no-tour-anchor: student quiz screen; tours walk teachers
            type="button"
            onClick={onBack}
            aria-label={t('quizReview.backToLast', 'Back to the last question')}
            className={`p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 ${focusCls}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="flex-1 min-w-0 text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
            {title}
          </p>
          {clock}
        </div>
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-black text-slate-900 focus:outline-hidden"
          >
            {t('quizReview.title', 'Review before you submit')}
          </h1>
          <p className="mt-1 text-sm text-slate-600" aria-live="polite">
            {summary}
          </p>
        </div>
        <ol className="flex flex-col gap-2">
          {rows.map((row) => {
            const locked = row.status === 'locked';
            const label = [
              t('quizReview.questionN', 'Question {{n}}', { n: row.index + 1 }),
              statusText(row.status),
              row.marked && t('quizReview.markedShort', 'marked for review'),
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <li key={row.id}>
                <button
                  // no-tour-anchor: student quiz screen; tours walk teachers
                  type="button"
                  onClick={() => onJump(row.index)}
                  disabled={locked}
                  aria-label={label}
                  className={`w-full min-h-[56px] flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors [-webkit-tap-highlight-color:transparent] ${focusCls} ${
                    locked
                      ? 'bg-slate-50 border-slate-200 cursor-default'
                      : row.status === 'unanswered'
                        ? 'bg-white border-amber-300 hover:border-amber-400'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="w-8 shrink-0 text-sm font-black text-slate-500 tabular-nums">
                    {row.index + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-slate-800 line-clamp-2">
                    <MathText text={row.text} />
                  </span>
                  {row.marked && (
                    <Bookmark
                      className="w-4 h-4 shrink-0 fill-amber-400 text-amber-600"
                      aria-hidden
                    />
                  )}
                  <span className="hidden sm:inline text-xs font-bold text-slate-500 shrink-0">
                    {statusText(row.status)}
                  </span>
                  <StatusIcon status={row.status} />
                </button>
              </li>
            );
          })}
        </ol>
        {footer && <div className="flex justify-center">{footer}</div>}
      </div>
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-slate-200">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-3 flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm font-bold text-red-700">
              {error}
            </p>
          )}
          <button
            // no-tour-anchor: student quiz screen; tours walk teachers
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className={`w-full py-4 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${focusCls}`}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {t('quizReview.submit', 'SUBMIT QUIZ')}{' '}
                <CheckCircle2 className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
