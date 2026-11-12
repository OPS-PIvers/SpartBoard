import React from 'react';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { StepPicture } from './StepPicture';
import type { StepPictures, StepsLabels, StepsViewStep } from './stepsModel';

/** Every step in order, each with its title, tip and picture; prints one step to a block. */
export const StepsArticle: React.FC<{
  steps: readonly StepsViewStep[];
  pictures: StepPictures;
  labels: StepsLabels;
  renderText?: (text: string) => React.ReactNode;
  renderMarkup?: (step: StepsViewStep) => React.ReactNode;
}> = ({ steps, pictures, labels, renderText, renderMarkup }) => (
  <ol data-testid="steps-article" className="flex flex-col gap-10 print:block">
    {steps.map((step, i) => {
      const title = step.title.trim();
      const text = step.text.trim();
      return (
        <li
          key={step.id}
          data-testid="steps-article-step"
          className="flex min-w-0 flex-col gap-3 print:mb-8 print:break-inside-avoid"
        >
          <header className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <span>{labels.stepNumber(i + 1)}</span>
              {step.onlyIfAppears && (
                <span
                  data-testid="steps-only-if"
                  className="font-medium normal-case tracking-normal"
                >
                  {labels.onlyIfAppears}
                </span>
              )}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-slate-900 wrap-break-word">
              {title || labels.untitledStep}
            </h2>
          </header>
          {text && (
            <p className="whitespace-pre-line text-sm/6 text-slate-700 wrap-break-word">
              {(renderText ?? renderStepText)(text)}
            </p>
          )}
          <StepPicture
            step={step}
            index={i}
            state={pictures[step.id]}
            labels={labels}
            markup={renderMarkup?.(step)}
          />
        </li>
      );
    })}
  </ol>
);
