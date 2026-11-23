// Live preview of one student's printed packet, drawn from the same job the print uses.
import React, { useEffect, useRef, useState } from 'react';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '@/utils/paperSheetLayout';
import { PREVIEW_GAP_MM } from '@/utils/paperSheetPrint';

const PX_PER_MM = 96 / 25.4;
const PAGE_W_PX = (PAGE_WIDTH_MM + 2 * PREVIEW_GAP_MM) * PX_PER_MM;
const PAGE_H_PX = (PAGE_HEIGHT_MM + 2 * PREVIEW_GAP_MM) * PX_PER_MM;

/** The box's size, kept current as the dialog resizes. */
function useBoxSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

export interface PaperPrintPreviewProps {
  /** The preview document, or null while the packet cannot be drawn. */
  doc: string | null;
  /** Shown in place of the pages when `doc` is null. */
  emptyText: string;
  className?: string;
}

export const PaperPrintPreview: React.FC<PaperPrintPreviewProps> = ({
  doc,
  emptyText,
  className = '',
}) => {
  const [boxRef, box] = useBoxSize();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scroll = useRef({ x: 0, y: 0 });
  // A whole page shows at once; the rest scroll below it.
  const scale =
    box.width > 0 && box.height > 0
      ? Math.min(box.width / PAGE_W_PX, box.height / PAGE_H_PX)
      : 0;

  // A new document reloads the frame; keep the teacher's place in the pages.
  const onLoad = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.scrollTo(scroll.current.x, scroll.current.y);
    win.addEventListener('scroll', () => {
      scroll.current = { x: win.scrollX, y: win.scrollY };
    });
  };

  return (
    <div
      ref={boxRef}
      className={`relative min-h-0 overflow-hidden ${className}`}
    >
      {doc && scale > 0 ? (
        <iframe
          ref={frameRef}
          title="Print preview"
          srcDoc={doc}
          // Same origin only so the pages can read the stimulus pictures; no scripts run.
          sandbox="allow-same-origin"
          onLoad={onLoad}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: box.width / scale,
            height: box.height / scale,
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <p className="p-4 text-sm text-slate-500">{doc ? '' : emptyText}</p>
      )}
    </div>
  );
};
