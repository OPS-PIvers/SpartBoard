// Live preview of one student's printed packet, drawn from the same job the print uses.
import React, { useEffect, useRef, useState } from 'react';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '@/utils/paperSheetLayout';
import type { PaperPreviewPage } from '@/utils/paperSheetPrint';

const PX_PER_MM = 96 / 25.4;
const PAGE_W_PX = PAGE_WIDTH_MM * PX_PER_MM;
const PAGE_H_PX = PAGE_HEIGHT_MM * PX_PER_MM;
/** Room around each page in the pane. */
const GAP_PX = 16;
const BLOB_URL = /blob:[^"'()\s]+/g;

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

const toDataUrl = async (url: string): Promise<string> => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
};

/**
 * The pages' object URLs as data URLs. A sandboxed frame has no origin, so it
 * cannot read the dialog's object URLs; a URL that fails to read draws as empty.
 */
function useInlinedPages(
  pages: readonly PaperPreviewPage[] | null
): PaperPreviewPage[] | null {
  const [inlined, setInlined] = useState<ReadonlyMap<string, string>>(
    () => new Map()
  );
  const wanted = [
    ...new Set((pages ?? []).flatMap((p) => p.doc.match(BLOB_URL) ?? [])),
  ];
  const missing = wanted.filter((u) => !inlined.has(u));
  const missingKey = missing.join(' ');
  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    const urls = missingKey.split(' ');
    void Promise.all(urls.map((u) => toDataUrl(u).catch(() => ''))).then(
      (data) => {
        if (!live) return;
        setInlined((prev) => {
          const next = new Map(prev);
          urls.forEach((u, i) => next.set(u, data[i]));
          return next;
        });
      }
    );
    return () => {
      live = false;
    };
  }, [missingKey]);
  if (!pages || missing.length > 0) return null;
  return pages.map((p) => ({
    ...p,
    doc: p.doc.replace(BLOB_URL, (u) => inlined.get(u) ?? ''),
  }));
}

export interface PaperPrintPreviewProps {
  /** One student's pages, or null while the packet cannot be drawn. */
  pages: readonly PaperPreviewPage[] | null;
  /** Shown in place of the pages when there are none. */
  emptyText: string;
  className?: string;
}

export const PaperPrintPreview: React.FC<PaperPrintPreviewProps> = ({
  pages,
  emptyText,
  className = '',
}) => {
  const [boxRef, box] = useBoxSize();
  const shown = useInlinedPages(pages);
  // A whole page shows at once; the rest scroll below it.
  const scale =
    box.width > 0 && box.height > 0
      ? Math.min(
          (box.width - 2 * GAP_PX) / PAGE_W_PX,
          (box.height - 2 * GAP_PX) / PAGE_H_PX
        )
      : 0;
  const waiting = !!pages?.length && !shown;

  return (
    <div ref={boxRef} className={`min-h-0 overflow-y-auto pb-4 ${className}`}>
      {shown?.length && scale > 0 ? (
        <ol aria-label="Printed pages" className="space-y-4 pt-4">
          {shown.map((page, i) => (
            // Pages keep their place, so an unchanged page never reloads.
            <li
              key={i}
              className="relative mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-slate-200"
              style={{ width: PAGE_W_PX * scale, height: PAGE_H_PX * scale }}
            >
              <iframe
                title={`Page ${i + 1}`}
                srcDoc={page.doc}
                sandbox=""
                tabIndex={page.kind === 'test' ? 0 : -1}
                className="absolute left-0 top-0 origin-top-left border-0"
                style={{
                  width: PAGE_W_PX,
                  height: PAGE_H_PX,
                  transform: `scale(${scale})`,
                }}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-4 text-sm text-slate-500">
          {waiting ? 'Loading the pages.' : emptyText}
        </p>
      )}
    </div>
  );
};
