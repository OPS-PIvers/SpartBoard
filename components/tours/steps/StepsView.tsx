import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { focusRing } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { StepsArticle } from './StepsArticle';
import type { StepPictures, StepsLabels, StepsViewStep } from './stepsModel';

export type StepsMode = 'steps' | 'walkthrough';

/** What a Walk through mode is given; `StepsWalkthrough` is the one the app uses. */
export interface WalkthroughProps {
  steps: readonly StepsViewStep[];
  pictures: StepPictures;
  labels: StepsLabels;
  onExit: () => void;
  renderText?: (text: string) => React.ReactNode;
  renderMarkup?: (step: StepsViewStep) => React.ReactNode;
}

const segment = (on: boolean) =>
  `min-h-11 rounded-md px-4 text-sm font-semibold sm:min-h-9 ${focusRing} ${
    on
      ? 'bg-white text-slate-900 shadow-xs'
      : 'text-slate-600 hover:text-slate-900'
  }`;

const Skeleton: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" aria-label={label} className="flex flex-col gap-10">
    {[0, 1].map((n) => (
      <div
        key={n}
        className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none"
      >
        <div className="h-3 w-16 rounded-sm bg-slate-200" />
        <div className="h-5 w-2/3 rounded-sm bg-slate-200" />
        <div className="h-4 w-full rounded-sm bg-slate-100" />
        <div className="aspect-video w-full rounded-xl bg-slate-100" />
      </div>
    ))}
  </div>
);

/** What prints: the article alone, on its own page-sized layer, so no app chrome comes with it. */
const PrintCopy: React.FC<{
  heading: { title: string; subtitle?: string };
  onDone: () => void;
  children: React.ReactNode;
}> = ({ heading, onDone, children }) => {
  const done = useEffectEvent(onDone);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('steps-printing');
    const finish = () => done();
    window.addEventListener('afterprint', finish);
    const timer = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      root.classList.remove('steps-printing');
    };
  }, []);
  return createPortal(
    <div data-steps-print="" className="bg-white p-0 text-slate-900">
      <h1 className="text-2xl font-semibold wrap-break-word">
        {heading.title}
      </h1>
      {heading.subtitle && (
        <p className="mt-1 text-sm text-slate-600">{heading.subtitle}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>,
    document.body
  );
};

/** A tour read without running it: every step as an article that prints, or one picture at a time with the tour's own bar and tip. */
export const StepsView: React.FC<{
  steps: readonly StepsViewStep[];
  pictures: StepPictures;
  labels: StepsLabels;
  /** The steps are still on their way. */
  loading?: boolean;
  /** The Walk through mode; left out where the tour's chrome isn't bundled (the extension's side panel). */
  walkthrough?: React.ComponentType<WalkthroughProps>;
  /** Names the printed page; leave out where printing isn't possible. */
  print?: { title: string; subtitle?: string };
  initialMode?: StepsMode;
  /** Words with their own markup, as Live tour tips have. */
  renderText?: (text: string) => React.ReactNode;
  /** Picture markup drawn over each step's picture. */
  renderMarkup?: (step: StepsViewStep) => React.ReactNode;
}> = ({
  steps,
  pictures,
  labels,
  loading = false,
  walkthrough: Walkthrough,
  print,
  initialMode = 'steps',
  renderText,
  renderMarkup,
}) => {
  const [asked, setMode] = useState<StepsMode>(initialMode);
  const [printing, setPrinting] = useState(false);
  const mode = Walkthrough ? asked : 'steps';
  const ready = steps.length > 0;
  const article = (
    <StepsArticle
      steps={steps}
      pictures={pictures}
      labels={labels}
      renderText={renderText}
      renderMarkup={renderMarkup}
    />
  );

  return (
    <div data-testid="steps-view" className="flex min-w-0 flex-col gap-5">
      {ready && (Walkthrough !== undefined || print !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          {Walkthrough ? (
            <div
              role="group"
              aria-label={labels.viewLabel}
              className="inline-flex rounded-lg bg-slate-900/5 p-1"
            >
              <button
                type="button"
                aria-pressed={mode === 'steps'}
                onClick={() => setMode('steps')}
                className={segment(mode === 'steps')}
                {...tourAttr('steps-view.mode-steps')}
              >
                {labels.article}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'walkthrough'}
                onClick={() => setMode('walkthrough')}
                className={segment(mode === 'walkthrough')}
                {...tourAttr('steps-view.mode-walkthrough')}
              >
                {labels.walkthrough}
              </button>
            </div>
          ) : (
            <span />
          )}
          {print && (
            <button
              type="button"
              onClick={() => setPrinting(true)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter sm:min-h-9 ${focusRing}`}
              {...tourAttr('steps-view.print')}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {labels.print}
            </button>
          )}
        </div>
      )}
      {loading && !ready ? (
        <Skeleton label={labels.loading} />
      ) : !ready ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {labels.empty}
        </p>
      ) : Walkthrough && mode === 'walkthrough' ? (
        <Walkthrough
          steps={steps}
          pictures={pictures}
          labels={labels}
          onExit={() => setMode('steps')}
          renderText={renderText}
          renderMarkup={renderMarkup}
        />
      ) : (
        article
      )}
      {printing && print && (
        <PrintCopy heading={print} onDone={() => setPrinting(false)}>
          {article}
        </PrintCopy>
      )}
    </div>
  );
};
