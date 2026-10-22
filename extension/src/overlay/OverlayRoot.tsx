import React, { useRef } from 'react';
import type { i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { TourBar } from '@/components/tours/TourBar';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip } from '@/components/tours/TourTip';
import type { OverlayAction, OverlayRect, OverlayState } from './overlayState';

const TIP_W = 320;
const GUTTER = 12;

/** Below the target when it fits, else above, else centred; refined with the real locator in slice 6. */
export function placeTip(
  rect: OverlayRect | null,
  view: { w: number; h: number }
): { left: number; top: number; width: number } {
  const width = Math.min(TIP_W, view.w - GUTTER * 2);
  if (!rect) {
    return { left: (view.w - width) / 2, top: view.h / 3, width };
  }
  const left = Math.min(
    Math.max(GUTTER, rect.x + rect.width / 2 - width / 2),
    view.w - width - GUTTER
  );
  const below = rect.y + rect.height + GUTTER * 2;
  const top = below < view.h * 0.75 ? below : Math.max(GUTTER, rect.y - 160);
  return { left, top, width };
}

interface Props {
  i18n: I18n;
  state: OverlayState;
  onAction: (action: OverlayAction) => void;
}

/** The SpartBoard tour overlay drawn over a web page: no Autopilot, nothing stored on the site. */
export const OverlayRoot: React.FC<Props> = ({ i18n, state, onAction }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const tip = placeTip(state.rect, {
    w: window.innerWidth,
    h: window.innerHeight,
  });
  return (
    <I18nextProvider i18n={i18n}>
      <TourSpotlight rect={state.rect} />
      <TourBar
        current={state.current}
        total={state.total}
        onBack={state.current > 1 ? () => onAction('back') : undefined}
        onNext={() => onAction('next')}
        onExit={() => onAction('exit')}
        positionKey={null}
      />
      <TourTip
        boxRef={boxRef}
        headingRef={headingRef}
        left={tip.left}
        top={tip.top}
        width={tip.width}
        tether={null}
        plain={false}
        animate
        title={state.title}
        looking={state.rect === null}
        status={null}
      >
        <p className="text-sm text-slate-700">{state.text}</p>
      </TourTip>
    </I18nextProvider>
  );
};
