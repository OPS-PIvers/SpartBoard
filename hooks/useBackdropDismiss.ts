import { useCallback, useRef } from 'react';

/** Where a press or release landed; `null` when no pointer event was seen. */
type Landing = 'backdrop' | 'panel' | null;

interface BackdropDismissProps {
  onPointerDownCapture: (event: React.PointerEvent) => void;
  onPointerUpCapture: (event: React.PointerEvent) => void;
  onClickCapture: (event: React.MouseEvent) => void;
}

/**
 * Props for an overlay element that should dismiss on a backdrop click but
 * survive a drag that started inside the panel and ended on the backdrop.
 *
 * A `click` fires on the nearest common ancestor of the pointerdown and
 * pointerup targets, so a select-drag from inside a modal released over the
 * backdrop targets the backdrop itself — indistinguishable from a real
 * backdrop click, and the reason a modal would close and discard everything
 * in it. Tracking where the press and release actually landed tells the two
 * apart; a click with no pointer events behind it still dismisses.
 *
 * Capture phase so a descendant that stops propagation can't leave the
 * tracking refs stale. Spread the result on the backdrop element.
 */
export const useBackdropDismiss = (
  onDismiss: (() => void) | undefined
): BackdropDismissProps => {
  const pressedOn = useRef<Landing>(null);
  const releasedOn = useRef<Landing>(null);

  const onPointerDownCapture = useCallback((event: React.PointerEvent) => {
    pressedOn.current =
      event.target === event.currentTarget ? 'backdrop' : 'panel';
    releasedOn.current = null;
  }, []);

  const onPointerUpCapture = useCallback((event: React.PointerEvent) => {
    releasedOn.current =
      event.target === event.currentTarget ? 'backdrop' : 'panel';
  }, []);

  const onClickCapture = useCallback(
    (event: React.MouseEvent) => {
      const pressed = pressedOn.current;
      const released = releasedOn.current;
      pressedOn.current = null;
      releasedOn.current = null;
      if (event.target !== event.currentTarget) return;
      if (pressed === 'panel' || released === 'panel') return;
      onDismiss?.();
    },
    [onDismiss]
  );

  return { onPointerDownCapture, onPointerUpCapture, onClickCapture };
};
