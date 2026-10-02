import { useLayoutEffect, useRef } from 'react';
import {
  useDashboardCanvasSelector,
  useDashboardCanvasStateGetter,
  useTourHidden,
} from '@/context/dashboardCanvasStore';
import type { WidgetData } from '@/types';
import { prefersReducedMotion } from './usePrefersReducedMotion';
import {
  STAGE_FADE_MS,
  STAGE_MOVE_MS,
  arriveFrames,
  awayTransform,
  leaveFrames,
  returnFrames,
  stageClearMs,
  staggerDelay,
} from './stageTransition';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const widgetEl = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(id)}"]`);

const widgetTypeOf = (el: HTMLElement) => el.dataset.tourWidgetType ?? '';

// The widget's dock item, else the dock itself; null when neither is on screen.
const dockTarget = (type: string): DOMRect | null => {
  const candidates = [
    type
      ? `[data-tour="dock.item"][data-tour-widget-type="${CSS.escape(type)}"]`
      : '',
    '[data-role="dock"]',
  ];
  for (const selector of candidates) {
    if (!selector) continue;
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
};

const running = new Map<string, Animation>();

const play = (
  id: string,
  frames: Keyframe[],
  options: { delay: number; duration: number; easing: string }
) => {
  const el = widgetEl(id);
  if (!el || typeof el.animate !== 'function') return;
  running.get(id)?.cancel();
  const animation = el.animate(frames, { ...options, fill: 'backwards' });
  running.set(id, animation);
  animation.onfinish = () => {
    if (running.get(id) === animation) running.delete(id);
  };
};

// Widgets a teacher had already minimized have nothing to move.
const notMinimized = (ids: string[], widgets: WidgetData[] | undefined) => {
  const minimized = new Set(
    (widgets ?? []).filter((w) => w.minimized).map((w) => w.id)
  );
  return ids.filter((id) => !minimized.has(id));
};

/** Animates the teacher's widgets into the dock when a tour clears the stage, and back out when it ends. */
export const TourStageTransition: React.FC = () => {
  const hidden = useTourHidden();
  const widgets = useDashboardCanvasSelector((s) => s.activeDashboard?.widgets);
  const getState = useDashboardCanvasStateGetter();

  const previous = useRef<ReadonlySet<string>>(new Set());
  const stageEndsAt = useRef(0);
  const arrived = useRef(new Set<string>());

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = hidden;
    const reducedMotion = prefersReducedMotion();
    const left = notMinimized(
      [...hidden].filter((id) => !before.has(id)),
      getState().activeDashboard?.widgets
    );
    const back = notMinimized(
      [...before].filter((id) => !hidden.has(id)),
      getState().activeDashboard?.widgets
    );

    left.forEach((id, i) => {
      const el = widgetEl(id);
      if (!el) return;
      const away = awayTransform(
        el.getBoundingClientRect(),
        dockTarget(widgetTypeOf(el))
      );
      play(id, leaveFrames(away, reducedMotion), {
        delay: reducedMotion ? 0 : staggerDelay(i, left.length),
        duration: reducedMotion ? STAGE_FADE_MS : STAGE_MOVE_MS,
        easing: EASE,
      });
    });
    if (left.length) {
      stageEndsAt.current =
        performance.now() + stageClearMs(left.length, reducedMotion);
    }

    back.forEach((id, i) => {
      const el = widgetEl(id);
      if (!el) return;
      const away = awayTransform(
        el.getBoundingClientRect(),
        dockTarget(widgetTypeOf(el))
      );
      play(id, returnFrames(away, reducedMotion), {
        delay: reducedMotion ? 0 : staggerDelay(i, back.length),
        duration: reducedMotion ? STAGE_FADE_MS : STAGE_MOVE_MS,
        easing: EASE,
      });
    });
    if (hidden.size === 0) {
      stageEndsAt.current = 0;
      arrived.current.clear();
    }
  }, [hidden, getState]);

  // Tour widgets fade in once the teacher's widgets have gone.
  useLayoutEffect(() => {
    if (hidden.size === 0) return;
    for (const w of widgets ?? []) {
      if (!w.transient || arrived.current.has(w.id)) continue;
      arrived.current.add(w.id);
      play(w.id, arriveFrames(prefersReducedMotion()), {
        delay: Math.max(0, Math.round(stageEndsAt.current - performance.now())),
        duration: STAGE_FADE_MS + 50,
        easing: EASE,
      });
    }
  }, [hidden, widgets]);

  return null;
};
