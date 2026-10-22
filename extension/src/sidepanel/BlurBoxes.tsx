import React, { useEffect, useMemo, useState } from 'react';
import type { RedactRect } from '@/components/widgets/GuidedLearning/utils/redactImage';

/** Smallest drawn box, in image-%, so a stray click draws nothing. */
const MIN_PCT = 1;

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** A picture the admin drags across to add blur boxes; pressing a box removes it. */
export const BlurBoxes: React.FC<{
  picture: Blob;
  boxes: readonly RedactRect[];
  onChange: (boxes: RedactRect[]) => void;
  label: string;
}> = ({ picture, boxes, onChange, label }) => {
  const url = useMemo(() => URL.createObjectURL(picture), [picture]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<RedactRect | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const pointAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100),
    };
  };
  const rectTo = (p: { x: number; y: number }): RedactRect | null =>
    start
      ? {
          xPct: Math.min(start.x, p.x),
          yPct: Math.min(start.y, p.y),
          wPct: Math.abs(start.x - p.x),
          hPct: Math.abs(start.y - p.y),
        }
      : null;

  return (
    <div
      className="relative w-full touch-none select-none overflow-hidden rounded-md border border-slate-200"
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.box) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setStart(pointAt(e));
      }}
      onPointerMove={(e) => start && setDraft(rectTo(pointAt(e)))}
      onPointerUp={(e) => {
        const r = rectTo(pointAt(e));
        setStart(null);
        setDraft(null);
        if (r && r.wPct >= MIN_PCT && r.hPct >= MIN_PCT)
          onChange([...boxes, r]);
      }}
    >
      {url && (
        <img src={url} alt="" className="block w-full" draggable={false} />
      )}
      {[...boxes, ...(draft ? [draft] : [])].map((b, i) => (
        <button
          key={i}
          type="button"
          data-box="1"
          aria-label="Remove blur"
          title="Remove blur"
          className="absolute border-2 border-slate-900 bg-slate-500/70 backdrop-blur-sm"
          style={{
            left: `${b.xPct}%`,
            top: `${b.yPct}%`,
            width: `${b.wPct}%`,
            height: `${b.hPct}%`,
          }}
          onClick={() =>
            i < boxes.length && onChange(boxes.filter((_, j) => j !== i))
          }
        />
      ))}
    </div>
  );
};
