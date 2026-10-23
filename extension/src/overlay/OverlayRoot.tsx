import React, { useRef } from 'react';
import type { i18n as I18n } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { TourBar } from '@/components/tours/TourBar';
import { TourSpotlight } from '@/components/tours/TourSpotlight';
import { TourTip } from '@/components/tours/TourTip';
import { tetherFor } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import type {
  OverlayAction,
  OverlayCheck,
  OverlayRect,
  OverlayState,
} from './overlayState';
import { useTargetRect } from './targetRect';

const TIP_W = 320;
const GUTTER = 12;
const TIP_H = 120;

/** Below the target when it fits, else above, else centred. */
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
  /** The stylesheet applied; see mountOverlay. */
  styled: boolean;
  onAction: (action: OverlayAction) => void;
}

const Picture: React.FC<{ picture: NonNullable<OverlayState['picture']> }> = ({
  picture,
}) => {
  const { t } = useTranslation();
  return (
    <img
      src={`data:${picture.mime};base64,${picture.data}`}
      width={picture.w}
      height={picture.h}
      alt={t('tours.webPictureAlt')}
      data-testid="web-tour-picture"
      className="mt-2 h-auto max-h-48 w-full rounded-lg border border-slate-200 object-contain"
    />
  );
};

const CHECK_KEYS: Record<Exclude<OverlayCheck, 'pending'>, string> = {
  found: 'tours.webCheckFound',
  weak: 'tours.webCheckWeak',
  ambiguous: 'tours.webCheckAmbiguous',
  none: 'tours.webCheckNone',
};

const CHECK_TONE: Record<Exclude<OverlayCheck, 'pending'>, string> = {
  found: 'bg-emerald-100 text-emerald-800',
  weak: 'bg-amber-100 text-amber-800',
  ambiguous: 'bg-amber-100 text-amber-800',
  none: 'bg-red-100 text-red-800',
};

const TopOverlay: React.FC<Omit<Props, 'i18n' | 'styled'>> = ({
  state,
  onAction,
}) => {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const lit = state.status === 'shown' && state.targetHere;
  const rect = useTargetRect(lit);
  const view = { w: window.innerWidth, h: window.innerHeight };
  // A target inside a frame is lit there; the tip waits low on the screen so it doesn't cover the frame.
  const away = state.status === 'shown' && !state.targetHere;
  const placed = placeTip(rect, view);
  const tip = away
    ? { ...placed, top: Math.max(GUTTER, view.h - TIP_H - GUTTER * 4) }
    : placed;
  const done = state.status === 'done';
  // The tip's height isn't known during render; the arrow only needs the side it leaves from.
  const tether = rect
    ? tetherFor(
        { x: tip.left, y: tip.top, w: tip.width, h: TIP_H },
        { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      )
    : null;
  const last = state.current === state.total;
  // Check mode: Next moves on from any step without the real click (C12).
  const checking = state.check !== undefined;
  const result = state.check && state.check !== 'pending' ? state.check : null;
  return (
    <>
      {lit && (
        <TourSpotlight rect={rect} breathe={!state.observe} clickThrough />
      )}
      <TourBar
        current={state.current}
        total={state.total}
        onBack={state.current > 1 || done ? () => onAction('back') : undefined}
        onNext={() => onAction(done ? 'exit' : 'next')}
        onExit={() => onAction('exit')}
        positionKey={null}
      />
      <TourTip
        boxRef={boxRef}
        headingRef={headingRef}
        left={tip.left}
        top={tip.top}
        width={tip.width}
        tether={tether}
        plain={!rect}
        animate
        title={done ? t('tours.completeTitle') : state.title}
        looking={state.status === 'seeking'}
        status={null}
        next={
          done
            ? { onNext: () => onAction('exit'), last: true }
            : checking || state.observe || state.status === 'fallback'
              ? { onNext: () => onAction('next'), last }
              : undefined
        }
      >
        {result && !done && (
          <p
            role="status"
            data-testid="web-tour-check-result"
            className={`mb-2 w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_TONE[result]}`}
          >
            {t(CHECK_KEYS[result])}
          </p>
        )}
        {!done && <p className="text-sm text-slate-700">{state.text}</p>}
        {state.status === 'wrong-page' && (
          <p
            data-testid="web-tour-other-page"
            className="mt-2 text-sm font-semibold text-slate-700"
          >
            {t('tours.webOtherPage')}
          </p>
        )}
        {state.status === 'fallback' && (
          <p
            data-testid="web-tour-find-it"
            className="mt-2 text-sm font-semibold text-slate-700"
          >
            {t('tours.webFindIt')}
          </p>
        )}
        {state.picture &&
          (state.status === 'fallback' || state.status === 'wrong-page') && (
            <Picture picture={state.picture} />
          )}
      </TourTip>
    </>
  );
};

/** A frame that holds the target: only the spotlight, since the bar and tip live in the top frame. */
const TargetOverlay: React.FC<{ state: OverlayState }> = ({ state }) => {
  const lit = state.status === 'shown' && state.targetHere;
  const rect = useTargetRect(lit);
  return lit ? (
    <TourSpotlight rect={rect} breathe={!state.observe} clickThrough />
  ) : null;
};

/** Without its stylesheet the overlay can't draw a spotlight, so a shown step reads as a find-it step. */
export const unstyledState = (state: OverlayState): OverlayState =>
  state.status === 'shown'
    ? { ...state, status: 'fallback', targetHere: false }
    : state;

/** The SpartBoard tour overlay drawn over a web page: no Autopilot, nothing stored on the site. */
export const OverlayRoot: React.FC<Props> = ({
  i18n,
  state: raw,
  styled,
  onAction,
}) => {
  const state = styled ? raw : unstyledState(raw);
  return (
    <I18nextProvider i18n={i18n}>
      {state.role === 'top' ? (
        <TopOverlay state={state} onAction={onAction} />
      ) : (
        <TargetOverlay state={state} />
      )}
    </I18nextProvider>
  );
};
