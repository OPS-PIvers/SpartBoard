import React, { useMemo } from 'react';
import {
  SCORED_WORK_STYLES,
  buildScoredWorkHtml,
  type WorksheetOrientation,
} from '@/utils/scoredWorkPrint';

interface WorksheetPreviewProps {
  /** Image URL of the first worksheet page, or undefined while it loads. */
  src: string | undefined;
  aspect: number;
  orientation: WorksheetOrientation;
  title: string;
}

/** CSS pixels of a US Letter page at 96 dpi. */
const PAGE_PX = { w: 816, h: 1056 };
const SCALE = 0.38;

/** The first printed page, drawn by the same code that prints it. */
export const WorksheetPreview: React.FC<WorksheetPreviewProps> = ({
  src,
  aspect,
  orientation,
  title,
}) => {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}${SCORED_WORK_STYLES}</style>${buildScoredWorkHtml(
        {
          workId: 'preview',
          title: title || 'Worksheet',
          pageCount: 1,
          sheets: [
            {
              seat: 1,
              student: null,
              displayName: 'Student name',
              className: '',
            },
          ],
          pageImageSrc: src ? [src] : [],
          orientation,
        },
        [aspect]
      )}`,
    [src, aspect, orientation, title]
  );

  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
      style={{ width: PAGE_PX.w * SCALE, height: PAGE_PX.h * SCALE }}
    >
      <iframe
        title="Print preview"
        srcDoc={srcDoc}
        tabIndex={-1}
        className="border-0 pointer-events-none"
        style={{
          width: PAGE_PX.w,
          height: PAGE_PX.h,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
};
