import React, { useLayoutEffect, useRef, useState } from 'react';
import type { DevicePreset } from '../../types/stage';
import { DeviceFrameContext, fitScale } from './deviceFrameContext';

interface DeviceFrameProps {
  preset: DevicePreset;
  children: React.ReactNode;
  /** Rendered in the reserved footer strip (the student app's nav footer). */
  footer?: React.ReactNode;
}

/** Renders the stage at the preset's true pixel size, scaled to fit; pointer maths use clientToImagePct. */
export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  preset,
  children,
  footer,
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () =>
      setAvailable({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = fitScale(preset, available);
  const stageH = preset.h - preset.footerPx;

  return (
    <div
      ref={outerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <div
        className="shrink-0"
        style={{ width: preset.w * k, height: preset.h * k }}
      >
        <DeviceFrameContext.Provider value={{ preset, k }}>
          <div
            data-testid="gl-device-frame"
            data-preset={preset.id}
            className="relative overflow-hidden rounded-md bg-slate-950 shadow-2xl ring-1 ring-slate-700"
            style={{
              width: preset.w,
              height: preset.h,
              transform: `scale(${k})`,
              transformOrigin: 'top left',
            }}
          >
            <div
              data-testid="gl-device-stage"
              className="relative w-full"
              style={{ height: stageH, containerType: 'size' }}
            >
              {children}
            </div>
            {preset.footerPx > 0 && (
              <div
                className="flex w-full items-center justify-center border-t border-slate-800 bg-slate-900"
                style={{ height: preset.footerPx }}
                aria-hidden={footer ? undefined : true}
              >
                {footer}
              </div>
            )}
          </div>
        </DeviceFrameContext.Provider>
      </div>
    </div>
  );
};
