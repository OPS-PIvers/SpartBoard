import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { TourDialog } from '@/components/tours/TourDialog';
import { primaryBtn, secondaryBtn } from '@/components/tours/tourButtons';
import { requestStartTour, useTourRunning } from '@/components/tours/tourState';
import { useCanRunLiveTour } from '@/components/tours/useCanRunLiveTour';
import { useShowSparty } from '@/components/sparty/useShowSparty';
import { GETTING_STARTED_PATH } from '@/config/gettingStarted';
import { useAuth } from '@/context/useAuth';
import { useFirstRun } from '@/hooks/useFirstRun';
import { useGettingStarted } from '@/hooks/useGettingStarted';
import { incrementHelpOpenCount } from '@/hooks/useHelpResources';
import { dismissWelcome } from '@/utils/gettingStartedProgress';
import { spaNavigate } from '@/utils/plcPath';

/** A brand-new teacher's Sparty welcome on the board: Start runs the first Essentials tour, Later puts it away for good (D1, D5, D6). */
export const GettingStartedWelcome: React.FC = () => {
  const { user } = useAuth();
  const { welcomePending } = useFirstRun();
  // At phone width it waits for the first sign-in on a bigger screen (D6).
  const canRun = useCanRunLiveTour();
  const tourRunning = useTourRunning();
  const [answered, setAnswered] = useState(false);
  if (!user || !welcomePending || !canRun || tourRunning || answered)
    return null;
  return <WelcomeCard uid={user.uid} onAnswer={() => setAnswered(true)} />;
};

const WelcomeCard: React.FC<{ uid: string; onAnswer: () => void }> = ({
  uid,
  onAnswer,
}) => {
  const { t } = useTranslation();
  const showSparty = useShowSparty();
  const { loading, nextEssential } = useGettingStarted();
  // Waits for the list so Start knows which tour comes first.
  if (loading) return null;

  const start = () => {
    onAnswer();
    void dismissWelcome(uid);
    if (nextEssential) {
      void incrementHelpOpenCount(nextEssential.itemId);
      requestStartTour({
        setId: nextEssential.setId,
        chain: 'getting-started',
      });
    } else {
      spaNavigate(GETTING_STARTED_PATH);
    }
  };
  const later = () => {
    onAnswer();
    void dismissWelcome(uid);
  };

  return createPortal(
    <div
      data-tour-ignore=""
      data-click-outside-ignore="true"
      onClick={(e) => e.stopPropagation()}
      className="contents"
    >
      <TourDialog
        title={t('gettingStarted.welcomeTitle', {
          defaultValue: 'Welcome to SpartBoard',
        })}
        body={t('gettingStarted.welcomeBody', {
          defaultValue:
            "Let's set up your board together. It takes about 8 minutes, and you can stop any time.",
        })}
        sparty={showSparty ? 'wave' : undefined}
      >
        {/* no-tour-anchor: the welcome shows once, before any tour */}
        <button
          type="button"
          data-testid="getting-started-welcome-later"
          className={secondaryBtn}
          onClick={later}
        >
          {t('gettingStarted.later', { defaultValue: 'Later' })}
        </button>
        {/* no-tour-anchor: the welcome shows once, before any tour */}
        <button
          type="button"
          data-autofocus=""
          data-testid="getting-started-welcome-start"
          className={primaryBtn}
          onClick={start}
        >
          {t('gettingStarted.welcomeStart', { defaultValue: 'Start' })}
        </button>
      </TourDialog>
    </div>,
    document.body
  );
};
