import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { X } from 'lucide-react';
import { chromeSurface, focusRing } from '@/components/common/lightChrome';
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
import { benchMark } from '../bench';
import { useStepRhythm } from '@/components/tours/useStepRhythm';
import { rhythmOf } from '@/components/tours/playbackEngine';
import { usePrefersReducedMotion } from '@/components/tours/usePrefersReducedMotion';
import { secondaryBtn } from '@/components/tours/tourButtons';
import { TourWherePicture } from '@/components/tours/TourWherePicture';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import {
  MIN_TIP_ROOM,
  placeTourTip,
  type TipPlace,
} from '@/components/tours/web/pictureTarget';

// The target the frame seeker attached in this frame, which the page settles around.
const frameTarget = () => globalThis.__sbWebTourFrame?.target?.el ?? null;

const GUTTER = 12;
const TIP_H = 120;

/** Below the target when the whole tip fits, else above, else on the roomier side with `maxH` capping the tip. */
export const placeTip = (
  rect: OverlayRect | null,
  view: { w: number; h: number },
  tipH = TIP_H,
  minRoom = MIN_TIP_ROOM
): TipPlace => placeTourTip(rect, view, tipH, minRoom);

// A step found faster than this never flashes "Looking…".
export const LOOKING_DELAY_MS = 400;

const onResize = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};

/** The viewport size, current across resizes. */
function useViewport(): { w: number; h: number } {
  const w = useSyncExternalStore(onResize, () => window.innerWidth);
  const h = useSyncExternalStore(onResize, () => window.innerHeight);
  return { w, h };
}

/** The rendered height of whichever element `ref` holds now, or `fallback` until one is measured. */
function useHeight(
  ref: React.RefObject<HTMLElement | null>,
  fallback: number
): number {
  const [measured, setMeasured] = useState<{
    el: HTMLElement | null;
    h: number;
  }>({ el: null, h: 0 });
  const [el, setEl] = useState<HTMLElement | null>(null);
  // No deps on purpose: the tip unmounts between steps and remounts as a new element.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sets state only when the element changed
  useLayoutEffect(() => {
    if (ref.current !== el) setEl(ref.current);
  });
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (el.isConnected && el.offsetHeight > 0)
        setMeasured({ el, h: el.offsetHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  // A height measured on an earlier step's element never places this one.
  return measured.el === el && measured.h > 0 ? measured.h : fallback;
}

/** True once `on` has held for `ms`; false again as soon as it drops. */
function useAfter(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [on, ms]);
  return on && late;
}

interface Props {
  i18n: I18n;
  state: OverlayState;
  /** The stylesheet applied; see mountOverlay. */
  styled: boolean;
  onAction: (action: OverlayAction) => void;
}

const Picture: React.FC<{
  picture: NonNullable<OverlayState['picture']>;
  markup?: OverlayState['markup'];
  target?: OverlayState['target'];
}> = ({ picture, markup, target }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-2">
      <TourWherePicture
        src={`data:${picture.mime};base64,${picture.data}`}
        alt={t('tours.webPictureAlt')}
        w={picture.w}
        h={picture.h}
        {...(target ? { target } : {})}
        {...(markup ? { markup } : {})}
        testId="web-tour-picture"
      />
    </div>
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

/** The next step's tip once this frame found its target, ahead of the service worker's own render. */
export const aheadState = (
  state: OverlayState,
  token: string | null
): OverlayState => {
  const { ahead, ...rest } = state;
  if (!ahead || token !== ahead.token || state.status !== 'shown') return rest;
  return {
    ...rest,
    title: ahead.title,
    text: ahead.text,
    observe: ahead.observe,
    current: Math.min(state.current + 1, state.total),
    picture: null,
  };
};

const TopOverlay: React.FC<Omit<Props, 'i18n'>> = ({
  state: given,
  styled,
  onAction,
}) => {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const lit = given.status === 'shown' && given.targetHere;
  // Tracking carries on while the next step is sought, so the spotlight moves as soon as this frame finds it.
  const { rect, token } = useTargetRect(lit || given.status === 'seeking');
  const state = aheadState(given, token);
  const view = useViewport();
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const boxH = useHeight(boxRef, TIP_H);
  const bodyH = useHeight(bodyRef, 0);
  // Placement uses the tip's full height, so capping the body never flips it to the other side.
  const tipH = boxH - bodyH + useHeight(contentRef, 0);
  // A target inside a frame is lit there; the tip waits low on the screen so it doesn't cover the frame.
  const away = state.status === 'shown' && !state.targetHere;
  const chromeH = boxH - bodyH;
  // A capped side must hold the title, buttons and a few lines of text, or the tip overflows it.
  const placed = placeTip(
    rect,
    view,
    tipH,
    Math.max(MIN_TIP_ROOM, chromeH + GUTTER * 4)
  );
  const tip = away
    ? {
        ...placed,
        top: Math.max(GUTTER, view.h - tipH - GUTTER * 4),
        bottom: undefined,
        maxH: undefined,
      }
    : placed;
  const bodyMax =
    tip.maxH === undefined
      ? undefined
      : Math.max(GUTTER * 4, tip.maxH - chromeH);
  const done = state.status === 'done';
  const looking = useAfter(state.status === 'seeking', LOOKING_DELAY_MS);
  // Settle, tick, glide, tip after the learner acts (TOURS_10X.md P1).
  const reducedMotion = usePrefersReducedMotion();
  const actable = state.status === 'shown' && !state.observe;
  const [seen, setSeen] = useState({ current: state.current, actable });
  const actedChange = state.current === seen.current + 1 && seen.actable;
  if (seen.current !== state.current || seen.actable !== actable)
    setSeen({ current: state.current, actable });
  // The control the learner just finished, so a page change that removed it skips its tick.
  const litEl = useRef<Element | null>(null);
  const finishedGone = useCallback(() => !litEl.current?.isConnected, []);
  const rhythm = useStepRhythm({
    finishedGone,
    enabled: styled,
    reducedMotion,
    stepKey: String(state.current),
    rect,
    actedChange,
    near: frameTarget,
    onPhase: (phase) => benchMark('rhythm', { phase, current: state.current }),
  });
  // Kept only while a step rests, so the next step's target never stands in for it.
  const resting = rhythm.phase === 'ready' && lit;
  const stepIndex = given.current - 1;
  useLayoutEffect(() => {
    const target = globalThis.__sbWebTourFrame?.target;
    // Seek tokens start with the step index; the frame may already hold the next step's target.
    if (resting && target && target.token.startsWith(`${stepIndex}:`))
      litEl.current = target.el;
  });
  const shownRect = rhythm.rect;
  const spot = !!shownRect;
  const plain = !shownRect && !away;
  useEffect(() => benchMark('view', { spot, plain }), [spot, plain]);
  useLayoutEffect(() => benchMark('paint', { rect: shownRect }), [shownRect]);
  // A step whose control isn't on the page folds its tip into the chip on the bar (P4).
  const waiting = styled && state.status === 'fallback';
  const tether = rect
    ? tetherFor(
        {
          x: tip.left,
          y: tip.top ?? view.h - (tip.bottom ?? 0) - boxH,
          w: tip.width,
          h: boxH,
        },
        { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      )
    : null;
  const last = state.current === state.total;
  // Check mode: Next moves on from any step without the real click (C12).
  const checking = state.check !== undefined;
  const result = state.check && state.check !== 'pending' ? state.check : null;
  return (
    <>
      {(lit || shownRect) && (
        <TourSpotlight
          rect={shownRect}
          breathe={lit && !state.observe}
          clickThrough
          glide={false}
          tick={rhythm.tick}
          glideFor={
            rhythm.phase === 'glide' ? rhythmOf(reducedMotion).glideMs : 0
          }
        />
      )}
      <TourBar
        current={state.current}
        total={state.total}
        onBack={state.current > 1 || done ? () => onAction('back') : undefined}
        onNext={() => onAction(done ? 'exit' : 'next')}
        onExit={() => onAction('exit')}
        positionKey={null}
        skipped={state.skipped ?? []}
        {...(waiting
          ? {
              waiting: {
                step: state.current,
                ...(state.picture
                  ? {
                      picture: (
                        <Picture
                          picture={state.picture}
                          markup={state.markup}
                          target={state.target}
                        />
                      ),
                    }
                  : {}),
                ...(state.takeBack
                  ? { onTakeBack: () => onAction('takeBack') }
                  : {}),
              },
            }
          : {})}
      />
      {(rhythm.tipShown || done) && !waiting && (
        <TourTip
          boxRef={boxRef}
          headingRef={headingRef}
          left={tip.left}
          top={tip.top}
          bottom={tip.bottom}
          width={tip.width}
          tether={tether}
          plain={!rect}
          animate
          clearOfChrome
          title={done ? t('tours.completeTitle') : state.title}
          looking={looking}
          status={null}
          next={
            done
              ? { onNext: () => onAction('exit'), last: true }
              : checking || state.observe || state.status === 'fallback'
                ? { onNext: () => onAction('next'), last }
                : undefined
          }
        >
          {!done && (
            <div
              ref={bodyRef}
              className={
                bodyMax === undefined
                  ? undefined
                  : '-mx-3 overflow-y-auto px-3 pb-1'
              }
              style={bodyMax === undefined ? undefined : { maxHeight: bodyMax }}
            >
              <div ref={contentRef} className="flex flex-col gap-2">
                {result && !done && (
                  <p
                    role="status"
                    data-testid="web-tour-check-result"
                    className={`mb-2 w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_TONE[result]}`}
                  >
                    {t(CHECK_KEYS[result])}
                  </p>
                )}
                {!done && (
                  <p className="whitespace-pre-line text-sm text-slate-700">
                    {renderStepText(state.text.trim())}
                  </p>
                )}
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
                  (state.status === 'fallback' ||
                    state.status === 'wrong-page') && (
                    <Picture
                      picture={state.picture}
                      markup={state.markup}
                      target={state.target}
                    />
                  )}
                {state.status === 'wrong-page' && state.takeBack && (
                  // no-tour-anchor: tour playback chrome on a website, never a tour's own target
                  <button
                    type="button"
                    data-testid="tour-take-me-back"
                    onClick={() => onAction('takeBack')}
                    className={`${secondaryBtn} mt-2 -ml-3`}
                  >
                    {t('tours.takeMeBack')}
                  </button>
                )}
              </div>
            </div>
          )}
        </TourTip>
      )}
    </>
  );
};

const NOTICE_KEYS: Record<'armed' | 'moved' | 'stopped', string> = {
  armed: 'tours.webArmed',
  moved: 'tours.webMoved',
  stopped: 'tours.webStopped',
};

const isNotice = (
  status: OverlayState['status']
): status is keyof typeof NOTICE_KEYS => status in NOTICE_KEYS;

/** A small chip while the tour waits for sign-in, moved to another tab or stopped; nothing else is drawn on the page. */
const NoticeChip: React.FC<{
  state: OverlayState & { status: keyof typeof NOTICE_KEYS };
  onAction: (action: OverlayAction) => void;
}> = ({ state, onAction }) => {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const armed = state.status === 'armed';
  return (
    <div
      role="status"
      data-testid={`web-tour-${state.status}`}
      className={`fixed right-4 top-4 flex max-w-sm items-center gap-2 rounded-2xl py-2 pl-4 pr-2 text-sm text-slate-800 ${chromeSurface}`}
    >
      <p className="font-semibold">{t(NOTICE_KEYS[state.status])}</p>
      {armed && state.goStart && (
        <button
          type="button"
          onClick={() => onAction('start')}
          className={`shrink-0 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark ${focusRing}`}
        >
          {t('tours.webGoToStart')}
        </button>
      )}
      <button
        type="button"
        aria-label={armed ? t('tours.webArmedExit') : t('tours.webDismiss')}
        onClick={() => (armed ? onAction('exit') : setHidden(true))}
        className={`shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${focusRing}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

/** A frame that holds the target: only the spotlight, since the bar and tip live in the top frame. */
const TargetOverlay: React.FC<{ state: OverlayState }> = ({ state }) => {
  const lit = state.status === 'shown' && state.targetHere;
  const { rect } = useTargetRect(lit);
  useLayoutEffect(() => benchMark('paint', { rect }), [rect]);
  return lit ? (
    <TourSpotlight
      rect={rect}
      breathe={!state.observe}
      clickThrough
      glide={false}
    />
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
      {isNotice(state.status) ? (
        state.role === 'top' && (
          <NoticeChip
            state={state as OverlayState & { status: keyof typeof NOTICE_KEYS }}
            onAction={onAction}
          />
        )
      ) : state.role === 'top' ? (
        <TopOverlay state={state} styled={styled} onAction={onAction} />
      ) : (
        <TargetOverlay state={state} />
      )}
    </I18nextProvider>
  );
};
