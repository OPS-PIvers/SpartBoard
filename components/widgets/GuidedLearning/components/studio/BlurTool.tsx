import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { PctPoint, StageGeometry } from '../../types/stage';
import type { RedactMode, RedactRect } from '../../utils/redactImage';

/** Smallest blur area, in image-%, so a stray click draws nothing. */
const MIN_RECT_PCT = 1;

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

const rectFrom = (a: PctPoint, b: PctPoint): RedactRect => {
  const [x0, x1] = [clampPct(a.xPct), clampPct(b.xPct)].sort((p, q) => p - q);
  const [y0, y1] = [clampPct(a.yPct), clampPct(b.yPct)].sort((p, q) => p - q);
  return { xPct: x0, yPct: y0, wPct: x1 - x0, hPct: y1 - y0 };
};

interface BlurToolProps {
  g: StageGeometry;
  rects: RedactRect[];
  mode: RedactMode;
  onChange: (rects: RedactRect[]) => void;
}

/** Drag rectangles over the slide to mark what the blur hides. */
export const BlurTool: React.FC<BlurToolProps> = ({
  g,
  rects,
  mode,
  onChange,
}) => {
  const { t } = useTranslation();
  const startRef = useRef<PctPoint | null>(null);
  const [draft, setDraft] = useState<RedactRect | null>(null);

  const box = (r: RedactRect): React.CSSProperties => {
    const a = g.imagePctToContainerPx({ xPct: r.xPct, yPct: r.yPct });
    const b = g.imagePctToContainerPx({
      xPct: r.xPct + r.wPct,
      yPct: r.yPct + r.hPct,
    });
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  };
  const areaClass =
    mode === 'solid'
      ? 'bg-slate-800 ring-2 ring-white'
      : 'bg-white/20 ring-2 ring-sky-500 backdrop-blur-md';

  return (
    <div
      data-testid="gl-blur-layer"
      className="pointer-events-auto absolute inset-0 cursor-crosshair"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        startRef.current = g.clientToImagePct(e.clientX, e.clientY);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = startRef.current;
        if (!start) return;
        setDraft(rectFrom(start, g.clientToImagePct(e.clientX, e.clientY)));
      }}
      onPointerUp={(e) => {
        const start = startRef.current;
        startRef.current = null;
        setDraft(null);
        if (!start) return;
        const r = rectFrom(start, g.clientToImagePct(e.clientX, e.clientY));
        if (r.wPct >= MIN_RECT_PCT && r.hPct >= MIN_RECT_PCT)
          onChange([...rects, r]);
      }}
      onPointerCancel={() => {
        startRef.current = null;
        setDraft(null);
      }}
    >
      {rects.map((r, i) => (
        <div
          key={i}
          data-testid="gl-blur-area"
          className={`absolute rounded-sm ${areaClass}`}
          style={box(r)}
        >
          <button
            type="button"
            aria-label={t('glStudio.blurRemove', { n: i + 1 })}
            title={t('glStudio.blurRemove', { n: i + 1 })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(rects.filter((_, j) => j !== i))}
            className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-300 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
      {draft && (
        <div
          data-testid="gl-blur-draft"
          className={`pointer-events-none absolute rounded-sm ${areaClass}`}
          style={box(draft)}
        />
      )}
    </div>
  );
};
