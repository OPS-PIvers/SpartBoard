import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StepsLabels } from './stepsModel';

/** The Steps view's words in the app's language. */
export function useStepsLabels(): StepsLabels {
  const { t } = useTranslation();
  return useMemo<StepsLabels>(
    () => ({
      article: t('tourSteps.article'),
      walkthrough: t('tourSteps.walkthrough'),
      viewLabel: t('tourSteps.viewLabel'),
      print: t('tourSteps.print'),
      stepNumber: (number) => t('tourSteps.stepNumber', { number }),
      onlyIfAppears: t('tourSteps.onlyIfAppears'),
      untitledStep: t('tourSteps.untitledStep'),
      continueOn: (host) => t('tourSteps.continueOn', { host }),
      pictureAlt: (number) => t('tourSteps.pictureAlt', { number }),
      pictureLoading: t('tourSteps.pictureLoading'),
      noPicture: t('tourSteps.noPicture'),
      pictureFailed: t('tourSteps.pictureFailed'),
      empty: t('tourSteps.empty'),
      loading: t('tourSteps.loading'),
    }),
    [t]
  );
}
