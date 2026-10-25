import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import type { WidgetType } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { type DocCamRotation, isSideways } from './docCamView';

export const LIVE_COMPARE_ID = 'live';

export type CompareSide =
  { kind: 'live' } | { kind: 'photo'; id: string; dataUrl: string };

interface Props {
  widgetId: string;
  widgetType: WidgetType;
  sides: readonly [CompareSide, CompareSide];
  stream: MediaStream | null;
  isMirrored: boolean;
  rotation: DocCamRotation;
  onExit: () => void;
}

const LiveSide: React.FC<{
  stream: MediaStream | null;
  mirrored: boolean;
  rotation: DocCamRotation;
}> = ({ stream, mirrored, rotation }) => {
  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && el.srcObject !== stream) el.srcObject = stream;
    },
    [stream]
  );
  return (
    <video
      data-pii=""
      ref={attach}
      autoPlay
      playsInline
      muted
      aria-label="Live camera"
      className="absolute left-1/2 top-1/2 object-contain max-w-none"
      // Turned like the main feed; a sideways turn swaps the box so it still fits the half.
      style={{
        width: isSideways(rotation) ? '100cqh' : '100cqw',
        height: isSideways(rotation) ? '100cqw' : '100cqh',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)${mirrored ? ' scaleX(-1)' : ''}`,
      }}
    />
  );
};

/** Two photos, or a photo and the live camera, split left and right for comparing work. */
export const DocCamCompare: React.FC<Props> = ({
  widgetId,
  widgetType,
  sides,
  stream,
  isMirrored,
  rotation,
  onExit,
}) => (
  <div className="absolute inset-0 z-widget-internal-overlay bg-slate-950 flex">
    {sides.map((side, i) => (
      <div
        key={side.kind === 'live' ? LIVE_COMPARE_ID : side.id}
        className={`relative flex-1 min-w-0 h-full overflow-hidden ${i === 1 ? 'border-l border-white/20' : ''}`}
        style={{ containerType: 'size' }}
      >
        {side.kind === 'live' ? (
          <LiveSide stream={stream} mirrored={isMirrored} rotation={rotation} />
        ) : (
          <img
            data-pii=""
            src={side.dataUrl}
            alt={`Photo ${i + 1}`}
            className="w-full h-full object-contain"
          />
        )}
      </div>
    ))}
    <button
      {...tourAttr('webcam.compare-exit', widgetId, widgetType)}
      onClick={onExit}
      className="absolute bg-black/70 hover:bg-black/80 text-white rounded-xl border border-white/30 z-10"
      style={{
        top: 'min(12px, 3cqmin)',
        right: 'min(12px, 3cqmin)',
        padding: 'min(8px, 2cqmin)',
      }}
      title="Exit compare"
      aria-label="Exit compare"
    >
      <X
        style={{ width: 'min(18px, 4.5cqmin)', height: 'min(18px, 4.5cqmin)' }}
      />
    </button>
  </div>
);
