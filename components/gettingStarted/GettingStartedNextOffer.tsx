import React from 'react';
import { useTranslation } from 'react-i18next';
import { TourDialog } from '@/components/tours/TourDialog';
import { primaryBtn, secondaryBtn } from '@/components/tours/tourButtons';
import { requestStartTour } from '@/components/tours/tourState';
import { useShowSparty } from '@/components/sparty/useShowSparty';
import { GETTING_STARTED_PATH } from '@/config/gettingStarted';
import {
  gettingStartedNext,
  useGettingStarted,
} from '@/hooks/useGettingStarted';
import { incrementHelpOpenCount } from '@/hooks/useHelpResources';
import { spaNavigate } from '@/utils/plcPath';

interface Props {
  /** The Getting Started tour that just finished. */
  finishedSetId: string;
  onClose: () => void;
}

/** The end of a Getting Started tour: the next Essentials tour, or Next steps once they're all done (D1, D8). */
export const GettingStartedNextOffer: React.FC<Props> = ({
  finishedSetId,
  onClose,
}) => {
  const { t } = useTranslation();
  const showSparty = useShowSparty();
  const { loading, essentials, nextSteps } = useGettingStarted();
  const next = gettingStartedNext(essentials, nextSteps, finishedSetId);

  const startNext = () => {
    if (next.kind !== 'tour') return;
    onClose();
    void incrementHelpOpenCount(next.tour.itemId);
    requestStartTour({ setId: next.tour.setId, chain: 'getting-started' });
  };
  const openNextSteps = () => {
    onClose();
    spaNavigate(GETTING_STARTED_PATH);
  };

  const title =
    next.kind === 'next-steps'
      ? t('gettingStarted.essentialsDoneTitle', {
          defaultValue: "You've finished the essentials",
        })
      : t('tours.completeTitle');
  const body =
    next.kind === 'tour'
      ? t('gettingStarted.upNext', {
          defaultValue: 'Up next: {{title}}',
          title: next.tour.item.title,
        })
      : next.kind === 'next-steps'
        ? t('gettingStarted.nextStepsOffer', {
            defaultValue: 'Next steps are there whenever you want them.',
          })
        : '';

  // Waits for the list so focus lands on the right button when the card opens.
  if (loading) return null;
  return (
    <TourDialog
      title={title}
      body={body}
      sparty={showSparty ? 'cheer' : undefined}
    >
      {next.kind === 'tour' && (
        // no-tour-anchor: the tour's own closing card, never a tour target
        <button
          type="button"
          data-autofocus=""
          data-testid="getting-started-next"
          className={primaryBtn}
          onClick={startNext}
        >
          {t('gettingStarted.startNext', { defaultValue: 'Start' })}
        </button>
      )}
      {next.kind === 'next-steps' && (
        // no-tour-anchor: the tour's own closing card, never a tour target
        <button
          type="button"
          data-autofocus=""
          data-testid="getting-started-next-steps"
          className={primaryBtn}
          onClick={openNextSteps}
        >
          {t('gettingStarted.seeNextSteps', {
            defaultValue: 'See Next steps',
          })}
        </button>
      )}
      {/* no-tour-anchor: the tour's own closing card, never a tour target */}
      <button
        type="button"
        data-autofocus={next.kind === 'none' ? '' : undefined}
        data-testid="getting-started-later"
        className={next.kind === 'none' ? primaryBtn : secondaryBtn}
        onClick={onClose}
      >
        {next.kind === 'none'
          ? t('tours.done')
          : t('gettingStarted.later', { defaultValue: 'Later' })}
      </button>
    </TourDialog>
  );
};
