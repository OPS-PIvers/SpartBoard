import React, { useEffect, useState } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Globe } from 'lucide-react';
import { LinkRow, LinkTile, type UrlLink } from './LinkTile';
import { pickLinkLayout } from './layout';

const GAP = 'min(6px, 1.5cqmin)';

const useBoxSize = () => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, size] as const;
};

const chunkRows = (urls: UrlLink[], rows: number[]): UrlLink[][] => {
  let start = 0;
  return rows.map((n) => {
    const row = urls.slice(start, start + n);
    start += n;
    return row;
  });
};

export const UrlWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];
  const [boxRef, box] = useBoxSize();
  const gapPx = Math.min(6, 0.015 * Math.min(box.w, box.h));
  const layout = pickLinkLayout(urls.length, box.w, box.h, gapPx);

  if (urls.length === 0) {
    return (
      <ScaledEmptyState
        icon={Globe}
        title="No Links Added"
        subtitle="Flip to set up your URLs."
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full flex flex-col overflow-hidden"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <div ref={boxRef} className="flex-1 min-h-0">
            {layout.mode === 'list' ? (
              <div
                className="h-full w-full overflow-y-auto"
                style={{ paddingBottom: 'max(12px, 2cqmin)' }}
              >
                <div
                  className="grid min-h-full"
                  style={{
                    gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                    gridAutoRows: 'minmax(max-content, 1fr)',
                    gap: GAP,
                  }}
                >
                  {urls.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      widgetType={widget.type}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full w-full" style={{ gap: GAP }}>
                {chunkRows(urls, layout.rows).map((row) => (
                  <div
                    key={row[0]?.id}
                    className="flex flex-1 min-h-0"
                    style={{ gap: GAP }}
                  >
                    {row.map((link) => (
                      <LinkTile
                        key={link.id}
                        link={link}
                        widgetType={widget.type}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};
