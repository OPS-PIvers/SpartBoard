// A published tour read as steps beside the website (docs/plans/shipped/TOURS_10X.md S4).
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Link2, Pencil, Play, RefreshCw } from 'lucide-react';
import {
  chromeMuted,
  focusRing,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { StepsView } from '@/components/tours/steps/StepsView';
import { STEPS_LABELS_EN } from '@/components/tours/steps/stepsModel';
import { publicTourLink, webToursUrl } from '../appOrigin';
import type { ListedTour } from '../tourList';
import type { TourStepsReply } from '../tourSteps';
import { FAILURE_TEXT } from './failureText';

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

const STEPS_FAILURE_TEXT = {
  ...FAILURE_TEXT,
  offline: "The steps couldn't load. Check your connection and try again.",
};

const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

export const TourStepsPane: React.FC<{
  tour: ListedTour;
  onBack: () => void;
  onStart: () => void;
  starting: boolean;
  /** Another tour is starting, so this one waits. */
  disabled: boolean;
  /** Admins can open the tour in the editor. */
  admin?: boolean;
}> = ({ tour, onBack, onStart, starting, disabled, admin = false }) => {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [read, setRead] = useState<{
    id: string;
    attempt: number;
    reply: TourStepsReply;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    send<TourStepsReply>({ type: 'tours/steps', setId: tour.id }).then(
      (reply) => {
        if (!cancelled)
          setRead({
            id: tour.id,
            attempt,
            reply: reply ?? { ok: false, why: 'offline' },
          });
      },
      () => {
        if (!cancelled)
          setRead({
            id: tour.id,
            attempt,
            reply: { ok: false, why: 'offline' },
          });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tour.id, attempt]);
  const reply =
    read?.id === tour.id && read.attempt === attempt ? read.reply : null;
  const steps = reply?.ok ? reply.tour : null;
  const title = steps?.title || tour.title || 'Untitled tour';
  const link = steps?.link ? publicTourLink(steps.link) : null;

  useEffect(() => {
    if (copied === 'idle') return;
    const timer = window.setTimeout(() => setCopied('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-8" data-testid="tour-steps-pane">
      <button
        type="button"
        onClick={onBack}
        className={`-ml-2 inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-200/60 ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All tours
      </button>
      <header className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold wrap-anywhere">{title}</h2>
          <p className={`text-xs ${chromeMuted}`}>
            {tour.host} · {tour.steps === 1 ? '1 step' : `${tour.steps} steps`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${primaryBtn} inline-flex items-center justify-center gap-1.5 ${disabledLook}`}
            disabled={disabled}
            onClick={onStart}
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            {starting ? 'Starting...' : 'Start tour'}
          </button>
          {link && (
            <button
              type="button"
              className={`${secondaryBtn} inline-flex items-center gap-1.5 border border-slate-200`}
              onClick={() => void copyLink()}
            >
              {copied === 'done' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              {copied === 'done' ? 'Link copied' : 'Copy link'}
            </button>
          )}
          {admin && (
            <button
              type="button"
              className={`${secondaryBtn} inline-flex items-center gap-1.5 border border-slate-200`}
              onClick={() =>
                void chrome.tabs.create({ url: webToursUrl(tour.id) })
              }
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit tour
            </button>
          )}
        </div>
        {copied === 'failed' && (
          <p role="alert" className="text-brand-red-primary">
            {"The link couldn't be copied. Try again."}
          </p>
        )}
        <span className="sr-only" aria-live="polite">
          {copied === 'done' ? 'Link copied' : ''}
        </span>
      </header>
      {reply && !reply.ok ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-slate-700">{STEPS_FAILURE_TEXT[reply.why]}</p>
          {reply.why === 'offline' && (
            <button
              type="button"
              className={`${secondaryBtn} -ml-3 inline-flex items-center gap-1.5`}
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      ) : (
        <StepsView
          steps={steps?.steps ?? []}
          pictures={steps?.pictures ?? {}}
          labels={STEPS_LABELS_EN}
          loading={!reply}
        />
      )}
    </div>
  );
};
