import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Z_INDEX } from '@/config/zIndex';
import { chromeSurface } from '@/components/common/lightChrome';
import { asScriptedClick, isScriptedClick } from '@/components/tours/autopilot';
import type { TourSlots } from '@/components/tours/tourSession';
import { secondaryBtn } from '@/components/tours/tourButtons';
import {
  resolvePickTarget,
  type PickTarget,
  type TourAnchorPick,
} from './pickAnchor';

interface Props {
  /** Tour slot to widget id, so a widget-scoped pick records its slot. */
  slots?: TourSlots;
  onPick: (pick: TourAnchorPick) => void;
  onCancel: () => void;
  /** Opens the anchor list for controls that aren't on screen. */
  onChooseFromList?: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Every pointer event on the board is swallowed while picking, so a click binds instead of acting.
const SWALLOW = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
] as const;

const PAD = 3;

const SEE_THROUGH = '[data-tour-overlay]';
const LAYER = '[role="dialog"], [aria-modal="true"]';
const FOCUSABLE =
  'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Ctrl (Cmd on a Mac) clicks act on the board instead of binding; Alt is kept from the older hint.
const passesThrough = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.altKey;

// The real control under the pointer, looking through the tour's dim layer.
const elementBelow = (e: MouseEvent): Element | null => {
  const stack =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(e.clientX, e.clientY)
      : [];
  const below = stack.find((el) => !el.closest(SEE_THROUGH));
  if (below) return below.closest('[data-tour-ignore]') ? null : below;
  return e.target instanceof Element && !e.target.closest(SEE_THROUGH)
    ? e.target
    : null;
};

// Re-sends the click without its modifier, so the app opens its menu as for a plain click.
const passThrough = (e: MouseEvent, type = e.type) => {
  const el = elementBelow(e);
  // A link would navigate away from the editor.
  if (!el || el.closest('a[href]')) return;
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: e.view,
    detail: e.detail,
    screenX: e.screenX,
    screenY: e.screenY,
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    buttons: e.buttons,
    shiftKey: e.shiftKey,
    relatedTarget: e.relatedTarget,
  };
  const copy =
    typeof PointerEvent === 'function' &&
    e instanceof PointerEvent &&
    type.startsWith('pointer')
      ? new PointerEvent(type, {
          ...init,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
          width: e.width,
          height: e.height,
          pressure: e.pressure,
        })
      : new MouseEvent(type, init);
  if (type === 'mousedown')
    el.closest<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  asScriptedClick(() => el.dispatchEvent(copy));
};

// A synthetic click can't open a native dropdown, so the modifier click opens its list directly.
const openNativeSelect = (e: MouseEvent): boolean => {
  const select = elementBelow(e)?.closest('select');
  if (!select || select.disabled) return false;
  select.focus({ preventScroll: true });
  try {
    select.showPicker();
  } catch {
    // Older browsers have no showPicker; the dropdown is focused for the arrow keys instead.
  }
  return true;
};

// The tour's dim layer sits over the board, so look through it at what is underneath.
const pickAt = (e: MouseEvent, slots: TourSlots | undefined) => {
  const stack =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(e.clientX, e.clientY)
      : [];
  if (stack.length === 0)
    return resolvePickTarget(
      e.target instanceof Element ? e.target : null,
      slots
    );
  let layer: Element | null | undefined;
  for (const el of stack) {
    // The dim and ring are see-through; real editor UI blocks.
    if (el.closest(SEE_THROUGH)) continue;
    if (el.closest('[data-tour-ignore]')) return null;
    // A dialog on top hides what is behind it.
    layer ??= el.closest(LAYER);
    if (layer && !layer.contains(el)) return null;
    const found = resolvePickTarget(el, slots);
    if (found) return found;
  }
  return null;
};

/** Outlines registered anchors under the pointer and binds the one clicked. */
export const TourAnchorPicker: React.FC<Props> = ({
  slots,
  onPick,
  onCancel,
  onChooseFromList,
}) => {
  const { t } = useTranslation();
  const [hover, setHover] = useState<PickTarget | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Whether the current press started with the modifier, kept across listener re-subscriptions.
  const pressRef = useRef<{ pass: boolean | null; clicked: boolean }>({
    pass: null,
    clicked: false,
  });

  useEffect(() => {
    const ignored = (target: EventTarget | null) =>
      target instanceof Element &&
      !target.closest(SEE_THROUGH) &&
      !!target.closest('[data-tour-ignore]');
    const onMove = (e: PointerEvent) => {
      if (ignored(e.target)) {
        setHover(null);
        return;
      }
      const found = pickAt(e, slots);
      setHover((prev) =>
        prev?.element === found?.element &&
        prev?.pick.anchor === found?.pick.anchor
          ? prev
          : found
      );
    };
    const onSwallow = (event: Event) => {
      const e = event as MouseEvent;
      // Fast-forward's own clicks still reach the board.
      if (isScriptedClick() || ignored(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const press = pressRef.current;
      if (e.type === 'pointerdown')
        Object.assign(press, { pass: passesThrough(e), clicked: false });
      const pass = press.pass ?? passesThrough(e);
      if (e.type === 'click' || e.type === 'dblclick') press.pass = null;
      if (e.type === 'pointerup' && press.clicked) press.pass = null;
      if (!pass) {
        if (e.type === 'click') {
          const found = pickAt(e, slots);
          if (found) onPick(found.pick);
        }
        return;
      }
      if (e.type === 'contextmenu') {
        // A Mac Ctrl-click fires contextmenu instead of click, so send the click after the release.
        if (isMac() && e.ctrlKey && e.button === 0) press.clicked = true;
        return;
      }
      // Cancelling pointerdown stops the browser's own mousedown and mouseup, so send them here.
      if (e.type === 'mousedown' || e.type === 'mouseup') return;
      if (e.type === 'pointerdown' && openNativeSelect(e)) return;
      passThrough(e);
      if (e.type === 'pointerdown') passThrough(e, 'mousedown');
      if (e.type === 'pointerup') passThrough(e, 'mouseup');
      if (e.type === 'pointerup' && press.clicked) passThrough(e, 'click');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape would otherwise minimise the selected widget.
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('pointermove', onMove, true);
    SWALLOW.forEach((type) => window.addEventListener(type, onSwallow, true));
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      SWALLOW.forEach((type) =>
        window.removeEventListener(type, onSwallow, true)
      );
      window.removeEventListener('keydown', onKey, true);
    };
  }, [slots, onPick, onCancel]);

  // Follows the hovered control through scrolls, drags and resizes.
  useEffect(() => {
    const el = hover?.element;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((prev) =>
        prev &&
        prev.x === r.x &&
        prev.y === r.y &&
        prev.w === r.width &&
        prev.h === r.height
          ? prev
          : { x: r.x, y: r.y, w: r.width, h: r.height }
      );
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [hover?.element]);

  const shown = hover && box;
  const labelAbove = shown ? box.y > 32 : true;

  return createPortal(
    <>
      <style>
        {
          '*{cursor:crosshair!important}[data-tour-ignore] *{cursor:auto!important}[data-tour-ignore] button{cursor:pointer!important}'
        }
      </style>
      {shown && (
        <div
          aria-hidden="true"
          data-testid="tour-anchor-picker-outline"
          className="pointer-events-none fixed rounded-lg border-2 border-white shadow-[0_0_0_2px_rgba(45,63,137,0.9)]"
          style={{
            left: box.x - PAD,
            top: box.y - PAD,
            width: box.w + PAD * 2,
            height: box.h + PAD * 2,
            zIndex: Z_INDEX.tourCallout,
          }}
        >
          <span
            className={`absolute left-0 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white shadow-lg ${
              labelAbove ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
          >
            {hover.label}
          </span>
        </div>
      )}
      <div
        role="toolbar"
        aria-label={t('tourPicker.prompt')}
        data-tour-ignore=""
        data-tour-obstacle=""
        data-testid="tour-anchor-picker-bar"
        className={`fixed left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-2xl py-1.5 pl-4 pr-1.5 ${chromeSurface}`}
        style={{ zIndex: Z_INDEX.tourCallout }}
      >
        <span className="mr-2 flex flex-col">
          <span className="whitespace-nowrap text-sm font-semibold">
            {t('tourPicker.prompt')}
          </span>
          <span className="whitespace-nowrap text-xs text-slate-500">
            {t('tourPicker.menuHint', { key: isMac() ? '⌘' : 'Ctrl' })}
          </span>
        </span>
        {onChooseFromList && (
          <button
            type="button"
            onClick={onChooseFromList}
            className={secondaryBtn}
          >
            {t('tourPicker.chooseFromList')}
          </button>
        )}
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          {t('tourPicker.cancel')}
        </button>
      </div>
    </>,
    document.body
  );
};
