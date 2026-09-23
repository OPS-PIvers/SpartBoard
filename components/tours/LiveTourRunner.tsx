import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, X } from 'lucide-react';
import type { GuidedLearningSet, WidgetType } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { Z_INDEX } from '@/config/zIndex';
import { placeCallout } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import {
  isTourRunning,
  setTourRunning,
  TOUR_START_EVENT,
  type TourStartRequest,
} from './tourState';
import {
  addedWidgetIds,
  missingSetupWidgets,
  tourStepsOf,
  type TourStep,
} from './tourSession';
import { useAnchorElement } from './useAnchorElement';
import { TourSpotlight } from './TourSpotlight';

type Phase = 'practice-offer' | 'running' | 'teardown';

interface ActiveTour {
  set: GuidedLearningSet;
  steps: TourStep[];
  phase: Phase;
  index: number;
  beforeIds: ReadonlySet<string>;
  addedTypes: WidgetType[];
}

const BOARD_WAIT_MS = 2000;
const CALLOUT_WIDTH = 320;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Runs a Guided Learning set's live-tour steps against the real app. */
export const LiveTourRunner: React.FC = () => {
  const { t } = useTranslation();
  const { canAccessFeature } = useAuth();
  const dashboard = useDashboard();
  const { activeDashboard, removeWidgets } = dashboard;
  const [tour, setTour] = useState<ActiveTour | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [box, setBox] = useState({ w: CALLOUT_WIDTH, h: 140 });
  const startingRef = useRef(false);

  // Async setup reads the newest dashboard actions, not the ones captured when it started.
  const latest = useRef({ dashboard, canAccessFeature, t });
  latest.current = { dashboard, canAccessFeature, t };

  const widgets = activeDashboard?.widgets ?? [];
  const added = tour
    ? addedWidgetIds(widgets, tour.beforeIds, tour.addedTypes)
    : [];
  const step =
    tour?.phase === 'running' ? (tour.steps[tour.index] ?? null) : null;
  const anchor = useAnchorElement(
    step?.tour ?? null,
    { widgetIds: added },
    attempt
  );

  const runSetup = (set: GuidedLearningSet, steps: TourStep[], from = 0) => {
    const { dashboard: d } = latest.current;
    const current = d.activeDashboard?.widgets ?? [];
    const missing = missingSetupWidgets(set, current);
    const beforeIds = new Set(current.map((w) => w.id));
    missing.forEach((type) => d.addWidget(type));
    setAttempt(0);
    setTour({
      set,
      steps,
      phase: 'running',
      index: Math.min(Math.max(from, 0), steps.length - 1),
      beforeIds,
      addedTypes: missing,
    });
  };

  useEffect(() => {
    const onStart = (e: Event) => {
      const req = (e as CustomEvent<TourStartRequest>).detail;
      const { canAccessFeature: can, dashboard: d, t: tr } = latest.current;
      if (
        !req?.setId ||
        !can('gl-live-tours') ||
        startingRef.current ||
        isTourRunning()
      )
        return;
      startingRef.current = true;
      void (async () => {
        try {
          const set = await loadBuildingSet(req.setId);
          const steps = set ? tourStepsOf(set) : [];
          if (!set || steps.length === 0) {
            d.addToast(tr('tours.unavailable'), 'error');
            return;
          }
          if (latest.current.dashboard.isActiveBoardReadOnly) {
            setTour({
              set,
              steps,
              phase: 'practice-offer',
              index: req.fromStep ?? 0,
              beforeIds: new Set(),
              addedTypes: [],
            });
            return;
          }
          runSetup(set, steps, req.fromStep);
        } catch (err) {
          console.error('LiveTourRunner: could not load tour', err);
          d.addToast(tr('tours.unavailable'), 'error');
        } finally {
          startingRef.current = false;
        }
      })();
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  const startOnPracticeBoard = async () => {
    if (!tour) return;
    const { set, steps, index } = tour;
    const id = await latest.current.dashboard.createNewDashboard(
      latest.current.t('tours.practiceBoardName')
    );
    if (!id) return;
    const deadline = performance.now() + BOARD_WAIT_MS;
    while (
      latest.current.dashboard.activeDashboard?.id !== id &&
      performance.now() < deadline
    ) {
      await nextFrame();
    }
    if (latest.current.dashboard.activeDashboard?.id !== id) {
      latest.current.dashboard.addToast(
        latest.current.t('tours.practiceFailed'),
        'error'
      );
      setTour(null);
      return;
    }
    runSetup(set, steps, index);
  };

  const finish = () => {
    if (!tour) return;
    if (added.length > 0) {
      setTour({ ...tour, phase: 'teardown' });
      return;
    }
    setTour(null);
  };

  const goTo = (index: number) => {
    if (!tour) return;
    if (index >= tour.steps.length) {
      finish();
      return;
    }
    setAttempt(0);
    setTour({ ...tour, index: Math.max(index, 0) });
  };

  const advanceRef = useRef(goTo);
  advanceRef.current = goTo;
  const stepIndex = tour?.index ?? 0;

  // A click on the anchor advances once the app has handled it.
  useEffect(() => {
    const el = anchor.element;
    if (!el || step?.tour.action !== 'click') return;
    let raf = 0;
    const onClick = () => {
      raf = requestAnimationFrame(() => advanceRef.current(stepIndex + 1));
    };
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('click', onClick, true);
      cancelAnimationFrame(raf);
    };
  }, [anchor.element, step?.tour.action, stepIndex]);

  const running = tour?.phase === 'running';
  const active = tour !== null;
  useEffect(() => {
    setTourRunning(active);
    return () => setTourRunning(false);
  }, [active]);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      finishRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [running]);

  const missingStepId = anchor.status === 'missing' ? step?.id : undefined;
  const setId = tour?.set.id;
  const missingAnchor = step?.tour.anchor;
  useEffect(() => {
    if (!missingStepId) return;
    console.warn('Live tour anchor not found', {
      setId,
      stepId: missingStepId,
      anchor: missingAnchor,
    });
  }, [missingStepId, setId, missingAnchor]);

  const boxObserver = useRef<ResizeObserver | null>(null);
  const measureBox = useCallback((el: HTMLDivElement | null) => {
    boxObserver.current?.disconnect();
    boxObserver.current = null;
    if (!el) return;
    boxObserver.current = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setBox((prev) =>
          prev.w === r.width && prev.h === r.height
            ? prev
            : { w: r.width, h: r.height }
        );
      }
    });
    boxObserver.current.observe(el);
  }, []);

  if (!tour || typeof document === 'undefined') return null;

  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const total = tour.steps.length;

  const dialog = (
    title: string,
    body: string,
    actions: React.ReactNode
  ): React.ReactNode => (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-dialog-title"
      className="fixed inset-0 flex items-center justify-center bg-slate-950/55 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-slate-900/95 p-5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl">
        <h2 id="tour-dialog-title" className="text-base font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-200">{body}</p>
        <div className="mt-4 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );

  const secondaryBtn =
    'rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  const primaryBtn =
    'rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

  let content: React.ReactNode = null;

  if (tour.phase === 'practice-offer') {
    content = dialog(
      t('tours.readOnlyTitle'),
      t('tours.readOnlyBody'),
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => setTour(null)}
        >
          {t('tours.cancel')}
        </button>
        <button
          type="button"
          className={primaryBtn}
          onClick={() => void startOnPracticeBoard()}
        >
          {t('tours.startPractice')}
        </button>
      </>
    );
  } else if (tour.phase === 'teardown') {
    content = dialog(
      t('tours.keepWidgetsTitle'),
      t('tours.keepWidgetsBody'),
      <>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => {
            removeWidgets(added);
            setTour(null);
          }}
        >
          {t('tours.removeWidgets')}
        </button>
        <button
          type="button"
          className={primaryBtn}
          onClick={() => setTour(null)}
        >
          {t('tours.keepWidgets')}
        </button>
      </>
    );
  } else if (step) {
    const rect = anchor.status === 'found' ? anchor.rect : null;
    const placement = rect
      ? placeCallout({
          box,
          target: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          container: viewport,
        })
      : null;
    const isMissing = anchor.status === 'missing';
    const isObserve = step.tour.action === 'observe';
    content = (
      <>
        {anchor.status === 'found' && <TourSpotlight rect={rect} />}
        <div
          ref={measureBox}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-step-title"
          data-tour-ignore=""
          data-testid="tour-callout"
          className="fixed flex flex-col gap-2 rounded-2xl bg-slate-900/90 px-4 py-3 text-white shadow-2xl ring-1 ring-black/40 border border-white/20 backdrop-blur-xl leading-relaxed"
          style={
            placement
              ? {
                  left: placement.left,
                  top: placement.top,
                  width: placement.width,
                }
              : {
                  left: '50%',
                  top: '50%',
                  width: CALLOUT_WIDTH,
                  transform: 'translate(-50%, -50%)',
                }
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div
              id="tour-step-title"
              className="font-bold tracking-tight text-white"
            >
              {step.label?.trim() ? step.label : t('tours.stepFallbackTitle')}
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label={t('tours.exit')}
              title={t('tours.exit')}
              className="-mr-1 rounded-md p-0.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {isMissing ? (
            <p className="text-sm text-slate-200">{t('tours.anchorMissing')}</p>
          ) : (
            step.text && <p className="text-sm text-slate-100">{step.text}</p>
          )}
          {anchor.status === 'searching' && (
            <p role="status" className="text-xs text-slate-300">
              {t('tours.looking')}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">
              {t('tours.progress', { current: tour.index + 1, total })}
            </span>
            <div className="flex items-center gap-1">
              {tour.index > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(tour.index - 1)}
                  className={`${secondaryBtn} flex items-center gap-1`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('tours.back')}
                </button>
              )}
              {isMissing && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className={secondaryBtn}
                >
                  {t('tours.retry')}
                </button>
              )}
              {isObserve && !isMissing ? (
                <button
                  type="button"
                  onClick={() => goTo(tour.index + 1)}
                  className={primaryBtn}
                >
                  {tour.index + 1 === total ? t('tours.done') : t('tours.next')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goTo(tour.index + 1)}
                  className={secondaryBtn}
                >
                  {t('tours.skip')}
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return createPortal(
    <div
      data-tour-ignore=""
      data-testid="live-tour"
      className="pointer-events-none fixed inset-0 [&>*]:pointer-events-auto [&>svg]:pointer-events-none"
      style={{ zIndex: Z_INDEX.tour }}
    >
      {content}
    </div>,
    document.body
  );
};
