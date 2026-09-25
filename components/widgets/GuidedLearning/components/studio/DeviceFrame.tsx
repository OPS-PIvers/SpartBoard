import React, { useLayoutEffect, useRef, useState } from 'react';
import type { GuidedLearningMode, GuidedLearningPublicStep } from '@/types';
import type { DevicePreset } from '../../types/stage';
import { DeviceFrameContext, fitScale } from './deviceFrameContext';
import {
  PlayerFooterPreview,
  PlayerShell,
  PlayerTopBar,
} from '../player/PlayerShell';
import { FOOTER_COMPACT_PX, playerShowsFooter } from '../player/playerLayout';

/** What the player's bars show, so the Studio stage gets the student's height. */
export interface DeviceFrameChrome {
  title: string;
  mode: GuidedLearningMode;
  playerV2?: boolean;
  steps: readonly GuidedLearningPublicStep[];
  /** The step shown on the canvas, for the footer's step count. */
  stepIndex: number;
  imageCount: number;
  imageIndex: number;
}

interface DeviceFrameProps {
  preset: DevicePreset;
  children: React.ReactNode;
  /** Wraps children in the player's top bar and footer, as the student sees them. */
  chrome?: DeviceFrameChrome;
}

/** Renders the stage at the preset's true pixel size, scaled to fit; pointer maths use clientToImagePct. */
export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  preset,
  children,
  chrome,
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
              className="relative h-full w-full"
              style={{ containerType: 'size' }}
            >
              {chrome ? (
                <PlayerShell
                  testId="gl-device-shell"
                  inertChrome
                  playerV2={chrome.playerV2}
                  topBar={
                    <PlayerTopBar
                      title={chrome.title}
                      mode={chrome.mode}
                      playerV2={chrome.playerV2}
                      imageCount={chrome.imageCount}
                      currentImageIndex={chrome.imageIndex}
                    />
                  }
                  footer={
                    playerShowsFooter(chrome.mode, chrome.steps.length) ? (
                      <PlayerFooterPreview
                        steps={chrome.steps}
                        stepIndex={chrome.stepIndex}
                        playerV2={chrome.playerV2}
                        compact={preset.w < FOOTER_COMPACT_PX}
                      />
                    ) : undefined
                  }
                >
                  {children}
                </PlayerShell>
              ) : (
                children
              )}
            </div>
          </div>
        </DeviceFrameContext.Provider>
      </div>
    </div>
  );
};
