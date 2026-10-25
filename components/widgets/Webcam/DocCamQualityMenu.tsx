import React, { useRef, useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import type { WidgetType } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  type CameraControls,
  type DocCamResolution,
  RESOLUTION_OPTIONS,
} from './docCamQuality';

interface Props {
  widgetId: string;
  widgetType: WidgetType;
  resolution: DocCamResolution;
  controls: CameraControls;
  onResolution: (r: DocCamResolution) => void;
  onAutoFocus: (on: boolean) => void;
  onAutoExposure: (on: boolean) => void;
}

const ROW =
  'w-full flex items-center text-left text-white hover:bg-white/15 rounded-lg';

/** Resolution choice plus focus and exposure switches the camera says it supports. */
export const DocCamQualityMenu: React.FC<Props> = ({
  widgetId,
  widgetType,
  resolution,
  controls,
  onResolution,
  onAutoFocus,
  onAutoExposure,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(menuRef, () => setOpen(false), [buttonRef]);

  const rowStyle = {
    gap: 'min(8px, 2cqmin)',
    padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
    fontSize: 'min(13px, 3.25cqmin)',
  };
  const check = (on: boolean) => (
    <Check
      aria-hidden="true"
      className={on ? '' : 'invisible'}
      style={{ width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' }}
    />
  );

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        // Escape would otherwise minimize the widget.
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        {...tourAttr('webcam.quality', widgetId, widgetType)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative touch-target-expand hover:bg-white/30 rounded-xl text-white"
        style={{ padding: 'min(8px, 2cqmin)' }}
        title="Camera quality"
        aria-label="Camera quality"
      >
        <SlidersHorizontal
          style={{
            width: 'min(18px, 4.5cqmin)',
            height: 'min(18px, 4.5cqmin)',
          }}
        />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="group"
          aria-label="Camera quality"
          className="absolute top-1/2 -translate-y-1/2 bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl"
          style={{
            right: 'calc(100% + min(10px, 2.5cqmin))',
            padding: 'min(6px, 1.5cqmin)',
            minWidth: 'min(170px, 42cqmin)',
          }}
        >
          <div
            className="text-white/60 font-semibold uppercase tracking-wider"
            style={{
              fontSize: 'min(11px, 2.75cqmin)',
              padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
            }}
          >
            Resolution
          </div>
          {RESOLUTION_OPTIONS.map((opt) => (
            // no-tour-anchor: one row per resolution; tours point at the Camera quality button
            <button
              key={opt.id}
              aria-pressed={resolution === opt.id}
              onClick={() => {
                onResolution(opt.id);
                setOpen(false);
              }}
              className={ROW}
              style={rowStyle}
            >
              {check(resolution === opt.id)}
              {opt.label}
            </button>
          ))}
          {(controls.focus || controls.exposure) && (
            <div
              className="bg-white/15"
              style={{ height: 1, margin: 'min(4px, 1cqmin) 0' }}
            />
          )}
          {controls.focus && (
            <button
              {...tourAttr('webcam.autofocus', widgetId, widgetType)}
              aria-pressed={controls.focusAuto}
              onClick={() => onAutoFocus(!controls.focusAuto)}
              className={ROW}
              style={rowStyle}
            >
              {check(controls.focusAuto)}
              Autofocus
            </button>
          )}
          {controls.exposure && (
            <button
              {...tourAttr('webcam.auto-exposure', widgetId, widgetType)}
              aria-pressed={controls.exposureAuto}
              onClick={() => onAutoExposure(!controls.exposureAuto)}
              className={ROW}
              style={rowStyle}
            >
              {check(controls.exposureAuto)}
              Auto exposure
            </button>
          )}
        </div>
      )}
    </div>
  );
};
