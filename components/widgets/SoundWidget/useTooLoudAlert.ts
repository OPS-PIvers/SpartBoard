import { useEffect, useEffectEvent, useState } from 'react';
import { ALERT_CLEAR_MS } from './noiseTarget';

/** True once the room has stayed over target for `delayMs`, until it is back under for a moment. */
export const useTooLoudAlert = (
  isOver: boolean,
  delayMs: number,
  onAlertStart: () => void
): boolean => {
  const [alerting, setAlerting] = useState(false);
  const fireStart = useEffectEvent(onAlertStart);

  useEffect(() => {
    if (isOver === alerting) return undefined;
    const timer = setTimeout(
      () => {
        setAlerting(isOver);
        if (isOver) fireStart();
      },
      isOver ? delayMs : ALERT_CLEAR_MS
    );
    return () => clearTimeout(timer);
  }, [isOver, alerting, delayMs]);

  return alerting;
};
