import React, { useCallback, useRef, useState } from 'react';
import { PresentWindow } from './PresentWindow';
import { PresentScreen, PresentData } from './PresentScreen';
import { PresentControls } from './PresentControls';

interface PresentSessionProps extends PresentData {
  /** True when the live question carries audio or video stimuli. */
  hasMedia: boolean;
  onSavePauseMessage: (message: string) => void;
  onBlocked: () => void;
  onExit: () => void;
}

/**
 * Owns everything that lives only for the duration of one presentation.
 * Mounting it fresh is what makes the names toggle reset to off each time —
 * a review game must never leave names on for the assessment that follows.
 */
export const PresentSession: React.FC<PresentSessionProps> = ({
  hasMedia,
  onSavePauseMessage,
  onBlocked,
  onExit,
  ...data
}) => {
  const [showNames, setShowNames] = useState(false);
  const winRef = useRef<Window | null>(null);

  const media = useCallback((action: 'play' | 'pause') => {
    const nodes = winRef.current?.document.querySelectorAll(
      '[data-present-root] audio, [data-present-root] video'
    );
    nodes?.forEach((node) => {
      const el = node as HTMLMediaElement;
      if (action === 'pause') el.pause();
      else void el.play().catch(() => undefined);
    });
  }, []);

  return (
    <>
      <PresentControls
        showNames={showNames}
        onToggleNames={() => setShowNames((v) => !v)}
        hasMedia={hasMedia}
        onPlayMedia={() => media('play')}
        onPauseMedia={() => media('pause')}
        paused={data.session.status === 'paused'}
        pauseMessage={data.session.pauseMessage ?? ''}
        onSavePauseMessage={onSavePauseMessage}
        onExit={onExit}
      />
      <PresentWindow
        title={data.session.quizTitle}
        onClose={onExit}
        onBlocked={onBlocked}
        onWindowReady={(win) => {
          winRef.current = win;
        }}
      >
        <PresentScreen {...data} showNames={showNames} />
      </PresentWindow>
    </>
  );
};
