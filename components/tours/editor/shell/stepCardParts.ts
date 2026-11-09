import { inputLight } from '@/components/common/lightChrome';

export const cardInput = `w-full rounded-lg px-2.5 py-1.5 text-sm font-normal ${inputLight}`;
export const cardLabel =
  'flex flex-col gap-1 text-xs font-semibold text-slate-600';

/** Id of a step's Title field, so Write text can focus it. */
export const stepTitleFieldId = (stepId: string) => `tour-step-title-${stepId}`;

/** Focuses a step's Title field once its card has rendered. */
export const focusStepTitle = (stepId: string): void => {
  requestAnimationFrame(() =>
    document.getElementById(stepTitleFieldId(stepId))?.focus()
  );
};
